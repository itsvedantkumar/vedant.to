// Malformed-input coverage for every route handler that accepts external input.
//
// Each case below sends a body, query string or form field that is well-formed
// JSON but wrong-typed, and asserts the handler answers 4xx from its schema
// instead of carrying the value deeper. Before lib/validation.ts existed these
// requests either got a status that described the wrong thing (401
// "authentication failed" for a body that was never compared) or reached Redis
// and came back 503 — i.e. the input was travelling past the boundary.
//
// Deliberately no Redis and no R2 here: the point is that validation rejects
// before any I/O, so a handler that answers 400 has proven it never got there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// next/server ships with no package.json "exports" map, so Node's strict ESM
// resolver refuses the extensionless "next/server" specifier. Same workaround
// as tests/guard.test.ts and tests/whisper-route.test.ts.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export function resolve(specifier, context, nextResolve) {
         if (specifier === 'next/server') return nextResolve('next/server.js', context);
         return nextResolve(specifier, context);
       }`
    ),
  import.meta.url
);

// Read at module scope by the routes and by lib/auth/guard.ts, so they have to
// be set before the first import below.
process.env.KEYSTATIC_SESSION_SECRET = 'test-session-secret-at-least-32-chars!!';
process.env.KEYSTATIC_AUTH_PASSWORD = 'test-break-glass-password';
process.env.UPLOAD_SECRET = 'test-upload-secret';
process.env.R2_BUCKET_NAME = 'test-bucket';

const { NextRequest } = await import('next/server');
const { CHALLENGE_COOKIE } = await import('@/lib/auth/session');
const { POST: passwordPOST } = await import('@/app/api/auth/password/route');
const { POST: registerOptionsPOST } =
  await import('@/app/api/auth/webauthn/register/options/route');
const { POST: registerVerifyPOST } =
  await import('@/app/api/auth/webauthn/register/verify/route');
const { POST: authVerifyPOST } =
  await import('@/app/api/auth/webauthn/authenticate/verify/route');
const { DELETE: credentialsDELETE } =
  await import('@/app/api/auth/webauthn/credentials/route');
const { POST: uploadPOST } = await import('@/app/api/upload/route');

type Req = InstanceType<typeof NextRequest>;

const ORIGIN = 'http://localhost:3000';

function jsonReq(url: string, body: unknown, extraHeaders: HeadersInit = {}): Req {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
    body: JSON.stringify(body),
  });
}

/** Basic credential carrying the break-glass password, as requireAdmin reads it. */
function basicAuth(): string {
  return `Basic ${btoa(`admin:${process.env.KEYSTATIC_AUTH_PASSWORD}`)}`;
}

// --- /api/auth/password ------------------------------------------------------

test('password: non-string password is rejected as a bad request, not compared', async () => {
  const res = await passwordPOST(
    jsonReq('http://localhost:3000/api/auth/password', { password: 12345 })
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_request');
});

test('password: missing password field is rejected', async () => {
  const res = await passwordPOST(jsonReq('http://localhost:3000/api/auth/password', {}));
  assert.equal(res.status, 400);
});

test('password: body that is not JSON at all is rejected', async () => {
  const req = new NextRequest('http://localhost:3000/api/auth/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: '{not json',
  });
  const res = await passwordPOST(req);
  assert.equal(res.status, 400);
});

// --- /api/auth/webauthn/register/options ------------------------------------

test('register/options: non-string password is rejected before requireAdmin', async () => {
  const res = await registerOptionsPOST(
    jsonReq('http://localhost:3000/api/auth/webauthn/register/options', {
      password: { toString: 'nope' },
    })
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_request');
});

// --- /api/auth/webauthn/register/verify -------------------------------------

function withChallenge(url: string, body: unknown): Req {
  return jsonReq(url, body, { cookie: `${CHALLENGE_COOKIE}=test-nonce` });
}

test('register/verify: a credential-shaped body missing required fields is rejected', async () => {
  const res = await registerVerifyPOST(
    withChallenge('http://localhost:3000/api/auth/webauthn/register/verify', {
      response: { id: 'abc' },
    })
  );
  // 400, not the 503 a Redis round-trip would produce: the request never got
  // as far as burnChallenge.
  assert.equal(res.status, 400);
});

test('register/verify: non-string label is rejected', async () => {
  const res = await registerVerifyPOST(
    withChallenge('http://localhost:3000/api/auth/webauthn/register/verify', {
      response: {
        id: 'abc',
        rawId: 'abc',
        type: 'public-key',
        response: { clientDataJSON: 'x', attestationObject: 'y' },
      },
      label: { name: 'laptop' },
    })
  );
  assert.equal(res.status, 400);
});

// --- /api/auth/webauthn/authenticate/verify ---------------------------------

test('authenticate/verify: assertion missing response fields is rejected', async () => {
  const res = await authVerifyPOST(
    withChallenge('http://localhost:3000/api/auth/webauthn/authenticate/verify', {
      id: 'abc',
      rawId: 'abc',
      type: 'public-key',
      response: { clientDataJSON: 'x' },
    })
  );
  assert.equal(res.status, 400);
  // The wording stays generic — a schema must not become the enumeration
  // oracle the rest of this route is careful not to be.
  assert.equal((await res.json()).error, 'authentication failed');
});

test('authenticate/verify: wrong credential type is rejected', async () => {
  const res = await authVerifyPOST(
    withChallenge('http://localhost:3000/api/auth/webauthn/authenticate/verify', {
      id: 'abc',
      rawId: 'abc',
      type: 'password',
      response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' },
    })
  );
  assert.equal(res.status, 400);
});

// --- /api/auth/webauthn/credentials (DELETE) --------------------------------

test('credentials DELETE: id outside the base64url alphabet is rejected', async () => {
  const req = new NextRequest(
    'http://localhost:3000/api/auth/webauthn/credentials?id=../../etc/passwd',
    { method: 'DELETE', headers: { origin: ORIGIN, authorization: basicAuth() } }
  );
  const res = await credentialsDELETE(req);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_request');
});

test('credentials DELETE: missing id is still a 400', async () => {
  const req = new NextRequest('http://localhost:3000/api/auth/webauthn/credentials', {
    method: 'DELETE',
    headers: { origin: ORIGIN, authorization: basicAuth() },
  });
  assert.equal((await credentialsDELETE(req)).status, 400);
});

// --- /api/upload -------------------------------------------------------------

function uploadReq(form: FormData, headers: HeadersInit = {}): Req {
  return new NextRequest('http://localhost:3000/api/upload', {
    method: 'POST',
    headers: {
      'x-upload-secret': process.env.UPLOAD_SECRET ?? '',
      ...Object.fromEntries(new Headers(headers)),
    },
    body: form,
  });
}

test('upload: a text field where a file belongs is rejected', async () => {
  const form = new FormData();
  form.set('file', 'not-a-file');
  const res = await uploadPOST(uploadReq(form));
  assert.equal(res.status, 400);
});

test('upload: a disallowed mime type is rejected before any R2 call', async () => {
  const form = new FormData();
  form.set('file', new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));
  assert.equal((await uploadPOST(uploadReq(form))).status, 415);
});

test('upload: an allowed mime type with the wrong magic bytes is rejected', async () => {
  const form = new FormData();
  form.set('file', new File(['definitely not a png'], 'x.png', { type: 'image/png' }));
  assert.equal((await uploadPOST(uploadReq(form))).status, 415);
});

test('upload: a non-numeric content-length is rejected', async () => {
  const form = new FormData();
  form.set('file', new File(['x'], 'x.png', { type: 'image/png' }));
  const res = await uploadPOST(uploadReq(form, { 'content-length': 'not-a-number' }));
  assert.equal(res.status, 413);
});

test('upload: a missing upload secret is unauthorized before anything is parsed', async () => {
  const form = new FormData();
  form.set('file', new File(['x'], 'x.png', { type: 'image/png' }));
  const req = new NextRequest('http://localhost:3000/api/upload', {
    method: 'POST',
    body: form,
  });
  assert.equal((await uploadPOST(req)).status, 401);
});
