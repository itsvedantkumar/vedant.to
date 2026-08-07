# vedant.to

Personal site of Vedant Kumar — writing, a /now page, and a few things I'm building.

Live at **[vedant.to](https://vedant.to)**

## Stack

| Layer               | Tool                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | [Next.js 14](https://nextjs.org) (App Router)                                                                                               |
| CMS                 | [Keystatic](https://keystatic.com) — content stored as Markdown files in `content/`                                                         |
| Styling             | [Tailwind CSS](https://tailwindcss.com)                                                                                                     |
| Fonts               | Inter via `next/font/google`                                                                                                                |
| Syntax highlighting | [sugar-high](https://github.com/huozhi/sugar-high)                                                                                          |
| Analytics           | [Vercel Analytics](https://vercel.com/analytics) + [Vercel Speed Insights](https://vercel.com/docs/speed-insights) + Google Analytics (GA4) |
| Deployment          | [Vercel](https://vercel.com)                                                                                                                |

## Features

- **Keystatic CMS** — edit posts from `/keystatic` in the browser; writes back to the `content/posts/` directory via GitHub commits (GitHub mode in production, local filesystem in dev)
- **Dynamic OG images** — auto-generated per-page via `@vercel/og` at `/api/og`
- **Auto sitemap + RSS** — `sitemap.xml` and `rss.xml` generated at build time from content
- **Reading time** — calculated per post at build time
- **Copy-to-clipboard** on code blocks
- **404 page** and `/now` page
- **Strict CSP** — per-route security headers including HSTS, X-Content-Type-Options, Referrer-Policy
- **Daily content backup** — GitHub Actions creates a dated git tag and uploads a `content-backup.zip` artifact daily with 90-day retention
- **Production drift alarm** — GitHub Actions checks that `vedant.to` is healthy and not lagging behind `main`

## Project structure

```
app/
  (site)/          # Public-facing pages (homepage, blog, /now)
  api/
    og/            # OG image generation
    keystatic/     # Keystatic API routes
  keystatic/       # Keystatic admin UI (protected by Keystatic auth)
  layout.tsx       # Root layout — fonts, Analytics, GA
  robots.ts
  sitemap.ts
  rss.xml/

content/
  posts/           # Markdown posts managed by Keystatic

lib/
  reader.ts        # Keystatic filesystem reader (build-time)
  renderers.tsx    # Keystatic DocumentRenderer components
  metadata.ts      # Shared createMetadata() helper
  reading-time.ts  # Reading time estimator

components/
  copy-button.tsx  # Client component for code block copy

.github/
  workflows/
    deploy.yml     # CI: validate build, formatting, typecheck, and content
    backup.yml     # Scheduled: daily content snapshot
    health.yml     # Scheduled: live-site probe + production drift alarm
```

## Running locally

```bash
git clone https://github.com/itsvedantkumar/vedant.to
cd vedant.to
npm install
```

Create `.env.local` from the example:

```bash
cp .env.example .env.local
```

Required env vars for local development:

```env
# Keystatic runs in local mode when these are absent — no OAuth needed for dev
# (Only required for production / GitHub storage mode)
KEYSTATIC_GITHUB_CLIENT_ID=
KEYSTATIC_GITHUB_CLIENT_SECRET=
KEYSTATIC_SECRET=
```

```bash
npm run dev
```

The site is at `http://localhost:3000`. The CMS is at `http://localhost:3000/keystatic` — no login required in local mode.

## CMS (Keystatic)

Content lives in `content/posts/` as Markdown files with YAML frontmatter. Keystatic handles editing through a web UI.

**In development (local mode):** visit `/keystatic` — writes directly to disk.

**In production (GitHub mode):** Keystatic commits changes back to the repo via a GitHub OAuth App. Requires `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, and `KEYSTATIC_SECRET` to be set in Vercel environment variables.

To set up the GitHub OAuth App:

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App
2. Set the callback URL to `https://vedant.to/api/keystatic/github/oauth/callback`
3. Add the client ID, secret, and a random `KEYSTATIC_SECRET` (`openssl rand -hex 32`) to Vercel

## Analytics

Three layers are active in production:

- **Vercel Analytics** — pageviews and web vitals, zero config (injected via `<Analytics />`)
- **Vercel Speed Insights** — Core Web Vitals per route (injected via edge script)
- **Google Analytics (GA4)** — set `NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX` in Vercel environment variables to enable

## Deployment

Production deploys should come from Vercel's Git integration on pushes to `main`, not from GitHub Actions. That keeps releases independent from Actions billing/quota failures.

GitHub Actions still handles validation and support jobs:

- `CI` validates build, formatting, typecheck, and content checks
- `Production Health` probes the live site and alerts if production falls behind `main`
- `Setup Vercel Env Vars` is only for syncing env vars to Vercel and forcing a manual redeploy when needed

## Backup

A scheduled GitHub Actions workflow runs daily at midnight UTC:

- Creates a `backup/YYYY-MM-DD` git tag pointing to the current commit
- Zips `content/` and `public/images/` and uploads it as a workflow artifact (retained 90 days)
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
