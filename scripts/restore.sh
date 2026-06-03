#!/usr/bin/env bash
# Restore content/ from a backup zip.
#
# Sources (in order of convenience):
#   1. A GitHub Actions artifact: Actions tab -> "Daily Content Backup" run ->
#      download "content-<id>.zip".
#   2. Cloudflare R2 (if configured):
#        aws s3 cp s3://$R2_BUCKET/backups/content-YYYY-MM-DD.zip . \
#          --endpoint-url "$R2_ENDPOINT"
#   3. A dated git tag: `git checkout backup/YYYY-MM-DD -- content`
#
# Usage: scripts/restore.sh path/to/content-backup.zip
set -euo pipefail

ZIP="${1:-}"
if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "Usage: scripts/restore.sh path/to/content-backup.zip" >&2
  exit 1
fi

echo "Verifying archive..."
unzip -t "$ZIP" > /dev/null

if [ -d content ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  echo "Existing content/ moved to content.bak-$STAMP"
  mv content "content.bak-$STAMP"
fi

echo "Restoring content/ from $ZIP..."
unzip -q "$ZIP" 'content/*'

COUNT=$(find content -type f | wc -l | tr -d ' ')
echo "Restored $COUNT files. Review with 'git status', then commit."
