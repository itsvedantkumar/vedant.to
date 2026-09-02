import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import {
  checkContentType,
  checkOrigin,
  enrollmentBlockedReason,
  jsonError,
  requireAdmin,
  sessionSecret,
} from '@/lib/auth/guard';
import { notifySecurityEvent, requestContext } from '@/lib/auth/notify';
import {
  CHALLENGE_COOKIE,
  bytesToB64Url,
  clearChallengeCookie,
} from '@/lib/auth/session';
import { getRelyingParty } from '@/lib/webauthn/config';
import {
  burnChallenge,
  countCredentials,
  getCredential,
  isRedisUnavailable,
  saveCredential,
} from '@/lib/webauthn/store';
import { parseJson, registerVerifyBodySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LABEL = 64;

// The schema guarantees a string of bounded length; what it cannot express is
// the fallback name and the control-character strip, so those stay here.
function sanitizeLabel(raw: string | undefined): string {
  if (raw === undefined) return 'unnamed device';
  // Strip control characters; the label is rendered back into the manage UI.
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.slice(0, MAX_LABEL) || 'unnamed device';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkOrigin(req)) return jsonError(403, 'bad origin');
  if (!checkContentType(req)) return jsonError(415, 'expected application/json');
  if (!sessionSecret()) return jsonError(503, 'auth misconfigured');

  const nonce = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!nonce) return jsonError(400, 'registration failed');

  // Generic on purpose, and without the issue list: this endpoint's wording is
  // the same enumeration concern as the assertion route's, so a schema must not
  // become a more descriptive failure mode than the ones below it.
  const parsed = await parseJson(req, registerVerifyBodySchema, {
    invalid: { error: 'registration failed', includeIssues: false },
    malformedJson: { error: 'invalid body', includeIssues: false },
  });
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const response = body.response;

  const failed = (status: number, error: string) =>
    NextResponse.json(
      { error },
      { status, headers: { 'Set-Cookie': clearChallengeCookie() } }
    );

  try {
    // Validate the challenge BEFORE comparing any caller-supplied secret, so a
    // forged challenge cookie can never be used to probe the password.
    const challenge = await burnChallenge(nonce);
    if (!challenge || challenge.kind !== 'reg') return failed(400, 'registration failed');

    const auth = await requireAdmin(req, body);
    if (!auth.ok) return failed(auth.status, auth.error);

    // Re-checked here, not just at /register/options: the options endpoint is a
    // separate request and its verdict must not be the only thing standing
    // between a caller and a stored credential.
    const blocked = enrollmentBlockedReason(auth, await countCredentials());
    if (blocked) return failed(403, blocked);

    const { rpID, origins } = getRelyingParty(req);

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch {
      return failed(400, 'registration failed');
    }

    if (!verification.verified || !verification.registrationInfo) {
      return failed(400, 'registration failed');
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    if (await getCredential(credential.id)) {
      return failed(409, 'this device is already enrolled');
    }

    await saveCredential({
      id: credential.id,
      // base64url, never the raw Uint8Array — see lib/webauthn/store.ts.
      publicKey: bytesToB64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? response.response.transports,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      label: sanitizeLabel(body.label),
      createdAt: Date.now(),
      lastUsedAt: null,
    });

    // Out-of-band alert: if this enrollment wasn't you, you find out now.
    await notifySecurityEvent(
      'a new passkey was enrolled',
      `A passkey was added to /keystatic.\n\n` +
        `label: ${sanitizeLabel(body.label)}\n` +
        `authorised via: ${auth.via}\n` +
        `${requestContext(req)}\n\n` +
        `If this wasn't you, rotate KEYSTATIC_SESSION_SECRET and KEYSTATIC_AUTH_PASSWORD on Vercel, then remove the device at /auth/keystatic/enroll.`
    );

    return NextResponse.json(
      { ok: true, id: credential.id },
      { headers: { 'Set-Cookie': clearChallengeCookie(), 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    if (isRedisUnavailable(err)) return jsonError(503, 'passkeys unavailable');
    return jsonError(503, 'enrollment unavailable');
  }
}
