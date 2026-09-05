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

## Redacted lines (/sidequests)

Password-gated bullets are served by `POST /api/redact`. The ciphertext lives
only in the `REDACTED_LINES` env var (Vercel, production, sensitive), never in
the repo or the page, so there is nothing to brute force offline. scrypt
(128 MiB per guess) plus Upstash rate limits (5 attempts per IP per hour,
60 site-wide, spent atomically before the key derivation) bound online guessing; without Redis the route answers 503.

Add or rotate a line:

```sh
REDACT_PASSWORD='<password>' node scripts/redact.mjs <id> "<text>" > /tmp/lines.json
# merge into the existing map first if other ids exist: REDACTED_LINES='<current json>'
cd /tmp/vlink && npx --yes vercel@59.1.4 env rm REDACTED_LINES production -y
printf '%s' "$(cat /tmp/lines.json)" | npx --yes vercel@59.1.4 env add REDACTED_LINES production --sensitive
npx --yes vercel@59.1.4 redeploy <prod url>
```

The page references a line by id: `<Redacted id="birthday" />`. Lines sharing a
password unlock as a group: a correct guess returns every line that password
opens, so the reader types it once and the whole page reveals. A wrong guess
still costs exactly one key derivation, so this cannot be used to amplify load.

## Legacy archive Worker (old site)

The site that preceded this one was built in Framer. It is preserved verbatim at
`site.legacyUrl` by a second Cloudflare Worker, `legacy/worker/index.mjs`, deployed as
`<site-host>-legacy`. It shares nothing with the Next.js app. It has its own Worker, its own
domain, and its own copy of every asset, and Framer is not in the serving path at all.

| Piece          | Where                      | Notes                                                                         |
| -------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Rewritten HTML | `legacy/site/**` (tracked) | One file per route, served by the Worker's static-assets binding.             |
| Framer runtime | R2, `fr-mirr/` prefix      | JS chunks, fonts, images, CMS blobs. Built into `legacy/assets/`, gitignored. |
| Worker         | `legacy/worker/index.mjs`  | Static assets + R2 reads + the `?range=` slicing below.                       |

### Rebuild and deploy

```sh
npm run legacy:mirror                          # re-fetch, rewrite, write legacy/
R2_BUCKET_NAME=<assets bucket> npm run legacy:upload
R2_BUCKET_NAME=<assets bucket> npm run legacy:deploy
npm run legacy:verify -- --runtime          # against the deployed origin
```

`legacy:verify` is the acceptance test, and it runs against the live origin rather than
`legacy/` on disk, because the failures worth catching are the ones the Worker introduces: a
mirror key that never got uploaded, a `?range=` answer of the wrong length, a page that still
reaches Framer once hydrated. The static pass checks every route for a 200, the `noindex`
meta and header, and any third-party host; then it checks a real CMS blob byte for byte,
including the malformed-range 400s. `--runtime` adds the slow headless-browser pass, which is
the only one that can see a request made after hydration.

`legacy:upload` goes through `wrangler r2 object put`, not the S3 client
`scripts/sync-images-to-r2.mjs` uses, because wrangler authenticates with the Cloudflare API
token this machine already has and the S3-compatible R2 credentials are empty here. It skips
a file whose hash is unchanged in `legacy/assets-manifest.json`; pass `--force` if the bucket
and the manifest ever disagree. That manifest is gitignored, like `legacy/assets/` itself, so
a fresh clone starts with neither and `legacy:mirror` rebuilds both.

`legacy:mirror` drives a headless browser (`npx agent-browser`) over every route to discover
assets, because Framer builds some URLs at runtime that appear in no file you can fetch. The
icon components are the ones that bit me. It caches that list in `legacy/runtime-assets.txt`, so
`npm run legacy:mirror -- --no-runtime` reuses it and skips the slow pass.

### The things that will bite you

**`?range=` is not HTTP Range.** Framer's CMS reader fetches slices of a binary `.framercms`
blob with its own query parameter and rejects anything that is not a `200` whose body is
exactly the concatenated slices:

```js
if (res.status !== 200) throw Error(...)
if (bytes.length !== expectedTotal) throw Error(...)
```

R2's native range support answers `206`, so it cannot serve these directly. The Worker reads
the whole object and slices it instead. A blank blog or poetry page almost always means this
broke. Check that `GET /fr-mirr/cms/.../<name>-indexes-default-0.framercms?range=6159-8792`
returns 200 with exactly 2634 bytes.

**Mirrored URLs must keep their byte length.** Those blobs address themselves by absolute
byte offset, and they contain asset URLs. Rewriting `https://framerusercontent.com/` to
anything of a different length shifts every offset after it and the archive renders blank.
The replacement is `<legacyUrl>/fr-mirr/`, which is 30 bytes, the same as the original.
`scripts/legacy-mirror.mjs` asserts this and refuses to run otherwise. Changing `legacyUrl`
in `site.config.mjs` means changing the `fr-mirr` segment to compensate.

**The archive still had a way to reach Framer that no string search could find.** The
rewrite replaces literal URLs, and every `framerusercontent.com` string in `legacy/**` is
gone, verified. But `script_main.*.mjs` did
`await import('https://framer.com/edit/init.mjs')`, Framer's on-page editor bar. That module
loads `framer.com/m/phosphor-icons/<Icon>.js`, and those fetch the real icon components
straight from `framerusercontent.com`. So every route reached Framer through code that
exists in no file you can rewrite. `scripts/legacy-mirror.mjs` now swaps that import for a
`data:` URL exporting a no-op `createEditorBar`, and swaps the `api.framer.com/forms/v1/`
form action for a dead path on our own origin. Only the network view catches this class of
leak, which is why `npm run legacy:verify -- --runtime` exists and why its request blocklist
is wider than its HTML one. `framer.com` has to stay legal in the markup (the hidden badge
links to it) while staying illegal on the wire.

**Re-mirroring is not enough on its own; the edge has to be told.** Framer hash-names each
file after its own content, the mirror rewrites that content under the same name, and the
Worker serves it with `max-age=31536000, immutable`. A fix therefore sits in R2 while the
edge keeps serving the pre-fix bytes. This is not hypothetical: the editor-bar fix above
uploaded cleanly and `curl` still returned the old chunk. `scripts/legacy-deploy.mjs` sets
`MIRROR_VERSION` to a digest of `legacy/assets-manifest.json`, and the Worker folds it into
its `caches.default` key, so a deploy after a re-mirror invalidates exactly what changed.
This account's API token cannot purge cache, so do not go looking for that button.

### The archive's forms, and what that costs

The two Framer forms post to this site's `/api/whisper`. They have a single Message textarea
and nowhere to render the quiz question that endpoint normally asks, so tokens minted for
the legacy origin carry the sentinel quiz id `!legacy` and `POST` skips the quiz for them.
`!legacy` is reserved in `quizBankSchema` (`lib/env.ts`) so a real question can never collide
with it.

Be clear about the guarantee. `Origin` is unforgeable inside a browser and freely forged
everywhere else, and the archive's URL is public. That makes this CSRF protection, not
authentication. **Any scripted client can mint an `!legacy` token and skip the quiz.** The
HMAC only stops a token minted for one origin being replayed at the other. It does not make
the origin claim trustworthy. The quiz is this endpoint's real bot gate and this path does
not have one.

What bounds abuse on that path instead: the `whisper-legacy` limiter (2 per trusted IP per
24h) charged _on top of_ the normal `whisper` limiter (3/24h), the VPN/datacenter block, the
single-use token burn, the 3-second minimum token age, the honeypot, and the message dedup.
An unverifiable `trustedIp` is refused outright in production on this path, unlike the gated
one, because nothing else would stand in its way. Ceiling: two whispers per real egress IP
per day.

This is the tradeoff the owner accepted to keep the archive pixel-identical. If it stops
being enough, add a quiz field to the two forms in `scripts/legacy-mirror.mjs` and accept a
visibly different archive.
