import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptRedacted, decryptRedacted } from '@/lib/redact';

const TEXT = 'the line nobody gets to read without the password';
const PASSWORD = 'correct horse battery staple';

test('round-trips with the right password', async () => {
  const payload = await encryptRedacted(TEXT, PASSWORD);
  assert.equal(await decryptRedacted(payload, PASSWORD), TEXT);
});

test('payload carries no plaintext', async () => {
  const payload = await encryptRedacted(TEXT, PASSWORD);
  const blob = JSON.stringify(payload);
  assert.ok(!blob.includes('nobody'));
  assert.ok(!blob.includes(PASSWORD));
});

test('wrong password resolves to null, not a throw', async () => {
  const payload = await encryptRedacted(TEXT, PASSWORD);
  assert.equal(await decryptRedacted(payload, 'wrong'), null);
  assert.equal(await decryptRedacted(payload, ''), null);
});

test('tampered ciphertext resolves to null', async () => {
  const payload = await encryptRedacted(TEXT, PASSWORD);
  const bytes = Buffer.from(payload.data, 'base64');
  bytes[0] ^= 0xff;
  const tampered = { ...payload, data: bytes.toString('base64') };
  assert.equal(await decryptRedacted(tampered, PASSWORD), null);
  assert.equal(
    await decryptRedacted({ ...payload, data: 'not base64!' }, PASSWORD),
    null
  );
});

test('fresh salt and iv per call', async () => {
  const a = await encryptRedacted(TEXT, PASSWORD);
  const b = await encryptRedacted(TEXT, PASSWORD);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});
