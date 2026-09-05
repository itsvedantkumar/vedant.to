/**
 * The other half of the boundary: `process.env` is external input too.
 *
 * SERVER ONLY. Every var the app reads at runtime is declared here with a
 * schema, and nothing outside this module reaches into `process.env` for a
 * secret or a piece of configuration.
 *
 * Two deliberate choices:
 *
 * 1. **Lazy, per access group, never memoised.** A single eager `parse()` at
 *    import time would run during `next build`, where the real secrets do not
 *    exist (CI and .claude/verify.sh build with three Keystatic placeholders and
 *    nothing else) — a build failure that says nothing about the code. Reading
 *    per call also keeps the live-read semantics the tests depend on: several
 *    swap env vars around a call and expect the next call to see the change.
 *    This module never caches; callers that snapshot an accessor's result in a
 *    module-level const (lib/redis.ts, lib/r2.ts, lib/webauthn/config.ts) keep
 *    the load-time behaviour they had before this module existed.
 *
 * 2. **Optional stays optional.** Most of these are genuinely absent in a valid
 *    deployment and the code already degrades (no Redis → no rate limiting; no
 *    R2 → 503; no password → password login disabled). Schemas therefore
 *    validate *shape*, and nothing here throws on an absent variable.
 *
 * Not listed: KEYSTATIC_GITHUB_CLIENT_ID / KEYSTATIC_GITHUB_CLIENT_SECRET /
 * KEYSTATIC_SECRET, which @keystatic/next reads itself, and NEXT_PUBLIC_*,
 * which are inlined at build time and must stay literal `process.env.X` reads
 * for the bundler to substitute them.
 */

import { z } from 'zod';

/**
 * An empty string is treated as unset. Vercel and CI hand out `X=''` for a
 * variable that was declared but never given a value, and every consumer here
 * already tests truthiness.
 */
function optional<S extends z.ZodType>(schema: S) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const secret = z.string().min(1).max(4096);
const url = z.string().url();
/**
 * Format is deliberately NOT enforced on the alert addresses. These are read on
 * the notification path, which is best-effort and must never turn a config typo
 * into a 503 on enrollment; a wrong address fails loudly at Resend instead.
 */
const emailish = z.string().min(1).max(320);

function parseGroup<S extends z.ZodType>(name: string, schema: S): z.output<S> {
  const result = schema.safeParse(process.env);
  if (result.success) return result.data;
  const detail = result.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  throw new Error(`Invalid environment for ${name} — ${detail}`);
}

// --- runtime mode ------------------------------------------------------------

const runtimeSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).catch('development'),
  // `.catch(undefined)` for the same reason as NODE_ENV below: these are set by
  // the platform, and an unrecognised value must degrade to "not production"
  // rather than take the process down.
  VERCEL_ENV: z
    .enum(['development', 'preview', 'production'])
    .optional()
    .catch(undefined),
  VERCEL_URL: optional(z.string().min(1)),
});

/**
 * `.catch()` rather than a hard failure: NODE_ENV is set by the toolchain, not
 * by an operator, and refusing to boot because a runner used an unexpected
 * value would be a self-inflicted outage. The fail-closed branches that read
 * this all treat "not production" as the safe default anyway.
 */
export function runtimeEnv(): z.output<typeof runtimeSchema> {
  return parseGroup('runtime', runtimeSchema);
}

export function isProduction(): boolean {
  return runtimeEnv().NODE_ENV === 'production';
}

// --- upstash redis -----------------------------------------------------------

const redisSchema = z.object({
  UPSTASH_REDIS_REST_URL: optional(url),
  UPSTASH_REDIS_REST_TOKEN: optional(secret),
});

export type RedisEnv = { url: string; token: string };

/**
 * Null unless BOTH halves are present, matching lib/redis.ts's contract: seven
 * modules import that client, including proxy.ts, and a throw here would 500
 * the auth gate rather than degrade it.
 */
export function redisEnv(): RedisEnv | null {
  const env = parseGroup('redis', redisSchema);
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  return null;
}

export function redisHalfConfigured(): boolean {
  const env = parseGroup('redis', redisSchema);
  return Boolean(env.UPSTASH_REDIS_REST_URL) !== Boolean(env.UPSTASH_REDIS_REST_TOKEN);
}

// --- cloudflare r2 -----------------------------------------------------------

const r2Schema = z.object({
  R2_ACCOUNT_ID: optional(z.string().min(1).max(256)),
  R2_ACCESS_KEY_ID: optional(secret),
  R2_SECRET_ACCESS_KEY: optional(secret),
  R2_BUCKET_NAME: optional(z.string().min(1).max(256)),
  WHISPER_BUCKET_NAME: optional(z.string().min(1).max(256)),
});

export type R2Credentials = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function r2Env(): {
  credentials: R2Credentials | null;
  partiallyConfigured: boolean;
  bucketName?: string;
  whisperBucketName?: string;
} {
  const env = parseGroup('r2', r2Schema);
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const setCount = [accountId, accessKeyId, secretAccessKey].filter(Boolean).length;
  return {
    credentials:
      accountId && accessKeyId && secretAccessKey
        ? { accountId, accessKeyId, secretAccessKey }
        : null,
    partiallyConfigured: setCount > 0 && setCount < 3,
    bucketName: env.R2_BUCKET_NAME,
    whisperBucketName: env.WHISPER_BUCKET_NAME,
  };
}

// --- keystatic auth ----------------------------------------------------------

const authSchema = z.object({
  KEYSTATIC_SESSION_SECRET: optional(secret),
  KEYSTATIC_AUTH_PASSWORD: optional(secret),
  KEYSTATIC_ENROLL_TOKEN: optional(secret),
  KEYSTATIC_RP_ID: optional(z.string().min(1).max(253)),
  // Anything other than the literal 'passkey' means 'basic' — the rollback
  // default. Parsed, not compared inline, so a typo can never silently select
  // a third mode.
  KEYSTATIC_AUTH_MODE: optional(z.string().min(1).max(32)),
  KEYSTATIC_ALERT_EMAIL: optional(emailish),
});

export function authEnv(): z.output<typeof authSchema> {
  return parseGroup('keystatic auth', authSchema);
}

export function keystaticAuthMode(): 'passkey' | 'basic' {
  return authEnv().KEYSTATIC_AUTH_MODE === 'passkey' ? 'passkey' : 'basic';
}

// --- upload ------------------------------------------------------------------

const uploadSchema = z.object({ UPLOAD_SECRET: optional(secret) });

export function uploadEnv(): z.output<typeof uploadSchema> {
  return parseGroup('upload', uploadSchema);
}

// --- whisper -----------------------------------------------------------------

const whisperSchema = z.object({
  WHISPER_TOKEN_SECRET: optional(secret),
  WHISPER_TO_EMAIL: optional(emailish),
  PROXYCHECK_API_KEY: optional(secret),
  RESEND_API_KEY: optional(secret),
});

export function whisperEnv(): z.output<typeof whisperSchema> {
  return parseGroup('whisper', whisperSchema);
}

// --- redacted lines ----------------------------------------------------------

const redactSchema = z.object({
  /** JSON map of id → { salt, iv, data }; produced by scripts/redact.mjs. */
  REDACTED_LINES: optional(z.string().min(2).max(65536)),
});

/** Raw JSON (validated for shape in lib/redact.ts). Undefined when unset. */
export function rawRedactedLines(): string | undefined {
  return parseGroup('redact', redactSchema).REDACTED_LINES;
}

/**
 * The question bank. Answers are personal data, which is why they live in an
 * env var and not in the repo; a malformed bank yields an empty one and the
 * route fails closed with a 503 rather than serving an ungated form.
 */
/**
 * Reserved: app/api/whisper/route.ts mints tokens carrying this id for the
 * archived site's quiz-free forms. A real question sharing it would be handed
 * to main-site visitors whose answer is then never checked, locking that
 * question out. Kept here rather than imported to leave lib/env.ts free of a
 * route dependency; the two must be changed together.
 */
const RESERVED_QUIZ_ID = '!legacy';

export const quizQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answers: z.array(z.string().refine((a) => a.trim().length > 0)).min(1),
});

export const quizBankSchema = z
  .array(quizQuestionSchema)
  .min(1)
  // findQuestion() resolves by id; duplicates would make it ambiguous.
  .refine(
    (qs) => new Set(qs.map((q) => q.id)).size === qs.length,
    'WHISPER_QUIZ has duplicate ids'
  )
  .refine(
    (qs) => qs.every((q) => q.id !== RESERVED_QUIZ_ID),
    `WHISPER_QUIZ uses the reserved id ${RESERVED_QUIZ_ID}`
  );

export function rawQuizBank(): string | undefined {
  return process.env.WHISPER_QUIZ || undefined;
}

// --- outbound mail -----------------------------------------------------------

const mailSchema = z.object({
  RESEND_API_KEY: optional(secret),
  KEYSTATIC_ALERT_EMAIL: optional(emailish),
  WHISPER_TO_EMAIL: optional(emailish),
});

export function mailEnv(): z.output<typeof mailSchema> {
  return parseGroup('mail', mailSchema);
}
