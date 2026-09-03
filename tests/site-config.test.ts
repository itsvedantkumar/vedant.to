// Validates site configuration: URLs are well-formed, constants are consistent,
// and social links are valid. This test ensures the site config is portable —
// a fork's only edit should be site.config.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { SITE_URL, SITE_HOST, SITE_ORIGIN_RE, TWITTER_HANDLE, SOCIAL_LINKS } =
  await import('@/lib/constants');

test('site-config: SITE_URL has no trailing slash', () => {
  assert.ok(!SITE_URL.endsWith('/'), `SITE_URL must not end with /: ${SITE_URL}`);
});

test('site-config: SITE_URL is a valid https URL', () => {
  const url = new URL(SITE_URL);
  assert.equal(url.protocol, 'https:', `SITE_URL must use https: ${SITE_URL}`);
});

test('site-config: SITE_HOST matches SITE_URL', () => {
  const url = new URL(SITE_URL);
  assert.equal(SITE_HOST, url.host, `SITE_HOST must be ${url.host}, got ${SITE_HOST}`);
});

test('site-config: SITE_ORIGIN_RE matches SITE_URL', () => {
  assert.ok(SITE_ORIGIN_RE.test(SITE_URL), `SITE_ORIGIN_RE must match ${SITE_URL}`);
});

test('site-config: SITE_ORIGIN_RE rejects lookalike domain', () => {
  assert.ok(
    !SITE_ORIGIN_RE.test(`https://${SITE_HOST}.evil.com`),
    'SITE_ORIGIN_RE must reject lookalike domains'
  );
});

test('site-config: SITE_ORIGIN_RE rejects subdomain', () => {
  assert.ok(
    !SITE_ORIGIN_RE.test(`https://www.${SITE_HOST}`),
    'SITE_ORIGIN_RE must reject subdomains'
  );
});

test('site-config: SITE_ORIGIN_RE rejects with trailing path', () => {
  assert.ok(
    !SITE_ORIGIN_RE.test(`${SITE_URL}/`),
    'SITE_ORIGIN_RE must reject origins with trailing path'
  );
});

test('site-config: TWITTER_HANDLE starts with @ when set', () => {
  if (SOCIAL_LINKS.x) {
    assert.ok(
      TWITTER_HANDLE.startsWith('@'),
      `TWITTER_HANDLE must start with @: ${TWITTER_HANDLE}`
    );
  }
});

test('site-config: all non-null social links are https URLs', () => {
  for (const [key, url] of Object.entries(SOCIAL_LINKS)) {
    if (url !== null) {
      const u = new URL(url);
      assert.equal(u.protocol, 'https:', `${key} social link must use https: ${url}`);
    }
  }
});
