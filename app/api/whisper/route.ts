import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

// Fail closed: if Upstash is configured at all, both vars must be present.
// If neither is set, we skip rate limiting (dev mode).
// If one is set but not the other, that's a misconfiguration — refuse to start.
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
if ((upstashUrl && !upstashToken) || (!upstashUrl && upstashToken)) {
  throw new Error(
    'Upstash misconfigured: set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN or neither'
  );
}

const ratelimit =
  upstashUrl && upstashToken
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(5, '24 h'),
        prefix: 'whisper',
      })
    : null;

// Use Vercel's tamper-proof forwarded header; falls back to x-real-ip
function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  );
}

export async function POST(req: NextRequest) {
  // Content-Length guard — reject oversized bodies before parsing
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > 4096) {
    return NextResponse.json({ error: 'too large' }, { status: 413 });
  }

  // Origin check — must come from same site (absent = non-browser, allowed through to rate limiter)
  const origin = req.headers.get('origin');
  if (origin && !origin.match(/^(https:\/\/vedant\.to|https?:\/\/localhost(:\d+)?)$/)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { message?: string; _trap?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  // Honeypot — naive HTML-form bots fill hidden fields
  if (body._trap) {
    return NextResponse.json({ ok: true });
  }

  const message = (body.message ?? '').trim().slice(0, 1000);
  if (!message || message.length < 5) {
    return NextResponse.json({ error: 'too short' }, { status: 400 });
  }

  // IP rate limit: 5 per 24h via Upstash (x-vercel-forwarded-for is not client-spoofable)
  if (ratelimit) {
    const ip = getIP(req);
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: 'slow down' }, { status: 429 });
    }
  }

  const ts = new Date().toISOString();
  const rand = Math.random().toString(36).slice(2, 8);
  const key = `whispers/${ts}-${rand}.json`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify({ message, ts }),
      ContentType: 'application/json',
    })
  );

  const toEmail = process.env.WHISPER_TO_EMAIL;
  if (process.env.RESEND_API_KEY && toEmail) {
    const resend = new Resend(process.env.RESEND_API_KEY);
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
