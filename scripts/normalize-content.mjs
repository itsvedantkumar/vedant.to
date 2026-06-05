#!/usr/bin/env node
/**
 * normalize-content.mjs
 *
 * Fixes Markdown patterns in .mdoc files that cause Keystatic's
 * "Unknown inline node type: paragraph" validation error:
 *
 * 1. Loose lists (blank lines between same-level list items) → tightened
 * 2. Multi-paragraph list items (indented continuations) → merged into one line
 * 3. Images not isolated by blank lines → surrounded with blank lines
 *
 * Usage:
 *   node scripts/normalize-content.mjs          # mutate files in place
 *   node scripts/normalize-content.mjs --dry    # report only, no writes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
const CONTENT_DIR = path.join(ROOT, 'content');

function findMdocFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMdocFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.mdoc')) results.push(full);
  }
  return results;
}

/** Split raw .mdoc into frontmatter block + body content. */
function splitMdoc(raw) {
  const match = raw.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: raw };
  return { frontmatter: match[1], body: match[2] };
}

/** True if the line starts a list item (at any indent level). */
function isListItem(line) {
  return /^[ \t]*([-*+]|\d+[.)]) /.test(line);
}

/** Returns the indentation width of a list item line, or -1 if not a list item. */
function listItemIndent(line) {
  const m = line.match(/^([ \t]*)([-*+]|\d+[.)]) /);
  return m ? m[1].length : -1;
}

/** True if the line is blank (empty or only whitespace). */
function isBlank(line) {
  return line === '' || /^\s+$/.test(line);
}

/**
 * Fix loose lists and multi-paragraph list items.
 *
 * Keystatic's validator wraps each list-item's content in a `paragraph` node
 * whenever the source Markdown is a "loose" list (items separated by blank
 * lines) or a multi-paragraph item (indented continuation blocks). Both
 * produce "Unknown inline node type: paragraph".
 *
 * Strategy:
 * - Between two consecutive list items at the same indent level, collapse
 *   any blank lines so the list becomes "tight".
 * - Indented continuation blocks inside a list item are merged with the
 *   previous line using a single space.
 */
function fixLists(lines) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!isListItem(line)) {
      out.push(line);
      i++;
      continue;
    }

    const indent = listItemIndent(line);
    out.push(line);
    i++;

    // Consume lines that belong to this list item.
    while (i < lines.length) {
      const cur = lines[i];

      if (isBlank(cur)) {
        // Peek past the blank line(s) to decide what follows.
        let j = i + 1;
        while (j < lines.length && isBlank(lines[j])) j++;

        if (j >= lines.length) {
          // EOF — preserve trailing blank line.
          out.push('');
          i = j;
          break;
        }

        const next = lines[j];

        if (isListItem(next) && listItemIndent(next) === indent) {
          // Blank line(s) between same-level items → skip them (tight list).
          i = j;
        } else if (!isListItem(next) && /^[ \t]{2,}/.test(next)) {
          // Indented continuation paragraph → merge into current item.
          out[out.length - 1] += ' ' + next.trimStart();
          i = j + 1;
        } else {
          // Genuinely different context — preserve the blank line and stop.
          out.push('');
          i = j;
          break;
        }
      } else if (!isListItem(cur) && /^[ \t]{2,}/.test(cur)) {
        // Indented continuation without a blank line — merge.
        out[out.length - 1] += ' ' + cur.trimStart();
        i++;
      } else {
        // A new list item at a different indent, or non-list content.
        break;
      }
    }
  }

  return out;
}

/**
 * Ensure every standalone image line is surrounded by blank lines.
 *
 * Keystatic's Markdoc parser treats an image that shares a paragraph with
 * text as an inline node, which the renderer cannot handle. Isolating the
 * image on its own "paragraph" (blank lines on both sides) makes it a block.
 */
function fixImageSpacing(lines) {
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    // A standalone image: the entire (trimmed) line is one or more ![]() refs.
    const isStandaloneImage = trimmed !== '' && /^(!\[.*?\]\([^)]*\)\s*)+$/.test(trimmed);

    if (isStandaloneImage) {
      // Insert blank line before if needed.
      if (out.length > 0 && !isBlank(out[out.length - 1])) out.push('');
      out.push(lines[i]);
      // Insert blank line after if needed (peek ahead).
      if (i + 1 < lines.length && !isBlank(lines[i + 1])) out.push('');
    } else {
      out.push(lines[i]);
    }
  }

  return out;
}

/** Remove runs of more than two consecutive blank lines (cosmetic). */
function collapseExtraBlankLines(lines) {
  const out = [];
  let blanks = 0;
  for (const line of lines) {
    if (isBlank(line)) {
      blanks++;
      if (blanks <= 2) out.push(line);
    } else {
      blanks = 0;
      out.push(line);
    }
  }
  return out;
}

function normalizeBody(body) {
  let lines = body.split('\n');
  lines = fixLists(lines);
  lines = fixImageSpacing(lines);
  lines = collapseExtraBlankLines(lines);
  return lines.join('\n');
}

// ── main ───────────────────────────────────────────────────────────────────

const files = findMdocFiles(CONTENT_DIR);
let checked = 0;
let fixed = 0;
let errors = 0;

for (const file of files) {
  checked++;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const { frontmatter, body } = splitMdoc(raw);
    const normalizedBody = normalizeBody(body);

    if (normalizedBody === body) continue;

    fixed++;
    const rel = path.relative(ROOT, file);

    if (DRY) {
      console.log(`[dry] would fix: ${rel}`);
    } else {
      fs.writeFileSync(file, frontmatter + normalizedBody, 'utf8');
      console.log(`fixed: ${rel}`);
    }
  } catch (err) {
    errors++;
    console.error(`error processing ${path.relative(ROOT, file)}: ${err.message}`);
  }
}

console.log(
  `normalize-content: checked ${checked} file(s), fixed ${fixed}${errors ? `, ${errors} error(s)` : ''}`
);

if (errors > 0) process.exit(1);
