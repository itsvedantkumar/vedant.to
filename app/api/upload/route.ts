import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Ratelimit } from '@upstash/ratelimit';
import { NextRequest, NextResponse } from 'next/server';
import { ASSETS_URL } from '@/lib/constants';
import { getIP } from '@/lib/request';
import { timingSafeEqual } from '@/lib/timing';
import { r2 } from '@/lib/r2';
import { redis } from '@/lib/redis';
import { r2Env, uploadEnv } from '@/lib/env';
import {
  UPLOAD_ALLOWED_TYPES,
  UPLOAD_MAX_BYTES,
  contentLengthSchema,
  parseInput,
  uploadFileTypeSchema,
  uploadSecretHeaderSchema,
  uploadedFileSchema,
} from '@/lib/validation';

// 10 requests per IP per hour sliding window (defense-in-depth; upload is auth-gated)
const uploadRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 h'),
      prefix: 'upload',
    })
  : null;

const UNAUTHORIZED = {
  status: 401,
  error: 'Unauthorized',
  includeIssues: false,
} as const;

export async function POST(req: NextRequest) {
  // Shape first, comparison second: an absent or empty header is rejected as
  // unauthorized rather than compared, so timingSafeEqual is never handed ''.
  const offered = parseInput(
    req.headers.get('x-upload-secret'),
    uploadSecretHeaderSchema,
    UNAUTHORIZED
  );
  if (!offered.ok) return offered.response;
  const expected = uploadEnv().UPLOAD_SECRET;
  if (!expected || !timingSafeEqual(offered.data, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Content-Length pre-check — reject before parsing body. A malformed header
  // parsed to NaN, and `NaN > MAX_BYTES` is false, so it slipped through; the
  // schema rejects NaN outright. (The post-parse byteLength check below is the
  // authority either way — this header is client-supplied.)
  const declared = parseInput(
    req.headers.get('content-length') ?? '0',
    contentLengthSchema,
    { status: 413, error: 'File too large', includeIssues: false }
  );
  if (!declared.ok) return declared.response;

  // Rate limit (defense-in-depth; upload is already auth-gated)
  // Skip when IP is 'unknown': a single shared bucket would lock out all users.
  if (uploadRatelimit) {
    const ip = getIP(req);
    if (ip !== 'unknown') {
      try {
        const { success } = await uploadRatelimit.limit(ip);
        if (!success) {
          return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }
      } catch (err) {
        console.error('[upload] rate limit failed:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      }
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    // Malformed multipart body — the client's fault, not ours.
    console.error('[upload] form parse failed:', err);
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  const parsedFile = parseInput(form.get('file'), uploadedFileSchema, {
    status: 400,
    error: 'No file provided',
    includeIssues: false,
  });
  if (!parsedFile.ok) return parsedFile.response;
  const file = parsedFile.data;

  // Declared type only — the magic-byte check below is what actually decides.
  const parsedType = parseInput(file.type, uploadFileTypeSchema, {
    status: 415,
    error: 'Unsupported file type',
    includeIssues: false,
  });
  if (!parsedType.ok) return parsedType.response;
  const contentType = parsedType.data;

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > UPLOAD_MAX_BYTES) {
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
  const ext = UPLOAD_ALLOWED_TYPES[contentType];
  const key = `${crypto.randomUUID()}${ext}`;

  // Fail closed: a half-configured R2 env exports `r2` as null.
  const bucket = r2Env().bucketName;
  if (!r2 || !bucket) {
    return NextResponse.json({ error: 'storage unavailable' }, { status: 503 });
  }

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: contentType,
      })
    );
  } catch (err) {
    console.error('[upload] R2 write failed:', err);
    return NextResponse.json({ error: 'Storage error' }, { status: 500 });
  }

  return NextResponse.json({ url: `${ASSETS_URL}/${key}` });
}
