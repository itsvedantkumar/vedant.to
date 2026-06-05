#!/usr/bin/env node
/**
 * sync-images-to-r2.mjs
 *
 * Uploads every file under public/images/ to the R2 bucket, converting
 * PNG/JPG/JPEG to WebP (quality 82, max 1600px wide) before uploading.
 *
 * R2 key mapping:
 *   public/images/posts/slug/file.png → i/slug/file.webp
 *   (strip "images/posts/" prefix → "i/", always .webp extension)
 *
 * Skips unchanged files by comparing content hash against R2 ETag.
 * Sets immutable cache headers — Cloudflare serves from edge.
 *
 * Usage:
 *   node scripts/sync-images-to-r2.mjs          # upload new/changed files
 *   node scripts/sync-images-to-r2.mjs --dry     # report only, no writes
 *
 * Env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 * (.env.local loaded automatically in local dev)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

// Load .env.local in local dev
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } =
  process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('Missing R2 env vars.');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const COMPRESS = new Set(['.png', '.jpg', '.jpeg']);

function walk(dir) {
  const r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) r.push(...walk(full));
    else r.push(full);
  }
  return r;
}

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

/** Map local path → R2 key. Converts images/posts/ → i/ and forces .webp for compressible images. */
function toR2Key(absPath) {
  const rel = path.relative(path.join(ROOT, 'public'), absPath).replace(/\\/g, '/');
  // images/posts/slug/file.ext → i/slug/file.ext
  const withPrefix = rel.replace(/^images\/posts\//, 'i/');
  const ext = path.extname(withPrefix).toLowerCase();
  return COMPRESS.has(ext)
    ? withPrefix.replace(/\.(png|jpg|jpeg)$/i, '.webp')
    : withPrefix;
}

async function existsOnR2(key, contentHash) {
  try {
    const res = await s3.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
    );
    return (res.ETag || '').replace(/"/g, '') === contentHash;
  } catch {
    return false;
  }
}

if (!fs.existsSync(IMAGES_DIR)) {
  console.log('No public/images directory — nothing to upload.');
  process.exit(0);
}

const files = walk(IMAGES_DIR);
let uploaded = 0,
  skipped = 0,
  failed = 0;

for (const absPath of files) {
  const ext = path.extname(absPath).toLowerCase();
  const key = toR2Key(absPath);

  let buf;
  let contentType;
  if (COMPRESS.has(ext)) {
    buf = await sharp(absPath)
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    contentType = 'image/webp';
  } else if (ext === '.webp') {
    buf = fs.readFileSync(absPath);
    contentType = 'image/webp';
  } else if (ext === '.svg') {
    buf = fs.readFileSync(absPath);
    contentType = 'image/svg+xml';
  } else if (ext === '.gif') {
    buf = fs.readFileSync(absPath);
    contentType = 'image/gif';
  } else {
    buf = fs.readFileSync(absPath);
    contentType = 'application/octet-stream';
  }

  const hash = md5(buf);

  if (DRY) {
    console.log(`would upload: ${key}  (${(buf.length / 1024).toFixed(0)}KB)`);
    uploaded++;
    continue;
  }

  const unchanged = await existsOnR2(key, hash);
  if (unchanged) {
    skipped++;
    continue;
  }

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buf,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
    console.log(`✓ ${key}`);
    uploaded++;
  } catch (e) {
    console.error(`✗ ${key}: ${e.message}`);
    failed++;
  }
}

console.log(
  `\nDone: ${uploaded} uploaded, ${skipped} skipped (unchanged), ${failed} failed.`
);
process.exit(failed > 0 ? 1 : 0);
