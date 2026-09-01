// Covers app/api/whisper/route.ts POST body validation.
//
// Defect: only the top-level shape of the parsed JSON was checked
// (`typeof parsed !== 'object'`). Individual fields were then read with
// `body.quizAnswer ?? ''` etc — `??` only substitutes on null/undefined, so a
// wrong-typed value like `quizAnswer: {}` sailed straight through and threw
// inside `.slice()` deep in the handler. That throw happened while evaluating
// the `if (!isCorrectAnswer(...))` condition, which is BEFORE the quiz rate
// limiters (quizRatelimit, globalQuizRatelimit) and burnToken run — so the
// throw didn't just 500, it skipped every limiter downstream of it. One token
// from a single GET could then be replayed for free against all three
// limiters for its full 30-minute TTL.
//
// The fix (isValidWhisperBody in route.ts) rejects any wrong-typed field with
// 400 before any field is read, for every optional field on the body
// (message, _trap, token, quizAnswer, quizOnly), not just quizAnswer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// next/server ships with no package.json "exports" map, so Node's strict ESM
// resolver refuses the extensionless "next/server" specifier. Same workaround
// as tests/guard.test.ts.
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

// WHISPER_BUCKET_NAME, WHISPER_TOKEN_SECRET and WHISPER_QUIZ are all read at
// module scope, so they must be set before the route module is imported.
// A real secret + a real question bank are needed for the "reaches
// isCorrectAnswer" regression test below: with no token secret / no quiz
// configured, verifyTokenSignature or findQuestion reject the request first
// (403) and the vulnerable line is never reached, which would make that test
// pass for the wrong reason.
const QUIZ_SECRET = 'test-whisper-token-secret';
const QUIZ_ID = 'q1';
process.env.WHISPER_BUCKET_NAME = 'test-bucket';
process.env.WHISPER_TOKEN_SECRET = QUIZ_SECRET;
process.env.WHISPER_QUIZ = JSON.stringify([
  { id: QUIZ_ID, question: 'test question?', answers: ['the answer'] },
]);

const { POST } = await import('@/app/api/whisper/route');
const { NextRequest } = await import('next/server');

// Mirrors route.ts's private `hmac()` exactly (HMAC-SHA256, base64) so tests
// can mint a token the route will accept as validly signed, without
// exporting a signing primitive out of the route module just for tests.
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

// A real, validly-signed token for QUIZ_ID, minted 4s in the past so it also
// clears the route's TOKEN_MIN_AGE_MS (3s) anti-instant-submit check.
async function realToken(): Promise<string> {
  const ts = Date.now() - 4000;
  const tsStr = ts.toString(36);
  const sig = await hmac(QUIZ_SECRET, `${tsStr}.${QUIZ_ID}`);
  return `${tsStr}.${QUIZ_ID}.${sig}`;
}

function postReq(bodyObj: unknown): InstanceType<typeof NextRequest> {
  const raw = JSON.stringify(bodyObj);
  return new NextRequest('http://localhost:3000/api/whisper', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(raw)),
      origin: 'http://localhost:3000',
    },
    body: raw,
  });
}

test('quizAnswer: {} returns 400, not a 500/throw', async () => {
  const res = await POST(postReq({ token: await realToken(), quizAnswer: {} }));
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, 'bad request');
});

test('quizAnswer: array returns 400', async () => {
  const res = await POST(postReq({ token: await realToken(), quizAnswer: ['x'] }));
  assert.equal(res.status, 400);
});

test('message: {} returns 400, not a 500/throw', async () => {
  const res = await POST(
    postReq({
      token: await realToken(),
      quizAnswer: 'the answer',
      message: {},
    })
  );
  assert.equal(res.status, 400);
});

test('token: non-string returns 400', async () => {
  const res = await POST(postReq({ token: 12345 }));
  assert.equal(res.status, 400);
});

test('quizOnly: non-boolean returns 400', async () => {
  const res = await POST(postReq({ token: await realToken(), quizOnly: 'yes' }));
  assert.equal(res.status, 400);
});

test('_trap: non-string returns 400', async () => {
  const res = await POST(postReq({ token: await realToken(), _trap: 1 }));
  assert.equal(res.status, 400);
});

// Sanity: a well-typed body is not rejected by the shape check itself — a
// correct answer with quizOnly proceeds all the way to `{ok:true}` (200),
// proving control passed through isValidWhisperBody rather than 400ing.
test('well-typed body is not rejected by the shape check', async () => {
  const res = await POST(
    postReq({
      token: await realToken(),
      quizAnswer: 'the answer',
      quizOnly: true,
    })
  );
  assert.equal(res.status, 200);
});

// Regression proof: this is the exact request that used to crash the handler
// with an uncaught `{}.slice is not a function` while evaluating
// `isCorrectAnswer(...)` — BEFORE quizRatelimit/globalQuizRatelimit run and
// before burnToken is ever reached, i.e. the metering-skipping half of the
// defect, not just "some 500 somewhere". Token and quiz id are real and
// valid here (see realToken()/WHISPER_QUIZ above), so this reaches that
// exact line rather than being rejected earlier by the token/question check.
//
// Removal proof (see task report for the full before/after run): with
// isValidWhisperBody's call removed from route.ts, this request's promise
// rejects (TypeError: {}.slice is not a function) instead of resolving to a
// 400 Response — `await POST(...)` throws and the test fails. With the
// check in place, it resolves cleanly to 400.
test('regression: malformed quizAnswer never reaches isCorrectAnswer', async () => {
  const res = await POST(postReq({ token: await realToken(), quizAnswer: {} }));
  assert.equal(res.status, 400);
});
