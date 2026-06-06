import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

export async function POST(req: NextRequest) {
  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const message = (body.message ?? '').trim().slice(0, 1000);
  if (!message) return NextResponse.json({ error: 'empty' }, { status: 400 });

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
