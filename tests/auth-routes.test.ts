// Covers the *wiring* around lib/auth/enrollment.ts's policy functions inside
// the two route handlers that actually enforce them — tests/enrollment.test.ts
// only proves the pure functions return the right string; nothing exercised
// whether the routes call them with the right arguments and act on the result.
//
// app/api/auth/webauthn/credentials/route.ts DELETE:
//   deleting the last passkey must consult lastCredentialDeleteBlockedReason
//   and, when blocked, relink the credential it just unlinked rather than
//   leaving the store with zero credentials.
// app/api/keystatic/[...params]/route.ts gated():
//   in passkey mode a password-mode session cookie must be rejected on both
//   GET and POST before the inner Keystatic handler ever runs; a passkey
//   session must reach it.
//
// @/lib/auth/guard (requireAdmin/checkOrigin/jsonError), @/lib/webauthn/store
// and @keystatic/next/route-handler are stubbed via a node:module resolve
// hook (same idiom as tests/draft-invariant.test.ts and tests/guard.test.ts) —
// no Redis, no real WebAuthn ceremony, no @keystatic/core. lib/auth/enrollment
// is left real: that's the wiring under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import type { AdminGranted } from '@/lib/auth/guard';

type Auth = AdminGranted;

function toDataUrl(source: string): string {
  return 'data:text/javascript,' + encodeURIComponent(source);
}

// --- stub: @/lib/auth/guard ---------------------------------------------
// checkOrigin/checkOriginOrAbsent are already covered against the real
// module in tests/guard.test.ts; stubbed here to true so this file's tests
// are about auth *outcome* wiring, not CSRF. requireAdmin reads whatever the
// test placed on globalThis.__adminAuth, so each test can set exactly the
// AdminAuth shape it wants without touching sessions/Redis.
const guardStubUrl = toDataUrl(`
  export function checkOrigin(req) { return true; }
  export function checkOriginOrAbsent(req) { return true; }
  export function jsonError(status, error) {
    return new Response(JSON.stringify({ error }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
  export async function requireAdmin(req) {
    return globalThis.__adminAuth;
  }
`);

// --- stub: @/lib/webauthn/store ------------------------------------------
// Every call is recorded on globalThis.__storeCalls so tests can assert not
// just the response but which store operations actually ran (e.g. that a
// blocked delete relinks instead of deleting).
const storeStubUrl = toDataUrl(`
  export async function getCredential(id) {
    globalThis.__storeCalls.getCredential.push(id);
    return globalThis.__store.credential;
  }
  export async function unlinkCredentialId(id) {
    globalThis.__storeCalls.unlinkCredentialId.push(id);
    return globalThis.__store.unlinkResult;
  }
  export async function countCredentials() {
    return globalThis.__store.count;
  }
  export async function relinkCredentialId(id) {
    globalThis.__storeCalls.relinkCredentialId.push(id);
  }
  export async function deleteCredentialRecord(id) {
    globalThis.__storeCalls.deleteCredentialRecord.push(id);
  }
  export function isRedisUnavailable(err) { return false; }
  export async function listCredentials() { return []; }
`);

// --- stub: @keystatic/next/route-handler ---------------------------------
// The inner Keystatic handler itself is out of scope (no @keystatic/core in
// this graph). Records whether it was reached at all, which is what proves
// gated() actually short-circuits a blocked request before calling it.
const routeHandlerStubUrl = toDataUrl(`
  export function makeRouteHandler(opts) {
    return {
      GET: async (request) => {
        globalThis.__innerCalls.push('GET');
        return new Response(JSON.stringify({ inner: true }), { status: 200 });
      },
      POST: async (request) => {
        globalThis.__innerCalls.push('POST');
        return new Response(JSON.stringify({ inner: true }), { status: 200 });
      },
    };
  }
`);

// --- stub: keystatic.config.ts -------------------------------------------
// Real config imports @keystatic/core and defines the full collections
// schema — irrelevant to gated(), which never touches config itself (only
// makeRouteHandler(), also stubbed above, receives it).
const configStubUrl = toDataUrl(`export default { stub: true };`);

register(
  toDataUrl(`
    export function resolve(specifier, context, nextResolve) {
      // next/server ships with no package.json "exports" map; same
      // workaround as tests/guard.test.ts and tests/whisper-route.test.ts.
      if (specifier === 'next/server') return nextResolve('next/server.js', context);
      if (specifier === '@/lib/auth/guard') {
        return { url: ${JSON.stringify(guardStubUrl)}, shortCircuit: true };
      }
      if (specifier === '@/lib/webauthn/store') {
        return { url: ${JSON.stringify(storeStubUrl)}, shortCircuit: true };
      }
      if (specifier === '@keystatic/next/route-handler') {
        return { url: ${JSON.stringify(routeHandlerStubUrl)}, shortCircuit: true };
      }
      if (specifier === '../../../../keystatic.config') {
        return { url: ${JSON.stringify(configStubUrl)}, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }
  `),
  import.meta.url
);

const { DELETE } = await import('@/app/api/auth/webauthn/credentials/route');
const { GET, POST } = await import('@/app/api/keystatic/[...params]/route');
const { NextRequest } = await import('next/server');

function setAdminAuth(auth: Auth): void {
  Reflect.set(globalThis, '__adminAuth', auth);
}

function setStore(opts: {
  credential: unknown;
  unlinkResult: number;
  count: number;
}): void {
  Reflect.set(globalThis, '__store', opts);
}

function resetCalls(): void {
  Reflect.set(globalThis, '__storeCalls', {
    getCredential: [] as string[],
    unlinkCredentialId: [] as string[],
    relinkCredentialId: [] as string[],
    deleteCredentialRecord: [] as string[],
  });
  Reflect.set(globalThis, '__innerCalls', [] as string[]);
}

function storeCalls(): {
  getCredential: string[];
  unlinkCredentialId: string[];
  relinkCredentialId: string[];
  deleteCredentialRecord: string[];
} {
  return Reflect.get(globalThis, '__storeCalls');
}

function innerCalls(): string[] {
  return Reflect.get(globalThis, '__innerCalls');
}

function deleteReq(id: string): InstanceType<typeof NextRequest> {
  return new NextRequest(`http://localhost:3000/api/auth/webauthn/credentials?id=${id}`, {
    method: 'DELETE',
    headers: { origin: 'http://localhost:3000' },
  });
}

function keystaticReq(method: 'GET' | 'POST'): InstanceType<typeof NextRequest> {
  return new NextRequest('http://localhost:3000/api/keystatic/collection/posts', {
    method,
  });
}

const passwordAuth: Auth = { ok: true, via: 'password', session: null };
const tokenAuth: Auth = { ok: true, via: 'token', session: null };
const passwordSession: Auth = {
  ok: true,
  via: 'session',
  session: { v: 1, sub: 'admin', m: 'password', iat: 0, exp: 0, jti: 'a' },
};
const passkeySession: Auth = {
  ok: true,
  via: 'session',
  session: { v: 1, sub: 'admin', m: 'passkey', iat: 0, exp: 0, jti: 'b' },
};

const CRED_ID = 'cred-abc123_XYZ';

// --- DELETE /api/auth/webauthn/credentials -------------------------------

test('DELETE last passkey: password (break-glass) auth is blocked and relinks', async () => {
  resetCalls();
  setStore({ credential: { id: CRED_ID }, unlinkResult: 1, count: 0 });
  setAdminAuth(passwordAuth);

  const res = await DELETE(deleteReq(CRED_ID));

  assert.equal(res.status, 409);
  const json = await res.json();
  assert.match(json.error, /passkey/i);
  assert.deepEqual(storeCalls().relinkCredentialId, [CRED_ID]);
  assert.deepEqual(storeCalls().deleteCredentialRecord, []);
});

test('DELETE last passkey: password-mode session is blocked and relinks', async () => {
  resetCalls();
  setStore({ credential: { id: CRED_ID }, unlinkResult: 1, count: 0 });
  setAdminAuth(passwordSession);

  const res = await DELETE(deleteReq(CRED_ID));

  assert.equal(res.status, 409);
  assert.deepEqual(storeCalls().relinkCredentialId, [CRED_ID]);
  assert.deepEqual(storeCalls().deleteCredentialRecord, []);
});

test('DELETE last passkey: passkey session is allowed and does not relink', async () => {
  resetCalls();
  setStore({ credential: { id: CRED_ID }, unlinkResult: 1, count: 0 });
  setAdminAuth(passkeySession);

  const res = await DELETE(deleteReq(CRED_ID));

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.deepEqual(storeCalls().deleteCredentialRecord, [CRED_ID]);
  assert.deepEqual(storeCalls().relinkCredentialId, []);
});

test('DELETE last passkey: enroll token is allowed', async () => {
  resetCalls();
  setStore({ credential: { id: CRED_ID }, unlinkResult: 1, count: 0 });
  setAdminAuth(tokenAuth);

  const res = await DELETE(deleteReq(CRED_ID));

  assert.equal(res.status, 200);
  assert.deepEqual(storeCalls().deleteCredentialRecord, [CRED_ID]);
  assert.deepEqual(storeCalls().relinkCredentialId, []);
});

test('DELETE non-last credential: password auth is allowed (block only applies to the last one)', async () => {
  resetCalls();
  setStore({ credential: { id: CRED_ID }, unlinkResult: 1, count: 1 });
  setAdminAuth(passwordAuth);

  const res = await DELETE(deleteReq(CRED_ID));

  assert.equal(res.status, 200);
  assert.deepEqual(storeCalls().deleteCredentialRecord, [CRED_ID]);
  assert.deepEqual(storeCalls().relinkCredentialId, []);
});

test('DELETE: no such credential returns 404 before any relink logic', async () => {
  resetCalls();
  setStore({ credential: null, unlinkResult: 0, count: 0 });
  setAdminAuth(passwordAuth);

  const res = await DELETE(deleteReq(CRED_ID));

  assert.equal(res.status, 404);
  assert.deepEqual(storeCalls().unlinkCredentialId, []);
  assert.deepEqual(storeCalls().relinkCredentialId, []);
});

// --- gated() in app/api/keystatic/[...params]/route.ts -------------------

test('passkey mode: password-mode session is rejected on GET, inner handler never runs', async () => {
  process.env.KEYSTATIC_AUTH_MODE = 'passkey';
  resetCalls();
  setAdminAuth(passwordSession);

  const res = await GET(keystaticReq('GET'));

  assert.equal(res.status, 401);
  assert.deepEqual(innerCalls(), []);
});

test('passkey mode: password-mode session is rejected on POST, inner handler never runs', async () => {
  process.env.KEYSTATIC_AUTH_MODE = 'passkey';
  resetCalls();
  setAdminAuth(passwordSession);

  const res = await POST(keystaticReq('POST'));

  assert.equal(res.status, 401);
  assert.deepEqual(innerCalls(), []);
});

test('passkey mode: passkey session is allowed on GET and reaches the inner handler', async () => {
  process.env.KEYSTATIC_AUTH_MODE = 'passkey';
  resetCalls();
  setAdminAuth(passkeySession);

  const res = await GET(keystaticReq('GET'));

  assert.equal(res.status, 200);
  assert.deepEqual(innerCalls(), ['GET']);
});

test('passkey mode: passkey session is allowed on POST and reaches the inner handler', async () => {
  process.env.KEYSTATIC_AUTH_MODE = 'passkey';
  resetCalls();
  setAdminAuth(passkeySession);

  const res = await POST(keystaticReq('POST'));

  assert.equal(res.status, 200);
  assert.deepEqual(innerCalls(), ['POST']);
});

test('passkey mode: explicit break-glass password (no session) still reaches the inner handler', async () => {
  // Mirrors enrollment.test.ts's "explicit password via is break-glass" —
  // proving that contract is actually wired into the route, not just true of
  // the pure function in isolation.
  process.env.KEYSTATIC_AUTH_MODE = 'passkey';
  resetCalls();
  setAdminAuth(passwordAuth);

  const res = await GET(keystaticReq('GET'));

  assert.equal(res.status, 200);
  assert.deepEqual(innerCalls(), ['GET']);
});

test('basic mode: password-mode session is allowed (the block is passkey-mode only)', async () => {
  delete process.env.KEYSTATIC_AUTH_MODE;
  resetCalls();
  setAdminAuth(passwordSession);

  const res = await GET(keystaticReq('GET'));

  assert.equal(res.status, 200);
  assert.deepEqual(innerCalls(), ['GET']);
});
