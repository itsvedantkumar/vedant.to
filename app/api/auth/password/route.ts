import { NextRequest, NextResponse } from 'next/server';
import {
  checkContentType,
  checkOrigin,
  jsonError,
  limitSecretAttempt,
  sessionSecret,
} from '@/lib/auth/guard';
import { notifySecurityEvent, requestContext } from '@/lib/auth/notify';
import { SESSION_TTL_SEC, sessionCookie, signSession } from '@/lib/auth/session';
import { timingSafeEqual } from '@/lib/timing';
import { authEnv } from '@/lib/env';
import { parseJson, passwordBodySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Break-glass login. Exchanges KEYSTATIC_AUTH_PASSWORD for a session cookie. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkOrigin(req)) return jsonError(403, 'bad origin');
  if (!checkContentType(req)) return jsonError(415, 'expected application/json');

  const secret = sessionSecret();
  if (!secret) return jsonError(503, 'auth misconfigured');

  const configured = authEnv().KEYSTATIC_AUTH_PASSWORD;
  if (!configured) return jsonError(403, 'password login is disabled');

  // Shared bucket with every other password/token comparison — see guard.ts.
  if (!(await limitSecretAttempt(req))) return jsonError(429, 'too many attempts');

  // Parsed AFTER limitSecretAttempt, deliberately: the shared attempt bucket
  // must be spent before anything derived from the body is looked at, and a
  // schema failure is not a cheaper path to an unmetered retry.
  const parsed = await parseJson(req, passwordBodySchema);
  if (!parsed.ok) return parsed.response;

  if (!timingSafeEqual(parsed.data.password, configured)) {
    return jsonError(401, 'authentication failed');
  }

  // The password is meant to be a rarely-used recovery path, so every use is
  // worth knowing about.
  await notifySecurityEvent(
    'break-glass password was used',
    `Someone signed in to /keystatic with the break-glass password instead of a passkey.\n\n${requestContext(req)}\n\n` +
      `If this wasn't you, rotate KEYSTATIC_AUTH_PASSWORD and KEYSTATIC_SESSION_SECRET on Vercel.`
  );

  const token = await signSession({ m: 'password' }, secret);
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': sessionCookie(token, SESSION_TTL_SEC),
        'Cache-Control': 'no-store',
      },
    }
  );
}
