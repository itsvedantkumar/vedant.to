// Covers the boundary helper itself (lib/validation.ts) rather than any one
// route: the contract every handler now relies on is that parseJson never
// throws, never echoes the input back, and returns a result you cannot read
// `data` off of without having handled the failure.
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

const { z } = await import('zod');
const {
  parseInput,
  parseJson,
  parseSearchParams,
  credentialIdSchema,
  ogQuerySchema,
  whisperBodySchema,
  OG_DEFAULT_TITLE,
} = await import('@/lib/validation');

const schema = z.object({ n: z.number() });

/** Minimal stand-in for the only part of the request parseJson touches. */
function bodyOf(json: () => Promise<unknown>): { json(): Promise<unknown> } {
  return { json };
}

test('parseJson: a matching body comes back typed', async () => {
  const result = await parseJson(
    bodyOf(async () => ({ n: 1 })),
    schema
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.n, 1);
});

test('parseJson: a rejecting json() is a 400, not a throw', async () => {
  const result = await parseJson(
    bodyOf(async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    }),
    schema
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 400);
  const body = await result.response.json();
  assert.equal(body.error, 'invalid_request');
  assert.equal(body.issues[0].code, 'invalid_json');
});

test('parseJson: the 400 body never echoes the input or a stack trace', async () => {
  const secretish = 'hunter2-do-not-reflect-me';
  const result = await parseJson(
    bodyOf(async () => ({ n: secretish })),
    schema
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  const raw = JSON.stringify(await result.response.json());
  assert.equal(raw.includes(secretish), false);
  assert.equal(raw.includes('at '), false);
  assert.equal(raw.includes('ZodError'), false);
});

test('parseInput: a per-route failure shape replaces the default body', async () => {
  const result = parseInput({ n: 'x' }, schema, {
    status: 403,
    error: 'nope',
    includeIssues: false,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 403);
  assert.deepEqual(await result.response.json(), { error: 'nope' });
});

test('credentialIdSchema: rejects anything outside the base64url alphabet', () => {
  assert.equal(parseInput({ id: 'AbC-_09' }, credentialIdSchema).ok, true);
  assert.equal(parseInput({ id: '../../etc/passwd' }, credentialIdSchema).ok, false);
  assert.equal(parseInput({ id: '' }, credentialIdSchema).ok, false);
  assert.equal(parseInput({}, credentialIdSchema).ok, false);
});

test('ogQuerySchema: truncates instead of rejecting, and defaults when absent', () => {
  const long = parseSearchParams(
    new URLSearchParams({ title: 'x'.repeat(500) }),
    ogQuerySchema
  );
  assert.equal(long.ok, true);
  if (long.ok) assert.equal(long.data.title.length, 100);

  const none = parseSearchParams(new URLSearchParams(), ogQuerySchema);
  assert.equal(none.ok, true);
  if (none.ok) assert.equal(none.data.title, OG_DEFAULT_TITLE);
});

test('whisperBodySchema: every optional field is type-checked, not just present', () => {
  assert.equal(parseInput({}, whisperBodySchema).ok, true);
  assert.equal(parseInput({ quizOnly: true }, whisperBodySchema).ok, true);
  assert.equal(parseInput({ quizAnswer: {} }, whisperBodySchema).ok, false);
  assert.equal(parseInput({ quizOnly: 'yes' }, whisperBodySchema).ok, false);
  assert.equal(parseInput(null, whisperBodySchema).ok, false);
  assert.equal(parseInput('a string body', whisperBodySchema).ok, false);
});
