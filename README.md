# vedant.to

Personal site of Vedant Kumar — writing, a /now page, and a few things I'm building.

Live at **[vedant.to](https://vedant.to)**

## Stack

| Layer | Tool |
|---|---|
| Framework | [Next.js 14](https://nextjs.org) (App Router) |
| CMS | [Keystatic](https://keystatic.com) — content stored as Markdown files in `content/` |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Fonts | Inter via `next/font/google` |
| Syntax highlighting | [sugar-high](https://github.com/huozhi/sugar-high) |
| Analytics | [Vercel Analytics](https://vercel.com/analytics) + [Vercel Speed Insights](https://vercel.com/docs/speed-insights) + Google Analytics (GA4) |
| Deployment | [Vercel](https://vercel.com) |

## Features

- **Keystatic CMS** — edit posts from `/keystatic` in the browser; writes back to the `content/posts/` directory via GitHub commits (GitHub mode in production, local filesystem in dev)
- **Dynamic OG images** — auto-generated per-page via `@vercel/og` at `/api/og`
- **Auto sitemap + RSS** — `sitemap.xml` and `rss.xml` generated at build time from content
- **Reading time** — calculated per post at build time
- **Copy-to-clipboard** on code blocks
- **404 page** and `/now` page
- **Strict CSP** — per-route security headers including HSTS, X-Content-Type-Options, Referrer-Policy
- **Daily content backup** — GitHub Actions creates a dated git tag and uploads a `content-backup.zip` artifact daily with 90-day retention

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
    deploy.yml     # CI: build + Vercel deploy on push to main
    backup.yml     # Scheduled: daily content snapshot
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

Push to `main` → GitHub Actions builds and deploys to Vercel automatically. The `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets must be set in the GitHub repo.

## Backup

A scheduled GitHub Actions workflow runs daily at midnight UTC:
- Creates a `backup/YYYY-MM-DD` git tag pointing to the current commit
- Zips `content/` and uploads it as a workflow artifact (retained 90 days)

Trigger a manual backup anytime from the Actions tab → "Daily Content Backup" → Run workflow.
