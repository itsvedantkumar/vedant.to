import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

// Fail closed: partial Upstash config is a misconfiguration.
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
if ((upstashUrl && !upstashToken) || (!upstashUrl && upstashToken)) {
  throw new Error(
    'Upstash misconfigured: set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN or neither'
  );
}

const redis = upstashUrl && upstashToken ? Redis.fromEnv() : null;

// 10 requests per IP per hour sliding window (defense-in-depth; upload is auth-gated)
const uploadRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 h'),
      prefix: 'upload',
    })
  : null;

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-upload-secret') ?? '';
  const expected = process.env.UPLOAD_SECRET ?? '';
  const enc = new TextEncoder();
  const a = enc.encode(secret);
  const b = enc.encode(expected);
  const maxLen = Math.max(a.byteLength, b.byteLength);
  const aPadded = new Uint8Array(maxLen);
  const bPadded = new Uint8Array(maxLen);
  aPadded.set(a);
  bPadded.set(b);
  const unauthorized =
    !secret ||
    !expected ||
    (() => {
      let diff = 0;
      for (let i = 0; i < maxLen; i++) diff |= aPadded[i] ^ bPadded[i];
      return diff !== 0;
    })();
  if (unauthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Content-Length pre-check — reject before parsing body
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  // Rate limit (defense-in-depth; upload is already auth-gated)
  if (uploadRatelimit) {
    const ip = req.headers.get('x-vercel-forwarded-for') ?? 'unknown';
    const { success } = await uploadRatelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const ALLOWED_TYPES: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    // AVIF excluded until magic-byte validation is implemented
  };

  const contentType = ALLOWED_TYPES[file.type] ? file.type : null;
  if (!contentType) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  // Verify magic bytes match the declared type
  const header = new Uint8Array(bytes.slice(0, 12));
  const isJpeg = header[0] === 0xff && header[1] === 0xd8;
  const isPng =
    header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  // Full 6-byte GIF signature: GIF87a or GIF89a
  const isGif =
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38 &&
    (header[4] === 0x37 || header[4] === 0x39) &&
    header[5] === 0x61;
  // WebP: RIFF prefix (bytes 0-3) + WEBP marker (bytes 8-11)
  const isWebp =
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50;

  if (!isJpeg && !isPng && !isGif && !isWebp) {
    return NextResponse.json(
      { error: 'File content does not match declared type' },
      { status: 415 }
    );
  }

  // Random UUID key — no user-controlled component to prevent double-extension attacks
  const ext = ALLOWED_TYPES[contentType];
  const key = `${crypto.randomUUID()}${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: contentType,
    })
  );

  return NextResponse.json({ url: `https://assets.vedant.to/${key}` });
}
