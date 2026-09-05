// SERVER ONLY. Password-gated lines for /sidequests.
//
// The ciphertext never leaves the server: it lives in the REDACTED_LINES env
// var, and app/api/redact/route.ts decrypts it only when the reader's password
// derives the right key. A reader who never sees the ciphertext cannot brute
// force it offline, which turns "how strong is the password" into "how many
// guesses does the rate limiter allow" (a few per IP, a few dozen globally).
//
// KDF is scrypt (memory-hard, ships in node:crypto, so no dependency): 128 MiB
// per guess makes GPU/ASIC guessing expensive even if the ciphertext leaked.
// Cipher is AES-256-GCM; the auth tag rejects a wrong password outright, so
// there is no partial plaintext and no oracle beyond pass/fail.
import { randomBytes, scrypt, createCipheriv, createDecipheriv } from 'node:crypto';
import { z } from 'zod';

export const redactedPayloadSchema = z.object({
  /** base64, 16 bytes */
  salt: z.string().min(1),
  /** base64, 12 bytes */
  iv: z.string().min(1),
  /** base64, ciphertext + 16-byte GCM tag */
  data: z.string().min(1),
});
export type RedactedPayload = z.output<typeof redactedPayloadSchema>;

/** `{ [id]: payload }` — the shape of the REDACTED_LINES env var. */
export const redactedLinesSchema = z.record(
  z.string().regex(/^[a-z0-9-]{1,64}$/),
  redactedPayloadSchema
);
export type RedactedLines = z.output<typeof redactedLinesSchema>;

// N=2^17, r=8, p=1 → 128 MiB, ~150 ms on a laptop core. maxmem must exceed
// 128 * N * r bytes or node refuses.
const SCRYPT = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  // util.promisify drops the options overload, so wrap the callback by hand.
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, 32, SCRYPT, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function encryptLine(
  text: string,
  password: string
): Promise<RedactedPayload> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: data.toString('base64'),
  };
}

/** Resolves to the plaintext, or null when the password (or payload) is wrong. */
export async function decryptLine(
  payload: RedactedPayload,
  password: string
): Promise<string | null> {
  try {
    const salt = Buffer.from(payload.salt, 'base64');
    const iv = Buffer.from(payload.iv, 'base64');
    const data = Buffer.from(payload.data, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || data.length < 17) return null;
    const key = await deriveKey(password, salt);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(data.subarray(data.length - 16));
    const plain = Buffer.concat([
      decipher.update(data.subarray(0, data.length - 16)),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Parse a REDACTED_LINES value. Malformed input yields an empty map, so the
 * route fails closed (every id unknown → 401) rather than throwing.
 */
export function parseRedactedLines(raw: string | undefined): RedactedLines {
  if (!raw) return {};
  try {
    const result = redactedLinesSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}
