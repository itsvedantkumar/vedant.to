/**
 * Out-of-band alerts for anything that changes who can reach /keystatic.
 * Best-effort: never throws, never blocks the caller's result.
 * Node runtime only.
 */

import { Resend } from 'resend';
import { getTrustedIP } from '@/lib/request';
import { mailEnv } from '@/lib/env';

const apiKey = mailEnv().RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

export async function notifySecurityEvent(subject: string, text: string): Promise<void> {
  const mail = mailEnv();
  const toEmail = mail.KEYSTATIC_ALERT_EMAIL ?? mail.WHISPER_TO_EMAIL;
  if (!resend || !toEmail) return;
  await resend.emails
    .send({
      from: 'security@vedant.to',
      to: toEmail,
      subject: `[vedant.to] ${subject}`,
      text,
    })
    .catch((err: unknown) => {
      console.error('[keystatic-auth] alert email failed:', err);
    });
}

/** Context line appended to every alert so an unexpected one is actionable. */
export function requestContext(req: {
  headers: { get(name: string): string | null };
}): string {
  const ip = getTrustedIP(req);
  const ua = req.headers.get('user-agent') ?? 'unknown';
  return `ip: ${ip}\nuser-agent: ${ua}\nat: ${new Date().toISOString()}`;
}
