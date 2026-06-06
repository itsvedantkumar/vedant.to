import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest): NextResponse {
  const password = process.env.KEYSTATIC_AUTH_PASSWORD;

  // Skip auth when env var not set (local dev without the var)
  if (!password) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get('authorization');

  if (authHeader?.startsWith('Basic ')) {
    const base64 = authHeader.slice('Basic '.length);
    const decoded = atob(base64);
    const colonIndex = decoded.indexOf(':');
    if (colonIndex !== -1) {
      const providedPassword = decoded.slice(colonIndex + 1);

      const enc = new TextEncoder();
      const a = enc.encode(providedPassword);
      const b = enc.encode(password);

      if (a.byteLength === b.byteLength) {
        const timingSafe = (() => {
          try {
            // Node.js runtime
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const nodeCrypto = require('crypto') as typeof import('crypto');
            return nodeCrypto.timingSafeEqual(a, b);
          } catch {
            // Edge runtime fallback: manual constant-time compare
            let result = 0;
            for (let i = 0; i < a.length; i++) {
              result |= a[i] ^ b[i];
            }
            return result === 0;
          }
        })();

        if (timingSafe) {
          return NextResponse.next();
        }
      }
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
