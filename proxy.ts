import { NextRequest, NextResponse } from 'next/server';
import { sessionOpensCms } from './lib/auth/enrollment';
import { SESSION_COOKIE, verifySession } from './lib/auth/session';
import { makeRatelimit } from './lib/ratelimit';
import { getIP, getTrustedIP } from './lib/request';
import { redis } from './lib/redis';
import { timingSafeEqual } from './lib/timing';
import { authEnv, isProduction, keystaticAuthMode } from './lib/env';

// 20 failed auth attempts per 10 min per IP. Metered only after the session and
// Basic-auth checks have both declined (see below), so a request that carries a
// valid credential never consumes budget — the Keystatic UI is chatty enough to
// blow through this bucket during normal editing otherwise.
const keystaticlimit = makeRatelimit('keystatic:auth', 20, '10 m');

// Global backstop for the break-glass password. Deliberately SHARES the bucket
// limitSecretAttempt uses in lib/auth/guard.ts ('keystatic:pw-global', 50 per
// 15m): one credential gets one budget, so an attacker who can reach both this
// path and /api/auth/password does not get 50 attempts at each. Sized to match
// guard.ts rather than inventing a second number for the same secret.
const keystaticGlobalLimit = makeRatelimit('keystatic:pw-global', 50, '15 m');

// Rollout/rollback switch. Defaults to 'basic' — the pre-passkey HTTP Basic
// Auth behaviour — so deploying this code changes nothing until
// KEYSTATIC_AUTH_MODE=passkey is set deliberately, once passkeys are enrolled
// and KEYSTATIC_SESSION_SECRET exists. Opt in, never by accident.
const AUTH_MODE = keystaticAuthMode();

const LOGIN_PATH = '/auth/keystatic';

// Next's dev-only react-refresh runtime evaluates code with eval(), so without
// this nothing hydrates under `npm run dev` — every client component is inert.
// Never emitted in production builds.
const IS_PROD = isProduction();

const DEV_EVAL = IS_PROD ? '' : " 'unsafe-eval'";

/**
 * CSP for /keystatic and /api/keystatic. Public routes get theirs statically
 * from next.config.mjs: that policy takes no per-request input, so emitting it
 * here would put an edge invocation on every page view to produce a constant
 * string. The two are deliberately different — this one trusts GitHub's API and
 * avatars because the CMS talks to them, and the public one must not.
 *
 * Nonce-based script-src works here because /keystatic is force-dynamic
 * (app/keystatic/layout.tsx), so every request gets a fresh nonce matching what
 * was just rendered. Public routes are statically prerendered, so a nonce baked
 * in at build time could never match a later request — which is why they stay
 * on 'unsafe-inline'.
 */
function buildCSP(nonce?: string): string {
  const scriptSrc = nonce ? `'self' 'nonce-${nonce}'` : "'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}${DEV_EVAL}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
}

/** Random per-request nonce, base64-encoded per the CSP spec's nonce-value grammar. */
function makeNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/**
 * Allows the request through to the actual Keystatic route render. The nonce
 * is forwarded on the *request* headers (not just the response) because
 * Next.js reads it from there to nonce its own internally-generated inline
 * scripts (RSC bootstrap, etc.) — see the Next.js CSP docs' proxy
 * pattern. Requires /keystatic to be force-dynamic: a statically prerendered
 * page would bake in a stale nonce that could never match a later request's.
 */
function allow(req: NextRequest): NextResponse {
  const nonce = makeNonce();
  const csp = buildCSP(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

function deny(status: number, body: string, extra?: HeadersInit): NextResponse {
  const res = new NextResponse(body, { status, headers: extra });
  // No page render happens on a deny path (redirect/error body only), so no
  // nonce is needed here — 'unsafe-inline' is harmless on a response with no
  // inline scripts of ours to begin with, and keeps this helper nonce-free.
  res.headers.set('Content-Security-Policy', buildCSP());
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** Basic Auth against the break-glass password. */
function checkBasicAuth(req: NextRequest, password: string): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) return false;
  try {
    const decoded = atob(authHeader.slice('Basic '.length));
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) return false;
    // Username is ignored — only the password is checked.
    return timingSafeEqual(decoded.slice(colonIndex + 1), password);
  } catch {
    return false;
  }
}

/** True for a top-level page load (as opposed to Keystatic's own fetch calls). */
function isNavigation(req: NextRequest): boolean {
  if (req.headers.get('sec-fetch-mode') === 'navigate') return true;
  return (req.headers.get('accept') ?? '').includes('text/html');
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;

  const { KEYSTATIC_AUTH_PASSWORD: password, KEYSTATIC_SESSION_SECRET: sessionSecret } =
    authEnv();

  // Fail closed. Previously a missing password meant /keystatic was wide open;
  // now a gate that cannot be enforced denies instead.
  if (!sessionSecret && AUTH_MODE !== 'basic') {
    return deny(503, 'Keystatic auth is not configured');
  }
  if (!password && !redis) {
    return deny(503, 'Keystatic auth is not configured');
  }

  // 1. Session cookie — cheap, no network, so it runs before the rate limiter.
  if (AUTH_MODE !== 'basic') {
    const session = await verifySession(
      req.cookies.get(SESSION_COOKIE)?.value,
      sessionSecret
    );
    if (session && sessionOpensCms('passkey', session.m)) return allow(req);
  }

  // 2. Break-glass password over HTTP Basic.
  //
  // The compare is METERED BEFORE IT RUNS. An earlier version checked the
  // password first and rate limited afterwards, reasoning that a local compare
  // costs nothing and that metering above it would count the chatty Keystatic
  // UI's own traffic. That reasoning was wrong in a way that voided the limit
  // entirely: a correct guess returned allow() before any limiter executed, and
  // a wrong guess got a 429 that did nothing to stop the next request being
  // compared. Every request was a free guess and the budget only throttled the
  // error message.
  //
  // The metering is one ATOMIC limit() call, not a getRemaining() peek followed
  // by a spend. limit() is a Lua script Redis evaluates in a single round trip,
  // so the check and the decrement cannot interleave. Peek-then-spend was the
  // second version of this code and it was broken the same way as the first:
  // every request in a concurrent burst reads the same remaining count before
  // any decrement lands, so all of them proceed to the compare. That prices the
  // budget at the attacker's connection count rather than at 50 per 15 minutes,
  // and no amount of narrowing the window helps, because the attacker widens it
  // by adding concurrency instead of waiting. lib/auth/guard.ts:76 already gated
  // on limit().success; diverging from it here is what reintroduced the race.
  //
  // Only requests carrying an Authorization header enter this path, so ordinary
  // unauthenticated traffic never touches the budget.
  //
  // The cost, since metering precedes the compare: a SUCCESSFUL break-glass
  // login also spends a token. In passkey mode, which production runs, Basic is
  // genuinely break-glass and the Keystatic UI rides the session cookie, so
  // that is one token per emergency login out of 50. In basic mode the browser
  // re-sends Authorization on every request, so ordinary editing meters itself;
  // that mode is the documented rollback path, and a deployment that lives on
  // it should raise these buckets deliberately rather than have the live path
  // stay unmetered to keep the fallback comfortable.
  if (password && req.headers.get('authorization')?.startsWith('Basic ')) {
    const ip = getTrustedIP(req);

    // Fails CLOSED in production, matching limitSecretAttempt in
    // lib/auth/guard.ts, which guards this same credential on
    // /api/auth/password. Those two paths had opposite outage behaviour until
    // now, and fail-open is the weaker of the two during exactly the outage an
    // attacker would wait for.
    //
    // The cost, stated rather than discovered later: while Upstash is down the
    // break-glass password stops working. A passkey session still gets in at
    // step 1, which is HMAC-only and touches no network, so this is survivable
    // as long as a passkey is enrolled. Enroll a second one before relying on it.
    if (IS_PROD && !keystaticGlobalLimit) {
      return deny(503, 'Auth rate limiter unavailable');
    }

    try {
      // Per-IP budget is skipped for 'unknown': bucketing every unknown IP
      // together would let one bad request lock out everyone sharing that
      // fallback key. The global budget below has no such skip, so those
      // requests are still metered.
      if (keystaticlimit && ip !== 'unknown') {
        const { success } = await keystaticlimit.limit(ip);
        if (!success) return deny(429, 'Too Many Requests');
      }
      if (keystaticGlobalLimit) {
        const { success } = await keystaticGlobalLimit.limit('all');
        if (!success) return deny(429, 'Too Many Requests');
      }
    } catch {
      return deny(503, 'Auth rate limiter unavailable');
    }

    if (checkBasicAuth(req, password)) return allow(req);
  }

  // 3. Rate limit the rest: requests that presented no credential at all.
  //
  // Deliberately per-IP only. The global 'keystatic:pw-global' bucket is shared
  // with lib/auth/guard.ts so that one credential gets one budget, which means
  // draining it here would let an unauthenticated flood of ordinary /keystatic
  // requests lock out legitimate logins on /api/auth/password for the whole
  // window. Only a failed password guess above may spend it.
  if (keystaticlimit) {
    const ip = getIP(req);
    if (ip !== 'unknown') {
      try {
        const { success } = await keystaticlimit.limit(ip);
        if (!success) return deny(429, 'Too Many Requests');
      } catch {
        // Best effort. An outage here must not decide the request.
      }
    }
  }

  // 4. Deny.
  if (AUTH_MODE === 'basic') {
    // Legacy behaviour: prompt the browser for credentials.
    return deny(401, 'Unauthorized', {
      'WWW-Authenticate': 'Basic realm="keystatic"',
    });
  }

  // `?basic=1` opts back into the native browser prompt — an emergency path
  // that works with JavaScript disabled.
  if (req.nextUrl.searchParams.get('basic') === '1' && password) {
    return deny(401, 'Unauthorized', {
      'WWW-Authenticate': 'Basic realm="keystatic"',
    });
  }

  if (isNavigation(req) && !pathname.startsWith('/api/')) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url, 307);
    res.headers.set('Content-Security-Policy', buildCSP());
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }

  return deny(401, JSON.stringify({ error: 'unauthorized' }), {
    'Content-Type': 'application/json',
  });
}

export const config = {
  // Only the gated paths. This used to match every route so it could set the
  // public CSP header, which put an invocation on every page view, image and
  // feed fetch to emit a constant string; that header is static in
  // next.config.mjs now. Matching by prefix rather than by file extension keeps
  // /keystatic/*.png gated too — excluding assets by extension would drop auth
  // on those requests.
  matcher: ['/keystatic', '/keystatic/:path*', '/api/keystatic', '/api/keystatic/:path*'],
};
