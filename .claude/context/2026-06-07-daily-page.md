# daily page — 2026-06-07

## What changed
Added a daily journal section at `/daily` — new Keystatic collection, list page, detail page, and nav link.

## Why
User wanted a blog-like daily journal where each post is keyed by date, living under `/daily` slug.

## Key files (path:line)
- `keystatic.config.ts:87` — `daily` collection added after `posts`
- `lib/daily.ts` — `getPublishedDailyEntries()` (mirrors `lib/posts.ts`)
- `app/(site)/daily/page.tsx` — list view, sorted newest-first
- `app/(site)/daily/[slug]/page.tsx` — detail view with prev/next nav
- `app/(site)/layout.tsx:5` — `daily` nav link added between blog and quotes
- `content/daily/` — empty dir, add entries here (or via /keystatic)

## Decisions made
- Slug field = arbitrary string (user sets to date, e.g. `2026-06-07`) — not forced to date format so Keystatic UI is flexible
- Separate `date` field (required) used for sorting + display
- `title` field optional — if blank, list shows blank label, detail shows only date
- No cover image, no reading time — daily is lighter than blog
- Images stored in `public/images/daily/`, same CDN as posts

## Open issues / follow-ups
- Sitemap/RSS feed don't include daily entries yet — add if desired
- `/daily` list entry title shows empty space when no title set; could show excerpt snippet instead
