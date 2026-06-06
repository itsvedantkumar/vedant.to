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

// Rate limiter: 5 requests per IP per day. Skipped if Upstash not configured.
let ratelimit: Ratelimit | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, '24 h'),
    prefix: 'whisper',
  });
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  // Origin check — must come from same site (or be absent for same-origin fetches)
  const origin = req.headers.get('origin');
  if (origin && !origin.match(/^https?:\/\/(vedant\.to|localhost(:\d+)?)$/)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { message?: string; _trap?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  // Honeypot — bots fill this field, humans never see it
  if (body._trap) {
    return NextResponse.json({ ok: true }); // silently accept, don't store
  }

  const message = (body.message ?? '').trim().slice(0, 1000);
  if (!message || message.length < 5) {
    return NextResponse.json({ error: 'too short' }, { status: 400 });
  }

  // IP rate limit: 5 per day
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

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails
      .send({
        from: 'whisper@vedant.to',
        to: process.env.WHISPER_TO_EMAIL ?? 'vk.work.official@gmail.com',
        subject: 'new whisper',
        text: message,
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
