// Covers lib/analytics.ts, the path filter instrumentation-client.ts applies
// before any event leaves the browser: admin routes never reach PostHog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrackedPath, pathnameOf, UNTRACKED_PREFIXES } from '@/lib/analytics';

test('public pages are tracked', () => {
  for (const p of [
    '/',
    '/blog',
    '/blog/some-post',
    '/daily/17-august-2026',
    '/quotes',
    '/whisper',
  ]) {
    assert.equal(isTrackedPath(p), true, p);
  }
});

test('admin prefixes and everything under them are not tracked', () => {
  for (const prefix of UNTRACKED_PREFIXES) {
    assert.equal(isTrackedPath(prefix), false, prefix);
    assert.equal(isTrackedPath(`${prefix}/`), false);
    assert.equal(isTrackedPath(`${prefix}/deeper/path`), false);
  }
});

test('a public page whose name merely starts with an admin prefix is tracked', () => {
  assert.equal(isTrackedPath('/authors'), true);
  assert.equal(isTrackedPath('/apis-i-like'), true);
});

test('pathnameOf extracts the path from an absolute URL and rejects junk', () => {
  assert.equal(
    pathnameOf('https://example.com/keystatic/branch/main?x=1'),
    '/keystatic/branch/main'
  );
  assert.equal(pathnameOf('not a url'), null);
  assert.equal(pathnameOf(undefined), null);
  assert.equal(pathnameOf(42), null);
});
