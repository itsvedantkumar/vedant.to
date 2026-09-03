// Covers requireAdmin's metering decision in lib/auth/guard.ts. proxy.ts
// already meters and verifies a Basic header on every path under its matcher,
// so a route behind it passes basicMeteredUpstream to skip the second charge
// against the shared keystatic:pw buckets. Body passwords and enroll tokens
// are never metered upstream and must still be charged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Stub the limiter so each .limit() call is countable, and make @/lib/redis
// truthy so guard.ts constructs its limiters at all. next/server needs the
// same extension fix as tests/guard.test.ts.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export function resolve(specifier, context, nextResolve) {
         if (specifier === 'next/server') return nextResolve('next/server.js', context);
         if (specifier === '@/lib/redis') {
           return { url: 'data:text/javascript,export const redis = {};', shortCircuit: true };
         }
         if (specifier === '@upstash/ratelimit') {
           return {
             url: 'data:text/javascript,' + encodeURIComponent(
               'export class Ratelimit {' +
               '  static slidingWindow() { return null; }' +
               '  constructor() {}' +
               '  async limit() { globalThis.__limitCalls = (globalThis.__limitCalls ?? 0) + 1; return { success: true }; }' +
               '}'
             ),
             shortCircuit: true,
           };
         }
         return nextResolve(specifier, context);
       }`
    ),
  import.meta.url
);

process.env.KEYSTATIC_SESSION_SECRET = 'test-session-secret-at-least-32-chars!!';
process.env.KEYSTATIC_AUTH_PASSWORD = 'test-break-glass-password';
process.env.KEYSTATIC_ENROLL_TOKEN = 'test-enroll-token-at-least-32-chars!!!!';

const { requireAdmin } = await import('@/lib/auth/guard');

declare global {
  // eslint-disable-next-line no-var
  var __limitCalls: number | undefined;
}

function req(headers: Record<string, string>) {
  return { headers: new Headers(headers), cookies: { get: () => undefined } };
}

function basic(): string {
  return `Basic ${btoa(`admin:${process.env.KEYSTATIC_AUTH_PASSWORD}`)}`;
}

async function meteredCalls(run: () => Promise<unknown>): Promise<number> {
  const before = globalThis.__limitCalls ?? 0;
  await run();
  return (globalThis.__limitCalls ?? 0) - before;
}

test('Basic header is metered by default', async () => {
  let auth;
  const calls = await meteredCalls(async () => {
    auth = await requireAdmin(req({ authorization: basic() }));
  });
  assert.ok(calls >= 1, `expected at least one limiter call, saw ${calls}`);
  assert.deepEqual(auth, { ok: true, via: 'password', session: null });
});

test('Basic header with basicMeteredUpstream is verified without a second charge', async () => {
  let auth;
  const calls = await meteredCalls(async () => {
    auth = await requireAdmin(req({ authorization: basic() }), undefined, {
      basicMeteredUpstream: true,
    });
  });
  assert.equal(calls, 0);
  assert.deepEqual(auth, { ok: true, via: 'password', session: null });
});

test('enroll token is still metered even with basicMeteredUpstream', async () => {
  const calls = await meteredCalls(() =>
    requireAdmin(
      req({ 'x-enroll-token': process.env.KEYSTATIC_ENROLL_TOKEN! }),
      undefined,
      {
        basicMeteredUpstream: true,
      }
    )
  );
  assert.ok(calls >= 1, `expected at least one limiter call, saw ${calls}`);
});

test('body password is still metered even with basicMeteredUpstream', async () => {
  const calls = await meteredCalls(() =>
    requireAdmin(
      req({}),
      { password: process.env.KEYSTATIC_AUTH_PASSWORD },
      {
        basicMeteredUpstream: true,
      }
    )
  );
  assert.ok(calls >= 1, `expected at least one limiter call, saw ${calls}`);
});
