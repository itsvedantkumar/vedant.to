// Covers the site's critical invariant: a post with draft: true (or no
// publishedAt) must never appear on the live site or in any feed. Two layers:
//
// 1. The filter/sort behavior of getPublishedPosts (lib/posts.ts) and
//    getPublishedDailyEntries (lib/daily.ts), exercised against in-memory
//    fixtures. The Keystatic reader is the filesystem boundary, so it is
//    stubbed via a module hook (same idiom as tests/guard.test.ts) — the
//    filter and sort under test run unmodified.
// 2. A static source sweep asserting every file in app/ and lib/ that lists
//    the posts or daily collections goes through those two functions. This is
//    what catches a new feed/listing route that calls the reader directly and
//    silently leaks drafts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import type { getPublishedPosts as GetPublishedPosts } from '@/lib/posts';
import type { getPublishedDailyEntries as GetPublishedDailyEntries } from '@/lib/daily';

type PostRecord = Awaited<ReturnType<typeof GetPublishedPosts>>[number];
type DailyRecord = Awaited<ReturnType<typeof GetPublishedDailyEntries>>[number];

// Stub lib/reader.ts for the two modules under test. The replacement module
// evaluates on the main thread, so it can hand back fixtures the tests place
// on globalThis. Everything else (the filter, the sort) is the real code.
const readerStub =
  'data:text/javascript,' +
  encodeURIComponent(
    `const get = (key) => globalThis[key] ?? [];
     export const reader = {
       collections: {
         posts: { all: async () => get('__draftInvariantPosts') },
         daily: { all: async () => get('__draftInvariantDaily') },
       },
     };`
  );
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export function resolve(specifier, context, nextResolve) {
         if (
           specifier === './reader' &&
           context.parentURL &&
           /\\/lib\\/(posts|daily)\\.ts$/.test(context.parentURL)
         ) {
           return { url: ${JSON.stringify(readerStub)}, shortCircuit: true };
         }
         return nextResolve(specifier, context);
       }`
    ),
  import.meta.url
);

const { getPublishedPosts } = await import('@/lib/posts');
const { getPublishedDailyEntries } = await import('@/lib/daily');

// publishedAt/date are typed `string` (isRequired in keystatic.config.ts), so
// "missing" is representable only as the empty string — which is exactly the
// falsy value the truthiness filters guard against.
function post(slug: string, publishedAt: string, draft: boolean): PostRecord {
  return {
    slug,
    entry: {
      title: `Title for ${slug}`,
      publishedAt,
      updatedAt: null,
      draft,
      excerpt: '',
      coverImage: null,
      content: async () => [],
    },
  };
}

function daily(slug: string, date: string, draft: boolean): DailyRecord {
  return {
    slug,
    entry: {
      slug,
      date,
      draft,
      content: async () => [],
    },
  };
}

function setPosts(records: PostRecord[]): void {
  Reflect.set(globalThis, '__draftInvariantPosts', records);
}

function setDaily(records: DailyRecord[]): void {
  Reflect.set(globalThis, '__draftInvariantDaily', records);
}

// --- getPublishedPosts -------------------------------------------------------

test('posts: draft: true is excluded even with publishedAt set', async () => {
  setPosts([post('live', '2025-01-01', false), post('secret', '2025-02-01', true)]);
  const slugs = (await getPublishedPosts()).map((p) => p.slug);
  assert.deepEqual(slugs, ['live']);
});

test('posts: empty publishedAt is excluded even when not a draft', async () => {
  setPosts([post('dated', '2025-01-01', false), post('undated', '', false)]);
  const slugs = (await getPublishedPosts()).map((p) => p.slug);
  assert.deepEqual(slugs, ['dated']);
});

test('posts: draft: false with publishedAt is included', async () => {
  setPosts([post('live', '2025-01-01', false)]);
  const slugs = (await getPublishedPosts()).map((p) => p.slug);
  assert.deepEqual(slugs, ['live']);
});

test('posts: nothing survives when everything is draft or undated', async () => {
  setPosts([post('a', '', false), post('b', '2025-01-01', true), post('c', '', true)]);
  assert.deepEqual(await getPublishedPosts(), []);
});

test('posts: sorted newest-first by publishedAt', async () => {
  setPosts([
    post('oldest', '2023-01-01', false),
    post('newest', '2025-05-05', false),
    post('middle', '2024-02-02', false),
  ]);
  const slugs = (await getPublishedPosts()).map((p) => p.slug);
  assert.deepEqual(slugs, ['newest', 'middle', 'oldest']);
});

// --- getPublishedDailyEntries ------------------------------------------------

test('daily: draft: true is excluded even with date set', async () => {
  setDaily([
    daily('2025-01-01', '2025-01-01', false),
    daily('2025-01-02', '2025-01-02', true),
  ]);
  const slugs = (await getPublishedDailyEntries()).map((e) => e.slug);
  assert.deepEqual(slugs, ['2025-01-01']);
});

test('daily: empty date is excluded even when not a draft', async () => {
  setDaily([daily('dated', '2025-01-01', false), daily('undated', '', false)]);
  const slugs = (await getPublishedDailyEntries()).map((e) => e.slug);
  assert.deepEqual(slugs, ['dated']);
});

test('daily: sorted newest-first by date', async () => {
  setDaily([daily('old', '2024-03-03', false), daily('new', '2025-08-08', false)]);
  const slugs = (await getPublishedDailyEntries()).map((e) => e.slug);
  assert.deepEqual(slugs, ['new', 'old']);
});

// --- consumer sweep ----------------------------------------------------------
// Any file in app/ or lib/ that lists the posts or daily collections directly
// (reader.collections.<x>.all() / .list()) bypasses the draft filter. Only
// lib/posts.ts and lib/daily.ts may do that; likewise only lib/reader.ts may
// construct a reader. .read(slug) on a single entry is fine and not flagged.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(...dirs: string[]): string[] {
  return dirs.flatMap((dir) =>
    readdirSync(join(repoRoot, dir), { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
      .map((d) => join(d.parentPath, d.name))
  );
}

const listingRules: { pattern: RegExp; allowed: string; useInstead: string }[] = [
  {
    pattern: /collections\s*\.\s*posts\s*\.\s*(all|list)\s*\(/,
    allowed: 'lib/posts.ts',
    useInstead: 'getPublishedPosts() from lib/posts.ts',
  },
  {
    pattern: /collections\s*\.\s*daily\s*\.\s*(all|list)\s*\(/,
    allowed: 'lib/daily.ts',
    useInstead: 'getPublishedDailyEntries() from lib/daily.ts',
  },
  {
    pattern: /createReader\s*\(/,
    allowed: 'lib/reader.ts',
    useInstead:
      'the shared reader from lib/reader.ts (and the lib/posts.ts / lib/daily.ts wrappers for listings)',
  },
];

test('no route or lib file lists posts/daily around the draft filter', () => {
  const violations: string[] = [];
  for (const file of sourceFiles('app', 'lib')) {
    const rel = relative(repoRoot, file);
    const source = readFileSync(file, 'utf8');
    for (const rule of listingRules) {
      if (rel !== rule.allowed && rule.pattern.test(source)) {
        violations.push(
          `${rel} matches ${rule.pattern} — this bypasses the draft/published filter. ` +
            `Use ${rule.useInstead} instead.`
        );
      }
    }
  }
  assert.equal(violations.length, 0, `\n${violations.join('\n')}`);
});

test('sweep self-check: the patterns still match their allowed call sites', () => {
  // If a refactor changes how the allowed files call the reader, these
  // patterns go stale and the sweep above would pass vacuously. Fail loudly
  // here instead so the sweep gets updated alongside the refactor.
  for (const rule of listingRules) {
    const source = readFileSync(join(repoRoot, rule.allowed), 'utf8');
    assert.equal(
      rule.pattern.test(source),
      true,
      `${rule.allowed} no longer matches ${rule.pattern}; update the sweep in tests/draft-invariant.test.ts`
    );
  }
});
