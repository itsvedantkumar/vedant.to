import type { SessionPayload } from '@/lib/auth/session';

export type EnrollmentAuth = {
  via: 'session' | 'password' | 'token';
  session: SessionPayload | null;
};

/**
 * Who may add a new passkey. Pure policy, no I/O — kept in its own module so it
 * stays directly testable.
 *
 * The break-glass password is deliberately NOT enough once a passkey exists.
 * Otherwise a leaked or guessed password would let someone mint their own
 * permanent credential — a foothold that survives rotating the password. So:
 *
 *   - zero passkeys enrolled  → password/token bootstrap is allowed
 *   - one or more enrolled    → only a session that was itself proved by a
 *                               passkey, or KEYSTATIC_ENROLL_TOKEN
 *
 * Losing every device is therefore recovered by setting KEYSTATIC_ENROLL_TOKEN
 * on Vercel — something only the account owner can do.
 */
export function enrollmentBlockedReason(
  auth: EnrollmentAuth,
  existingCredentials: number
): string | null {
  if (existingCredentials === 0) return null;
  if (auth.via === 'token') return null;
  if (auth.via === 'session' && auth.session?.m === 'passkey') return null;
  return 'adding a device requires unlocking with an existing passkey first';
}

/**
 * Who may delete a passkey that is the last remaining one. Password must not
 * empty the set: that reopens enrollmentBlockedReason's zero-credential
 * bootstrap and turns a leaked password into a durable attacker passkey.
 */
export function lastCredentialDeleteBlockedReason(auth: EnrollmentAuth): string | null {
  if (auth.via === 'token') return null;
  if (auth.via === 'session' && auth.session?.m === 'passkey') return null;
  return 'removing the last passkey requires unlocking with an existing passkey first';
}

/** Passkey-mode CMS: only a session proved by a passkey. Password cookies are login, not git writes. */
export function sessionOpensCms(
  authMode: 'passkey' | 'basic',
  method: SessionPayload['m'] | undefined
): boolean {
  if (authMode === 'basic') return false;
  return method === 'passkey';
}

/**
 * Route-level CMS gate. Password-shaped sessions are not git writes.
 * Explicit password (Basic/body) remains break-glass. Enroll token is enrollment-only.
 */
export function cmsAccessBlockedReason(
  authMode: 'passkey' | 'basic',
  auth: EnrollmentAuth
): string | null {
  if (authMode === 'basic') {
    if (auth.via === 'password' || auth.via === 'session') return null;
    return 'unauthorized';
  }
  if (auth.via === 'session' && auth.session?.m === 'passkey') return null;
  if (auth.via === 'password') return null;
  return 'CMS requires a passkey session';
}
