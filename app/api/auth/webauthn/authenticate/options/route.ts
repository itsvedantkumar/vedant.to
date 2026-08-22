import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { checkOrigin, jsonError, sessionSecret } from '@/lib/auth/guard';
import { CHALLENGE_TTL_SEC, challengeCookie } from '@/lib/auth/session';
import { getRelyingParty } from '@/lib/webauthn/config';
import {
  countCredentials,
  isRedisUnavailable,
  newNonce,
  putChallenge,
} from '@/lib/webauthn/store';
import { getIP } from '@/lib/request';
import { makeRatelimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generous: passkey attempts are cryptographically useless to an attacker, so
// this bucket only caps Redis load.
const ratelimit = makeRatelimit('keystatic:wa', 30, '10 m');

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkOrigin(req)) return jsonError(403, 'bad origin');
  if (!sessionSecret()) return jsonError(503, 'auth misconfigured');

  // Guarded: an Upstash error thrown out here used to escape the handler as a
  // raw 500 instead of the 503 the rest of this route answers with. Kept above
  // the main try (rather than inside it) so ordering is unchanged.
  try {
    if (ratelimit) {
      const ip = getIP(req);
      if (ip !== 'unknown') {
        const { success } = await ratelimit.limit(ip);
        if (!success) return jsonError(429, 'too many attempts');
      }
    }
  } catch (err) {
    if (isRedisUnavailable(err)) return jsonError(503, 'passkeys unavailable');
    return jsonError(503, 'authentication unavailable');
  }

  try {
    if ((await countCredentials()) === 0) {
      return jsonError(409, 'no passkeys enrolled');
    }

    const { rpID } = getRelyingParty(req);
    // No allowCredentials: passkeys are discoverable (residentKey: 'required'),
    // so the browser picks. This also means an unauthenticated caller learns
    // nothing about which credentials exist.
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
    });

    const nonce = newNonce();
    await putChallenge(nonce, {
      kind: 'auth',
      challenge: options.challenge,
      ip: getIP(req),
    });

    return NextResponse.json(options, {
      headers: {
        'Set-Cookie': challengeCookie(nonce, CHALLENGE_TTL_SEC),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (isRedisUnavailable(err)) return jsonError(503, 'passkeys unavailable');
    return jsonError(503, 'authentication unavailable');
  }
}
