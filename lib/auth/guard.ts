/**
 * Shared authorisation + CSRF helpers for the /api/auth/* route handlers.
 * Node runtime only.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from '@/lib/timing';
import { SESSION_COOKIE, verifySession, type SessionPayload } from '@/lib/auth/session';
import { getTrustedIP } from '@/lib/request';
import { redis } from '@/lib/redis';
import { authEnv, isProduction, runtimeEnv } from '@/lib/env';

type HeaderBag = { headers: { get(name: string): string | null } };
type CookieBag = {
  cookies: { get(name: string): { value: string } | undefined };
};

export type AdminGranted = {
  ok: true;
  via: 'session' | 'password' | 'token';
  session: SessionPayload | null;
};

export type AdminAuth = AdminGranted | { ok: false; status: number; error: string };

export { enrollmentBlockedReason } from '@/lib/auth/enrollment';

export function sessionSecret(): string | undefined {
  return authEnv().KEYSTATIC_SESSION_SECRET;
}

// One shared bucket for every path that compares a caller-supplied secret
// against KEYSTATIC_AUTH_PASSWORD or KEYSTATIC_ENROLL_TOKEN. It lives here
// rather than per-route so no endpoint can accidentally become an unthrottled
// brute-force oracle for the break-glass password.
const secretLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      prefix: 'keystatic:pw',
    })
  : null;

// Non-IP-keyed backstop, mirroring the whisper quiz limiter. The per-IP bucket
// above is exactly what a residential proxy pool defeats — rotate the egress IP
// and every request gets a fresh 5-attempt budget. One global bucket can't be
// evaded by rotating anything. 50 per 15 min is far above real use (one admin
// typing one password) and far below a useful brute force.
const globalSecretLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(50, '15 m'),
      prefix: 'keystatic:pw-global',
    })
  : null;

/**
 * False when the caller has exhausted their password/token attempt budget.
 *
 * Fails CLOSED in production: without a limiter store the break-glass password
 * is an unmetered brute-force oracle, and that password is full CMS access.
 * Local dev (no Upstash configured) is unaffected and keeps working.
 */
export async function limitSecretAttempt(req: HeaderBag): Promise<boolean> {
  const inProd = isProduction();
  if (!secretLimit || !globalSecretLimit) return !inProd;
  try {
    // getTrustedIP, not getIP: this keys a security decision, and getIP's
    // fallbacks are client-settable — an attacker could mint a fresh bucket per
    // request just by incrementing an x-forwarded-for header.
    const ip = getTrustedIP(req);
    // Skip 'unknown' per the convention elsewhere: one shared bucket would let a
    // single bad request lock out everyone behind that fallback key. The global
    // backstop below still meters these.
    if (ip !== 'unknown') {
      const { success } = await secretLimit.limit(ip);
      if (!success) return false;
    }
    const { success } = await globalSecretLimit.limit('all');
    return success;
  } catch {
    return !inProd; // Redis outage — same fail-closed reasoning as above.
  }
}

export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * Origin allowlist — mirrors app/api/whisper/route.ts. A missing Origin header
 * is rejected, not waved through.
 */
export function checkOrigin(req: HeaderBag): boolean {
  const origin = req.headers.get('origin') ?? '';
  if (isProduction()) {
    // Exact origin only — a wildcard subdomain match would let any delegated
    // or dangling *.vedant.to CNAME become a valid CSRF origin.
    if (/^https:\/\/vedant\.to$/.test(origin)) return true;
    // Preview deploys only. Accepting any *.vercel.app in production would
    // admit an attacker-hosted page on that shared domain.
    return (
      runtimeEnv().VERCEL_ENV === 'preview' &&
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)
    );
  }
  return /^(https:\/\/vedant\.to|https?:\/\/localhost(:\d+)?)$/.test(origin);
}

/**
 * Origin guard for idempotent reads. A missing Origin header is allowed —
 * browsers omit it on same-origin GET navigations/fetches, and a read leaks
 * nothing to a cross-site caller that CORS doesn't already block. A present
 * but wrong Origin is still rejected. Mutating verbs keep checkOrigin.
 */
export function checkOriginOrAbsent(req: HeaderBag): boolean {
  if (!req.headers.get('origin')) return true;
  return checkOrigin(req);
}

/** Forces a CORS preflight, which blocks cross-site HTML-form POSTs. */
export function checkContentType(req: HeaderBag): boolean {
  return (req.headers.get('content-type') ?? '').includes('application/json');
}

function passwordFromBasicHeader(req: HeaderBag): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice('Basic '.length));
    const colon = decoded.indexOf(':');
    return colon === -1 ? null : decoded.slice(colon + 1);
  } catch {
    return null;
  }
}

/**
 * Accepts, in order: a valid session cookie, the break-glass password (Basic
 * header or `password` in the JSON body), or the bootstrap enroll token.
 * Denies by default — including when KEYSTATIC_SESSION_SECRET is missing, since
 * no session could be minted or verified anyway.
 */
export type RequireAdminOptions = {
  /**
   * The Basic header was already metered and verified by proxy.ts before the
   * request reached this handler (true for every path under its matcher:
   * /keystatic and /api/keystatic). Metering it again here charged the shared
   * keystatic:pw and keystatic:pw-global buckets twice per request, halving
   * the break-glass budget. Body passwords and enroll tokens are never
   * metered upstream, so they are still charged here.
   */
  basicMeteredUpstream?: boolean;
};

export async function requireAdmin(
  req: HeaderBag & CookieBag,
  body?: { password?: unknown },
  opts: RequireAdminOptions = {}
): Promise<AdminAuth> {
  const secret = sessionSecret();
  if (!secret) {
    return { ok: false, status: 503, error: 'auth misconfigured' };
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret);
  if (session) return { ok: true, via: 'session', session };

  const bodyPassword = typeof body?.password === 'string' ? body.password : null;
  const headerPassword = passwordFromBasicHeader(req);
  const headerToken = req.headers.get('x-enroll-token');

  // Meter before any comparison, and only when a secret was actually offered —
  // session-cookie traffic must not consume the budget.
  const meterBasic = headerPassword && !opts.basicMeteredUpstream;
  if (bodyPassword || meterBasic || headerToken) {
    if (!(await limitSecretAttempt(req))) {
      return { ok: false, status: 429, error: 'too many attempts' };
    }
  }

  const { KEYSTATIC_AUTH_PASSWORD: configured, KEYSTATIC_ENROLL_TOKEN: enrollToken } =
    authEnv();
  if (configured) {
    const provided = headerPassword ?? bodyPassword;
    if (provided && timingSafeEqual(provided, configured)) {
      return { ok: true, via: 'password', session: null };
    }
  }

  if (enrollToken && headerToken && timingSafeEqual(headerToken, enrollToken)) {
    return { ok: true, via: 'token', session: null };
  }

  return { ok: false, status: 401, error: 'unauthorized' };
}
