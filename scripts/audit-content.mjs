#!/usr/bin/env node
/**
 * audit-content.mjs
 *
 * Audits .mdoc files for patterns that cause Keystatic validation errors.
 * Run once, or with --watch to re-audit on every file save.
 *
 * Usage:
 *   node scripts/audit-content.mjs           # audit all content files
 *   node scripts/audit-content.mjs --watch   # watch mode: re-audit on save
 *   node scripts/audit-content.mjs path/to/file.mdoc  # audit one file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const WATCH = process.argv.includes('--watch');
const TARGET = process.argv.find((a) => a.endsWith('.mdoc'));

// ── helpers ────────────────────────────────────────────────────────────────

import {
  isListItem,
  listItemIndent,
  isBlank,
  splitMdoc,
  findMdocFiles,
  splitByFencedCode,
} from './lib/mdoc-utils.mjs';

// ── issue detectors ────────────────────────────────────────────────────────

/**
 * Each detector receives (lines, frontmatterLineCount) and returns:
 * [{ line: number, message: string, severity: 'error'|'warn' }]
 * Line numbers are 1-based and include frontmatter offset.
 */

function detectLooseLists(lines, offset) {
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isListItem(lines[i])) continue;
    const indent = listItemIndent(lines[i]);
    let j = i + 1;
    while (j < lines.length && isBlank(lines[j])) j++;
    if (j < lines.length && isListItem(lines[j]) && listItemIndent(lines[j]) === indent) {
      if (j > i + 1) {
        issues.push({
          line: i + 1 + offset,
          message: `Loose list: blank line between same-level list items (will cause "Unknown inline node type: paragraph")`,
          severity: 'error',
        });
        i = j - 1;
      }
    }
  }
  return issues;
}

function detectNestedLists(lines, offset) {
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isListItem(lines[i])) continue;
    const indent = listItemIndent(lines[i]);
    const j = i + 1;
    if (j < lines.length && isListItem(lines[j]) && listItemIndent(lines[j]) > indent) {
      issues.push({
        line: j + 1 + offset,
        message: `Nested sub-list inside list item (causes "Unknown inline node type: paragraph" in Keystatic). Run \`npm run fix-content\` to flatten.`,
        severity: 'error',
      });
    }
  }
  return issues;
}

function detectUnisolatedImages(lines, offset) {
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    const isImg = trimmed !== '' && /^(!\[[^\]]*\]\([^)]*\)\s*)+$/.test(trimmed);
    if (!isImg) continue;
    const prevBlank = i === 0 || isBlank(lines[i - 1]);
    const nextBlank = i === lines.length - 1 || isBlank(lines[i + 1]);
    if (!prevBlank || !nextBlank) {
      issues.push({
        line: i + 1 + offset,
        message: `Image not isolated by blank lines (may render as inline). Run \`npm run fix-content\` to fix.`,
        severity: 'warn',
      });
    }
  }
  return issues;
}

function detectMultiParaListItems(lines, offset) {
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isListItem(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && isBlank(lines[j])) j++;
    if (j < lines.length && !isListItem(lines[j]) && /^[ \t]{2,}/.test(lines[j])) {
      issues.push({
        line: j + 1 + offset,
        message: `Multi-paragraph list item continuation (causes "Unknown inline node type: paragraph"). Run \`npm run fix-content\` to merge.`,
        severity: 'error',
      });
    }
  }
  return issues;
}

function detectCDNAssetExtensions(lines, offset) {
  const issues = [];
  const IMG_RE = /!\[[^\]]*\]\(([^)]+)\)/g;
  for (let i = 0; i < lines.length; i++) {
    let match;
    while ((match = IMG_RE.exec(lines[i])) !== null) {
      const url = match[1];
      if (
        /^https:\/\/assets\.vedant\.to\//i.test(url) &&
        /\.(png|jpg|jpeg)$/i.test(url)
      ) {
        issues.push({
          line: i + 1 + offset,
          message: `Image ref has wrong extension (points to ${url.split('/').pop()}). Run \`npm run fix-images\` to rewrite to .webp.`,
          severity: 'error',
        });
      }
    }
  }
  return issues;
}

function detectFrontmatterCDNAssetExtensions(lines, offset) {
  const issues = [];
  const URL_RE = /https:\/\/assets\.vedant\.to\/\S+/gi;
  for (let i = 0; i < lines.length; i++) {
    let match;
    while ((match = URL_RE.exec(lines[i])) !== null) {
      const url = match[0];
      if (!/\.webp$/i.test(url)) {
        issues.push({
          line: i + 1 + offset,
          message: `Frontmatter ref has wrong extension (points to ${url.split('/').pop()}). Run \`npm run fix-images\` to rewrite to .webp.`,
          severity: 'error',
        });
      }
    }
  }
  return issues;
}

/**
 * Posts that predate the excerpt check, listed by slug.
 *
 * These four ship an empty RSS <description> and an empty JSON feed summary
 * today. They are named here rather than waved through by lowering the check to
 * a warning, because a warning on a gate nobody has to satisfy is how the link
 * checker sat broken for three months: muted, green-adjacent, and providing no
 * coverage. An explicit list fails loudly for every NEW post, keeps the debt
 * countable, and empties itself as excerpts get written.
 *
 * To close one out: add an `excerpt:` to the post's frontmatter and delete its
 * slug from this list. When the list is empty, delete the list.
 */
const POSTS_WITHOUT_EXCERPTS = new Set([
  'guilt-of-not-working',
  'is-it-bad-to-be-cocky',
  'loose-lips-sink-ships',
  'the-case-against-for-human-connection',
]);

function detectMissingExcerpt(lines, offset, slug) {
  const issues = [];
  let draft = false;
  let excerptLine = -1;
  let excerptValue = '';
  for (let i = 0; i < lines.length; i++) {
    if (/^draft:\s*true\s*$/.test(lines[i])) draft = true;
    const match = lines[i].match(/^excerpt:\s*(.*)$/);
    if (!match) continue;
    excerptLine = i;
    let value = match[1].trim();
    if (/^[>|][+-]?$/.test(value)) {
      // block scalar (>-, |, …): value is the indented continuation lines
      value = '';
      for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) {
        value += lines[j].trim();
      }
    }
    excerptValue = value.replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  if (draft) return issues;
  if (POSTS_WITHOUT_EXCERPTS.has(slug)) return issues;
  if (excerptLine === -1) {
    issues.push({
      line: 1,
      message: `Published post has no excerpt (RSS <description> and JSON feed summary fall back to the title). Add an excerpt to the frontmatter.`,
      severity: 'error',
    });
  } else if (excerptValue === '') {
    issues.push({
      line: excerptLine + 1 + offset,
      message: `Published post has an empty excerpt (RSS <description> and JSON feed summary fall back to the title). Fill in the excerpt.`,
      severity: 'error',
    });
  }
  return issues;
}

const DETECTORS = [
  detectLooseLists,
  detectNestedLists,
  detectUnisolatedImages,
  detectMultiParaListItems,
  detectCDNAssetExtensions,
];

// ── audit one file ─────────────────────────────────────────────────────────

function auditFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`  ✗ could not read: ${err.message}`);
    return [];
  }

  const { frontmatter, body } = splitMdoc(raw);
  // frontmatter ends with '\n', so split leaves a trailing empty string —
  // subtract it or every body line number comes out one too high
  const fmLines = frontmatter.split('\n').length - 1;
  const segments = splitByFencedCode(body);
  const allIssues = [];

  allIssues.push(...detectFrontmatterCDNAssetExtensions(frontmatter.split('\n'), 0));

  // Only posts carry an excerpt field (daily entries and quotes have none).
  if (
    path.relative(ROOT, filePath).startsWith(path.join('content', 'posts') + path.sep)
  ) {
    // Posts are flat files: content/posts/<slug>.mdoc
    const slug = path.basename(filePath, '.mdoc');
    allIssues.push(...detectMissingExcerpt(frontmatter.split('\n'), 0, slug));
  }

  for (const seg of segments) {
    if (seg.type === 'code') continue;
    for (const detect of DETECTORS) {
      allIssues.push(...detect(seg.lines, fmLines + seg.startLine));
    }
  }

  allIssues.sort((a, b) => a.line - b.line);
  return allIssues;
}

// ── output helpers ─────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function printIssues(filePath, issues) {
  const rel = path.relative(ROOT, filePath);
  if (issues.length === 0) {
    console.log(`${GREEN}✓${RESET} ${rel}`);
    return;
  }
  console.log(`\n${BOLD}${rel}${RESET}`);
  for (const { line, message, severity } of issues) {
    const color = severity === 'error' ? RED : YELLOW;
    const tag = severity === 'error' ? 'error' : ' warn';
    console.log(`  ${color}${tag}${RESET} ${DIM}line ${line}:${RESET} ${message}`);
  }
}

// ── run audit ─────────────────────────────────────────────────────────────

function runAudit(files) {
  let totalIssues = 0;
  for (const f of files) {
    const issues = auditFile(f);
    printIssues(f, issues);
    totalIssues += issues.length;
  }
  console.log(
    `\n${DIM}audit-content: ${files.length} file(s), ${totalIssues} issue(s)${totalIssues === 0 ? ` ${GREEN}✓${RESET}` : ''}${RESET}`
  );
  return totalIssues;
}

// ── watch mode ─────────────────────────────────────────────────────────────

if (WATCH) {
  const files = TARGET ? [path.resolve(TARGET)] : findMdocFiles(CONTENT_DIR);
  console.log(`${CYAN}audit-content watching ${CONTENT_DIR}...${RESET}\n`);
  runAudit(files);

  // Node 20+ supports recursive watch natively on all platforms.
  fs.watch(CONTENT_DIR, { recursive: true }, (event, filename) => {
    if (!filename || !filename.endsWith('.mdoc')) return;
    const changed = path.join(CONTENT_DIR, filename);
    console.log(`\n${CYAN}[changed]${RESET} ${path.relative(ROOT, changed)}`);
    const issues = auditFile(changed);
    printIssues(changed, issues);
    if (issues.length === 0) {
      console.log(`${DIM}  no issues${RESET}`);
    }
  });
} else {
  const files = TARGET ? [path.resolve(TARGET)] : findMdocFiles(CONTENT_DIR);
  const total = runAudit(files);
  if (total > 0) process.exit(1);
}
