// Covers lib/redact-notify.ts, the alert sent when someone opens a redacted
// line. The reveal is not persisted anywhere, so the same reader unlocks the
// same line on every reload; what these tests pin is that only the first of
// those reaches the inbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  announceUnlock,
  NOTICE_WINDOW_SECONDS,
  type NoticeStore,
} from '@/lib/redact-notify';

type Claim = { key: string; value: string; opts: { nx: true; ex: number } };

/** Stands in for Upstash: `set` with NX answers 'OK' once, then null. */
function fakeStore(): NoticeStore & { claims: Claim[] } {
  const taken = new Set<string>();
  const claims: Claim[] = [];
  return {
    claims,
    set(key, value, opts) {
      claims.push({ key, value, opts });
      if (taken.has(key)) return Promise.resolve(null);
      taken.add(key);
      return Promise.resolve('OK');
    },
  };
}

function recorder(): {
  send: (subject: string, text: string) => Promise<void>;
  sent: { subject: string; text: string }[];
} {
  const sent: { subject: string; text: string }[] = [];
  return {
    sent,
    send: (subject, text) => {
      sent.push({ subject, text });
      return Promise.resolve();
    },
  };
}

const event = { id: 'birthday', ip: '203.0.113.7', context: 'ip: 203.0.113.7' };

test('the first unlock sends, and names the line', async () => {
  const store = fakeStore();
  const mail = recorder();
  const outcome = await announceUnlock({ store, send: mail.send }, event);

  assert.equal(outcome, 'sent');
  assert.equal(mail.sent.length, 1);
  assert.match(mail.sent[0].subject, /unlocked/);
  assert.match(mail.sent[0].text, /line: birthday/);
  assert.match(mail.sent[0].text, /203\.0\.113\.7/);
});

test('a repeat unlock of the same line by the same address is silent', async () => {
  const store = fakeStore();
  const mail = recorder();
  const deps = { store, send: mail.send };

  assert.equal(await announceUnlock(deps, event), 'sent');
  assert.equal(await announceUnlock(deps, event), 'deduped');
  assert.equal(await announceUnlock(deps, event), 'deduped');
  assert.equal(mail.sent.length, 1);
});

test('a different line, or a different address, is its own notice', async () => {
  const store = fakeStore();
  const mail = recorder();
  const deps = { store, send: mail.send };

  await announceUnlock(deps, event);
  assert.equal(await announceUnlock(deps, { ...event, id: 'other-line' }), 'sent');
  assert.equal(await announceUnlock(deps, { ...event, ip: '198.51.100.4' }), 'sent');
  assert.equal(mail.sent.length, 3);
});

test('the claim is NX and expires, so the window reopens on its own', async () => {
  const store = fakeStore();
  const mail = recorder();
  await announceUnlock({ store, send: mail.send }, event);

  const [claim] = store.claims;
  assert.equal(claim.opts.nx, true);
  assert.equal(claim.opts.ex, NOTICE_WINDOW_SECONDS);
  assert.ok(claim.key.includes('birthday'));
  assert.ok(claim.key.includes('203.0.113.7'));
});

test('without a store it still sends: no Redis means no dedup, not no alert', async () => {
  const mail = recorder();
  const outcome = await announceUnlock({ store: null, send: mail.send }, event);

  assert.equal(outcome, 'sent');
  assert.equal(mail.sent.length, 1);
});

test('a failing mailer is swallowed, never thrown at the unlock', async () => {
  const outcome = await announceUnlock(
    { store: fakeStore(), send: () => Promise.reject(new Error('resend down')) },
    event
  );

  assert.equal(outcome, 'failed');
});

test('a failing store is swallowed too, and sends nothing', async () => {
  const mail = recorder();
  const outcome = await announceUnlock(
    {
      store: {
        set: () => Promise.reject(new Error('redis down')),
      },
      send: mail.send,
    },
    event
  );

  assert.equal(outcome, 'failed');
  assert.equal(mail.sent.length, 0);
});
