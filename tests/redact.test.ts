import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptLine, decryptLine, parseRedactedLines } from '@/lib/redact';

const TEXT = 'the line nobody gets to read without the password';
const PASSWORD = 'correct horse battery staple';

test('round-trips with the right password', async () => {
  const payload = await encryptLine(TEXT, PASSWORD);
  assert.equal(await decryptLine(payload, PASSWORD), TEXT);
});

test('payload carries no plaintext', async () => {
  const payload = await encryptLine(TEXT, PASSWORD);
  const blob = JSON.stringify(payload);
  assert.ok(!blob.includes('nobody'));
  assert.ok(!blob.includes(PASSWORD));
});

test('wrong password resolves to null, not a throw', async () => {
  const payload = await encryptLine(TEXT, PASSWORD);
  assert.equal(await decryptLine(payload, 'wrong'), null);
  assert.equal(await decryptLine(payload, ''), null);
});

test('tampered or malformed ciphertext resolves to null', async () => {
  const payload = await encryptLine(TEXT, PASSWORD);
  const bytes = Buffer.from(payload.data, 'base64');
  bytes[0] ^= 0xff;
  assert.equal(
    await decryptLine({ ...payload, data: bytes.toString('base64') }, PASSWORD),
    null
  );
  assert.equal(await decryptLine({ ...payload, data: 'AA==' }, PASSWORD), null);
  assert.equal(await decryptLine({ ...payload, salt: 'AA==' }, PASSWORD), null);
});

test('fresh salt and iv per call', async () => {
  const a = await encryptLine(TEXT, PASSWORD);
  const b = await encryptLine(TEXT, PASSWORD);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});

test('parseRedactedLines fails closed on garbage', async () => {
  assert.deepEqual(parseRedactedLines(undefined), {});
  assert.deepEqual(parseRedactedLines('not json'), {});
  assert.deepEqual(
    parseRedactedLines('{"Bad Id!":{"salt":"a","iv":"b","data":"c"}}'),
    {}
  );
  assert.deepEqual(parseRedactedLines('{"x":{"salt":"a"}}'), {});
  const payload = await encryptLine(TEXT, PASSWORD);
  assert.deepEqual(parseRedactedLines(JSON.stringify({ birthday: payload })), {
    birthday: payload,
  });
});
