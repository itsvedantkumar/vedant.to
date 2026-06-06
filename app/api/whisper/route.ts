import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

// Fail closed: partial Upstash config is a misconfiguration.
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
if ((upstashUrl && !upstashToken) || (!upstashUrl && upstashToken)) {
  throw new Error(
    'Upstash misconfigured: set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN or neither'
  );
}

const redis = upstashUrl && upstashToken ? Redis.fromEnv() : null;
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
if (!TOKEN_SECRET && process.env.NODE_ENV === 'production') {
  console.error('WHISPER_TOKEN_SECRET not set — token validation bypassed in production');
}
const TOKEN_TTL_MS = 30 * 60 * 1000;

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

const TOKEN_MIN_AGE_MS = 15_000; // tokens submitted < 15s after issue = bot

async function verifyToken(token: string): Promise<boolean> {
  if (!TOKEN_SECRET) return true; // dev: skip if not configured
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
    // Single-use: burn token in Redis so it can't be replayed
    if (redis) {
      const burned = await redis.set(`whisper:token:${sig}`, 1, { nx: true, ex: 1800 });
      if (burned === null) return false; // already used
    }
    return true;
  } catch {
    return false;
  }
}

// Use Vercel's tamper-proof header — not client-spoofable
function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  );
}

// Check if IP is a known VPN, proxy, or datacenter via ip-api.com (free, fail-open)
async function isVpnOrProxy(ip: string): Promise<boolean> {
  if (ip === 'unknown' || ip === '127.0.0.1' || ip.startsWith('::')) return false;
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=proxy,hosting`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { proxy?: boolean; hosting?: boolean };
    return data.proxy === true || data.hosting === true;
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
    return NextResponse.json({ token: 'dev' });
  }
  const ts = Date.now().toString(36);
  const sig = await hmac(TOKEN_SECRET, ts);
  return NextResponse.json({ token: `${ts}.${sig}` });
}

// --- POST: receive a whisper ---
export async function POST(req: NextRequest) {
  // Content-Length guard — reject before parsing
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > 4096) {
    return NextResponse.json({ error: 'too large' }, { status: 413 });
  }

  // Origin check — https-only for production domain
  const origin = req.headers.get('origin');
  if (origin && !origin.match(/^(https:\/\/vedant\.to|https?:\/\/localhost(:\d+)?)$/)) {
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

  // Rate limit first — every attempt counts against the quota
  if (ratelimit) {
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
  const rand = Math.random().toString(36).slice(2, 8);
  const key = `whispers/${ts}-${rand}.json`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.WHISPER_BUCKET_NAME ?? process.env.R2_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify({ message, ts }),
      ContentType: 'application/json',
    })
  );

  const toEmail = process.env.WHISPER_TO_EMAIL;
  if (resend && toEmail) {
    await resend.emails
      .send({
        from: 'whisper@vedant.to',
        to: toEmail,
        subject: 'new whisper',
        text: message,
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
