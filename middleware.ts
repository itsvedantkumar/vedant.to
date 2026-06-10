import { Ratelimit } from '@upstash/ratelimit';
import { NextRequest, NextResponse } from 'next/server';
import { getIP } from './lib/request';
import { redis } from './lib/redis';
import { timingSafeEqual } from './lib/timing';

// 20 auth attempts per 10 min per IP
const keystaticlimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '10 m'),
      prefix: 'keystatic:auth',
    })
  : null;

function buildCSP(isKeystatic: boolean): string {
  if (isKeystatic) {
    return [
      "default-src 'self'",
      "script-src 'self'",
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
  return [
    "default-src 'self'",
    "script-src 'self' https://va.vercel-scripts.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://assets.vedant.to https://www.google-analytics.com",
    "font-src 'self' data:",
    "connect-src 'self' https://va.vercel-scripts.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const isKeystatic =
    pathname.startsWith('/keystatic') || pathname.startsWith('/api/keystatic');

  if (isKeystatic) {
    const password = process.env.KEYSTATIC_AUTH_PASSWORD;

    // Rate limit brute-force attempts — skipped gracefully if Upstash is absent.
    // Skip when IP is 'unknown': bucketing all unknown IPs together would let
    // one bad request globally lock out every user sharing that fallback key.
    if (keystaticlimit) {
      const ip = getIP(req);
      if (ip !== 'unknown') {
        const { success } = await keystaticlimit.limit(ip);
        if (!success) {
          return new NextResponse('Too Many Requests', { status: 429 });
        }
      }
    }

    // Optional Basic Auth gate. When KEYSTATIC_AUTH_PASSWORD is not set, pass
    // through to Keystatic — it handles auth via GitHub OAuth in production.
    if (password) {
      const authHeader = req.headers.get('authorization');

      if (authHeader?.startsWith('Basic ')) {
        try {
          const base64 = authHeader.slice('Basic '.length);
          const decoded = atob(base64);
          const colonIndex = decoded.indexOf(':');
          if (colonIndex !== -1) {
            const providedPassword = decoded.slice(colonIndex + 1);

            if (timingSafeEqual(providedPassword, password)) {
              const res = NextResponse.next({});
              res.headers.set('Content-Security-Policy', buildCSP(true));
              return res;
            }
          }
        } catch {
          // malformed base64 → fall through to 401
        }
      }

      return new NextResponse('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="keystatic"' },
      });
    }

    // No password set — pass through to Keystatic's own auth
    const res = NextResponse.next({});
    res.headers.set('Content-Security-Policy', buildCSP(true));
    return res;
  }

  // All public routes: per-request CSP
  const res = NextResponse.next({});
  res.headers.set('Content-Security-Policy', buildCSP(false));
  return res;
}

export const config = {
  // Match all paths except Next.js internals and static assets
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml)).*)',
  ],
};
