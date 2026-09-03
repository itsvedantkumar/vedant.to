#!/usr/bin/env node
// Fails when a value from site.config.mjs is hardcoded anywhere else in the
// tracked tree. This is what keeps "edit one file" true after a fork: the
// audit-content regex, the CSP host and the origin allowlist all used to carry
// their own copy of the domain, and a copy that is missed fails open.
//
// Comments count too. A comment naming the old domain misleads the next
// reader as surely as a literal misleads the build.
//
// Allowlisted paths are prose or the owner's content, not code that a fork
// runs: README, docs, LICENSE, SECURITY.md, content/, package metadata, and
// the agent configuration directories.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { site, siteHost, assetsHost } from '../site.config.mjs';

const ALLOW = [
  /^site\.config\.mjs$/,
  /^README\.md$/,
  /^SECURITY\.md$/,
  /^LICENSE$/,
  /^CHANGELOG\.md$/,
  /^docs\//,
  /^content\//,
  /^package(-lock)?\.json$/,
  /^CLAUDE\.md$/,
  /^\.claude\//,
  /^\.conductor\//,
  /^\.audit\//,
  /^public\/.*\.(png|jpg|jpeg|webp|ico|svg)$/,
];

// Every distinct string a fork must change. Case-insensitive, so the name in
// a title and the same name lowercased in a slug both count.
const values = [
  site.name,
  ...site.author.split(/\s+/),
  siteHost,
  assetsHost,
  site.github.owner,
  ...Object.values(site.social),
  ...Object.values(site.email),
].filter((s) => typeof s === 'string' && s.length > 0);

// A needle under three characters would match inside ordinary words and drown
// the report in noise, so refuse to run rather than silently skip it.
const tooShort = values.filter((s) => s.length < 3);
if (tooShort.length) {
  console.error(
    `check-identity: refusing to scan for ${tooShort.map((s) => JSON.stringify(s)).join(', ')}: ` +
      'values under three characters cannot be matched safely. Lengthen them or drop the field.'
  );
  process.exit(1);
}

// Whole-token match: a three-letter name must not fire inside "metadata".
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const needles = [...new Set(values.map((s) => s.toLowerCase()))].map((n) => ({
  label: n,
  re: new RegExp(`(?<![\\p{L}\\p{N}_])${escape(n)}(?![\\p{L}\\p{N}_])`, 'iu'),
}));

// Vercel builds from an export without .git, so fall back to a directory walk
// that skips build output and dependencies.
const WALK_SKIP = new Set([
  '.git',
  'node_modules',
  '.next',
  '.vercel',
  '.claude',
  '.audit',
  'out',
  'coverage',
]);
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (WALK_SKIP.has(entry.name)) continue;
    const rel = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}
function listFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    return walk('.');
  }
}

const files = listFiles().filter((f) => !ALLOW.some((re) => re.test(f)));

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the index but not yet committed, or unreadable
  }
  text.split('\n').forEach((line, i) => {
    for (const { label, re } of needles) {
      if (re.test(line)) {
        hits.push(`${file}:${i + 1}: "${label}"`);
        break;
      }
    }
  });
}

if (hits.length) {
  console.error(
    `check-identity: ${hits.length} hardcoded identity value(s) outside site.config.mjs:\n` +
      hits.map((h) => `  ${h}`).join('\n')
  );
  process.exit(1);
}
console.log(
  `check-identity: ok (${files.length} files scanned, ${needles.length} needles)`
);
