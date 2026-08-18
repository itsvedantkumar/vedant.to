import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Ratelimit } from '@upstash/ratelimit';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getIP } from '@/lib/request';
import { r2 } from '@/lib/r2';
import { redis } from '@/lib/redis';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// 3 requests per IP per 24h sliding window
const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '24 h'),
      prefix: 'whisper',
    })
  : null;

// --- Submission proof token (HMAC-SHA256, 30-minute TTL) ---
// GET /api/whisper issues a token; POST validates it.
// Proves the submitter loaded the page — stops bulk scripted submissions.
const TOKEN_SECRET = process.env.WHISPER_TOKEN_SECRET ?? '';
const TOKEN_TTL_MS = 30 * 60 * 1000;

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

async function verifyToken(token: string): Promise<boolean> {
  if (!TOKEN_SECRET) {
    // Fail-closed in prod — missing secret means misconfiguration
    if (process.env.NODE_ENV === 'production') return false;
    return true; // dev: skip
  }
  try {
    const [tsStr, sig] = token.split('.');
    if (!tsStr || !sig) return false;
    const ts = parseInt(tsStr, 36);
    const age = Date.now() - ts;
    if (age > TOKEN_TTL_MS) return false; // expired
    if (age < TOKEN_MIN_AGE_MS) return false; // too fast = bot
    const expected = await hmac(TOKEN_SECRET, tsStr);
    // Constant-time compare
    const enc = new TextEncoder();
    const a = enc.encode(sig);
    const b = enc.encode(expected);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    if (diff !== 0) return false;
    // Single-use: burn token in Redis so it can't be replayed.
    // Fail-closed in prod — without Redis a valid token is replayable ~600×
    // within its 30-min TTL, exhausting Resend quota and filling R2.
    if (redis) {
      const burned = await redis.set(`whisper:token:${sig}`, 1, {
        nx: true,
        ex: TOKEN_TTL_MS / 1000 + 60,
      });
      if (burned === null) return false; // already used
    } else if (process.env.NODE_ENV === 'production') {
      return false; // no dedup store → refuse rather than allow replay
    }
    return true;
  } catch {
    return false;
  }
}

// Check if IP is a known VPN, proxy, or datacenter via proxycheck.io (HTTPS, free tier)
async function isVpnOrProxy(ip: string): Promise<boolean> {
  if (ip === 'unknown' || ip === '127.0.0.1' || ip.startsWith('::')) return false;
  // Validate IP format before interpolating into URL
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;
  if (!ipRegex.test(ip)) return false;
  try {
    const key = process.env.PROXYCHECK_API_KEY
      ? `&key=${process.env.PROXYCHECK_API_KEY}`
      : '';
    const res = await fetch(`https://proxycheck.io/v2/${ip}?vpn=1&asn=1${key}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as Record<string, { proxy?: string }>;
    return data[ip]?.proxy === 'yes';
  } catch {
    return false; // fail-open — never block legitimate users due to API timeout
  }
}

// SHA-256 hash of message for dedup
async function msgHash(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- GET: issue a submission proof token ---
export async function GET() {
  if (!TOKEN_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'misconfigured' }, { status: 503 });
    }
    return NextResponse.json({ token: 'dev' });
  }
  const ts = Date.now().toString(36);
  const sig = await hmac(TOKEN_SECRET, ts);
  return NextResponse.json({ token: `${ts}.${sig}` });
}

// --- POST: receive a whisper ---
export async function POST(req: NextRequest) {
  if (!WHISPER_BUCKET) {
    return NextResponse.json({ error: 'storage not configured' }, { status: 503 });
  }

  // Content-Length guard — reject before parsing
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > 4096) {
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

  let body: { message?: string; _trap?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  // Honeypot
  if (body._trap) return NextResponse.json({ ok: true });

  // Submission proof token — must have loaded the page within last 30 min
  if (!(await verifyToken(body.token ?? ''))) {
    return NextResponse.json({ error: 'invalid token' }, { status: 403 });
  }

  const message = (body.message ?? '').trim().slice(0, 1000);
  if (!message || message.length < 5) {
    return NextResponse.json({ error: 'too short' }, { status: 400 });
  }

  const ip = getIP(req);

  // Block VPN/proxy/datacenter IPs — fail-open on API timeout
  if (await isVpnOrProxy(ip)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Rate limit first — every attempt counts against the quota.
  // Skip when IP is 'unknown': a single shared bucket would lock out all users.
  if (ratelimit && ip !== 'unknown') {
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: 'slow down' }, { status: 429 });
    }
  }

  // Dedup: silent drop for exact duplicate message from same IP within 24h
  if (redis) {
    const hash = await msgHash(message);
    const dedupKey = `whisper:dedup:${ip}:${hash}`;
    const seen = await redis.set(dedupKey, 1, { nx: true, ex: 86400 });
    if (seen === null) {
      return NextResponse.json({ ok: true }); // silent — don't confirm dedup to sender
    }
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
