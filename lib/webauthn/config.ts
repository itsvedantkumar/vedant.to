/**
 * Relying-party identity + capability checks for the /keystatic passkey gate.
 * Node runtime only (imported by app/api/auth/**).
 */

import { redis } from '@/lib/redis';
import { authEnv, runtimeEnv } from '@/lib/env';
import { SITE_HOST, SITE_NAME } from '@/lib/constants';

const PROD_RP_ID = authEnv().KEYSTATIC_RP_ID || SITE_HOST;

/**
 * Single admin, forever — so every passkey shares one user handle and the OS
 * groups them under a single entry. Changing this orphans existing passkeys in
 * the OS UI (they still verify; lookup is by credential id, not user handle).
 */
export const WEBAUTHN_USER_ID = new TextEncoder().encode('keystatic-admin');
export const WEBAUTHN_USER_NAME = `admin@${SITE_HOST}`;
export const WEBAUTHN_USER_DISPLAY_NAME = SITE_NAME;

export type RelyingParty = {
  rpID: string;
  rpName: string;
  origins: string[];
};

/**
 * rpID and expected origins are pinned per environment — never derived from the
 * Host header in production, which an attacker controls on some edge configs.
 * Origin comparison in @simplewebauthn is a literal string match, so entries
 * must be exact and unslashed.
 */
export function getRelyingParty(req: {
  headers: { get(name: string): string | null };
}): RelyingParty {
  const rpName = SITE_NAME;

  const { VERCEL_ENV, VERCEL_URL } = runtimeEnv();

  if (VERCEL_ENV === 'production') {
    return { rpID: PROD_RP_ID, rpName, origins: [`https://${PROD_RP_ID}`] };
  }

  if (VERCEL_ENV === 'preview') {
    const host = req.headers.get('x-forwarded-host') ?? VERCEL_URL ?? '';
    // Only trust the forwarded host on preview, and only for vercel.app domains.
    if (host.endsWith('.vercel.app')) {
      return { rpID: host, rpName, origins: [`https://${host}`] };
    }
    return { rpID: PROD_RP_ID, rpName, origins: [`https://${PROD_RP_ID}`] };
  }

  return {
    rpID: 'localhost',
    rpName,
    origins: ['http://localhost:3000', 'http://localhost:3001'],
  };
}

export function isPasswordConfigured(): boolean {
  return Boolean(authEnv().KEYSTATIC_AUTH_PASSWORD);
}

/** Passkeys need Redis for credential + challenge storage. */
export function isPasskeysAvailable(): boolean {
  return redis !== null;
}
