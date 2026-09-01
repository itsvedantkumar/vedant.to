import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getIP, getTrustedIP } from '@/lib/request';
import { r2 } from '@/lib/r2';
import { redis } from '@/lib/redis';
import { makeRatelimit } from '@/lib/ratelimit';
import { timingSafeEqual } from '@/lib/timing';
import {
  findQuestion,
  isCorrectAnswer,
  questionAt,
  randomQuestion,
  QUIZ_COUNT,
  type QuizQuestion,
} from '@/lib/whisper-quiz';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// 3 requests per IP per 24h sliding window
const ratelimit = makeRatelimit('whisper', 3, '24 h');

// Wrong quiz answers are cheap and retryable (a typo must not cost a submission
// slot), so they need their own throttle or the gate becomes a brute-force
// oracle over a tiny answer space. Only spent on a WRONG guess — correct
// answers never consume it, so a fumbling human can still submit.
const quizRatelimit = makeRatelimit('whisper-quiz', 10, '10 m');

// Backstop for the per-IP quiz limiter, which IP rotation via a proxy pool
// defeats outright. One global bucket can't be evaded by rotating anything.
// 100 wrong guesses per 10 min is ~2 orders of magnitude above real traffic on
// this site (a wrong guess means a human typo'd), so it only trips under an
// actual distributed brute force. Tradeoff: while it's tripped, a genuine typo
// also gets a 429 — but a CORRECT answer never touches this limiter, so the
// gate degrades for fumblers instead of closing for everyone.
const globalQuizRatelimit = makeRatelimit('whisper-quiz-global', 100, '10 m');

// GET is unauthenticated and mints tokens, so it needs its own cap. 20 per
// 10 min per IP: a human reloading the page a few times is nowhere near it,
// while bulk token minting and question probing now cost real IPs.
const getRatelimit = makeRatelimit('whisper-get', 20, '10 m');

// --- Submission proof token (HMAC-SHA256, 30-minute TTL) ---
// GET /api/whisper issues a token; POST validates it.
// Proves the submitter loaded the page — stops bulk scripted submissions.
// Payload is `<ts>.<quizId>`, signed as one string: the question id is bound
// into the signature so a client can't shop for an easy question and then
// answer a different one, and can't tamper with the id at all.
const TOKEN_SECRET = process.env.WHISPER_TOKEN_SECRET ?? '';
const TOKEN_TTL_MS = 30 * 60 * 1000;

// A whisper is 1000 chars max, so 4 KB of JSON is already generous.
const MAX_BODY_BYTES = 4096;

// No fallback to R2_BUCKET_NAME: that bucket is served publicly at
// assets.vedant.to, so a missing var would publish anonymous private messages.
const WHISPER_BUCKET = process.env.WHISPER_BUCKET_NAME;

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

const TOKEN_MIN_AGE_MS = 3_000; // quiz already gates humans; 3s only catches scripted instant-submit

/**
 * Stateless half of token validation: signature, TTL, minimum age.
 * Deliberately does NOT burn the token — a wrong quiz answer has to be free to
 * retry, and the answer can't be checked until the question id is recovered
 * from here.
 *
 * Reports WHY it failed, because the caller must not collapse these into one
 * response: 'too_soon' on the quiz check is an honest fast human, and rendering
 * that as "wrong answer" tells a correct answerer they were wrong.
 */
type TokenCheck =
  | { ok: true; quizId: string }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'too_soon'; waitMs: number };

const TOKEN_INVALID = { ok: false, reason: 'invalid' } as const;

async function verifyTokenSignature(token: string): Promise<TokenCheck> {
  try {
    const [tsStr, quizId, sig] = token.split('.');
    if (!tsStr || !quizId || !sig) return TOKEN_INVALID;
    if (!TOKEN_SECRET) {
      // Fail-closed in prod — missing secret means misconfiguration
      if (process.env.NODE_ENV === 'production') return TOKEN_INVALID;
      return { ok: true, quizId }; // dev: skip signature + age checks
    }
    const expected = await hmac(TOKEN_SECRET, `${tsStr}.${quizId}`);
    // Shared primitive — folds the length difference into the XOR instead of
    // early-returning on it, and keeps every secret compare in this repo on one
    // implementation.
    if (!timingSafeEqual(sig, expected)) return TOKEN_INVALID;
    // Age checks come AFTER the signature: only then is `ts` a value we minted,
    // so a forged token can never talk its way into a distinguishable reason.
    const ts = parseInt(tsStr, 36);
    if (!Number.isFinite(ts)) return TOKEN_INVALID;
    const age = Date.now() - ts;
    if (age > TOKEN_TTL_MS) return { ok: false, reason: 'expired' };
    if (age < TOKEN_MIN_AGE_MS) {
      return { ok: false, reason: 'too_soon', waitMs: TOKEN_MIN_AGE_MS - age };
    }
    return { ok: true, quizId };
  } catch {
    return TOKEN_INVALID;
  }
}

/**
 * Stateful half: single-use burn, called only once a request is actually going
 * to be stored. Kept after the quiz check and the rate limiter so a typo or a
 * 429 never costs the user their token.
 */
async function burnToken(token: string): Promise<boolean> {
  if (!TOKEN_SECRET) return process.env.NODE_ENV !== 'production'; // dev: nothing to burn
  const sig = token.split('.')[2];
  if (!sig) return false;
  // Burn token in Redis so it can't be replayed.
  // Fail-closed in prod — without Redis a valid token is replayable ~600×
  // within its 30-min TTL, exhausting Resend quota and filling R2.
  if (redis) {
    try {
      const burned = await redis.set(`whisper:token:${sig}`, 1, {
        nx: true,
        ex: TOKEN_TTL_MS / 1000 + 60,
      });
      if (burned === null) return false; // already used
    } catch (err) {
      // Outage mid-burn: single use can't be proven, so refuse in prod rather
      // than let the token be replayed. Uncaught, this would have been a 500.
      console.error('[whisper] token burn failed:', err);
      return process.env.NODE_ENV !== 'production';
    }
  } else if (process.env.NODE_ENV === 'production') {
    return false; // no dedup store → refuse rather than allow replay
  }
  return true;
}

// Check if IP is a known VPN, proxy, or datacenter via proxycheck.io (HTTPS, free tier).
// 'unknown' = the lookup didn't answer (timeout, non-2xx, quota exhausted); kept
// distinct from 'no' so a failed lookup is never cached as a clean verdict.
type ProxyVerdict = 'yes' | 'no' | 'unknown';

async function proxyVerdict(ip: string): Promise<ProxyVerdict> {
  if (ip === 'unknown' || ip === '127.0.0.1' || ip.startsWith('::')) return 'no';
  // Validate IP format before interpolating into URL
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;
  if (!ipRegex.test(ip)) return 'no';
  try {
    const key = process.env.PROXYCHECK_API_KEY
      ? `&key=${process.env.PROXYCHECK_API_KEY}`
      : '';
    const res = await fetch(`https://proxycheck.io/v2/${ip}?vpn=1&asn=1${key}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return 'unknown';
    const data = (await res.json()) as Record<string, { proxy?: string }>;
    return data[ip]?.proxy === 'yes' ? 'yes' : 'no';
  } catch {
    return 'unknown'; // fail-open below — never block legitimate users on a timeout
  }
}

async function isVpnOrProxy(ip: string): Promise<boolean> {
  return (await proxyVerdict(ip)) === 'yes'; // 'unknown' → fail-open, unchanged
}

// Consult proxycheck.io only once a client has already produced this many wrong
// guesses. Keeps the paid/quota'd lookup off the happy path entirely — a visitor
// who answers correctly never triggers one.
const PROXY_CHECK_AFTER_WRONG_GUESSES = 3;
const PROXY_VERDICT_TTL_S = 86_400;
// A failed lookup is re-tried soon instead of being trusted for a day: caching
// it long would let one proxycheck outage whitelist every attacking IP.
const PROXY_UNKNOWN_TTL_S = 60;
const WRONG_GUESS_WINDOW_S = 600;

/** Wrong guesses from this IP in the 10 min since its first one, this one included. */
async function countWrongGuess(ip: string): Promise<number> {
  if (!redis) return 0;
  try {
    const key = `whisper:wrong:${ip}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, WRONG_GUESS_WINDOW_S); // TTL on create only → fixed window
    return n;
  } catch (err) {
    // 0 = "not enough wrong guesses yet", so an outage skips the proxy lookup
    // instead of 500ing. Fail-open matches the rest of this path.
    console.error('[whisper] wrong-guess count failed:', err);
    return 0;
  }
}

/**
 * proxyVerdict behind a Redis cache: a sustained attack from one IP costs one
 * external lookup per day, not one per guess. Cache is guess-path only — the
 * submission path stays uncached so a stale false positive can't lock a real
 * sender out for a day.
 */
async function isVpnOrProxyCached(ip: string): Promise<boolean> {
  if (!redis) return isVpnOrProxy(ip);
  const key = `whisper:proxy:${ip}`;
  try {
    // 'yes'/'no', not '1'/'0': Upstash JSON-parses values on read, so numeric
    // strings would come back as numbers.
    const cached = await redis.get<string>(key);
    // A cached 'unknown' is honoured too (short TTL): during a proxycheck outage
    // this stops every guess turning into another doomed external call.
    if (cached === 'yes' || cached === 'no' || cached === 'unknown')
      return cached === 'yes';
    const verdict = await proxyVerdict(ip);
    await redis.set(key, verdict, {
      ex: verdict === 'unknown' ? PROXY_UNKNOWN_TTL_S : PROXY_VERDICT_TTL_S,
    });
    return verdict === 'yes'; // 'unknown' → fail-open
  } catch (err) {
    // Cache unavailable → fall back to the uncached lookup, which fails open on
    // its own errors. Never a 500.
    console.error('[whisper] proxy cache failed:', err);
    return isVpnOrProxy(ip);
  }
}

// Question is derived per IP per hour rather than picked at random, keyed on the
// PLATFORM-VERIFIED IP: keying on the spoofable one would have let a client roll
// a new question per request just by editing a header, which is the whole
// property this is meant to have. What this actually buys: re-rolling GET from
// ONE IP is useless — same question every time. What it does NOT stop: anyone
// with N egress IPs (cheap residential
// proxies) gets N independent rolls per hour and reads the question text
// straight out of the GET body, so shopping for the low-entropy question is
// still possible at the cost of a proxy pool. GET stays free of the proxycheck
// lookup on purpose — an external round-trip on every page load is the wrong
// trade for a personal-site spam gate.
// Keyed by TOKEN_SECRET so the IP → question map isn't precomputable offline.
// Window (1h) exceeds the token TTL (30m), so a token in flight never has its
// question rotate out from under the user.
const QUESTION_WINDOW_MS = 60 * 60 * 1000;

// Returns undefined only when the bank is unconfigured; callers answer 503.
async function questionForClient(ip: string): Promise<QuizQuestion | undefined> {
  // Nothing stable to key on (or no secret to key with) → fall back to random.
  if (ip === 'unknown' || !TOKEN_SECRET) return randomQuestion();
  const window = Math.floor(Date.now() / QUESTION_WINDOW_MS);
  const digest = await hmac(TOKEN_SECRET, `question:${ip}:${window}`);
  // hmac() returns base64; fold 4 decoded bytes into a uint32 before reducing,
  // so the modulo bias stays ~QUIZ_COUNT/2^32 whatever the bank size grows to.
  const bytes = atob(digest);
  let acc = 0;
  for (let i = 0; i < 4; i++) acc = (acc * 256 + bytes.charCodeAt(i)) % QUIZ_COUNT;
  return questionAt(acc);
}

// SHA-256 hash of message for dedup
async function msgHash(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- GET: issue a submission proof token + the question to ask ---
// Only the question TEXT and its opaque id go out. Answers never leave the server.
export async function GET(req: NextRequest) {
  const ip = getIP(req); // rate limiting only — spoofable by design
  // Skip when IP is 'unknown': one shared bucket would lock out every visitor.
  // Fails OPEN when redis is null or errors — a limiter outage must not take the
  // page down, and POST already fails closed in prod without redis, so nothing
  // that this endpoint hands out can be cashed in anyway.
  if (getRatelimit && ip !== 'unknown') {
    try {
      const { success } = await getRatelimit.limit(ip);
      if (!success) {
        return NextResponse.json({ error: 'slow down' }, { status: 429 });
      }
    } catch (err) {
      console.error('[whisper] GET rate limit failed:', err);
    }
  }

  const q = await questionForClient(getTrustedIP(req));
  // No bank configured (WHISPER_QUIZ missing or malformed) — fail closed rather
  // than serve an ungated form.
  if (!q) {
    return NextResponse.json({ error: 'misconfigured' }, { status: 503 });
  }
  const ts = Date.now().toString(36);
  const quiz = { id: q.id, question: q.question };

  if (!TOKEN_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'misconfigured' }, { status: 503 });
    }
    // dev: unsigned token, but keep the shape so POST can recover the quiz id
    return NextResponse.json({ token: `${ts}.${q.id}.dev`, quiz });
  }
  const sig = await hmac(TOKEN_SECRET, `${ts}.${q.id}`);
  return NextResponse.json({ token: `${ts}.${q.id}.${sig}`, quiz });
}

// --- POST: receive a whisper ---
export async function POST(req: NextRequest) {
  if (!WHISPER_BUCKET) {
    return NextResponse.json({ error: 'storage not configured' }, { status: 503 });
  }

  // Content-Length guard — reject before parsing. A missing header parsed to 0
  // and a malformed one to NaN, and `NaN > MAX` is false, so both walked past
  // this check; require a real number instead.
  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'too large' }, { status: 413 });
  }

  // Origin check — require a valid origin; reject missing or cross-origin
  const origin = req.headers.get('origin');
  const validOrigin =
    process.env.NODE_ENV === 'production'
      ? /^https:\/\/vedant\.to$/.test(origin ?? '')
      : /^(https:\/\/vedant\.to|https?:\/\/localhost(:\d+)?)$/.test(origin ?? '');
  if (!validOrigin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: {
    message?: string;
    _trap?: string;
    token?: string;
    quizAnswer?: string;
    quizOnly?: boolean;
  };
  try {
    // Read as text first: Content-Length is client-supplied, so the only honest
    // size check is on the bytes that actually arrived.
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'too large' }, { status: 413 });
    }
    const parsed: unknown = JSON.parse(raw);
    // `null` and bare scalars are valid JSON; without this every field read
    // below would throw on them.
    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  // Honeypot
  if (body._trap) return NextResponse.json({ ok: true });

  // Submission proof token — must have loaded the page within last 30 min.
  // Signature only here; the burn happens further down, once we know the
  // request is actually going to be stored.
  const token = body.token ?? '';
  const verified = await verifyTokenSignature(token);
  if (!verified.ok) {
    if (verified.reason === 'too_soon') {
      // 425, NOT 403: the answer was never even looked at, so the client must
      // not paint this as "wrong". The gate itself is unchanged — waiting is the
      // only way through, and the retry is re-checked here against the signed ts.
      return NextResponse.json(
        { error: 'too soon', code: 'too_soon', retryAfterMs: verified.waitMs },
        { status: 425 }
      );
    }
    // Distinct codes so the client can refresh a stale token silently instead of
    // reporting a correct answer as wrong. Both stay 403 + generic message.
    const code = verified.reason === 'expired' ? 'expired' : 'invalid';
    return NextResponse.json({ error: 'invalid token', code }, { status: 403 });
  }

  // The question is recovered from the signed payload, never from the body,
  // so the client can't answer a different question than the one it was asked.
  const question = findQuestion(verified.quizId);
  if (!question) {
    return NextResponse.json({ error: 'invalid token' }, { status: 403 });
  }

  // Two IPs, two jobs (see lib/request.ts): `ip` is best-effort and spoofable,
  // fine for throttling; `trustedIp` is platform-verified and is the only one
  // allowed to key a security decision or an identity.
  const ip = getIP(req);
  const trustedIp = getTrustedIP(req);

  if (!isCorrectAnswer((body.quizAnswer ?? '').slice(0, 200), question)) {
    // Throttle only wrong guesses: keeps typos free while capping brute force
    // over a small answer space. Skip when IP is 'unknown' (see below).
    if (quizRatelimit && ip !== 'unknown') {
      try {
        const { success } = await quizRatelimit.limit(ip);
        if (!success) {
          return NextResponse.json({ error: 'slow down' }, { status: 429 });
        }
      } catch (err) {
        // Same fail-closed-in-prod reasoning as the !redis branch below.
        console.error('[whisper] quiz rate limit failed:', err);
        if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'slow down' }, { status: 429 });
        }
      }
    } else if (!redis && process.env.NODE_ENV === 'production') {
      // Fail-closed in prod, same as burnToken — with no limiter store the quiz
      // is an unmetered brute-force oracle over a tiny answer space.
      return NextResponse.json({ error: 'slow down' }, { status: 429 });
    }

    // Non-IP-keyed backstop: the per-IP limiter above is exactly what a proxy
    // pool defeats, so cap total wrong guesses site-wide as well.
    if (globalQuizRatelimit) {
      try {
        const { success } = await globalQuizRatelimit.limit('all');
        if (!success) {
          return NextResponse.json({ error: 'slow down' }, { status: 429 });
        }
      } catch (err) {
        console.error('[whisper] global quiz rate limit failed:', err);
        if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'slow down' }, { status: 429 });
        }
      }
    }

    // VPN/proxy block on the guessing path too — otherwise IP rotation walks
    // straight past the per-IP cap. Deferred until this client has actually
    // shown it's guessing, and cached, so the external lookup never runs for a
    // visitor who answers correctly. A VPN user who typos three times is
    // blocked here, which matches the submission path: it already refuses VPN
    // IPs outright, so they could not have submitted anyway.
    // The counter stays on the throttling IP (it's part of the guess throttle),
    // but the verdict itself is a block decision, so it keys on trustedIp.
    if (
      redis &&
      ip !== 'unknown' &&
      trustedIp !== 'unknown' &&
      (await countWrongGuess(ip)) >= PROXY_CHECK_AFTER_WRONG_GUESSES &&
      (await isVpnOrProxyCached(trustedIp))
    ) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Distinct + non-revealing: no hint about the answer or which part matched.
    // Tagged so the client shows "wrong." for THIS and not for a token problem.
    return NextResponse.json(
      { error: 'wrong answer', code: 'wrong_answer' },
      { status: 403 }
    );
  }

  // Gate check only — the client asking "was that right?" before showing the
  // message box. Costs no token burn and no submission slot.
  if (body.quizOnly) {
    return NextResponse.json({ ok: true });
  }

  const message = (body.message ?? '').trim().slice(0, 1000);
  if (!message || message.length < 5) {
    return NextResponse.json({ error: 'too short' }, { status: 400 });
  }

  // Block VPN/proxy/datacenter IPs — fail-open on API timeout. trustedIp only:
  // a spoofed header would otherwise let anyone pick an IP the lookup clears.
  if (await isVpnOrProxy(trustedIp)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Rate limit before storing — every real submission counts against the quota,
  // so it keys on trustedIp: on the spoofable one, 3-per-24h was a header edit
  // away from unlimited. Skip 'unknown': one shared bucket locks out everyone.
  if (ratelimit && trustedIp !== 'unknown') {
    try {
      const { success } = await ratelimit.limit(trustedIp);
      if (!success) {
        return NextResponse.json({ error: 'slow down' }, { status: 429 });
      }
    } catch (err) {
      // Fail closed in prod: unmetered, this is the endpoint that sends mail.
      console.error('[whisper] submission rate limit failed:', err);
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'slow down' }, { status: 429 });
      }
    }
  }

  // Dedup BEFORE the burn: both are Redis writes, and burning first meant an
  // outage here spent the user's single-use token, dropped the message, and
  // still 500'd. This way the worst case of a dedup failure is a duplicate.
  // Silent drop for an exact duplicate message from the same IP within 24h.
  if (redis) {
    try {
      const hash = await msgHash(message);
      const dedupKey = `whisper:dedup:${trustedIp}:${hash}`;
      const seen = await redis.set(dedupKey, 1, { nx: true, ex: 86400 });
      if (seen === null) {
        return NextResponse.json({ ok: true }); // silent — don't confirm dedup to sender
      }
    } catch (err) {
      // Non-fatal: dedup is spam hygiene, not a security control. A Redis blip
      // must not cost someone their message.
      console.error('[whisper] dedup check failed:', err);
    }
  }

  // Fail closed before burning the token: a half-configured R2 env exports
  // `r2` as null, and the sender should get a retryable 503, not a spent token.
  if (!r2) {
    return NextResponse.json({ error: 'storage unavailable' }, { status: 503 });
  }

  // Burn the token late, so only a submission that gets this far spends it.
  if (!(await burnToken(token))) {
    return NextResponse.json({ error: 'invalid token' }, { status: 403 });
  }

  const ts = new Date().toISOString();
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const key = `whispers/${ts}-${rand}.json`;

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: WHISPER_BUCKET,
        Key: key,
        Body: JSON.stringify({ message, ts }),
        ContentType: 'application/json',
      })
    );
  } catch (err) {
    console.error('[whisper] R2 write failed:', err);
    return NextResponse.json({ error: 'storage error' }, { status: 500 });
  }

  const toEmail = process.env.WHISPER_TO_EMAIL;
  if (resend && toEmail) {
    await resend.emails
      .send({
        from: 'whisper@vedant.to',
        to: toEmail,
        subject: 'new whisper',
        text: message,
      })
      .catch((err: unknown) => {
        console.error('[whisper] email send failed:', err);
      });
  }

  return NextResponse.json({ ok: true });
}
