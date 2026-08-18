// Covers lib/reading-time.ts getReadingStats. It's pure aside from a single
// readFileSync against content/posts/<slug>.mdoc with a try/catch fallback —
// no Keystatic document tree required. A small fixture .mdoc is written under
// content/posts for the duration of this file and removed in `after`, using a
// slug prefix that can't collide with real content.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getReadingStats } from '@/lib/reading-time';

const fixtureSlug = 'zz-test-fixture-reading-time';
const fixturePath = join(process.cwd(), 'content/posts', `${fixtureSlug}.mdoc`);

before(() => {
  const body = `${'word '.repeat(250).trim()}`;
  writeFileSync(fixturePath, `---\ntitle: fixture\n---\n${body}\n`, 'utf-8');
});

after(() => {
  if (existsSync(fixturePath)) unlinkSync(fixturePath);
});

test('invalid slug shape (path traversal / non [a-z0-9-] chars) short-circuits to a safe default', () => {
  assert.deepEqual(getReadingStats('../../etc/passwd'), { words: 0, minutes: 1 });
  assert.deepEqual(getReadingStats('has spaces'), { words: 0, minutes: 1 });
  assert.deepEqual(getReadingStats('under_score'), { words: 0, minutes: 1 });
});

test('valid slug shape but no matching file falls back via catch, not a throw', () => {
  assert.deepEqual(getReadingStats('slug-that-does-not-exist-anywhere'), {
    words: 0,
    minutes: 1,
  });
});

test('strips frontmatter and counts words, rounding minutes up (250 words / 200wpm -> 2 min)', () => {
  const stats = getReadingStats(fixtureSlug);
  assert.equal(stats.words, 250);
  assert.equal(stats.minutes, 2);
});

test('minutes is floored at 1 even for very short bodies', () => {
  writeFileSync(fixturePath, '---\ntitle: fixture\n---\none two three\n', 'utf-8');
  const stats = getReadingStats(fixtureSlug);
  assert.equal(stats.words, 3);
  assert.equal(stats.minutes, 1);
});
