# backups moved to private bucket + images included — 2026-08-07

## What changed

Backups were being written to `R2_BUCKET_NAME` (`vedant-assets`), the live asset bucket fronted
by the public domain `assets.vedant.to`. Every archive under `backups/` was world-readable —
confirmed by downloading `content-2026-08-07.zip` unauthenticated (valid zip, 77 entries).

1. Created private R2 bucket `vedant-backups` (no custom domain binding).
2. Added GitHub secret `R2_BACKUP_BUCKET_NAME=vedant-backups`.
3. `backup.yml`: zip now covers `content/` **and** `public/images/`; upload targets the private
   bucket; added a mirror step syncing the live asset bucket to `r2-assets/` in the backup
   bucket; integrity check fails if either tree is missing from the archive.
4. Added `purge-public-backups.yml` (workflow_dispatch, requires `confirm=DELETE`) that migrates
   historical archives to the private bucket, verifies counts, then deletes `backups/*` from the
   public bucket.
5. `restore.sh`: handles both trees; its zip-slip guard previously allowed only `content/` and
   would have aborted on every new archive.
6. Cloudflare WAF custom rule blocking `assets.vedant.to/backups/*`.

Commits `4a34cc2`, `ded7375`.

## Why

The exposure was latent rather than active — I extracted the public archive and found zero
`draft: true` entries, so nothing unpublished had leaked. But `content/` is exactly where
unreleased writing lives, so the next draft saved in Keystatic would have been published to a
public URL on the following 00:00 UTC run.

## Verification (all performed)

- Backup run `31168245318`: all steps success. "Backed up 74 content files and 12 image files".
  33 objects mirrored; 0 leaked into `r2-assets/backups` (exclude held).
- Purge run `31168358052`: `public=38 private=38` before deletion, then 38 deletes.
- All 38 public backup URLs now return 403 (was 200).
- Images (`assets.vedant.to/i/...`) still 200; `vedant.to/`, `/blog`, `/daily/7-august-2026`
  still 200.
- `restore.sh` tested locally against three archives: content+images (restores both),
  legacy content-only (restores content, notes missing images), and a malicious archive with
  `etc/passwd` (aborts, exit 1).

## Key files (path:line)

- `.github/workflows/backup.yml:17-21` — job-level env so the `if:` guards can read the secrets
- `.github/workflows/backup.yml:57+` — private-bucket upload, with a comment explaining why it
  must never target `R2_BUCKET_NAME`
- `.github/workflows/backup.yml` — "Mirror live R2 objects" step, `--exclude 'backups/*'`
- `.github/workflows/purge-public-backups.yml` — migrate → verify → delete
- `scripts/restore.sh:29-35` — zip-slip guard, now `^(content|public/images)/`

## Decisions made

- **Separate bucket over a WAF rule alone.** A WAF rule is a request-layer filter; the object
  stays public at the bucket layer and any other route to it (r2.dev, a second domain) would
  re-expose it. The bucket split is the actual fix; the WAF rule is defence in depth.
- **Migrate before delete.** The Jul 1–Aug 6 archives existed only in the public bucket, so a
  straight purge would have closed the exposure by destroying backup history. The purge job now
  refuses to delete unless the private bucket holds at least as many archives.
- **Full daily image snapshot rather than incremental.** 14 MB/day is ~5 GB/yr, roughly
  $0.38/mo on R2 — not worth the complexity of deduping.
- **Mirror the live bucket.** `/api/upload` images (bare UUID keys) and whisper messages exist
  only in R2 with no repo copy, so the zip alone could never have restored them.

## Gotchas

- **The Cloudflare API token in the shell env cannot purge cache.** Zone permissions are
  `#waf:read/edit`, `#zone:read`, `#zone_settings:read`, `#dns_records:read/edit` — no
  `#cache_purge`. `POST /purge_cache` returns `10000 Authentication error`. The WAF rule was the
  workaround, and works because custom rules evaluate before cache lookup.
- **Deleting an R2 object does not evict the Cloudflare edge cache.** After the purge, objects
  were gone from R2 but still served 200 via `assets.vedant.to` until the WAF rule landed.
- **WAF rule propagation is per-PoP and takes ~40s.** Individual URLs flipped to 403 at
  different times; verify by polling, not a single request.
- **`PUT /rulesets/phases/.../entrypoint` rejects `kind`, `phase`, and `name`.** Send only
  `rules`. There was no pre-existing custom-rules ruleset on this zone
  (`cf_list_waf_custom_rules` errors with `10003 could not find entrypoint ruleset`), so nothing
  was clobbered.
- **No pyyaml locally.** Validate workflow YAML with the repo's `node_modules/js-yaml`.

## Open issues / follow-ups

- **No retention policy on `vedant-backups`.** Archives accumulate forever (~5 GB/yr). Consider
  an R2 lifecycle rule, e.g. expire `backups/` objects after 365 days.
- **Restore has still never been drilled end-to-end** against a real archive pulled from R2 —
  only against synthetic zips locally.
- **`r2-assets/` mirror is a sync, not versioned.** A deletion in the live bucket is not
  propagated (no `--delete`, deliberately), but an *overwrite* of an existing key is mirrored
  and the prior version is lost. Acceptable for content-addressed images; worth knowing.
- The Cloudflare token cannot purge cache — if a future task needs it, the token needs the Cache
  Purge permission added.
