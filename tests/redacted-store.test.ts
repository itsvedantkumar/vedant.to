// Covers lib/redacted-store.ts. One password buys every line on the page, but
// buying a line and putting it on screen are separate: the strips the reader
// did not click stay strips, they just stop asking for the password.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { subscribe, getShown, getKnown, getSealed, learn, show } =
  await import('@/lib/redacted-store');

const TEXTS = { interns: 'Dated 5 interns lol', birthday: 'born on a leap day' };

test('unlocking one line shows it and only it', () => {
  learn(TEXTS, 'interns');

  assert.equal(getShown('interns'), TEXTS.interns);
  assert.equal(getShown('birthday'), null);
});

test('the sibling is paid for, so it never asks for the password again', () => {
  assert.equal(getKnown('birthday'), TEXTS.birthday);
});

test('clicking the paid sibling opens it', () => {
  show('birthday');
  assert.equal(getShown('birthday'), TEXTS.birthday);
});

test('a line nobody paid for cannot be shown', () => {
  show('never-unlocked');
  assert.equal(getShown('never-unlocked'), null);
  assert.equal(getKnown('never-unlocked'), null);
});

test('subscribers hear every change, and unsubscribe stops that', () => {
  let calls = 0;
  const stop = subscribe(() => {
    calls += 1;
  });

  learn({ later: 'a third line' }, 'later');
  assert.equal(calls, 1);

  show('later'); // already shown by learn, so nothing changes and nobody is told
  assert.equal(calls, 1);

  stop();
  learn({ afterwards: 'a fourth' }, 'afterwards');
  assert.equal(calls, 1);
});

test('the server snapshot is always sealed, so SSR renders the strip', () => {
  assert.equal(getSealed(), null);
});
