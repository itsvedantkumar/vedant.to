// Covers lib/auth/session.ts signSession/verifySession — the HMAC-signed,
// stateless admin session cookie that every /api/auth/* route and
// middleware.ts trusts. This is the actual authentication boundary: a bug
// here means either legitimate sessions get rejected, or a tampered/expired
// token gets accepted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession } from '@/lib/auth/session';

const SECRET = 'unit-test-secret-do-not-use-in-prod';

test('round trip: sign then verify returns the original claims', async () => {
  const token = await signSession({ m: 'passkey', cid: 'abcdef0123456789' }, SECRET);
  const payload = await verifySession(token, SECRET);
  assert.ok(payload);
  assert.equal(payload?.v, 1);
  assert.equal(payload?.sub, 'admin');
  assert.equal(payload?.m, 'passkey');
  assert.equal(payload?.cid, 'abcdef0123456789');
  assert.equal(typeof payload?.jti, 'string');
  assert.ok((payload?.jti.length ?? 0) > 0);
});

test('round trip: password-mode session has no cid', async () => {
  const token = await signSession({ m: 'password' }, SECRET);
  const payload = await verifySession(token, SECRET);
  assert.ok(payload);
  assert.equal(payload?.m, 'password');
  assert.equal(payload?.cid, undefined);
});

test('cid is truncated to 16 characters, matching the docstring', async () => {
  const token = await signSession({ m: 'passkey', cid: 'a'.repeat(40) }, SECRET);
  const payload = await verifySession(token, SECRET);
  assert.equal(payload?.cid, 'a'.repeat(16));
});

test('a tampered payload fails verification', async () => {
  const token = await signSession({ m: 'passkey' }, SECRET);
  const [body, sig] = token.split('.');
  // Flip the mode claim without re-signing — decodes to different JSON, same
  // (now invalid) signature.
  const tamperedBody = body.slice(0, -1) + (body.at(-1) === 'A' ? 'B' : 'A');
  const tampered = `${tamperedBody}.${sig}`;
  assert.equal(await verifySession(tampered, SECRET), null);
});

test('a tampered signature fails verification', async () => {
  const token = await signSession({ m: 'passkey' }, SECRET);
  const [body, sig] = token.split('.');
  // Flip a character near the start of the signature, not the last character:
  // base64url's final character only encodes 2 low-order bits, so mutating it
  // can (depending on the underlying byte) decode to the same byte value and
  // produce a false negative for this test.
  const tamperedSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.equal(await verifySession(`${body}.${tamperedSig}`, SECRET), null);
});

test('a token signed with a different secret fails verification', async () => {
  const token = await signSession({ m: 'passkey' }, SECRET);
  assert.equal(await verifySession(token, 'a-completely-different-secret'), null);
});

test('an expired token fails verification', async () => {
  const token = await signSession({ m: 'passkey' }, SECRET, -10); // exp already in the past
  assert.equal(await verifySession(token, SECRET), null);
});

test('a token at the exact expiry boundary is rejected (exp is exclusive)', async () => {
  const token = await signSession({ m: 'passkey' }, SECRET, 0); // exp === iat === now
  assert.equal(await verifySession(token, SECRET), null);
});

test('malformed tokens (wrong shape) return null instead of throwing', async () => {
  await assert.doesNotReject(async () => {
    assert.equal(await verifySession('not-a-real-token', SECRET), null);
    assert.equal(await verifySession('too.many.dots.here', SECRET), null);
    assert.equal(await verifySession('', SECRET), null);
    assert.equal(await verifySession('..', SECRET), null);
  });
});

test('missing cookie or missing secret returns null, never throws', async () => {
  assert.equal(await verifySession(undefined, SECRET), null);
  const token = await signSession({ m: 'passkey' }, SECRET);
  assert.equal(await verifySession(token, undefined), null);
});

test('an oversized cookie is rejected outright (pathological-input guard)', async () => {
  const huge = 'a'.repeat(513) + '.' + 'b'.repeat(10);
  assert.equal(await verifySession(huge, SECRET), null);
});

test('regression: verifySession never throws on adversarial input', async () => {
  // verifySession's docstring promises "never throws" because Edge middleware
  // fails hard on an unhandled exception. Any of these used to be plausible
  // crash inputs (bad base64, non-JSON payload, wrong types).
  const adversarialCookies = [
    '!!!not-base64!!!.also-not-base64',
    `${Buffer.from('not json at all').toString('base64url')}.deadbeef`,
    `${Buffer.from(JSON.stringify({ v: 2, sub: 'admin', m: 'passkey', exp: 9999999999 })).toString('base64url')}.deadbeef`,
  ];
  for (const cookie of adversarialCookies) {
    await assert.doesNotReject(() => verifySession(cookie, SECRET));
  }
});
