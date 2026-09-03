/**
 * Boundary validation for every external input the app accepts.
 *
 * One rule: data crossing in from a client is `unknown` until a schema has
 * parsed it, and nothing past this module re-checks it. Handlers get a typed
 * value or a ready-made `NextResponse`; they never see a ZodError and never
 * have to `try`. See `.claude/` notes and lib/env.ts for the env-var half.
 *
 * The 400 body is `{ error, issues }` where `issues` names the failing path and
 * the zod issue code only. Input values are NEVER echoed back — an error
 * response is not a place to reflect attacker-supplied bytes — and no stack
 * trace ever leaves the process.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

// --- result type -------------------------------------------------------------

/**
 * Discriminated so a handler cannot use `data` without having narrowed away the
 * failure case: `if (!parsed.ok) return parsed.response;`.
 */
export type ParseResult<T> =
  { ok: true; data: T } | { ok: false; response: NextResponse };

/** Path + code + message. Never the offending value. */
export type IssueSummary = { path: string; code: string; message: string };

/**
 * Per-route override of the 400 body. Defaults produce
 * `{ error: 'invalid_request', issues: [...] }`.
 *
 * Routes that already answer with a deliberately generic string (the WebAuthn
 * verify endpoints, whose wording is an enumeration-oracle concern, and
 * /api/whisper, whose `bad request` body is asserted by tests) pass their own
 * here rather than leaking a second, more descriptive failure mode.
 */
export type FailureShape = {
  status?: number;
  error?: string;
  includeIssues?: boolean;
  headers?: HeadersInit;
};

export type ParseJsonOptions = {
  /** Body parsed as JSON but did not match the schema. */
  invalid?: FailureShape;
  /** Body was not JSON at all. Defaults to the `invalid` shape. */
  malformedJson?: FailureShape;
};

const DEFAULT_FAILURE = {
  status: 400,
  error: 'invalid_request',
  includeIssues: true,
} as const;

function summarize(error: z.ZodError): IssueSummary[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    // zod's messages describe the expectation ("expected string, received
    // number"), not the value, so they are safe to return verbatim.
    message: issue.message,
  }));
}

function failure(issues: IssueSummary[], shape: FailureShape = {}): NextResponse {
  const status = shape.status ?? DEFAULT_FAILURE.status;
  const error = shape.error ?? DEFAULT_FAILURE.error;
  const includeIssues = shape.includeIssues ?? DEFAULT_FAILURE.includeIssues;
  return NextResponse.json(
    includeIssues ? { error, issues } : { error },
    shape.headers ? { status, headers: shape.headers } : { status }
  );
}

const NOT_JSON: IssueSummary[] = [
  { path: '', code: 'invalid_json', message: 'body is not valid JSON' },
];

/** Validate an already-obtained value (query params, form fields, parsed JSON). */
export function parseInput<S extends z.ZodType>(
  value: unknown,
  schema: S,
  shape?: FailureShape
): ParseResult<z.output<S>> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, response: failure(summarize(result.error), shape) };
}

/**
 * Read a JSON body and validate it. Never throws across the handler boundary:
 * a malformed body, an aborted stream and a schema mismatch all come back as a
 * `{ ok: false }` carrying the response to return.
 */
export async function parseJson<S extends z.ZodType>(
  req: { json(): Promise<unknown> },
  schema: S,
  options: ParseJsonOptions = {}
): Promise<ParseResult<z.output<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: failure(NOT_JSON, options.malformedJson ?? options.invalid),
    };
  }
  return parseInput(raw, schema, options.invalid);
}

/** Validate query/search params. `URLSearchParams` is flattened last-wins. */
export function parseSearchParams<S extends z.ZodType>(
  params: URLSearchParams,
  schema: S,
  shape?: FailureShape
): ParseResult<z.output<S>> {
  return parseInput(Object.fromEntries(params), schema, shape);
}

// --- shared field schemas ----------------------------------------------------

/**
 * Empty string is not a value here: every caller of these treats `''` the same
 * as absent, and letting it through would mean an empty password compared with
 * timingSafeEqual.
 */
const nonEmpty = z.string().min(1);

/**
 * base64url payloads from the authenticator. Length caps are generous but
 * finite — an unbounded string is a free allocation for any caller.
 */
const b64u = nonEmpty.max(4096);
const b64uLarge = nonEmpty.max(65536);

const transports = z.array(
  z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'])
);

/**
 * Mirrors the DOM's `AuthenticationExtensionsClientOutputs`. Unknown extension
 * outputs are stripped rather than rejected: @simplewebauthn/server does not
 * read this field at all (it only declares it), and a browser shipping a new
 * extension must not break login.
 */
const clientExtensionResults = z
  .object({
    appid: z.boolean().optional(),
    credProps: z.object({ rk: z.boolean().optional() }).optional(),
    hmacCreateSecret: z.boolean().optional(),
  })
  .default({});

const authenticatorAttachment = z.enum(['cross-platform', 'platform']).optional();

// --- WebAuthn ----------------------------------------------------------------

export const authenticationResponseSchema = z.object({
  id: b64u,
  rawId: b64u,
  response: z.object({
    clientDataJSON: b64uLarge,
    authenticatorData: b64uLarge,
    signature: b64u,
    userHandle: b64u.optional(),
  }),
  authenticatorAttachment,
  clientExtensionResults,
  type: z.literal('public-key'),
});

export const registrationResponseSchema = z.object({
  id: b64u,
  rawId: b64u,
  response: z.object({
    clientDataJSON: b64uLarge,
    attestationObject: b64uLarge,
    authenticatorData: b64uLarge.optional(),
    transports: transports.optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: b64uLarge.optional(),
  }),
  authenticatorAttachment,
  clientExtensionResults,
  type: z.literal('public-key'),
});

/**
 * Compile-time proof that what the schemas produce is what
 * @simplewebauthn/server accepts. Without these, a drifting upstream type would
 * surface as a cast or an `any` at the call site instead of a build error.
 */
type Assignable<T extends U, U> = T;

/** What the assertion route hands to verifyAuthenticationResponse. */
export type AuthenticationResponseInput = Assignable<
  z.output<typeof authenticationResponseSchema>,
  AuthenticationResponseJSON
>;

/** What the enrollment route hands to verifyRegistrationResponse. */
export type RegistrationResponseInput = Assignable<
  z.output<typeof registrationResponseSchema>,
  RegistrationResponseJSON
>;

/**
 * `password` stays optional: these endpoints also authorise via the session
 * cookie, and requireAdmin() decides. The schema's job is only to guarantee it
 * is a string before it reaches timingSafeEqual.
 */
export const adminBodySchema = z.object({ password: nonEmpty.max(1024).optional() });

export const registerVerifyBodySchema = z.object({
  response: registrationResponseSchema,
  // Sanitised (control characters, length) after parsing — see the route.
  label: z.string().max(512).optional(),
  password: nonEmpty.max(1024).optional(),
});

/** Break-glass login. A non-string password can never reach the comparison. */
export const passwordBodySchema = z.object({ password: nonEmpty.max(1024) });

/**
 * Credential id in the DELETE query string. Base64url alphabet only: the value
 * is interpolated into Redis keys and into an alert email.
 */
export const credentialIdSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/),
});

// --- whisper -----------------------------------------------------------------

/**
 * Every field is optional because the client sends different subsets on the
 * quiz-check and submit paths, but none may be wrong-typed: the handler reads
 * them with `?? ''`, which only substitutes null/undefined, so a `{}` used to
 * reach `.slice()` and throw past the rate limiters. See tests/whisper-route.
 *
 * Bounds match what the handler does with each value (message is truncated to
 * 1000 after trim; quizAnswer to 200) with headroom for whitespace, so a valid
 * submission is never rejected here.
 */
export const whisperBodySchema = z.object({
  message: z.string().max(4096).optional(),
  _trap: z.string().max(1024).optional(),
  token: z.string().max(1024).optional(),
  quizAnswer: z.string().max(1024).optional(),
  quizOnly: z.boolean().optional(),
});

// --- upload ------------------------------------------------------------------

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Client-supplied `Content-Length`. A missing header is 0 and a malformed one
 * used to be NaN, and `NaN > MAX` is false, so both walked past the guard —
 * hence the explicit finite check rather than a bare max.
 */
export const contentLengthSchema = z.coerce.number().max(UPLOAD_MAX_BYTES);

export const uploadSecretHeaderSchema = nonEmpty.max(1024);

export const UPLOAD_ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  // AVIF excluded until magic-byte validation is implemented.
} as const;

export const uploadedFileSchema = z.instanceof(File);

export const uploadFileTypeSchema = z.enum(
  Object.keys(UPLOAD_ALLOWED_TYPES) as [
    keyof typeof UPLOAD_ALLOWED_TYPES,
    ...(keyof typeof UPLOAD_ALLOWED_TYPES)[],
  ]
);

// --- og ----------------------------------------------------------------------

import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants';

export const OG_DEFAULT_TITLE = `${SITE_NAME} - ${SITE_DESCRIPTION}`;

/**
 * Truncates rather than rejects: an over-long `?title=` has always rendered a
 * clipped card, and turning that into a 400 would blank social previews for
 * links already in the wild. The transform is the same `.slice(0, 100)` the
 * handler used inline.
 */
export const ogQuerySchema = z.object({
  title: z
    .string()
    .transform((t) => t.slice(0, 100))
    .catch(OG_DEFAULT_TITLE)
    .default(OG_DEFAULT_TITLE),
});
