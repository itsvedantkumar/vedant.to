import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';
import { jsonError, sessionSecret } from '@/lib/auth/guard';
import { isPasskeysAvailable, isPasswordConfigured } from '@/lib/webauthn/config';
import { countCredentials } from '@/lib/webauthn/store';
import { getIP } from '@/lib/request';
import { makeRatelimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generous — the login page calls this once. The cap only stops bulk probing
// of the capability surface (enrolledCount === 0 advertises that enrollment
// is still open).
const ratelimit = makeRatelimit('keystatic:status', 30, '1 m');

/**
 * Capability probe so the login UI renders the right affordances. Returns
 * booleans and a count only — never credential ids.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Fail open on limiter errors: this is a capability probe, not a secret
  // endpoint, and the login UI breaking on a Redis blip is the worse outcome.
  try {
    if (ratelimit) {
      const ip = getIP(req);
      if (ip !== 'unknown') {
        const { success } = await ratelimit.limit(ip);
        if (!success) return jsonError(429, 'too many attempts');
      }
    }
  } catch {
    // limiter unavailable — serve the probe
  }

  const secret = sessionSecret();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret);

  const passkeysAvailable = isPasskeysAvailable();
  let enrolledCount: number | null = 0;
  if (passkeysAvailable) {
    try {
      enrolledCount = await countCredentials();
    } catch {
      enrolledCount = null;
    }
  }

  return NextResponse.json(
    {
      configured: Boolean(secret),
      passkeysAvailable,
      passwordEnabled: isPasswordConfigured(),
      enrolledCount,
      sessionActive: session !== null,
      sessionMethod: session?.m ?? null,
      // Mirrors enrollmentBlockedReason() — never treat a Redis failure as
      // zero credentials (that advertised open bootstrap).
      canEnroll: enrolledCount === 0 || session?.m === 'passkey',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
