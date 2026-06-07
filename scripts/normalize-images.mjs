#!/usr/bin/env node
/**
 * normalize-images.mjs
 *
 * Scans every .mdoc file under content/ for image references `![](path)`.
 * For each reference:
 *   1. If the file exists at the referenced path → leave it alone.
 *   2. If the URL-decoded path points to a real file → rename the file to a
 *      slug-safe name and update the .mdoc reference.
 *   3. If neither path exists → warn (image is genuinely missing).
 *
 * Slug rule: lowercase, replace anything not [a-z0-9._/-] with '-', collapse runs.
 * The directory structure (post slug subdir) is preserved; only the basename is slugified.
 *
 * Usage:
 *   node scripts/normalize-images.mjs          # dry-run flag not set → mutates files
 *   node scripts/normalize-images.mjs --dry    # report only, no writes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

/** Turn a filename into a URL-and-filesystem-safe slug. */
function slugifyBasename(name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // replace anything not alphanumeric/hyphen
    .replace(/-{2,}/g, '-') // collapse consecutive hyphens
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
  return slug + ext.toLowerCase();
}

/** Recursively find all .mdoc files. */
function findMdoc(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMdoc(full));
    else if (entry.name.endsWith('.mdoc')) results.push(full);
  }
  return results;
}

const IMG_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

let totalFixed = 0;
let totalMissing = 0;

for (const mdocPath of findMdoc(path.join(ROOT, 'content'))) {
  let src = fs.readFileSync(mdocPath, 'utf8');
  let changed = false;

  src = src.replace(IMG_RE, (match, rawRef) => {
    // rawRef is the raw string inside the parens, e.g. /images/posts/slug/image%20%281%29.png
    // Absolute URLs (CDN / external) are not local files — skip them entirely.
    if (/^https?:\/\//.test(rawRef)) return match;

    const publicRoot = path.join(ROOT, 'public');
    const absRef = path.join(publicRoot, rawRef);
    const absDecoded = path.join(publicRoot, decodeURIComponent(rawRef));

    // Path traversal guard: ensure resolved paths stay within public/
    const publicRootWithSep = publicRoot + path.sep;
    if (
      !absRef.startsWith(publicRootWithSep) ||
      !absDecoded.startsWith(publicRootWithSep)
    ) {
      console.warn(`  TRAVERSAL: ${rawRef} escapes public/ — skipping`);
      return match;
    }

    // Case 1: file already at exact referenced path → fine
    if (fs.existsSync(absRef)) return match;

    // Case 2: decoded path exists → rename to slug-safe and update ref
    if (fs.existsSync(absDecoded)) {
      const dir = path.dirname(absDecoded);
      const slugged = slugifyBasename(path.basename(absDecoded));
      const absDest = path.join(dir, slugged);
      const newRef = path.join(path.dirname(rawRef), slugged).replace(/\\/g, '/');

      if (absDecoded !== absDest) {
        // Collision check: don't overwrite a different existing file
        if (fs.existsSync(absDest)) {
          console.warn(
            `  COLLISION: ${path.relative(ROOT, absDest)} already exists — skipping rename`
          );
          return match;
        }
        if (!DRY) fs.renameSync(absDecoded, absDest);
        console.log(
          `  rename: ${path.relative(ROOT, absDecoded)} → ${path.relative(ROOT, absDest)}`
        );
      }

      // Safe replace: rebuild match string to avoid rawRef-in-alt-text corruption
      // and JS special replacement chars in newRef
      const altText = match.slice(2, match.indexOf(']'));
      const newMatch = `![${altText}](${newRef})`;
      changed = true;
      totalFixed++;
      return newMatch;
    }

    // Case 3: genuinely missing
    console.warn(`  MISSING: ${rawRef}  (in ${path.relative(ROOT, mdocPath)})`);
    totalMissing++;
    return match;
  });

  if (changed) {
    if (!DRY) fs.writeFileSync(mdocPath, src, 'utf8');
    console.log(`updated: ${path.relative(ROOT, mdocPath)}`);
  }
}

if (totalFixed === 0 && totalMissing === 0) {
  // Silence when nothing to do (normal pre-commit case)
  process.exit(0);
}

if (totalMissing > 0) {
  console.warn(`\n⚠  ${totalMissing} missing image(s) — check paths above.`);
}
if (totalFixed > 0) {
  console.log(`\n✓  ${totalFixed} image ref(s) normalized.`);
}

process.exit(totalMissing > 0 ? 1 : 0);
