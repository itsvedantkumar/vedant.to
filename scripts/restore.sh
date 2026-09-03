#!/usr/bin/env bash
# Restore content/ and public/images/ from a backup archive.
#
# Sources:
#   1. Cloudflare R2, the PRIVATE backup bucket, not the public asset bucket.
#      The ops Worker writes a GitHub tarball of main there every day:
#        aws s3 cp "s3://$R2_BACKUP_BUCKET_NAME/backups/repo-YYYY-MM-DD.tar.gz" . \
#          --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
#   2. Any zip that holds content/ and public/images/ at its root (the format
#      the old Actions job produced).
#
# Objects that live only in R2 (API uploads, whisper messages) are not in the
# archive. They are mirrored to s3://$R2_BACKUP_BUCKET_NAME/r2-assets/ and
# restore with `aws s3 sync` in the opposite direction.
#
# Usage: scripts/restore.sh path/to/repo-YYYY-MM-DD.tar.gz
#        scripts/restore.sh path/to/content-backup.zip
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: scripts/restore.sh path/to/repo-YYYY-MM-DD.tar.gz (or a content zip)" >&2
  exit 1
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

case "$ARCHIVE" in
  *.tar.gz | *.tgz)
    echo "Verifying archive..."
    tar tzf "$ARCHIVE" > /dev/null

    echo "Checking archive entries for path traversal..."
    if tar tzf "$ARCHIVE" | grep -qE '(^/|^\.\./|/\.\./|/\.\.$)'; then
      echo "ERROR: archive contains absolute or parent-relative paths — aborting." >&2
      exit 1
    fi

    # GitHub tarballs nest everything under <owner>-<repo>-<sha>/. Extract, then
    # lift only the two trees we restore; the rest of the repo is ignored.
    mkdir "$TMPDIR/extract"
    tar xzf "$ARCHIVE" -C "$TMPDIR/extract"
    TOP="$(find "$TMPDIR/extract" -mindepth 1 -maxdepth 1 -type d | head -1)"
    if [ -z "$TOP" ]; then
      echo "ERROR: tarball has no top-level directory — aborting." >&2
      exit 1
    fi
    [ -d "$TOP/content" ] && mv "$TOP/content" "$TMPDIR/content"
    if [ -d "$TOP/public/images" ]; then
      mkdir -p "$TMPDIR/public"
      mv "$TOP/public/images" "$TMPDIR/public/images"
    fi
    ;;
  *.zip)
    echo "Verifying archive..."
    unzip -t -- "$ARCHIVE" > /dev/null

    echo "Checking archive entries for zip-slip..."
    if unzip -Z1 -- "$ARCHIVE" | grep -qvE '^(content|public/images)/'; then
      echo "ERROR: archive contains entries outside content/ and public/images/ — aborting." >&2
      unzip -Z1 -- "$ARCHIVE" | grep -vE '^(content|public/images)/' | head >&2
      exit 1
    fi
    unzip -q -- "$ARCHIVE" -d "$TMPDIR"
    ;;
  *)
    echo "ERROR: expected a .tar.gz or .zip archive — got $ARCHIVE" >&2
    exit 1
    ;;
esac

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
