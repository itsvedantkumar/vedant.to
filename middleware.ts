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
    const decoded = atob(header.slice('Basic '.length));
    const supplied = decoded.slice(decoded.indexOf(':') + 1);
    if (supplied === password) return NextResponse.next();
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Keystatic", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/keystatic', '/keystatic/:path*'],
};
