# vedant.to

Personal site of Vedant Kumar. Essays, a daily log, and a quote collection.

[![CI](https://github.com/itsvedantkumar/vedant.to/actions/workflows/ci.yml/badge.svg)](https://github.com/itsvedantkumar/vedant.to/actions/workflows/ci.yml)
[![Node 22](https://img.shields.io/badge/node-22.x-informational)](.nvmrc)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Live at **[vedant.to](https://vedant.to)**. To run your own copy, start at
[Deploy your own](#deploy-your-own).

## Stack

Next.js 15 (App Router) with Keystatic as the CMS, Tailwind for styling, TypeScript
throughout, deployed on Vercel, with Upstash Redis for rate limiting and Cloudflare R2
for asset and whisper storage. Node 22.

There is no ESLint here. `npm run typecheck` and Prettier are the static gates, so do not
go looking for `npm run lint`.

## Content

Three Keystatic collections, all stored as flat files in the repo:

| Collection | Path              | Format  |
| ---------- | ----------------- | ------- |
| Posts      | `content/posts/`  | `.mdoc` |
| Daily      | `content/daily/`  | `.mdoc` |
| Quotes     | `content/quotes/` | `.yaml` |

Posts and daily entries both carry a `draft` boolean. **`draft: true` hides an entry
everywhere**: site listings, RSS, JSON Feed, and the sitemap. It is enforced once, at the
source, in `lib/posts.ts` and `lib/daily.ts`; `lib/feed-utils.ts` and
`app/sitemap.xml/route.ts` consume the already-filtered `getPublishedPosts()` /
`getPublishedDailyEntries()` rather than re-implementing the check. One filter, no drift.

This is also why backups must never land in a public bucket: an unpublished draft is
invisible on the site but sits in plain text in `content/`. See [Backup](#backup).

Quotes have no `draft` field. Everything in `content/quotes/` is public.

Images referenced from content live on the CDN, not in the repo. Keystatic writes an
upload to `public/images/`, `scripts/sync-images-to-r2.mjs` converts it to WebP and pushes
it to R2 on the next push to `main`, and the reference in the `.mdoc` points at
`assets.vedant.to`. Because the sync converts the file, the reference has to say `.webp`
too. `npm run fix-images` rewrites it, and `npm run check` fails if one was missed.

## Structure

- `app/` is the App Router. `(site)/` holds the public pages, `api/` the route handlers,
  `keystatic/` the CMS UI, `auth/keystatic/` the login and device-management screens.
- `lib/` holds the content readers (`posts.ts`, `daily.ts`, `reader.ts`), feed/SEO helpers,
  plus `auth/` and `webauthn/` for the `/keystatic` gate.
- `components/` holds the two client components that need to be client components.
- `content/` holds the three Keystatic collections above.
- `public/` holds static assets, including a hand-written `robots.txt`.
- `scripts/` holds content normalisers, the content auditor, the R2 image sync, `restore.sh`.
- `.github/workflows/` holds CI and the scheduled jobs (see [Deployment](#deployment)).
- `proxy.ts` is the `/keystatic` auth gate. It runs on the Node.js runtime.

Deliberately a list and not an ASCII tree: the tree that used to live here had drifted
wrong in four places.

## Running locally

```bash
git clone https://github.com/itsvedantkumar/vedant.to
cd vedant.to
npm install
cp .env.example .env.local
npm run dev
```

The site is at `http://localhost:3000`, the CMS at `http://localhost:3000/keystatic`.
Keystatic runs in local mode when the GitHub credentials are absent, so it writes straight
to disk and needs no OAuth for dev.

Env vars are documented in `.env.example`, not here. It explains the semantics of the
trickier ones (`KEYSTATIC_ENROLL_TOKEN`, `KEYSTATIC_SESSION_SECRET`) better than a table
could, and a second copy would only rot.

Before pushing:

```bash
npm run check   # tsc --noEmit, then scripts/audit-content.mjs, then npm test
```

Four more scripts help while writing:

| Command                       | Does                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| `npm run audit:content:watch` | Runs the content auditor continuously                          |
| `npm run fix-content`         | Rewrites frontmatter and Markdoc that Keystatic would reject   |
| `npm run fix-images`          | Slugifies image filenames and points CDN references at `.webp` |
| `npm run format`              | Prettier over the repo                                         |

## Keystatic auth

`/keystatic` is gated by WebAuthn passkeys, with a break-glass password as the recovery
path. Full design, env vars, and known limitations: **[docs/auth.md](docs/auth.md)**.

The one thing worth knowing up front: `KEYSTATIC_AUTH_MODE` defaults to `basic`. Anything
other than the literal string `passkey` keeps the old HTTP Basic Auth prompt, so shipping
the passkey code is deliberately a no-op until you opt in.

If the passkey gate is the only part you want, it lives standalone as a runnable Next.js
app at **[itsvedantkumar/keystatic-passkeys](https://github.com/itsvedantkumar/keystatic-passkeys)**,
same code, none of this site around it.

## Feeds and SEO

Three hand-rolled route handlers, all `export const dynamic = 'force-static'`, all sharing
`lib/feed-utils.ts` so the three outputs can't disagree about what's published:

- `app/rss.xml/`, RSS 2.0
- `app/feed.json/`, JSON Feed 1.1
- `app/sitemap.xml/`, sitemap

They are route handlers rather than Next's `sitemap.ts` / `robots.ts` conventions because
the shared-source-of-truth wiring is easier to see this way. `robots.txt` is a static file
in `public/`. OG images are generated per-page by `@vercel/og` at `/api/og`. The
`indexnow.yml` workflow pings IndexNow on every push to `main`, so new posts get crawled in
minutes instead of days.

## Deployment

Production deploys come from Vercel's Git integration on pushes to `main`, **not** from
GitHub Actions. That keeps releases independent of Actions billing and quota failures. A
red CI run never blocks a deploy.

GitHub Actions handles validation and support jobs only:

| Workflow             | Name                  | Trigger                  | Does                                                                                                           |
| -------------------- | --------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `ci.yml`             | CI                    | push to `main`, PR       | build, normalize-content, audit-content, `format:check`, `typecheck`, `npm test`, R2 image sync, Lighthouse CI |
| `health.yml`         | Production Health     | 4×/day                   | probes the live site, alerts if prod lags `main`                                                               |
| `backup.yml`         | Daily Content Backup  | daily 03:17 UTC          | tags, zips, and off-sites `content/` (see below)                                                               |
| `secret-scan.yml`    | Secret Scan           | push, PR, weekly         | `gitleaks`, weekly over full history                                                                           |
| `security-audit.yml` | Security Audit        | manifest changes, weekly | `npm audit`, fails on high/critical                                                                            |
| `indexnow.yml`       | IndexNow              | push to `main`           | pings IndexNow so new content is crawled fast                                                                  |
| `links.yml`          | Link Check            | weekly Mon 07:00 UTC     | `lychee` over `content/**/*.mdoc` and this README                                                              |
| `setup-env.yml`      | Setup Vercel Env Vars | manual only              | syncs secrets to Vercel, forces a redeploy                                                                     |

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fitsvedantkumar%2Fvedant.to&env=KEYSTATIC_GITHUB_CLIENT_ID,KEYSTATIC_GITHUB_CLIENT_SECRET,KEYSTATIC_SECRET,KEYSTATIC_AUTH_PASSWORD&envDescription=GitHub%20OAuth%20app%20credentials%20for%20the%20CMS%2C%20plus%20a%20password%20for%20%2Fkeystatic&envLink=https%3A%2F%2Fgithub.com%2Fitsvedantkumar%2Fvedant.to%2Fblob%2Fmain%2F.env.example&project-name=my-site&repository-name=my-site)

This is a personal site rather than a template, so the button gets you a running copy of
**my** site, and the steps below turn it into yours. Nothing here is hidden. The identity
table in [Make it yours](#2-make-it-yours) is the complete list of what to change.

### 1. Get it running

1. Fork the repo, then clone your fork.
2. Run `npm install`, `cp .env.example .env.local`, and `npm run dev`. The site comes up at
   `http://localhost:3000` with the CMS at `/keystatic`, writing to disk. No credentials
   are needed yet.
3. Delete my writing: `rm -rf content/posts/* content/daily/* content/quotes/*`. Keep the
   directories and keep `keystatic.config.ts`, which defines their shape.
4. Work through [Make it yours](#2-make-it-yours) before deploying, so the first build
   already carries your domain.

### 2. Make it yours

`lib/constants.ts` is the intended single source of truth (`SITE_URL`, `ASSETS_URL`,
`SITE_NAME`, `AUTHOR`, `TWITTER_HANDLE`). It is not yet the _only_ source: the same values
are hardcoded in the files below, because a `.mjs` config cannot import a TypeScript module
cleanly. Consolidating these is the main work in turning this into a
real template.

| Where                                                                  | What                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `lib/constants.ts`                                                     | site URL, asset URL, name, author, social handle         |
| `lib/json-ld.ts`                                                       | contact email in the `Person` schema, **on every page**  |
| `next.config.mjs`, `proxy.ts`                                          | the asset host, in `images` config and CSP               |
| `keystatic.config.ts`                                                  | GitHub `owner`/`name`, asset public path                 |
| `lib/webauthn/config.ts`                                               | passkey relying-party ID, user name, and allowed origins |
| `lib/auth/guard.ts`, `app/api/whisper/route.ts`                        | the origin allowlist                                     |
| `lib/auth/notify.ts`                                                   | the `from` address and subject prefix on security alerts |
| `scripts/sync-images-to-r2.mjs`                                        | R2 bucket and key prefix                                 |
| `public/robots.txt`, `public/.well-known/security.txt`                 | sitemap URL, contact, expiry                             |
| `.github/workflows/indexnow.yml` + `public/<key>.txt`                  | IndexNow key. Regenerate, don't reuse mine               |
| `.github/workflows/health.yml`                                         | the probed base URL and the homepage string it greps     |
| `.env.production`                                                      | the GA measurement ID                                    |
| `package.json`, `LICENSE`, `SECURITY.md`                               | project name, author, copyright, reporting address       |
| `app/(site)/layout.tsx`, `app/(site)/page.tsx`, `app/api/og/route.tsx` | name and links in the UI                                 |

**Rip out what isn't yours.** `/whisper` is an anonymous-message endpoint gated by a
personal-trivia quiz; the questions live in the `WHISPER_QUIZ` env var (deliberately not in
the repo), so it fails closed with a 503 until you set your own. `components/` holds two
easter eggs. `post-console-art.tsx` prints ASCII art to the devtools console for four
specific slugs and calls `console.clear()`. `CLAUDE.md` and `.claude/` are my agent
configuration and mean nothing in your fork.

### 3. Or let an agent do it

Paste this into Claude Code, Cursor, or any agent with repo access, in a fresh fork:

```text
This repo is a fork of itsvedantkumar/vedant.to, a Next.js 15 + Keystatic blog. Rebrand it
for me and leave the architecture alone.

My details:
- Name: <YOUR NAME>          - Short site name: <SHORT NAME>
- Domain: <example.com>      - Asset host: <assets.example.com>
- GitHub: <owner>/<repo>     - X: <@handle>   - LinkedIn: <url>
- Contact email: <you@example.com>

Do this:
1. Replace every occurrence of "Vedant", "Vedant Kumar", "vedant.to", "assets.vedant.to",
   "itsvedantkumar", and every vedant.to email address with my values. Start from
   lib/constants.ts, then work through lib/json-ld.ts, lib/metadata.ts, lib/webauthn/config.ts,
   lib/auth/guard.ts, lib/auth/notify.ts, keystatic.config.ts, next.config.mjs, proxy.ts,
   app/layout.tsx, app/(site)/layout.tsx, app/(site)/page.tsx, app/api/og/route.tsx,
   app/api/whisper/route.ts, app/manifest.ts, app/rss.xml/route.ts, app/feed.json/route.ts,
   scripts/sync-images-to-r2.mjs, package.json, LICENSE, SECURITY.md, public/robots.txt,
   public/.well-known/security.txt, and every file in .github/workflows/.
2. Empty content/posts/, content/daily/, and content/quotes/. Do not change
   keystatic.config.ts's collection schemas.
3. Delete the /whisper feature (app/(site)/whisper/, app/api/whisper/, lib/whisper-quiz.ts,
   and its entries in public/robots.txt), the easter eggs (components/easter-egg.tsx,
   components/post-console-art.tsx, and their imports in app/layout.tsx and the blog post
   page), CLAUDE.md, and .claude/.
4. Replace the IndexNow key: generate a new 32-character hex string, rename
   public/<old-key>.txt to <new-key>.txt with the key as its only content, and update
   .github/workflows/indexnow.yml.
5. Rewrite the intro paragraphs of README.md and the homepage copy in app/(site)/page.tsx
   in my voice.
6. Run `npm run check` and `npm run build` and fix what breaks.
7. Then list, and do not attempt yourself: the DNS records, the Vercel project and env
   vars, the Cloudflare R2 buckets, the Upstash Redis instance, and the GitHub OAuth app.
```

### 4. Set up the services

The site builds and serves content with none of these. Add each one only when you want
what it does.

| Service                 | Needed for                        | Without it                                          |
| ----------------------- | --------------------------------- | --------------------------------------------------- |
| GitHub OAuth app        | `/keystatic` in production        | The build fails; CI uses placeholders               |
| Vercel                  | Hosting                           | No hosting                                          |
| Upstash Redis           | Rate limiting, passkey storage    | Limits are skipped; `/keystatic` still fails closed |
| Cloudflare R2 (public)  | Image hosting                     | Uploads return 503                                  |
| Cloudflare R2 (private) | Daily backups, whisper messages   | `backup.yml` and `/api/whisper` fail                |
| Resend                  | Security alerts and whisper email | Alerts are dropped                                  |
| proxycheck.io           | VPN detection on `/whisper`       | The check is skipped                                |

Three env vars get a production build to pass: `KEYSTATIC_GITHUB_CLIENT_ID`,
`KEYSTATIC_GITHUB_CLIENT_SECRET`, and `KEYSTATIC_SECRET`. Add `KEYSTATIC_AUTH_PASSWORD`
and you can also get into `/keystatic`; without either that password or an Upstash Redis,
the gate fails closed and answers 503.
`.env.example` documents all 28 and says which are required. Set them in the Vercel
dashboard, or put them in GitHub Actions secrets and run the `setup-env.yml` workflow,
which pushes them to Vercel and redeploys.

**One thing I'd change if starting over.** The feeds and sitemap are hand-rolled route
handlers rather than Next's `sitemap.ts` / `robots.ts` conventions. That was a deliberate
call for a visible shared source of truth, but the conventions are less code.

## Backup

A scheduled GitHub Actions workflow runs daily at 03:17 UTC:

- Creates a `backup/YYYY-MM-DD` git tag pointing to the current commit
- Zips `content/` (and `public/images/` when it exists) and uploads it as a workflow
  artifact, retained 90 days. `public/images/` is normally **absent**: Keystatic writes
  uploads there, `sync-images-to-r2.mjs` pushes them to R2 on the next push to `main`, and
  the local copies are then redundant. The image corpus of record is R2, covered by the
  bucket mirror below, not by the zip.
- Copies the same zip off-GitHub to `s3://$R2_BACKUP_BUCKET_NAME/backups/content-YYYY-MM-DD.zip`
- Mirrors the live asset bucket to `s3://$R2_BACKUP_BUCKET_NAME/r2-assets/`, capturing objects
  that exist only in R2 (API uploads, whisper messages) and have no copy in the repo

Trigger a manual backup anytime from the Actions tab → "Daily Content Backup" → Run workflow.

Backups go to a **private** bucket (`R2_BACKUP_BUCKET_NAME`), never to `R2_BUCKET_NAME`. The
latter is the live asset bucket, fronted by the public domain `assets.vedant.to`. Anything
written there is world-readable, and backups can contain unpublished drafts. Keep these
separate.

### Restore

```sh
scripts/restore.sh path/to/content-backup.zip
```

Restores `content/` and `public/images/`, moving any existing copies aside to
`*.bak-<timestamp>` first. It verifies the archive and refuses entries outside those two trees.
Fetch the zip from an Actions artifact, from the private R2 bucket, or use a git tag directly:

```sh
git checkout backup/YYYY-MM-DD -- content public/images
```

R2-only objects restore in the opposite direction, with
`aws s3 sync s3://$R2_BACKUP_BUCKET_NAME/r2-assets/ s3://$R2_BUCKET_NAME/`.
