# vedant.to

Personal site of Vedant Kumar — essays, a daily log, and a quote collection.

Live at **[vedant.to](https://vedant.to)**

## Stack

Next.js 15 (App Router) with Keystatic as the CMS, Tailwind for styling, TypeScript
throughout, deployed on Vercel, with Upstash Redis for rate limiting and Cloudflare R2
for asset and whisper storage. Node 22.

## Content

Three Keystatic collections, all stored as flat files in the repo:

| Collection | Path              | Format  | Count |
| ---------- | ----------------- | ------- | ----- |
| Posts      | `content/posts/`  | `.mdoc` | 7     |
| Daily      | `content/daily/`  | `.mdoc` | 17    |
| Quotes     | `content/quotes/` | `.yaml` | 51    |

Posts and daily entries both carry a `draft` boolean. **`draft: true` hides an entry
everywhere** — site listings, RSS, JSON Feed, and the sitemap. It is enforced once, at the
source, in `lib/posts.ts` and `lib/daily.ts`; `lib/feed-utils.ts` and
`app/sitemap.xml/route.ts` consume the already-filtered `getPublishedPosts()` /
`getPublishedDailyEntries()` rather than re-implementing the check. One filter, no drift.

This is also why backups must never land in a public bucket: an unpublished draft is
invisible on the site but sits in plain text in `content/`. See [Backup](#backup).

Quotes have no `draft` field — everything in `content/quotes/` is public.

## Structure

- `app/` — App Router. `(site)/` holds the public pages, `api/` the route handlers,
  `keystatic/` the CMS UI, `auth/keystatic/` the login and device-management screens.
- `lib/` — content readers (`posts.ts`, `daily.ts`, `reader.ts`), feed/SEO helpers,
  plus `auth/` and `webauthn/` for the `/keystatic` gate.
- `components/` — the two client components that need to be client components.
- `content/` — the three Keystatic collections above.
- `public/` — static assets, including a hand-written `robots.txt`.
- `scripts/` — content normalisers, the content auditor, the R2 image sync, `restore.sh`.
- `.github/workflows/` — CI and the scheduled jobs (see [Deployment](#deployment)).
- `middleware.ts` — the `/keystatic` auth gate, at the edge.

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

Env vars are documented in `.env.example`, not here — it explains the semantics of the
trickier ones (`KEYSTATIC_ENROLL_TOKEN`, `KEYSTATIC_SESSION_SECRET`) better than a table
could, and a second copy would only rot.

Before pushing:

```bash
npm run check   # tsc --noEmit + scripts/audit-content.mjs
```

`npm run audit:content:watch` runs the content auditor continuously while writing.
`npm run format` and `npm run fix-content` clean up formatting and frontmatter.

## Keystatic auth

`/keystatic` is gated by WebAuthn passkeys, with a break-glass password as the recovery
path. Full design, env vars, and known limitations: **[docs/auth.md](docs/auth.md)**.

The one thing worth knowing up front: `KEYSTATIC_AUTH_MODE` defaults to `basic`. Anything
other than the literal string `passkey` keeps the old HTTP Basic Auth prompt, so shipping
the passkey code is deliberately a no-op until you opt in.

If the passkey gate is the only part you want, it lives standalone as a runnable Next.js
app at **[itsvedantkumar/keystatic-passkeys](https://github.com/itsvedantkumar/keystatic-passkeys)**
— same code, none of this site around it.

## Feeds & SEO

Three hand-rolled route handlers, all `export const dynamic = 'force-static'`, all sharing
`lib/feed-utils.ts` so the three outputs can't disagree about what's published:

- `app/rss.xml/` — RSS 2.0
- `app/feed.json/` — JSON Feed 1.1
- `app/sitemap.xml/` — sitemap

They are route handlers rather than Next's `sitemap.ts` / `robots.ts` conventions because
the shared-source-of-truth wiring is easier to see this way. `robots.txt` is a static file
in `public/`. OG images are generated per-page by `@vercel/og` at `/api/og`. The
`indexnow.yml` workflow pings IndexNow on every push to `main`, so new posts get crawled in
minutes instead of days.

## Deployment

Production deploys come from Vercel's Git integration on pushes to `main`, **not** from
GitHub Actions. That keeps releases independent of Actions billing and quota failures — a
red CI run never blocks a deploy.

GitHub Actions handles validation and support jobs only:

| Workflow             | Name                  | Trigger                  | Does                                                                                                                        |
| -------------------- | --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`             | CI                    | push to `main`, PR       | build, normalize-content, `format:check`, `typecheck`, `npm test`, R2 image sync, Lighthouse CI against `lighthouserc.json` |
| `health.yml`         | Production Health     | 4×/day                   | probes the live site, alerts if prod lags `main`                                                                            |
| `backup.yml`         | Daily Content Backup  | daily 00:00 UTC          | tags, zips, and off-sites `content/` (see below)                                                                            |
| `secret-scan.yml`    | Secret Scan           | push, PR, weekly         | `gitleaks`, weekly over full history                                                                                        |
| `security-audit.yml` | Security Audit        | manifest changes, weekly | `npm audit`, fails on high/critical                                                                                         |
| `indexnow.yml`       | IndexNow              | push to `main`           | pings IndexNow so new content is crawled fast                                                                               |
| `links.yml`          | Link Check            | weekly Mon 07:00 UTC     | `lychee` over `content/**/*.mdoc` and this README                                                                           |
| `setup-env.yml`      | Setup Vercel Env Vars | manual only              | syncs secrets to Vercel, forces a redeploy                                                                                  |

## Making it your own

This is a personal site, not a template — but it is close to one, and this section is the
gap. Everything below is hardcoded to `vedant.to`. Change these and it's yours.

**Identity — start here.** `lib/constants.ts` is the intended single source of truth
(`SITE_URL`, `ASSETS_URL`, `SITE_NAME`, `AUTHOR`, `TWITTER_HANDLE`). It is not yet the
_only_ source: the same values are also hardcoded in the files below, because `.mjs`
configs and edge middleware can't import a TS module cleanly. Consolidating these is the
main work in turning this into a real template.

| Where                                                                  | What                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `lib/constants.ts`                                                     | site URL, asset URL, name, author, social handle         |
| `lib/json-ld.ts`                                                       | contact email in the `Person` schema — **on every page** |
| `next.config.mjs`, `middleware.ts`                                     | the asset host, in `images` config and CSP               |
| `keystatic.config.ts`                                                  | GitHub `owner`/`name`, asset public path                 |
| `lib/webauthn/config.ts`                                               | passkey relying-party ID and allowed origins             |
| `app/api/whisper/route.ts`, `lib/auth/guard.ts`                        | the origin allowlist                                     |
| `scripts/sync-images-to-r2.mjs`                                        | R2 bucket and key prefix                                 |
| `public/robots.txt`, `public/.well-known/security.txt`                 | sitemap URL, contact, expiry                             |
| `.github/workflows/indexnow.yml` + `public/<key>.txt`                  | IndexNow key — regenerate, don't reuse mine              |
| `.env.production`                                                      | the GA measurement ID                                    |
| `app/(site)/layout.tsx`, `app/(site)/page.tsx`, `app/api/og/route.tsx` | name and links in the UI                                 |

**Rip out what isn't yours.** `content/` is my writing — delete all three collections and
keep the shapes in `keystatic.config.ts`. `/whisper` is an anonymous-message endpoint gated
by a personal-trivia quiz; the questions live in the `WHISPER_QUIZ` env var (deliberately
not in the repo), so it fails closed with a 503 until you set your own. `components/`
holds two easter eggs — `post-console-art.tsx` prints ASCII art to the devtools console for
four specific slugs and calls `console.clear()`.

**Infrastructure you'd need.** Vercel, an Upstash Redis (rate limiting and passkey
storage — everything degrades without it, but `/keystatic` fails closed), Cloudflare R2
with a **public** assets bucket plus a **private** backup bucket, and optionally Resend for
security alerts and proxycheck.io for the whisper gate. `.env.example` documents each and
which are genuinely required.

**Two things I'd change if starting over.** The feeds and sitemap are hand-rolled route
handlers rather than Next's `sitemap.ts` / `robots.ts` conventions; that was a deliberate
call for a visible shared source of truth, but the conventions are less code. And
`middleware.ts` does CSP, auth, and rate limiting in one file — fine at this size, worth
splitting past it.

## Backup

A scheduled GitHub Actions workflow runs daily at midnight UTC:

- Creates a `backup/YYYY-MM-DD` git tag pointing to the current commit
- Zips `content/` (and `public/images/` when it exists) and uploads it as a workflow
  artifact, retained 90 days. `public/images/` is normally **absent**: Keystatic writes
  uploads there, `sync-images-to-r2.mjs` pushes them to R2 on the next push to `main`, and
  the local copies are then redundant. The image corpus of record is R2, covered by the
  bucket mirror below — not by the zip.
- Copies the same zip off-GitHub to `s3://$R2_BACKUP_BUCKET_NAME/backups/content-YYYY-MM-DD.zip`
- Mirrors the live asset bucket to `s3://$R2_BACKUP_BUCKET_NAME/r2-assets/`, capturing objects
  that exist only in R2 (API uploads, whisper messages) and have no copy in the repo

Trigger a manual backup anytime from the Actions tab → "Daily Content Backup" → Run workflow.

Backups go to a **private** bucket (`R2_BACKUP_BUCKET_NAME`), never to `R2_BUCKET_NAME`. The
latter is the live asset bucket, fronted by the public domain `assets.vedant.to` — anything
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
