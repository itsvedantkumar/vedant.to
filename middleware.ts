import { NextRequest, NextResponse } from 'next/server';

// Basic Auth gate for the Keystatic admin UI.
// If KEYSTATIC_AUTH_PASSWORD is unset (e.g. local dev), the gate is skipped.
// Only the /keystatic UI is gated — the /api/keystatic/* routes must stay open
// so the GitHub OAuth callback and the editor's API calls keep working
// (those are protected by Keystatic's own KEYSTATIC_SECRET-signed session).
export function middleware(req: NextRequest) {
  const password = process.env.KEYSTATIC_AUTH_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice('Basic '.length));
      const supplied = decoded.slice(decoded.indexOf(':') + 1);
      if (timingSafeEqual(supplied, password)) return NextResponse.next();
    } catch {
      // Malformed base64 — fall through to 401 instead of throwing a 500.
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Keystatic", charset="UTF-8"' },
  });
}

// Length-independent constant-time comparison to avoid leaking the password
// via response timing. Edge runtime has no node:crypto.timingSafeEqual.
function timingSafeEqual(a: string, b: string): boolean {
  let mismatch = a.length === b.length ? 0 : 1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
