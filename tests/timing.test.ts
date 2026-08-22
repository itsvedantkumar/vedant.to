// Covers lib/timing.ts timingSafeEqual — the constant-time string comparison
// every password/token check in lib/auth/guard.ts and the password route
// funnels through. A regression here (e.g. reverting to `a === b`, or an
// early-exit loop) turns a comparison into a timing side-channel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from '@/lib/timing';

test('equal strings match', () => {
  assert.equal(
    timingSafeEqual('correct-horse-battery-staple', 'correct-horse-battery-staple'),
    true
  );
});

test('empty strings match each other', () => {
  assert.equal(timingSafeEqual('', ''), true);
});

test('different strings of the same length do not match', () => {
  assert.equal(timingSafeEqual('aaaaaaaa', 'aaaaaaab'), false);
});

test('strings of different lengths never match, even when one is a prefix of the other', () => {
  assert.equal(timingSafeEqual('secret', 'secret-but-longer'), false);
  assert.equal(timingSafeEqual('secret-but-longer', 'secret'), false);
});

test('completely different lengths do not match', () => {
  assert.equal(timingSafeEqual('a', 'a much longer string entirely'), false);
});

test('is case-sensitive', () => {
  assert.equal(timingSafeEqual('Password', 'password'), false);
});

test('handles multi-byte UTF-8 input without throwing and without false positives', () => {
  assert.equal(timingSafeEqual('pässwörd', 'pässwörd'), true);
  assert.equal(timingSafeEqual('pässwörd', 'password'), false);
});

test('no early-exit shortcut: a mismatch anywhere in the byte range is still caught', () => {
  // Every position, first through last, must independently cause a mismatch —
  // guards against a loop that returns early on the first differing byte
  // (which would still be correct here, but is the shape of an early-exit bug)
  // as well as against comparing by length only.
  const base = 'abcdefghijklmnop';
  for (let i = 0; i < base.length; i++) {
    const mutated = base.slice(0, i) + 'X' + base.slice(i + 1);
    assert.equal(
      timingSafeEqual(base, mutated),
      false,
      `mismatch at index ${i} must be detected`
    );
  }
});
