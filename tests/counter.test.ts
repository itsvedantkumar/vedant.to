import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { counterAdvances } from '@/lib/webauthn/store';

/**
 * `counterAdvances` is the specification; the Lua in store.ts is the atomic
 * implementation of the same rule. These tests lock the decision table so a
 * future edit to either has to justify itself.
 *
 * NOTE: the Lua itself is NOT exercised here — that needs a real Redis, which
 * this repo has no local instance of. What is covered is the rule it encodes.
 */
describe('counterAdvances', () => {
  test('normal advance is accepted', () => {
    assert.equal(counterAdvances(5, 6), true);
    assert.equal(counterAdvances(0, 1), true);
    assert.equal(counterAdvances(41, 9000), true);
  });

  test('regression is rejected — the clone signal', () => {
    assert.equal(counterAdvances(6, 5), false);
    assert.equal(counterAdvances(9000, 1), false);
  });

  test('replay at the same non-zero counter is rejected', () => {
    // Two authenticators in lockstep both reporting 5 is the case the whole
    // check exists for.
    assert.equal(counterAdvances(5, 5), false);
  });

  test('synced passkeys (always signCount 0) must never trip it', () => {
    // iCloud Keychain / Google Password Manager report 0 forever. Zero on both
    // sides is spec-legal; suspending here would brick every synced passkey.
    assert.equal(counterAdvances(0, 0), true);
  });

  test('a counter that stops incrementing after use is still rejected', () => {
    // Non-zero stored, zero reported: one side maintains a counter and the
    // other does not, which per spec is a regression.
    assert.equal(counterAdvances(7, 0), false);
  });
});

describe('BUMP_COUNTER_LUA', () => {
  const src = readFileSync(new URL('../lib/webauthn/store.ts', import.meta.url), 'utf8');
  const lua = src.slice(
    src.indexOf('const BUMP_COUNTER_LUA'),
    src.indexOf('export function counterAdvances')
  );

  test('encodes the same comparison as counterAdvances', () => {
    // If the Lua's condition is edited without updating counterAdvances (and
    // this test), the two silently disagree and the CAS stops matching spec.
    assert.match(lua, /\(new > 0 or cur > 0\) and new <= cur/);
  });

  test('seeds from the record when the counter key is absent', () => {
    // Without this an existing credential restarts at zero and would accept one
    // stale counter after deploy.
    assert.match(lua, /if cur == false then cur = ARGV\[2\] end/);
  });

  test('writes only on the accepting path', () => {
    const returnsBeforeWrite = lua.indexOf('return 0');
    const write = lua.indexOf("redis.call('SET'");
    assert.ok(returnsBeforeWrite < write, 'must return 0 before any SET');
  });

  test('refuses rather than guessing on a non-numeric counter', () => {
    assert.match(lua, /if cur == nil or new == nil then return -1 end/);
  });
});
