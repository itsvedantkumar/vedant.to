import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = upstashUrl && upstashToken ? Redis.fromEnv() : null;

// 20 auth attempts per 10 min per IP
const keystaticlimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '10 m'),
      prefix: 'keystatic:auth',
    })
  : null;

// Only trust Vercel's injected header — not client-spoofable through Vercel's edge
function getIP(req: NextRequest): string {
  return req.headers.get('x-vercel-forwarded-for') ?? 'unknown';
}

function buildCSP(nonce: string, isKeystatic: boolean): string {
  if (isKeystatic) {
    return [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
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
    `script-src 'self' 'nonce-${nonce}' https://va.vercel-scripts.com https://www.googletagmanager.com`,
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
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const { pathname } = req.nextUrl;
  const isKeystatic =
    pathname.startsWith('/keystatic') || pathname.startsWith('/api/keystatic');

  // Forward nonce to server components via request header
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

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

            const enc = new TextEncoder();
            const a = enc.encode(providedPassword);
            const b = enc.encode(password);

            const maxLen = Math.max(a.byteLength, b.byteLength);
            const aPadded = new Uint8Array(maxLen);
            const bPadded = new Uint8Array(maxLen);
            aPadded.set(a);
            bPadded.set(b);
            let diff = a.byteLength ^ b.byteLength;
            for (let i = 0; i < maxLen; i++) diff |= aPadded[i] ^ bPadded[i];

            if (diff === 0) {
              const res = NextResponse.next({ request: { headers: requestHeaders } });
              res.headers.set('Content-Security-Policy', buildCSP(nonce, true));
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
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy', buildCSP(nonce, true));
    return res;
  }

  // All public routes: attach nonce + per-request CSP
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', buildCSP(nonce, false));
  return res;
}

export const config = {
  // Match all paths except Next.js internals and static assets
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|json)).*)',
  ],
};
