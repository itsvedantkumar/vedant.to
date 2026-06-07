/**
 * mdoc-utils.mjs
 *
 * Shared helpers for scripts that parse and transform .mdoc files.
 */

import fs from 'fs';
import path from 'path';

export function isListItem(line) {
  return /^[ \t]*([-*+]|\d+[.)]) /.test(line);
}

export function listItemIndent(line) {
  const m = line.match(/^([ \t]*)([-*+]|\d+[.)]) /);
  return m ? m[1].length : -1;
}

export function isBlank(line) {
  return line === '' || /^\s+$/.test(line);
}

/** Split raw .mdoc into frontmatter + body. */
export function splitMdoc(raw) {
  const match = raw.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: raw };
  return { frontmatter: match[1], body: match[2] };
}

/** Recursively find all .mdoc files under dir. */
export function findMdocFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMdocFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.mdoc')) results.push(full);
  }
  return results;
}

/**
 * Split body into text / fenced-code segments.
 * Each segment: { type: 'text' | 'code', lines: string[], startLine: number }
 */
export function splitByFencedCode(body) {
  const lines = body.split('\n');
  const segments = [];
  let inFence = false;
  let fenceMarker = '';
  let current = [];
  let segStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFence) {
      const fenceMatch = line.match(/^(`{3,}|~{3,})/);
      if (fenceMatch) {
        segments.push({ type: 'text', lines: current, startLine: segStart });
        current = [line];
        segStart = i;
        inFence = true;
        fenceMarker = fenceMatch[1][0].repeat(fenceMatch[1].length);
      } else {
        current.push(line);
      }
    } else {
      current.push(line);
      if (
        new RegExp(
          `^${fenceMarker[0] === '`' ? '`' : '~'}{${fenceMarker.length},}\\s*$`
        ).test(line)
      ) {
        segments.push({ type: 'code', lines: current, startLine: segStart });
        current = [];
        segStart = i + 1;
        inFence = false;
        fenceMarker = '';
      }
    }
  }
  if (current.length > 0) {
    segments.push({
      type: inFence ? 'code' : 'text',
      lines: current,
      startLine: segStart,
    });
  }
  return segments;
}
