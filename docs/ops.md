# Ops Worker

Backups and health checks run on a Cloudflare Worker, `ops/worker/index.mjs`, instead of
GitHub Actions. Actions has been billing-locked since 2026-09-03 and the lock is permanent,
so these jobs moved somewhere that does not depend on it. `security.yml` is still in the
repo but never runs for the same reason; `.githooks/pre-push` already runs `gitleaks`,
`osv-scanner` and `zizmor` locally on every push.

## What runs where

| Job        | Where                                   | Schedule                       | Does                                                                                                                                                                                                                                                                      |
| ---------- | --------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup     | `ops/worker/index.mjs`, `runBackup`     | daily 03:17 UTC                | Fetches the GitHub tarball of `main`, writes it to the private backup bucket as `backups/repo-YYYY-MM-DD.tar.gz`, prunes copies older than 30 days, and mirrors the public asset bucket into `r2-assets/` in the same bucket.                                             |
| Health     | `ops/worker/index.mjs`, `runHealth`     | 00:20, 06:20, 12:20, 18:20 UTC | Probes `/`, `/blog`, `/rss.xml`, `/feed.json`, `/sitemap.xml`, `/robots.txt`, and checks the homepage response contains the site name. Emails once through Resend when it starts failing, once when it recovers. State lives at `health/state.json` in the backup bucket. |
| IndexNow   | `scripts/indexnow.mjs`, npm `postbuild` | every production build         | Pings IndexNow with every public URL. Runs only when `VERCEL_ENV=production` (or `INDEXNOW_FORCE=1`), so local, preview and CI builds skip it. The key is whichever `public/<32 hex>.txt` file exists.                                                                    |
| Link check | `npm run links`                         | manual, no schedule            | Runs `lychee` over `content/**/*.mdoc` and README.md. Run it yourself before a release.                                                                                                                                                                                   |

## Limits

The Worker runs on Cloudflare's free plan: 50 subrequests and 10 ms CPU per invocation.
Every R2 read or write is a subrequest, so the asset mirror copies at most 18 objects
(`MIRROR_BUDGET` in `ops/worker/index.mjs`) per backup run. A large batch of changed assets
converges over a few days instead of failing in one run. The tarball fetch is capped at
100 MB (`MAX_TARBALL_BYTES`); a repo bigger than that needs a different approach.

## Deploy

```sh
R2_BUCKET_NAME=<assets bucket> R2_BACKUP_BUCKET_NAME=<backup bucket> npm run ops:deploy
```

This runs `scripts/ops-deploy.mjs`, which reads `site.config.mjs` for the site's identity
(URL, host, name, GitHub repo, alert sender and recipient), takes the two bucket names from
the environment, writes `ops/worker/wrangler.generated.jsonc` (gitignored, so no identity
is checked in), and deploys it with `npx wrangler@4 deploy`. The backup bucket must differ
from the assets bucket; the script refuses to deploy otherwise.

One secret has to be set once, by hand, so it never touches argv or the generated config:

```sh
npx wrangler secret put RESEND_API_KEY --config ops/worker/wrangler.generated.jsonc
```

`ALERT_TO` is not a secret. It comes from `site.email.securityContact` in `site.config.mjs`
and is baked into the generated config on every deploy, alongside `ALERT_FROM`.

First forced run, 2026-09-03: `backups/repo-2026-09-03.tar.gz`, 760773 bytes, both the
backup and health crons finished green.

## Run it by hand

```sh
npx wrangler dev --config ops/worker/wrangler.generated.jsonc --test-scheduled
```

Then, in another terminal, fire the cron you want to test:

```sh
curl 'http://localhost:8787/__scheduled?cron=17+3+*+*+*'   # backup
curl 'http://localhost:8787/__scheduled?cron=20+*/6+*+*+*' # health
```

The Worker has no route of its own; `fetch()` only exists to answer `--test-scheduled`.

## Logs

```sh
npx wrangler tail --config ops/worker/wrangler.generated.jsonc
```

Each run logs one JSON line, `{"job": "backup", ...}` or `{"job": "health", ...}`, with
enough in it to see what happened without re-running the job: bytes written, objects pruned
and mirrored, or which paths failed.

## What was dropped, and why

Four scheduled workflows were deleted: `backup.yml`, `health.yml`, `indexnow.yml`,
`links.yml`. All four needed GitHub Actions, which is permanently billing-locked. What they
did, and where it lives now:

- Health's "prod lags main" check is gone outright. It needed a Vercel token to compare the
  deployed commit against `main`, and nothing replaces it yet.
- Backup's git tags (`backup/YYYY-MM-DD`) and workflow artifacts are gone. Git history
  already covers the same ground: the tag pointed at a commit already reachable from `main`,
  and the artifact held the same content the repo already tracks.
- Link checking is unscheduled. Run `npm run links` yourself before a release; it needs
  `lychee` (`brew install lychee`).
- IndexNow moved from a push-triggered workflow to a `postbuild` script, so it fires on the
  build that actually goes live rather than on every push to `main`.
