import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';

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
  const secret = req.headers.get('x-upload-secret');
  if (!secret || secret !== process.env.UPLOAD_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  // Verify magic bytes match the declared type
  const header = new Uint8Array(bytes.slice(0, 12));
  const isJpeg = header[0] === 0xff && header[1] === 0xd8;
  const isPng =
    header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  const isGif = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
  const isWebp =
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
