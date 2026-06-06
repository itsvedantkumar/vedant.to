import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = upstashUrl && upstashToken ? Redis.fromEnv() : null;
// 20 auth attempts per 10 min per IP — generous for humans, blocks brute-force
const keystaticlimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '10 m'),
      prefix: 'keystatic:auth',
    })
  : null;

function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  );
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const password = process.env.KEYSTATIC_AUTH_PASSWORD;

  // Skip auth when env var not set (local dev without the var)
  if (!password) {
    return NextResponse.next();
  }

  // Rate-limit all auth attempts to /keystatic
  if (keystaticlimit) {
    const { success } = await keystaticlimit.limit(getIP(req));
    if (!success) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

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

        if (a.byteLength === b.byteLength) {
          let diff = 0;
          for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
          if (diff === 0) return NextResponse.next();
        }
      }
    } catch {
      // malformed base64 → fall through to 401
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="keystatic"',
    },
  });
}

export const config = {
  matcher: ['/keystatic', '/keystatic/(.*)', '/api/keystatic', '/api/keystatic/(.*)'],
};
