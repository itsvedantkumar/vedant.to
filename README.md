# vedant.to

My _widdle cworner of ze intwernet_

[![CI](https://github.com/itsvedantkumar/vedant.to/actions/workflows/ci.yml/badge.svg)](https://github.com/itsvedantkumar/vedant.to/actions/workflows/ci.yml)
[![Next.js 16](https://img.shields.io/badge/next.js-16-black)](package.json)
[![Node 22](https://img.shields.io/badge/node-22.x-informational)](.nvmrc)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![live](https://img.shields.io/badge/live-vedant.to-6f42c1)](https://vedant.to)

Live at **[vedant.to](https://vedant.to)**. To run your own copy, start at
[Deploy your own](#deploy-your-own).

The content rules here are enforced by something that can fail rather than by remembering
them. `draft: true` is applied once, in `lib/posts.ts` and `lib/daily.ts`; the pages, both
feeds and the sitemap all read that one filtered list, so the four outputs cannot disagree
about what is published. CI runs the content normaliser and then fails on its own diff, so
a `.mdoc` that would break rendering cannot land quietly. What each gate catches is in
[What CI enforces](#what-ci-enforces).

## Stack

Next.js 16 (App Router) with Keystatic as the CMS, Tailwind CSS 4 for styling, TypeScript
throughout, deployed on Vercel, with Upstash Redis for rate limiting and Cloudflare R2
for asset and whisper storage. Node 22.

There is no ESLint here. `npm run typecheck` and Prettier are the static gates, so do not
go looking for `npm run lint`.

## Content

None of it starts here. I write in Notion, edit it there until it is done, and only then
publish to the site. That library is also personal data collection on myself, half for
whatever self-actualization it eventually adds up to and half so there is a backup if this
site ever gets fucked.

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

| path                         | what it is                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `app/(site)/`                | the public pages                                                                     |
| `app/api/`                   | 12 route handlers: the auth endpoints, OG images, upload, whisper                    |
| `app/keystatic/`             | the CMS UI                                                                           |
| `app/auth/keystatic/`        | the login and device-management screens                                              |
| `lib/`                       | content readers (`posts.ts`, `daily.ts`, `reader.ts`) and the feed/SEO helpers       |
| `lib/auth/`, `lib/webauthn/` | the `/keystatic` gate                                                                |
| `components/`                | the two client components that have to be client components                          |
| `content/`                   | the three collections above: 9 posts, 17 daily entries, 51 quotes                    |
| `public/`                    | static assets, including a hand-written `robots.txt`                                 |
| `scripts/`                   | the content normalisers, the auditor, the R2 image sync, `restore.sh`                |
| `tests/`                     | 13 `node:test` files, 104 cases. `tests/manual/` needs a live Redis; CI skips it     |
| `docs/`                      | the long-form design notes. One so far: [docs/auth.md](docs/auth.md)                 |
| `.github/workflows/`         | CI and the seven scheduled or triggered jobs (see [Deployment](#deployment))         |
| `proxy.ts`                   | the `/keystatic` auth gate. Node.js runtime, and in Next 16 that is not configurable |
| `.claude/`, `.conductor/`    | my agent tooling. It does nothing in a fork. Delete it                               |

A table and not an ASCII tree: the tree that used to be here had drifted wrong in four
places. Regenerate the counts with `ls content/posts/*.mdoc | wc -l`, the same for
`daily` and `quotes`, and `npm test` for the case count.

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
in `public/`. OG images are generated per-page by `next/og` at `/api/og`. The
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

## What CI enforces

Every step below can fail the run, in this order. The cheap static gates come first on
purpose, so a formatting typo fails in seconds rather than after a full build.

| Step                                            | Fails when                                                                                            | Catches                                                                                                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalize-content.mjs && git diff --exit-code` | the normaliser rewrote a tracked file                                                                 | a `.mdoc` Keystatic would reject, committed unfixed. The run fails and names the file instead of silently fixing it inside the runner                                                         |
| `audit-content.mjs`                             | a content rule is broken                                                                              | CDN references that are not `.webp`, and the other checks in `scripts/audit-content.mjs`                                                                                                      |
| `format:check`                                  | Prettier would rewrite a file                                                                         | formatting drift                                                                                                                                                                              |
| `typecheck`                                     | `tsc --noEmit` reports an error                                                                       | type regressions. There is no ESLint here, so this and Prettier are the whole static gate                                                                                                     |
| `npm test`                                      | any of the 104 cases fails                                                                            | the `draft: true` invariant (`tests/draft-invariant.test.ts`), the auth gate (`guard`, `session`, `enrollment`, `counter`, `timing`), the whisper route and its quiz, and metadata generation |
| `next build`                                    | the build errors                                                                                      | a route that only breaks at build time. Runs with placeholder Keystatic secrets; Vercel rebuilds with the real ones                                                                           |
| Lighthouse CI                                   | performance, accessibility or SEO scores below 0.90 on `/`, `/blog`, `/daily`, `/quotes`, over 3 runs | a regression in any of the three. Best-practices is a warning, not an error. Thresholds live in `lighthouserc.json`                                                                           |

A red run does not block the deploy. Vercel deploys from `main` independently, so CI is
a report rather than a gate. That is the trade for keeping releases off Actions quota.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fitsvedantkumar%2Fvedant.to&env=KEYSTATIC_GITHUB_CLIENT_ID,KEYSTATIC_GITHUB_CLIENT_SECRET,KEYSTATIC_SECRET,KEYSTATIC_AUTH_PASSWORD&envDescription=GitHub%20OAuth%20app%20credentials%20for%20the%20CMS%2C%20plus%20a%20password%20for%20%2Fkeystatic&envLink=https%3A%2F%2Fgithub.com%2Fitsvedantkumar%2Fvedant.to%2Fblob%2Fmain%2F.env.example&project-name=my-site&repository-name=my-site)

This is a personal site rather than a template. The button gets you a running copy of
**my** site; the steps below turn it into yours. Nothing here is hidden, and the identity
table in [Make it yours](#3-make-it-yours) is the full list of what to change.

### 1. What you need first

Three accounts, and that is the whole list: **GitHub** (the fork, and Keystatic's storage in
production), **Vercel** (hosting), and an agent you are already signed in to, such as Claude
Code or Cursor. Every command-line tool this repo touches is installed by
[step 4](#4-or-let-an-agent-do-it), so you do not have to set up a toolchain by hand.

**You do not need `vercel login`.** Nothing here drives the Vercel CLI from your local
session. The one place it runs is `.github/workflows/setup-env.yml:98`, as a pinned
`npx vercel@59.11.0 deploy --prod --token "$VERCEL_TOKEN"`. What Vercel needs from you is
three GitHub Actions secrets, not a login:

```bash
gh secret set VERCEL_TOKEN        # vercel.com/account/tokens
gh secret set VERCEL_ORG_ID       # Vercel → Settings → General
gh secret set VERCEL_PROJECT_ID   # Vercel → your project → Settings → General
```

Prefer clicking? Set the same values in the Vercel dashboard and skip `setup-env.yml`. It
exists so secrets live in one place and reach Vercel in one run.

### 2. Get it running

1. Fork the repo, then clone your fork.
2. Run `nvm use`, `npm install`, `cp .env.example .env.local`, then `npm run dev`. The site
   comes up at `http://localhost:3000` with the CMS at `/keystatic`, writing to disk. No
   credentials are needed yet, and `.env.local` can stay empty for now.
3. Delete my writing: `rm -rf content/posts/* content/daily/* content/quotes/*`. Keep the
   directories and keep `keystatic.config.ts`, which defines their shape.
4. Work through [Make it yours](#3-make-it-yours) before deploying, so the first build
   already carries your domain.

### 3. Make it yours

`lib/constants.ts` is the intended single source of truth (`SITE_URL`, `ASSETS_URL`,
`SITE_NAME`, `AUTHOR`, `TWITTER_HANDLE`). It is not yet the _only_ source: the files below
hardcode the same values, because a `.mjs` config, a shell script and a YAML workflow cannot
import a TypeScript module. Consolidating these is the main work in turning this into a real
template.

| Where                                                                  | What                                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `lib/constants.ts`                                                     | site URL, asset URL, name, author, social handle                  |
| `lib/json-ld.ts`                                                       | contact email in the `Person` schema, **on every page**           |
| `app/layout.tsx`                                                       | title template, default description, OG site name                 |
| `next.config.mjs`                                                      | the asset host, in `images.remotePatterns` and the CSP            |
| `keystatic.config.ts`                                                  | GitHub `owner`/`name`, asset public path                          |
| `lib/webauthn/config.ts`                                               | passkey relying-party ID, user name, allowed origins              |
| `lib/auth/guard.ts`, `app/api/whisper/route.ts`                        | the origin allowlist                                              |
| `lib/auth/notify.ts`                                                   | the `from` address and subject prefix on security alerts          |
| `app/manifest.ts`                                                      | PWA name and short name                                           |
| `app/rss.xml/route.ts`, `app/feed.json/route.ts`                       | feed title, author block                                          |
| `app/(site)/layout.tsx`, `app/(site)/page.tsx`, `app/api/og/route.tsx` | name and links in the UI                                          |
| `app/icon.png`, `app/apple-icon.png`, `public/icon-192.png`            | favicon and app icons. Still mine until you replace them          |
| `scripts/sync-images-to-r2.mjs`                                        | R2 bucket and key prefix                                          |
| `scripts/audit-content.mjs`, `scripts/normalize-images.mjs`            | hardcoded `assets.vedant.to` regexes. **See the trap below**      |
| `tests/guard.test.ts`                                                  | asserts on `vedant.to` origins, so `npm test` fails until changed |
| `public/robots.txt`, `public/.well-known/security.txt`                 | sitemap URL, contact, expiry                                      |
| `.github/workflows/indexnow.yml` + `public/<key>.txt`                  | IndexNow key. Regenerate, do not reuse mine                       |
| `.github/workflows/health.yml`                                         | the probed base URL and the homepage string it greps              |
| `.github/workflows/setup-env.yml`                                      | bucket names (`itsvedantkumar-keystatic`, `vedant-whispers`)      |
| `.github/workflows/backup.yml`                                         | the asset host, in a comment about bucket safety                  |
| `.env.example`                                                         | the `KEYSTATIC_RP_ID` comment says "defaults to vedant.to"        |
| `docs/auth.md`, `lib/renderers.tsx`                                    | `vedant.to` in curl examples and a comment                        |
| `package.json`, `LICENSE`, `SECURITY.md`                               | project name, author, copyright, reporting address                |

**A trap worth knowing.** `scripts/audit-content.mjs` matches CDN references with a literal
`https://assets.vedant.to` regex. Miss that row and `npm run check` still exits 0 on your
fork: the regex simply stops matching anything, so the check passes without checking. It
fails open, quietly. Change it in the same pass as `lib/constants.ts`.

**Rip out what is not yours.** `/whisper` is an anonymous-message endpoint gated by a
personal-trivia quiz. The questions live in the `WHISPER_QUIZ` env var, deliberately not in
the repo, so it fails closed with a 503 until you write your own. `components/` holds two
easter eggs: `easter-egg.tsx` prints a line to the devtools console site-wide, and
`post-console-art.tsx` prints ASCII art on every post and daily entry, hand-drawn for four
slugs and generated from the slug for the rest. `CLAUDE.md`, `.claude/` and `.conductor/`
are my agent configuration and mean nothing in your fork.

### 4. Or let an agent do it

Before pasting this, finish [step 1](#1-what-you-need-first): the agent needs to be signed
in and to have push access to your fork. It cannot create your DNS records, Vercel project,
R2 buckets, Upstash database, or GitHub OAuth app, and the prompt ends by telling it to say
so rather than pretend.

```text
This repo is a fork of itsvedantkumar/vedant.to, a Next.js 16 + Keystatic blog. Rebrand it
for me and leave the architecture alone.

My details:
- Name: <YOUR NAME>          - Short site name: <SHORT NAME>
- Domain: <example.com>      - Asset host: <assets.example.com>
- GitHub: <owner>/<repo>     - X: <@handle>   - LinkedIn: <url>
- Contact email: <you@example.com>

Do not run `vercel login`; this repo never uses a local Vercel session.

Do this:
1. Set up the toolchain before anything else, installing whatever is missing rather than
   asking me to. This repo pins Node 22 in .nvmrc and package.json "engines", so run
   `nvm install 22 && nvm use` (install nvm first if absent). Then `npm install`. Install
   the GitHub CLI if it is missing and run `gh auth login` if `gh auth status` fails; it is
   needed to set Actions secrets. Install the `aws` CLI only if I say I want the R2 backup
   and restore scripts. Report the versions you ended up with.
2. Replace every occurrence of "Vedant", "Vedant Kumar", "vedant.to", "assets.vedant.to",
   "itsvedantkumar", and every vedant.to email address with my values. Start from
   lib/constants.ts, then work through lib/json-ld.ts, lib/webauthn/config.ts,
   lib/auth/guard.ts, lib/auth/notify.ts, lib/renderers.tsx, keystatic.config.ts,
   next.config.mjs, app/layout.tsx, app/(site)/layout.tsx, app/(site)/page.tsx,
   app/api/og/route.tsx, app/api/whisper/route.ts, app/manifest.ts, app/rss.xml/route.ts,
   app/feed.json/route.ts, scripts/sync-images-to-r2.mjs, scripts/audit-content.mjs,
   scripts/normalize-images.mjs, tests/guard.test.ts, package.json, LICENSE, SECURITY.md,
   docs/auth.md, .env.example, public/robots.txt, public/.well-known/security.txt, and every
   file in .github/workflows/. Finish by grepping the repo for those strings and report any
   you could not change, rather than assuming the list above was complete.
3. Empty content/posts/, content/daily/, and content/quotes/. Do not change
   keystatic.config.ts's collection schemas.
4. Delete the /whisper feature: app/(site)/whisper/, app/api/whisper/, lib/whisper-quiz.ts,
   its lines in public/robots.txt, and its env vars in .env.example (WHISPER_TOKEN_SECRET,
   WHISPER_QUIZ, WHISPER_BUCKET_NAME, WHISPER_TO_EMAIL) and in .github/workflows/setup-env.yml.
5. Delete the easter eggs: components/easter-egg.tsx and components/post-console-art.tsx,
   plus their imports in app/layout.tsx, app/(site)/blog/[slug]/page.tsx AND
   app/(site)/daily/[slug]/page.tsx. Both page files import PostConsoleArt.
6. Delete CLAUDE.md, .claude/ and .conductor/. They are the previous owner's agent tooling.
7. Replace the IndexNow key: generate a new 32-character hex string, rename
   public/<old-key>.txt to <new-key>.txt with the key as its only content, and update
   .github/workflows/indexnow.yml.
8. Generate fresh values for every secret in .env.example and write them to .env.local,
   which you should create by copying .env.example. Each of KEYSTATIC_SECRET,
   KEYSTATIC_SESSION_SECRET, KEYSTATIC_ENROLL_TOKEN and UPLOAD_SECRET must be a new random
   string of at least 32 characters. Never reuse a value from the upstream repo.
9. Rewrite the intro paragraphs of README.md and the homepage copy in app/(site)/page.tsx
   in my voice. Update the Vercel deploy button URL at the top of the Deploy your own
   section to point at my repo.
10. Run `npm run check` and `npm run build` and fix what breaks. Note that
    scripts/audit-content.mjs fails open: if its asset-host regex still says assets.vedant.to
    it will pass without checking anything, so confirm step 1 changed it.
11. Then list for me, and do not attempt yourself: the DNS records, the Vercel project and
    its three Actions secrets (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID), the
    Cloudflare R2 buckets, the Upstash Redis database, the GitHub OAuth app, replacing
    app/icon.png and app/apple-icon.png, and enrolling a passkey at /auth/keystatic/enroll.
```

### 5. Set up the services

The site builds and serves content with none of these. Add each one when you want what it
does.

| Service                 | Needed for                        | Without it                                          |
| ----------------------- | --------------------------------- | --------------------------------------------------- |
| GitHub OAuth app        | `/keystatic` in production        | The build fails; CI uses placeholders               |
| Vercel                  | Hosting                           | No hosting                                          |
| Upstash Redis           | Rate limiting, passkey storage    | Limits are skipped; `/keystatic` still fails closed |
| Cloudflare R2 (public)  | Image hosting                     | Uploads return 503                                  |
| Cloudflare R2 (private) | Daily backups, whisper messages   | `backup.yml` and `/api/whisper` fail                |
| Resend                  | Security alerts and whisper email | Alerts are dropped                                  |
| proxycheck.io           | VPN detection on `/whisper`       | The call still runs, unkeyed on the free tier       |

Three env vars get a production build to pass: `KEYSTATIC_GITHUB_CLIENT_ID`,
`KEYSTATIC_GITHUB_CLIENT_SECRET`, and `KEYSTATIC_SECRET`. Add `KEYSTATIC_AUTH_PASSWORD` and
you can also get into `/keystatic`; without either that password or an Upstash Redis, the
gate fails closed and answers 503. `.env.example` documents all 27 and says which are
required. Set them in the Vercel dashboard, or put them in GitHub Actions secrets and run
`setup-env.yml`, which pushes them to Vercel and redeploys.

Once `/keystatic` is reachable, enroll a passkey at `/auth/keystatic/enroll` and set
`KEYSTATIC_AUTH_MODE=passkey`. Enroll a second one before you rely on it: the break-glass
password needs Upstash reachable, so a single passkey plus a Redis outage locks you out.
[docs/auth.md](docs/auth.md) has the runbook.

**One thing I would change if starting over.** The feeds and sitemap are hand-rolled route
handlers rather than Next's `sitemap.ts` / `robots.ts` conventions. That was a deliberate
call for a visible shared source of truth, but the conventions are less code.

## Limits

Worth knowing before you fork it.

- **CI cannot stop a bad deploy.** Vercel ships on push to `main` whatever CI says. If that
  trade is wrong for you, add a branch protection rule; nothing in the repo does it for you.
- **The image pipeline hardcodes `assets.vedant.to` in three places** and fails open on any
  other host: `scripts/audit-content.mjs:125,140` and `scripts/normalize-images.mjs:54,72`.
  Point your content at a different CDN and the checker stops recognising your references,
  so `npm run check` passes, while `npm run fix-images` quietly rewrites nothing. Meanwhile
  `scripts/sync-images-to-r2.mjs` still uploads the file as `.webp`, so the reference and
  the object disagree and the image 404s in production. Change the host in all three files
  together.
- **The passkey gate is off by default.** `KEYSTATIC_AUTH_MODE` has to be the literal string
  `passkey`. Anything else keeps HTTP Basic Auth, so shipping the WebAuthn code changes
  nothing until you opt in.
- **Upstash and R2 are optional, but not equally.** The site builds and serves without either.
  Without Upstash there is no rate limiting; without R2 the whisper route and image uploads
  have nowhere to write.
- **macOS and Linux only.** Nothing here has been run on Windows, and `scripts/restore.sh`
  is bash.
- **No ESLint.** Deliberate, and it means a lint rule you rely on elsewhere is not running here.

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

## Docs

- [docs/auth.md](docs/auth.md) — the `/keystatic` gate: WebAuthn design, the break-glass
  password path, every env var it reads, and how to verify the gate is live in production.
- [.env.example](.env.example) — every environment variable, with the semantics of the
  awkward ones written next to them. Deliberately the only copy; a table in this file
  would rot against it.

## Credits

Next.js, Keystatic, Tailwind CSS, and Vercel do the heavy lifting. The passkey gate is
[SimpleWebAuthn](https://simplewebauthn.dev). Syntax highlighting is
[sugar-high](https://github.com/huozhi/sugar-high).

MIT. The code is yours to take; the writing in `content/` is not.
