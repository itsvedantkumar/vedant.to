#!/usr/bin/env node
// Ping IndexNow with every public URL after a production build.
//
// Runs as npm `postbuild`, so Vercel calls it on each deploy. Anything other
// than a production build (local, preview, CI) exits early: IndexNow only
// wants URLs that are live, and only the production build produces those.
// Set INDEXNOW_FORCE=1 to run by hand.
//
// The key is whichever `public/<32 hex>.txt` file exists, so rotating it is a
// one-file change (see README "Make it yours").

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteHost } from '../site.config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Index-only sections: no per-item route, so only the listing page is submitted. */
const STATIC_PATHS = ['/', '/blog', '/daily', '/quotes', '/sidequests'];

const COLLECTIONS = [
  { dir: 'content/posts', route: '/blog' },
  { dir: 'content/daily', route: '/daily' },
];

export function findKey(publicDir) {
  const hits = readdirSync(publicDir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (hits.length !== 1)
    throw new Error(
      `expected one IndexNow key file in ${publicDir}, found ${hits.length}`
    );
  return hits[0].slice(0, -4);
}

export function isDraft(source) {
  return /^draft:\s*true\s*$/m.test(source);
}

export function collectUrls(host, contentRoot = root) {
  const urls = STATIC_PATHS.map((p) => `https://${host}${p}`);
  for (const { dir, route } of COLLECTIONS) {
    const abs = join(contentRoot, dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs).sort()) {
      if (!file.endsWith('.mdoc')) continue;
      if (isDraft(readFileSync(join(abs, file), 'utf8'))) continue;
      urls.push(`https://${host}${route}/${file.slice(0, -5)}`);
    }
  }
  return urls;
}

async function main() {
  if (process.env.VERCEL_ENV !== 'production' && !process.env.INDEXNOW_FORCE) {
    console.log('indexnow: skipped (not a production build)');
    return;
  }
  const key = findKey(join(root, 'public'));
  const urlList = collectUrls(siteHost);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host: siteHost,
      key,
      keyLocation: `https://${siteHost}/${key}.txt`,
      urlList,
    }),
  });
  // Never fail the build over a crawler ping: the deploy is already good.
  console.log(`indexnow: ${res.status} for ${urlList.length} urls`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) =>
    console.error(`indexnow: ${err instanceof Error ? err.message : err}`)
  );
}
