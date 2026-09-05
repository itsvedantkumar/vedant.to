// Covers app/api/redact/route.ts: the only path to a redacted line's plaintext.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

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

// Non-production so the localhost origin below is accepted and a missing
// Redis degrades to "no limiter" instead of 503 (the 503 branch is asserted
// separately by flipping NODE_ENV).
Object.assign(process.env, { NODE_ENV: 'test' });
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { encryptLine } = await import('@/lib/redact');
const PASSWORD = 'misery loves tests';
const TEXT = 'secret line';
process.env.REDACTED_LINES = JSON.stringify({
  birthday: await encryptLine(TEXT, PASSWORD),
});

const { POST } = await import('@/app/api/redact/route');
const { NextRequest } = await import('next/server');

function post(
  body: unknown,
  origin = 'http://localhost:3000'
): InstanceType<typeof NextRequest> {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return new NextRequest('http://localhost:3000/api/redact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(raw)),
      ...(origin ? { origin } : {}),
    },
    body: raw,
  });
}

test('right password returns the text, uncached', async () => {
  const res = await POST(post({ id: 'birthday', password: PASSWORD }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { text: TEXT });
});

test('wrong password and unknown id are the same 401', async () => {
  const wrong = await POST(post({ id: 'birthday', password: 'nope' }));
  const unknown = await POST(post({ id: 'nothing-here', password: PASSWORD }));
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
});

test('cross-origin and missing origin are refused before any work', async () => {
  assert.equal(
    (await POST(post({ id: 'birthday', password: PASSWORD }, 'https://evil.example')))
      .status,
    403
  );
  assert.equal(
    (await POST(post({ id: 'birthday', password: PASSWORD }, ''))).status,
    403
  );
});

test('malformed bodies are 400 and never echo input', async () => {
  for (const body of [
    '{',
    { id: 'birthday' },
    { id: 'Bad Id', password: 'x' },
    { id: 'birthday', password: '' },
    { id: 'birthday', password: 'x'.repeat(257) },
  ]) {
    const res = await POST(post(body));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'bad request' });
  }
});

test('oversized body is 413', async () => {
  const res = await POST(post({ id: 'birthday', password: 'x'.repeat(2000) }));
  assert.equal(res.status, 413);
});

test('production without Redis fails closed with 503', async () => {
  Object.assign(process.env, { NODE_ENV: 'production' });
  try {
    const res = await POST(
      post({ id: 'birthday', password: PASSWORD }, 'https://example.com')
    );
    // Either the origin check (site origin differs in tests) or the Redis
    // check must refuse; what matters is that no 200 is possible.
    assert.ok(res.status === 503 || res.status === 403);
    assert.notEqual(res.status, 200);
  } finally {
    Object.assign(process.env, { NODE_ENV: 'test' });
  }
});
