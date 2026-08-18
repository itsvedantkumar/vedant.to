// Covers lib/metadata.ts coverImageUrl — recently consolidated from three
// divergent copies. Locks in: absolute/root-relative pass through, a bare
// relative path is deliberately NOT fabricated into a URL, and nullish/empty
// input returns undefined so callers fall back to the generated OG image.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverImageUrl } from '@/lib/metadata';
import { SITE_URL } from '@/lib/constants';

test('absolute https:// URL passes through unchanged', () => {
  assert.equal(
    coverImageUrl('https://cdn.example.com/a.png'),
    'https://cdn.example.com/a.png'
  );
});

test('leading-slash path is joined with SITE_URL', () => {
  assert.equal(coverImageUrl('/images/posts/a.png'), `${SITE_URL}/images/posts/a.png`);
});

test('bare relative path returns undefined instead of fabricating a URL', () => {
  assert.equal(coverImageUrl('images/posts/a.png'), undefined);
});

test('http:// (non-https) is not recognized as absolute', () => {
  // Only https:// is special-cased; a plain http URL is unrecognized data.
  assert.equal(coverImageUrl('http://example.com/a.png'), undefined);
});

test('null returns undefined', () => {
  assert.equal(coverImageUrl(null), undefined);
});

test('undefined returns undefined', () => {
  assert.equal(coverImageUrl(undefined), undefined);
});

test('empty string returns undefined', () => {
  assert.equal(coverImageUrl(''), undefined);
});
