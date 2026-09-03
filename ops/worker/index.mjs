// Ops Worker: the free replacement for the scheduled GitHub Actions jobs.
// Two cron triggers land in `scheduled()`; `event.cron` says which one fired.
//
//   BACKUP_CRON  daily   pull the repo tarball from GitHub into the private
//                        backup bucket, prune old copies, mirror the public
//                        assets bucket into `r2-assets/`.
//   HEALTH_CRON  4x/day  probe the live site; email once when it starts
//                        failing and once when it recovers.
//
// No identity lives here. `scripts/ops-deploy.mjs` derives every var from
// site.config.mjs and the R2 bucket names from the environment, then deploys
// with a generated wrangler config. The one secret, RESEND_API_KEY, is set
// once with `wrangler secret put`.
//
// Free-plan limits shape the code: 50 subrequests and 10 ms CPU per run.
// Every R2 call is a subrequest, so the mirror copies at most MIRROR_BUDGET
// objects per day and converges over successive runs.

const BACKUP_CRON = '17 3 * * *';
const HEALTH_CRON = '20 */6 * * *';
const HEALTH_PATHS = [
  '/',
  '/blog',
  '/rss.xml',
  '/feed.json',
  '/sitemap.xml',
  '/robots.txt',
];
const BACKUP_PREFIX = 'backups/';
const MIRROR_PREFIX = 'r2-assets/';
const STATE_KEY = 'health/state.json';
const KEEP_DAYS = 30;
const MIRROR_BUDGET = 18; // get + put per object, inside the 50-subrequest cap
const MAX_TARBALL_BYTES = 100 * 1024 * 1024;

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === BACKUP_CRON) {
      ctx.waitUntil(runBackup(env));
    } else if (event.cron === HEALTH_CRON) {
      ctx.waitUntil(runHealth(env));
    } else {
      console.warn(`unknown cron: ${event.cron}`);
    }
  },

  // The Worker has no route, so this only answers `wrangler dev --test-scheduled`.
  async fetch() {
    return new Response('ops worker: cron only', { status: 404 });
  },
};

/** @param {Env} env */
async function runBackup(env) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${BACKUP_PREFIX}repo-${today}.tar.gz`;
  const summary = { key, bytes: 0, pruned: 0, mirrored: 0, failures: [] };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${env.REPO}/tarball/${env.BRANCH}`,
      {
        headers: {
          'User-Agent': `${env.SITE_NAME}-ops-worker`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!res.ok) throw new Error(`tarball fetch ${res.status}`);
    // codeload streams without Content-Length; R2 needs a known size, so buffer.
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_TARBALL_BYTES)
      throw new Error(`tarball ${body.byteLength} bytes exceeds cap`);
    if (body.byteLength < 1024)
      throw new Error(`tarball suspiciously small: ${body.byteLength} bytes`);
    await env.BACKUPS.put(key, body, {
      httpMetadata: { contentType: 'application/gzip' },
    });
    summary.bytes = body.byteLength;
  } catch (err) {
    summary.failures.push(`snapshot: ${message(err)}`);
  }

  try {
    summary.pruned = await pruneOldBackups(env, today);
  } catch (err) {
    summary.failures.push(`prune: ${message(err)}`);
  }

  try {
    summary.mirrored = await mirrorAssets(env);
  } catch (err) {
    summary.failures.push(`mirror: ${message(err)}`);
  }

  console.log(JSON.stringify({ job: 'backup', ...summary }));
  if (summary.failures.length > 0) {
    await sendAlert(env, `[${env.SITE_HOST}] backup failed`, summary.failures.join('\n'));
  }
}

/** Delete dated snapshots older than KEEP_DAYS. Returns the count removed. */
async function pruneOldBackups(env, today) {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - KEEP_DAYS);
  const listed = await env.BACKUPS.list({ prefix: `${BACKUP_PREFIX}repo-` });
  const stale = listed.objects.filter((o) => {
    const m = /repo-(\d{4}-\d{2}-\d{2})\.tar\.gz$/.exec(o.key);
    return m && new Date(`${m[1]}T00:00:00Z`) < cutoff;
  });
  if (stale.length > 0) await env.BACKUPS.delete(stale.map((o) => o.key));
  return stale.length;
}

/** Copy assets whose etag differs into the backup bucket, MIRROR_BUDGET at a time. */
async function mirrorAssets(env) {
  const [live, mirrored] = await Promise.all([
    env.ASSETS.list({ limit: 1000 }),
    env.BACKUPS.list({ prefix: MIRROR_PREFIX, limit: 1000 }),
  ]);
  const have = new Map(
    mirrored.objects.map((o) => [o.key.slice(MIRROR_PREFIX.length), o.etag])
  );
  const pending = live.objects.filter(
    (o) => !o.key.startsWith(BACKUP_PREFIX) && have.get(o.key) !== o.etag
  );
  let copied = 0;
  for (const obj of pending.slice(0, MIRROR_BUDGET)) {
    const src = await env.ASSETS.get(obj.key);
    if (!src) continue;
    await env.BACKUPS.put(`${MIRROR_PREFIX}${obj.key}`, src.body, {
      httpMetadata: src.httpMetadata,
      customMetadata: src.customMetadata,
    });
    copied += 1;
  }
  if (pending.length > MIRROR_BUDGET) {
    console.log(
      `mirror: ${pending.length - MIRROR_BUDGET} objects left for the next run`
    );
  }
  return copied;
}

/** @param {Env} env */
async function runHealth(env) {
  const failures = [];
  const checks = await Promise.all(
    HEALTH_PATHS.map(async (path) => {
      const url = `${env.SITE_URL}${path}`;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': `${env.SITE_NAME}-ops-worker` },
          signal: AbortSignal.timeout(20_000),
        });
        if (res.status !== 200) return `${path}: HTTP ${res.status}`;
        if (path === '/') {
          const html = await res.text();
          if (!html.includes(env.SITE_NAME)) return `/: site name missing from homepage`;
        }
        return null;
      } catch (err) {
        return `${path}: ${message(err)}`;
      }
    })
  );
  for (const c of checks) if (c) failures.push(c);

  const now = new Date().toISOString();
  const prev = await readState(env);
  const failing = failures.length > 0;
  console.log(JSON.stringify({ job: 'health', failing, failures, at: now }));

  if (failing && !prev.failing) {
    await sendAlert(
      env,
      `[${env.SITE_HOST}] health check failing`,
      `${failures.join('\n')}\n\nChecked at ${now}`
    );
  } else if (!failing && prev.failing) {
    await sendAlert(
      env,
      `[${env.SITE_HOST}] health check recovered`,
      `All routes 200 again at ${now}.\nFailing since ${prev.since ?? 'unknown'}.`
    );
  }

  const next = failing
    ? { failing: true, since: prev.failing ? prev.since : now, last: failures }
    : { failing: false, since: null, last: [] };
  if (next.failing !== prev.failing) {
    await env.BACKUPS.put(STATE_KEY, JSON.stringify(next), {
      httpMetadata: { contentType: 'application/json' },
    });
  }
}

async function readState(env) {
  try {
    const obj = await env.BACKUPS.get(STATE_KEY);
    if (!obj) return { failing: false, since: null };
    const parsed = await obj.json();
    return {
      failing: Boolean(parsed.failing),
      since: typeof parsed.since === 'string' ? parsed.since : null,
    };
  } catch {
    return { failing: false, since: null };
  }
}

/** Email through Resend. Missing secrets log instead of throwing so a run still completes. */
async function sendAlert(env, subject, text) {
  if (!env.RESEND_API_KEY || !env.ALERT_TO) {
    console.warn(`alert not sent (RESEND_API_KEY/ALERT_TO unset): ${subject}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.ALERT_FROM, to: env.ALERT_TO, subject, text }),
  });
  if (!res.ok) console.error(`resend ${res.status}: ${await res.text()}`);
}

function message(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * @typedef {object} Env
 * @property {R2Bucket} ASSETS   public assets bucket, read only here
 * @property {R2Bucket} BACKUPS  private backup bucket
 * @property {string} SITE_URL   e.g. https://example.com
 * @property {string} SITE_HOST
 * @property {string} SITE_NAME
 * @property {string} REPO       owner/name on GitHub
 * @property {string} BRANCH
 * @property {string} ALERT_FROM verified Resend sender
 * @property {string} ALERT_TO   securityContact from site.config
 * @property {string} [RESEND_API_KEY] secret
 */
