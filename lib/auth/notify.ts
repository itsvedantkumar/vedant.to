/**
 * Out-of-band alerts for anything that changes who can reach /keystatic.
 * Best-effort: never throws, never blocks the caller's result.
 * Node runtime only.
 */

import { Resend } from 'resend';
import { getTrustedIP } from '@/lib/request';
import { mailEnv } from '@/lib/env';
import { SECURITY_EMAIL, SITE_HOST } from '@/lib/constants';

const apiKey = mailEnv().RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

export async function notifySecurityEvent(subject: string, text: string): Promise<void> {
  const mail = mailEnv();
  const toEmail = mail.KEYSTATIC_ALERT_EMAIL ?? mail.WHISPER_TO_EMAIL;
  if (!resend || !toEmail) return;
  await resend.emails
    .send({
      from: SECURITY_EMAIL,
      to: toEmail,
      subject: `[${SITE_HOST}] ${subject}`,
      text,
    })
    .catch((err: unknown) => {
      console.error('[keystatic-auth] alert email failed:', err);
    });
}

/**
 * Where the platform describes the caller. Vercel resolves these at the edge
 * from the connecting address, so a client cannot set them.
 */
const GEO_HEADERS = [
  'x-vercel-ip-city',
  'x-vercel-ip-country-region',
  'x-vercel-ip-country',
] as const;

/**
 * City names arrive percent-encoded ("New%20Delhi"). A malformed value throws
 * out of decodeURIComponent, and an alert is the worst place to raise.
 */
function decodeGeo(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Context line appended to every alert so an unexpected one is actionable. */
export function requestContext(req: {
  headers: { get(name: string): string | null };
}): string {
  const ip = getTrustedIP(req);
  const ua = req.headers.get('user-agent') ?? 'unknown';

  const place = GEO_HEADERS.map((h) => req.headers.get(h)?.trim())
    .filter((v): v is string => !!v)
    .map(decodeGeo);
  const tz = req.headers.get('x-vercel-ip-timezone')?.trim();

  const lines = [`ip: ${ip}`];
  // Omitted rather than reported as 'unknown': off-platform (local dev) there
  // is no geo to report, and a line of unknowns reads like a failure.
  if (place.length) {
    lines.push(`where: ${place.join(', ')}${tz ? ` (${tz})` : ''}`);
  }
  lines.push(`user-agent: ${ua}`, `at: ${new Date().toISOString()}`);
  return lines.join('\n');
}
