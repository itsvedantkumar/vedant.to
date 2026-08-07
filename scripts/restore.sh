#!/usr/bin/env bash
# Restore content/ and public/images/ from a backup zip.
#
# Sources (in order of convenience):
#   1. A GitHub Actions artifact: Actions tab -> "Daily Content Backup" run ->
#      download "content-<run_id>-<attempt>.zip".
#   2. Cloudflare R2 — the PRIVATE backup bucket, not the public asset bucket:
#        aws s3 cp "s3://$R2_BACKUP_BUCKET_NAME/backups/content-YYYY-MM-DD.zip" . \
#          --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
#   3. A dated git tag:
#        git checkout backup/YYYY-MM-DD -- content public/images
#
# Objects that live only in R2 (API uploads, whisper messages) are not in this
# zip. They are mirrored to s3://$R2_BACKUP_BUCKET_NAME/r2-assets/ and restore
# with `aws s3 sync` in the opposite direction.
#
# Usage: scripts/restore.sh path/to/content-backup.zip
set -euo pipefail

ZIP="${1:-}"
if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "Usage: scripts/restore.sh path/to/content-backup.zip" >&2
  exit 1
fi

echo "Verifying archive..."
unzip -t -- "$ZIP" > /dev/null

echo "Checking archive entries for zip-slip..."
if unzip -Z1 -- "$ZIP" | grep -qvE '^(content|public/images)/'; then
  echo "ERROR: archive contains entries outside content/ and public/images/ — aborting." >&2
  unzip -Z1 -- "$ZIP" | grep -vE '^(content|public/images)/' | head >&2
  exit 1
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
unzip -q -- "$ZIP" -d "$TMPDIR"

STAMP="$(date +%Y%m%d-%H%M%S)-$$"

# content/ — the archive always carries it; the backup job fails otherwise.
if [ -d "$TMPDIR/content" ]; then
  if [ -d content ]; then
    echo "Existing content/ moved to content.bak-$STAMP"
    mv content "content.bak-$STAMP"
  fi
  echo "Restoring content/..."
  mv "$TMPDIR/content" .
else
  echo "ERROR: archive has no content/ — aborting." >&2
  exit 1
fi

# public/images/ — absent from archives taken before images were included, so
# treat it as optional rather than failing an otherwise-valid older restore.
if [ -d "$TMPDIR/public/images" ]; then
  if [ -d public/images ]; then
    echo "Existing public/images/ moved to public/images.bak-$STAMP"
    mv public/images "public/images.bak-$STAMP"
  fi
  mkdir -p public
  echo "Restoring public/images/..."
  mv "$TMPDIR/public/images" public/
else
  echo "NOTE: archive predates image backups — public/images/ left untouched."
fi

COUNT=$(find content -type f | wc -l | tr -d ' ')
IMG_COUNT=$(find public/images -type f 2>/dev/null | wc -l | tr -d ' ')
echo "Restored $COUNT content files and $IMG_COUNT image files."
echo "Review with 'git status', then commit."
