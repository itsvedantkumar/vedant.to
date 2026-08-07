# daily slug normalization (7 Aug 2026) — 2026-08-07

## What changed

The 7 August 2026 daily entry was already published and live at `/daily/7th-august-2026` —
nothing was broken about publishing. The fix was purely a naming-pattern correction:

1. Renamed `content/daily/7th-august-2026.mdoc` → `content/daily/7-august-2026.mdoc` (`git mv`).
2. Changed the Keystatic `slug` name field in frontmatter from `7th August, 2026` → `7 August, 2026`.
3. Added a 308 redirect `/daily/7th-august-2026` → `/daily/7-august-2026` in `next.config.mjs`.

Shipped as `33f2a89` on `main`. Verified live: new URL 200, old URL 308 → new, body renders
with the latest edit, entry first on `/daily`, present in sitemap/rss/feed.json with the new
slug and zero references to the old one.

## Why

`7th-august-2026` was the only ordinal slug in the collection. All 15 other daily entries use a
bare number (`11-july-2026`, `9-june-2026`, `30-june-2026`); a grep for `[0-9]+(st|nd|rd|th)`
across `content/` finds ordinals only in body prose, never in a filename or `slug:` value.

## Key files (path:line)

- `content/daily/7-august-2026.mdoc:2` — `slug: 7 August, 2026`
- `next.config.mjs:32-36` — the new redirect entry, appended to the existing `redirects()` array
- `keystatic.config.ts:97-99` — `fields.slug({ name: ... })`: the author-typed `name` is written
  verbatim to frontmatter as `slug:`; the filename/URL is Keystatic's auto-slugified version of
  it, and is NOT stored. Both must change together or the CMS renames the file back on next save.
- `lib/daily.ts:3-12` — `getPublishedDailyEntries()`, the sole publish gate
  (`.filter((e) => e.entry.date && !e.entry.draft)`). Index, detail-page `generateStaticParams`,
  and `lib/feed-utils.ts:15-19` all inherit it. No future-date filtering.

## Decisions made

- **`permanent: true` (308) for the redirect.** This is a genuine move, not an alias. The three
  pre-existing entries use `permanent: false` because they are shortlinks (`/cal`) and admin
  aliases (`/admin` → `/keystatic`) — a different case.
- **Redirect was necessary, not optional.** There is no content-URL redirect layer anywhere:
  `vercel.json` is just `{ "framework": "nextjs" }`, and `middleware.ts` falls through to
  `NextResponse.next()` for every non-Keystatic path. Without it the old URL — already published
  in the sitemap and both feeds — would hard-404.
- **Kept the rename despite the URL already being indexed.** The URL was only ~1h old and the
  redirect preserves it.

## Gotchas worth remembering

- **Local `npm run build` fails without Keystatic env vars.** `keystatic.config.ts:29-38` gates
  storage on `NODE_ENV`, and `next build` forces `NODE_ENV=production`, so it always resolves to
  `kind: 'github'` and demands the OAuth vars. You cannot dodge it by unsetting them. Use the
  same placeholders CI uses (`.github/actions/build-next/action.yml:13-19`):
  ```
  KEYSTATIC_GITHUB_CLIENT_ID=build-placeholder \
  KEYSTATIC_GITHUB_CLIENT_SECRET=build-placeholder \
  KEYSTATIC_SECRET=build-placeholder-secret-minimum-32-chars \
  npm run build
  ```
  `.env.local` exists but every value is blank, so it contributes nothing.
- **`gh` CLI 404s on this repo.** Active account is `vedant-simulacrum`; the repo is
  `itsvedantkumar/vedant.to`. Git operations work via the repo-local credential helper, but
  `gh run list` does not. Confirm deploy status by curling production instead.
- **Concurrent CMS edits race with local commits.** Mid-task, a Keystatic save landed `c69d7bf`
  on `main` (body edit: `$50k` → `$50k last 2 weeks`), rejecting the push. `git rebase origin/main`
  resolved it cleanly — rename detection preserved the body edit. Re-check `origin/main` before
  pushing whenever the user may be editing live.

## Open issues / follow-ups

- If the Keystatic editor was left open on the old entry, a save could recreate
  `content/daily/7th-august-2026.mdoc` as a duplicate. A hard-refresh of `/keystatic` picks up
  the renamed file. Worth checking `content/daily/` for an `aug` duplicate if the entry looks
  doubled on `/daily`.
- The `slug` field label at `keystatic.config.ts:98` reads "Slug (e.g. 2026-06-07)" (ISO), but
  every actual entry uses `D Month, YYYY`. Misleading label — likely what invited the "7th"
  freeform value. Fixing the label would prevent a repeat.
