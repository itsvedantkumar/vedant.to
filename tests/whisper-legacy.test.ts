// Covers the quiz-free path app/api/whisper/route.ts opens for the archived
// Framer site's forms (see docs/ops.md, "The archive's forms, and what that
// costs").
//
// That path exists because the archive's two forms are a single Message
// textarea with nowhere to render a quiz question. It is a deliberate,
// bounded weakening of the endpoint's main bot gate, so the boundaries are
// what these tests pin — not the happy path:
//
//   - a `!legacy` token is worthless anywhere but the archive's own origin,
//     so a token minted there cannot be cashed in at the main site;
//   - the archive's Origin alone buys nothing: a normal quiz token still has
//     to answer its question even when posted from the archive;
//   - `!legacy` cannot collide with a real question id, which would hand a
//     main-site visitor a question whose answer is then never checked.
//
// The origin literal is never written here. It comes from site.config.mjs via
// lib/constants, which is what scripts/check-identity.mjs requires and what
// keeps this test honest if the archive ever moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Same next/server resolver shim as tests/whisper-route.test.ts.
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

// Pinned for the same reason as tests/whisper-route.test.ts: a Vercel build
// container exports NODE_ENV=production, and the non-production branch of the
// origin check is what admits the localhost origin used as "the main site".
Object.assign(process.env, { NODE_ENV: 'test' });

const TOKEN_SECRET = 'test-whisper-token-secret';
const QUIZ_ID = 'q1';
const LEGACY_QUIZ_ID = '!legacy';
process.env.WHISPER_BUCKET_NAME = 'test-bucket';
process.env.WHISPER_TOKEN_SECRET = TOKEN_SECRET;
process.env.WHISPER_QUIZ = JSON.stringify([
  { id: QUIZ_ID, question: 'test question?', answers: ['the answer'] },
]);

const { GET, POST, OPTIONS } = await import('@/app/api/whisper/route');
const { NextRequest } = await import('next/server');
const { LEGACY_URL } = await import('@/lib/constants');
const { quizBankSchema } = await import('@/lib/env');

const SITE_ORIGIN = 'http://localhost:3000';

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Validly signed, and minted 4s ago so it clears the 3s minimum token age. */
async function token(quizId: string): Promise<string> {
  const ts = (Date.now() - 4000).toString(36);
  return `${ts}.${quizId}.${await hmac(TOKEN_SECRET, `${ts}.${quizId}`)}`;
}

/**
 * Named arguments, not positional: every case below differs only in which
 * origin is claimed, and `req('POST', LEGACY_URL, body)` reads identically to
 * the transposed version that would silently test nothing.
 */
function req(opts: {
  method: 'GET' | 'POST' | 'OPTIONS';
  origin: string | null;
  body?: unknown;
}): InstanceType<typeof NextRequest> {
  const { method, origin, body } = opts;
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  if (body === undefined) {
    return new NextRequest('http://localhost:3000/api/whisper', { method, headers });
  }
  const raw = JSON.stringify(body);
  headers['content-type'] = 'application/json';
  headers['content-length'] = String(Buffer.byteLength(raw));
  return new NextRequest('http://localhost:3000/api/whisper', {
    method,
    headers,
    body: raw,
  });
}

/**
 * `Response.json()` is `any`, and an `any` walking into `json.quiz.question`
 * turns a missing field into a TypeError halfway down the assertion rather
 * than a failed assertion naming the field. Read it as `unknown` and check.
 */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = await res.json();
  assert.equal(typeof parsed, 'object');
  assert.notEqual(parsed, null);
  return parsed as Record<string, unknown>;
}

/** The token is `<ts36>.<quizId>.<sig>`; the middle field is what these test. */
function quizIdOf(json: Record<string, unknown>): string {
  const token = json.token;
  assert.equal(typeof token, 'string', 'response carried no token');
  return (token as string).split('.')[1];
}

test('GET from the archive mints a quiz-free token and asks nothing', async () => {
  const res = await GET(req({ method: 'GET', origin: LEGACY_URL }));
  assert.equal(res.status, 200);
  const json = await readJson(res);
  assert.equal(quizIdOf(json), LEGACY_QUIZ_ID);
  // No question, and no answer to leak with it.
  assert.equal(json.quiz, undefined);
});

test('GET from the main site still gets a real question', async () => {
  const res = await GET(req({ method: 'GET', origin: SITE_ORIGIN }));
  assert.equal(res.status, 200);
  const json = await readJson(res);
  assert.notEqual(quizIdOf(json), LEGACY_QUIZ_ID);
  const quiz = json.quiz as Record<string, unknown> | undefined;
  assert.equal(typeof quiz?.question, 'string');
  assert.equal(quiz?.id, QUIZ_ID);
  // Answers never leave the server, in either shape.
  assert.equal(quiz?.answers, undefined);
});

test('CORS is echoed to the archive only, never reflected or wildcarded', async () => {
  const allowed = await OPTIONS(req({ method: 'OPTIONS', origin: LEGACY_URL }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), LEGACY_URL);
  // Vary: Origin on every answer, or a cache serves one origin's headers to
  // another.
  assert.match(allowed.headers.get('vary') ?? '', /Origin/);

  const evil = await OPTIONS(req({ method: 'OPTIONS', origin: 'https://evil.example' }));
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  assert.match(evil.headers.get('vary') ?? '', /Origin/);
});

test('a !legacy token cannot be cashed in at the main site', async () => {
  const res = await POST(
    req({
      method: 'POST',
      origin: SITE_ORIGIN,
      body: { token: await token(LEGACY_QUIZ_ID), quizOnly: true },
    })
  );
  assert.equal(res.status, 403);
  assert.equal((await readJson(res)).code, 'invalid');
});

test('a !legacy token posted from the archive skips the quiz', async () => {
  const res = await POST(
    req({
      method: 'POST',
      origin: LEGACY_URL,
      body: { token: await token(LEGACY_QUIZ_ID), quizOnly: true },
    })
  );
  assert.equal(res.status, 200);
  assert.equal((await readJson(res)).ok, true);
});

test('the archive origin alone does not bypass the quiz', async () => {
  // A normal token, posted from the archive, still owes its answer: the bypass
  // rides on the signed quiz id, not on who is asking.
  const res = await POST(
    req({
      method: 'POST',
      origin: LEGACY_URL,
      body: { token: await token(QUIZ_ID), quizAnswer: 'wrong', quizOnly: true },
    })
  );
  assert.equal(res.status, 403);
  assert.equal((await readJson(res)).code, 'wrong_answer');
});

test('an unlisted origin is still refused outright', async () => {
  const res = await POST(
    req({
      method: 'POST',
      origin: 'https://evil.example',
      body: { token: await token(LEGACY_QUIZ_ID), quizOnly: true },
    })
  );
  assert.equal(res.status, 403);
});

test('a real question can never take the reserved !legacy id', async () => {
  // Otherwise a main-site visitor is handed a question whose answer is then
  // skipped, locking that question out of the bank.
  const parsed = quizBankSchema.safeParse([
    { id: LEGACY_QUIZ_ID, question: 'q?', answers: ['a'] },
  ]);
  assert.equal(parsed.success, false);
});
