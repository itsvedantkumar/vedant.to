#!/usr/bin/env node
/**
 * sync-images-to-r2.mjs
 *
 * Uploads every file under public/images/ to the R2 bucket at the same key,
 * e.g. public/images/posts/slug/image.png → bucket key images/posts/slug/image.png
 *
 * Run once to migrate, then called from GitHub Actions on every deploy so
 * new images committed via Keystatic are always synced to R2/Cloudflare.
 *
 * Usage:
 *   node scripts/sync-images-to-r2.mjs          # upload all (skips unchanged via ETag)
 *   node scripts/sync-images-to-r2.mjs --dry     # print what would be uploaded, no writes
 *
 * Requires env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 * (load .env.local automatically when run locally)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

// Load .env.local in local dev (GitHub Actions injects env vars directly)
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
  console.error(
    'Missing R2 env vars. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.'
  );
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const IMAGES_DIR = path.join(ROOT, 'public', 'images');

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

function walk(dir) {
  const results = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...walk(full));
    else results.push(full);
  }
  return results;
}

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

async function existsOnR2(key, localMd5) {
  try {
    const res = await s3.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
    );
    // R2 ETag is the MD5 hex (no quotes) for single-part uploads
    const remoteEtag = (res.ETag || '').replace(/"/g, '');
    return remoteEtag === localMd5;
  } catch {
    return false;
  }
}

if (!fs.existsSync(IMAGES_DIR)) {
  console.log('No public/images directory found — nothing to upload.');
  process.exit(0);
}

const files = walk(IMAGES_DIR);
let uploaded = 0,
  skipped = 0,
  failed = 0;

for (const absPath of files) {
  const rel = path.relative(path.join(ROOT, 'public'), absPath); // images/posts/slug/file.png
  const key = rel.replace(/\\/g, '/');
  const ext = path.extname(absPath).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const buf = fs.readFileSync(absPath);
  const hash = md5(buf);

  if (DRY) {
    console.log(`would upload: ${key}`);
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
        // Long cache — Cloudflare can serve stale, images are immutable once committed
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
