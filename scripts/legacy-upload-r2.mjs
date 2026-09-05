#!/usr/bin/env node
/**
 * legacy-upload-r2.mjs
 *
 * Pushes the mirrored Framer runtime (legacy/assets/**, produced by
 * scripts/legacy-mirror.mjs) to the R2 assets bucket under the `fr-mirr/`
 * prefix, which is where legacy/worker/index.mjs reads it from.
 *
 * The files are gitignored on purpose: ~25 MB of fonts, images and JS chunks
 * belong on the CDN, not in every clone of this repo. Re-run the mirror to
 * rebuild them.
 *
 * Uploads through `wrangler r2 object put`, not the S3 SDK that
 * scripts/sync-images-to-r2.mjs uses, because wrangler authenticates with the
 * Cloudflare API token this machine already has. The S3-compatible credentials
 * (R2_ACCESS_KEY_ID and friends) are empty here.
 *
 * Idempotence comes from legacy/assets-manifest.json: a key is re-uploaded only
 * when its content hash changed. Pass --force to ignore the manifest, which is
 * what you want if the bucket and the manifest ever disagree.
 *
 * Usage:
 *   R2_BUCKET_NAME=<bucket> node scripts/legacy-upload-r2.mjs
 *   R2_BUCKET_NAME=<bucket> node scripts/legacy-upload-r2.mjs --dry
 *   R2_BUCKET_NAME=<bucket> node scripts/legacy-upload-r2.mjs --force
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'legacy/assets');
const MANIFEST = path.join(ROOT, 'legacy/assets-manifest.json');
const PREFIX = 'fr-mirr/';
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const CONCURRENCY = 8;

const bucket = process.env.R2_BUCKET_NAME;
if (!bucket) {
  console.error('legacy-upload-r2: set R2_BUCKET_NAME');
  process.exit(2);
}
if (!fs.existsSync(SRC)) {
  console.log(
    'legacy-upload-r2: no legacy/assets directory; run `npm run legacy:mirror` first'
  );
  process.exit(0);
}

// Mirrors the table in legacy/worker/index.mjs. The Worker falls back to the
// extension when an object carries no stored content type, so the two must
// agree or a font gets served as a download.
const CONTENT_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.framercms': 'application/octet-stream',
};

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn('npx', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

const manifest =
  FORCE || !fs.existsSync(MANIFEST) ? {} : JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const files = walk(SRC).sort();
const counts = { uploaded: 0, skipped: 0, failed: 0 };
const next = { ...manifest };

async function upload(file) {
  const key = PREFIX + path.relative(SRC, file).split(path.sep).join('/');
  const hash = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');

  if (manifest[key] === hash) {
    counts.skipped++;
    return;
  }
  if (DRY) {
    console.log(`would upload: ${key}`);
    counts.uploaded++;
    return;
  }

  const { code, stderr } = await run([
    '--yes',
    'wrangler@4',
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--file',
    file,
    '--content-type',
    CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    '--cache-control',
    'public, max-age=31536000, immutable',
    '--remote',
  ]);
  if (code === 0) {
    next[key] = hash;
    counts.uploaded++;
    if (counts.uploaded % 25 === 0) console.log(`  ${counts.uploaded} uploaded…`);
  } else {
    console.error(`FAILED ${key}: ${stderr.trim().split('\n').slice(-2).join(' ')}`);
    counts.failed++;
  }
}

let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
    while (cursor < files.length) await upload(files[cursor++]);
  })
);

if (!DRY) fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n');
console.log(
  `legacy-upload-r2: ${counts.uploaded} uploaded, ${counts.skipped} skipped, ` +
    `${counts.failed} failed (${files.length} files under ${PREFIX})`
);
process.exit(counts.failed > 0 ? 1 : 0);
