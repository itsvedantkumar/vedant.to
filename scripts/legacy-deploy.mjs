#!/usr/bin/env node
// Deploy legacy/worker (the archived Framer site) to Cloudflare with a
// generated wrangler config, the same way scripts/ops-deploy.mjs does: the
// checked-in Worker carries no identity, so `scripts/check-identity.mjs` stays
// honest and a fork deploys its own copy by editing site.config.mjs alone.
//
// The Worker serves legacy/site/** as static assets and reads the mirrored
// Framer runtime out of R2 under the `fr-mirr/` prefix, so run
// `node scripts/legacy-upload-r2.mjs` before the first deploy.
//
// Usage:
//   R2_BUCKET_NAME=<assets> npm run legacy:deploy

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, siteHost, legacyHost } from '../site.config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.R2_BUCKET_NAME;
if (!assets) {
  console.error('legacy-deploy: set R2_BUCKET_NAME');
  process.exit(2);
}

const siteDir = resolve(root, 'legacy/site');
if (!existsSync(siteDir)) {
  console.error(
    'legacy-deploy: legacy/site is missing; run `node scripts/legacy-mirror.mjs` first'
  );
  process.exit(2);
}

/**
 * A digest of what is currently mirrored, folded into the Worker's edge cache
 * key. Framer hash-names its files by their original content, the mirror
 * rewrites that content in place, so the filename alone would let the edge
 * serve pre-rewrite bytes for a year after a fix. This changes exactly when the
 * mirrored bytes change.
 */
/**
 * Keys the edge cache. The cached body is a function of the mirrored bytes and
 * of the Worker that serves them, so both go into the digest: a Worker fix that
 * changes a response header while the assets stay put still has to reach
 * visitors, and `immutable` means it otherwise would not for a year.
 */
function mirrorVersion() {
  const manifest = resolve(root, 'legacy/assets-manifest.json');
  const worker = resolve(root, 'legacy/worker/index.mjs');
  const digest = createHash('sha256');
  if (existsSync(manifest)) digest.update(readFileSync(manifest));
  digest.update(readFileSync(worker));
  return digest.digest('hex').slice(0, 12);
}

const config = {
  name: `${siteHost.replace(/\./g, '-')}-legacy`,
  main: resolve(root, 'legacy/worker/index.mjs'),
  compatibility_date: '2026-08-01',
  workers_dev: false,
  observability: { enabled: true },
  assets: {
    directory: siteDir,
    binding: 'ASSETS',
    // Framer's routes are extensionless; unknown paths get the archive's own
    // 404 page rather than the Worker's default empty body.
    html_handling: 'auto-trailing-slash',
    not_found_handling: '404-page',
    // Assets are matched before the Worker by default, which would answer a
    // /fr-mirr/ request with the archive's 404 page instead of running the
    // ?range= slicing. Everything goes through the Worker instead, which then
    // calls env.ASSETS.fetch() itself: a per-prefix list would leave the page
    // requests bypassing the Worker, and with them the noindex header it adds.
    run_worker_first: true,
  },
  r2_buckets: [{ binding: 'MIRROR', bucket_name: assets }],
  // No `routes` here on purpose. A `custom_domain` route makes wrangler call
  // PUT /zones/:zone/workers/routes, which this account's API token is not
  // scoped for (10000 Authentication error), and the whole deploy exits
  // non-zero after the Worker has already uploaded. The account-level
  // /workers/domains endpoint does the same job and the token can reach it, so
  // bindCustomDomain() below does it after the upload instead.
  vars: { LEGACY_URL: site.legacyUrl, MIRROR_VERSION: mirrorVersion() },
};

const out = resolve(root, 'legacy/worker/wrangler.generated.jsonc');
writeFileSync(out, JSON.stringify(config, null, 2) + '\n');

const args = ['--yes', 'wrangler@4', 'deploy', '--config', out, ...process.argv.slice(2)];
const res = spawnSync('npx', args, { stdio: 'inherit', cwd: root });
if (res.status !== 0) process.exit(res.status ?? 1);

/**
 * Point the archive's hostname at the Worker. Idempotent: the API answers a
 * repeat PUT with the same domain id, so this runs on every deploy.
 *
 * Zone and account ids are looked up from the zone name rather than committed,
 * for the same reason nothing else here is a literal.
 */
async function bindCustomDomain() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.warn(
      `legacy-deploy: CLOUDFLARE_API_TOKEN unset, so ${legacyHost} was not bound to the ` +
        'Worker. Bind it by hand under Workers > Settings > Domains & Routes.'
    );
    return;
  }
  const api = async (path, init) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...init?.headers,
      },
    });
    const body = await r.json();
    if (!body.success) {
      throw new Error(`${path}: ${JSON.stringify(body.errors ?? body)}`);
    }
    return body.result;
  };

  const [zone] = await api(`/zones?name=${encodeURIComponent(siteHost)}`);
  if (!zone) throw new Error(`no Cloudflare zone named ${siteHost}`);
  const domain = await api(`/accounts/${zone.account.id}/workers/domains`, {
    method: 'PUT',
    body: JSON.stringify({
      environment: 'production',
      hostname: legacyHost,
      service: config.name,
      zone_id: zone.id,
    }),
  });
  console.log(`legacy-deploy: ${domain.hostname} → ${domain.service} (${domain.id})`);
}

await bindCustomDomain().catch((err) => {
  console.error(`legacy-deploy: could not bind ${legacyHost}: ${err.message}`);
  process.exit(1);
});
