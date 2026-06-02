import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/keystatic')) {
    return NextResponse.next();
  }

  const password = process.env.KEYSTATIC_AUTH_PASSWORD;

  // No password set → allow through (local dev)
  if (!password) return NextResponse.next();

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const credentials = atob(authHeader.slice(6));
    const colon = credentials.indexOf(':');
    const pass = credentials.slice(colon + 1);
    if (pass === password) return NextResponse.next();
  }

  return new NextResponse(null, {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="vedant.to CMS"' },
  });
}

export const config = {
  matcher: ['/keystatic/:path*'],
};
