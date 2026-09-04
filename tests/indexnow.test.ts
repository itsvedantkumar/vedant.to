// Covers scripts/indexnow.mjs's pure helpers, exercised against real
// temp-directory fixtures (no network, main() is never invoked):
//
// - findKey: exactly one `<32 hex>.txt` in the public dir yields the key;
//   zero or two such files throws.
// - isDraft: a `draft: true` line (with surrounding whitespace) flags a
//   source string; anything else does not.
// - collectUrls: 4 static paths first, then posts/daily slugs sorted by
//   filename, per-collection; drafts excluded, non-.mdoc files ignored, and
//   a missing collection directory is tolerated rather than throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findKey, isDraft, collectUrls } from '../scripts/indexnow.mjs';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'indexnow-test-'));
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = tempDir();
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- findKey -----------------------------------------------------------------

test('findKey: returns the key for exactly one 32-hex .txt file', () => {
  withTempDir((dir) => {
    const key = 'a'.repeat(32);
    writeFileSync(join(dir, `${key}.txt`), 'irrelevant');
    assert.equal(findKey(dir), key);
  });
});

test('findKey: ignores files that are not 32-hex .txt', () => {
  withTempDir((dir) => {
    const key = 'b'.repeat(32);
    writeFileSync(join(dir, `${key}.txt`), 'irrelevant');
    writeFileSync(join(dir, 'favicon.ico'), 'irrelevant');
    writeFileSync(join(dir, 'not-hex-but-32-characters-long!!.txt'), 'irrelevant');
    writeFileSync(join(dir, `${'c'.repeat(31)}.txt`), 'too short');
    assert.equal(findKey(dir), key);
  });
});

test('findKey: throws when no key file is present', () => {
  withTempDir((dir) => {
    assert.throws(() => findKey(dir), /found 0/);
  });
});

test('findKey: throws when more than one key file is present', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, `${'a'.repeat(32)}.txt`), 'one');
    writeFileSync(join(dir, `${'b'.repeat(32)}.txt`), 'two');
    assert.throws(() => findKey(dir), /found 2/);
  });
});

// --- isDraft -------------------------------------------------------------------

test('isDraft: true for a "draft: true" line', () => {
  assert.equal(isDraft('title: hi\ndraft: true\nbody'), true);
});

test('isDraft: tolerates extra whitespace around the value', () => {
  assert.equal(isDraft('draft:   true   '), true);
});

test('isDraft: false when draft is explicitly false', () => {
  assert.equal(isDraft('title: hi\ndraft: false\nbody'), false);
});

test('isDraft: false when there is no draft line at all', () => {
  assert.equal(isDraft('title: hi\nbody'), false);
});

test('isDraft: false for empty source', () => {
  assert.equal(isDraft(''), false);
});

// --- collectUrls ---------------------------------------------------------------

function writeMdoc(dir: string, name: string, draft = false): void {
  writeFileSync(join(dir, name), draft ? 'title: x\ndraft: true\n' : 'title: x\n');
}

test('collectUrls: static paths first, then posts and daily use the given host', () => {
  withTempDir((dir) => {
    const posts = join(dir, 'content/posts');
    const daily = join(dir, 'content/daily');
    mkdirSync(posts, { recursive: true });
    mkdirSync(daily, { recursive: true });
    writeMdoc(posts, 'hello-world.mdoc');
    writeMdoc(daily, '2025-01-01.mdoc');

    const urls = collectUrls('example.com', dir);
    assert.deepEqual(urls, [
      'https://example.com/',
      'https://example.com/blog',
      'https://example.com/daily',
      'https://example.com/quotes',
      'https://example.com/sidequests',
      'https://example.com/blog/hello-world',
      'https://example.com/daily/2025-01-01',
    ]);
  });
});

test('collectUrls: excludes drafts', () => {
  withTempDir((dir) => {
    const posts = join(dir, 'content/posts');
    mkdirSync(posts, { recursive: true });
    writeMdoc(posts, 'live.mdoc', false);
    writeMdoc(posts, 'secret.mdoc', true);

    const urls = collectUrls('example.com', dir);
    assert.equal(urls.includes('https://example.com/blog/live'), true);
    assert.equal(urls.includes('https://example.com/blog/secret'), false);
  });
});

test('collectUrls: ignores non-.mdoc files', () => {
  withTempDir((dir) => {
    const posts = join(dir, 'content/posts');
    mkdirSync(posts, { recursive: true });
    writeMdoc(posts, 'live.mdoc');
    writeFileSync(join(posts, 'README.md'), 'not a post');
    writeFileSync(join(posts, '.DS_Store'), '');

    const urls = collectUrls('example.com', dir);
    const postUrls = urls.filter((u) => u.startsWith('https://example.com/blog/'));
    assert.deepEqual(postUrls, ['https://example.com/blog/live']);
  });
});

test('collectUrls: tolerates a missing collection directory', () => {
  withTempDir((dir) => {
    const posts = join(dir, 'content/posts');
    mkdirSync(posts, { recursive: true });
    writeMdoc(posts, 'only-post.mdoc');
    // content/daily is never created.

    const urls = collectUrls('example.com', dir);
    assert.deepEqual(urls, [
      'https://example.com/',
      'https://example.com/blog',
      'https://example.com/daily',
      'https://example.com/quotes',
      'https://example.com/sidequests',
      'https://example.com/blog/only-post',
    ]);
  });
});

test('collectUrls: sorts slugs within each collection by filename', () => {
  withTempDir((dir) => {
    const posts = join(dir, 'content/posts');
    mkdirSync(posts, { recursive: true });
    writeMdoc(posts, 'zebra.mdoc');
    writeMdoc(posts, 'alpha.mdoc');
    writeMdoc(posts, 'middle.mdoc');

    const urls = collectUrls('example.com', dir);
    const postUrls = urls.filter((u) => u.startsWith('https://example.com/blog/'));
    assert.deepEqual(postUrls, [
      'https://example.com/blog/alpha',
      'https://example.com/blog/middle',
      'https://example.com/blog/zebra',
    ]);
  });
});

test('collectUrls: empty content root yields only the static paths', () => {
  withTempDir((dir) => {
    assert.deepEqual(collectUrls('example.com', dir), [
      'https://example.com/',
      'https://example.com/blog',
      'https://example.com/daily',
      'https://example.com/quotes',
      'https://example.com/sidequests',
    ]);
  });
});
