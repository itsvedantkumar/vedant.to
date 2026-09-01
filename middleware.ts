import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/auth/session';
import { makeRatelimit } from './lib/ratelimit';
import { getIP } from './lib/request';
import { redis } from './lib/redis';
import { timingSafeEqual } from './lib/timing';

// 20 failed auth attempts per 10 min per IP. Metered only after the session and
// Basic-auth checks have both declined (see below), so a request that carries a
// valid credential never consumes budget — the Keystatic UI is chatty enough to
// blow through this bucket during normal editing otherwise.
const keystaticlimit = makeRatelimit('keystatic:auth', 20, '10 m');

// Rollout/rollback switch. Defaults to 'basic' — the pre-passkey HTTP Basic
// Auth behaviour — so deploying this code changes nothing until
// KEYSTATIC_AUTH_MODE=passkey is set deliberately, once passkeys are enrolled
// and KEYSTATIC_SESSION_SECRET exists. Opt in, never by accident.
const AUTH_MODE = process.env.KEYSTATIC_AUTH_MODE === 'passkey' ? 'passkey' : 'basic';

const LOGIN_PATH = '/auth/keystatic';

// Next's dev-only react-refresh runtime evaluates code with eval(), so without
// this nothing hydrates under `npm run dev` — every client component is inert.
// Never emitted in production builds.
const DEV_EVAL = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";

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
 * scripts (RSC bootstrap, etc.) — see the Next.js CSP docs' middleware
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

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;

  const password = process.env.KEYSTATIC_AUTH_PASSWORD;
  const sessionSecret = process.env.KEYSTATIC_SESSION_SECRET;

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
    if (session) return allow(req);
  }

  // 2. Break-glass password over HTTP Basic. Checked BEFORE the rate limiter:
  // it's a local compare with no network cost, and in basic mode (the default)
  // there is no session step above it, so metering first would count every
  // successfully authed request from the chatty Keystatic UI against the
  // 20/10min bucket and lock the admin out of their own CMS.
  if (password && checkBasicAuth(req, password)) return allow(req);

  // 3. Rate limit what's left — requests that presented no valid credential.
  // Skip when IP is 'unknown': bucketing all unknown IPs together would let
  // one bad request globally lock out every user sharing that fallback key.
  if (keystaticlimit) {
    const ip = getIP(req);
    if (ip !== 'unknown') {
      try {
        const { success } = await keystaticlimit.limit(ip);
        if (!success) return deny(429, 'Too Many Requests');
      } catch {
        // Upstash outage: don't fail closed here. Step 4 is the real gate, and
        // denying would lock the admin out for no security gain.
      }
    }
  }

  // 4. Deny.
  if (AUTH_MODE === 'basic') {
    // Legacy behaviour: prompt the browser for credentials.
    return deny(401, 'Unauthorized', { 'WWW-Authenticate': 'Basic realm="keystatic"' });
  }

  // `?basic=1` opts back into the native browser prompt — an emergency path
  // that works with JavaScript disabled.
  if (req.nextUrl.searchParams.get('basic') === '1' && password) {
    return deny(401, 'Unauthorized', { 'WWW-Authenticate': 'Basic realm="keystatic"' });
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
  // public CSP header, which put an edge invocation on every page view, image
  // and feed fetch to emit a constant string; that header is static in
  // next.config.mjs now. Matching by prefix rather than by file extension keeps
  // /keystatic/*.png gated too — excluding assets by extension would drop auth
  // on those requests.
  matcher: ['/keystatic', '/keystatic/:path*', '/api/keystatic', '/api/keystatic/:path*'],
};
