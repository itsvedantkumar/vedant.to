#!/usr/bin/env node
// Deploy ops/worker to Cloudflare with a generated wrangler config.
//
// The checked-in Worker carries no identity: site name, host, repo and alert
// sender come from site.config.mjs, bucket names from the environment. That
// keeps `scripts/check-identity.mjs` honest and lets a fork deploy its own
// copy by editing one file.
//
// Usage:
//   R2_BUCKET_NAME=<assets> R2_BACKUP_BUCKET_NAME=<backups> npm run ops:deploy
// One-time secret (prompted, never on argv):
//   npx wrangler secret put RESEND_API_KEY --config ops/worker/wrangler.generated.jsonc

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, siteHost } from '../site.config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = process.env.R2_BUCKET_NAME;
const backups = process.env.R2_BACKUP_BUCKET_NAME;
if (!assets || !backups) {
  console.error('ops-deploy: set R2_BUCKET_NAME and R2_BACKUP_BUCKET_NAME');
  process.exit(2);
}
if (assets === backups) {
  console.error('ops-deploy: backup bucket must differ from the assets bucket');
  process.exit(2);
}

const config = {
  name: `${siteHost.replace(/\./g, '-')}-ops`,
  main: resolve(root, 'ops/worker/index.mjs'),
  compatibility_date: '2026-08-01',
  workers_dev: false,
  observability: { enabled: true },
  triggers: { crons: ['17 3 * * *', '20 */6 * * *'] },
  r2_buckets: [
    { binding: 'ASSETS', bucket_name: assets },
    { binding: 'BACKUPS', bucket_name: backups },
  ],
  vars: {
    SITE_URL: site.url,
    SITE_HOST: siteHost,
    SITE_NAME: site.name,
    REPO: `${site.github.owner}/${site.github.repo}`,
    BRANCH: 'main',
    ALERT_FROM: site.email.security,
    ALERT_TO: site.email.securityContact,
  },
};

const out = resolve(root, 'ops/worker/wrangler.generated.jsonc');
writeFileSync(out, JSON.stringify(config, null, 2) + '\n');

const args = ['--yes', 'wrangler@4', 'deploy', '--config', out, ...process.argv.slice(2)];
const res = spawnSync('npx', args, { stdio: 'inherit', cwd: root });
process.exit(res.status ?? 1);
