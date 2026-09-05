// Client-side redaction. Text is encrypted at build time with a key derived
// from a password (PBKDF2-SHA256 → AES-256-GCM); only the ciphertext ships in
// the bundle. The browser derives the same key from whatever the reader types,
// and AES-GCM's auth tag rejects a wrong password, so there is no oracle to
// compare against. Node 22 and every evergreen browser expose the same
// `crypto.subtle`, so this module runs in both.

export type RedactedPayload = {
  /** base64, 16 bytes */
  salt: string;
  /** base64, 12 bytes */
  iv: string;
  /** base64, ciphertext + GCM tag */
  data: string;
};

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 floor for PBKDF2-SHA256

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptRedacted(
  text: string,
  password: string
): Promise<RedactedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  );
  return { salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

/** Resolves to the plaintext, or null when the password (or payload) is wrong. */
export async function decryptRedacted(
  payload: RedactedPayload,
  password: string
): Promise<string | null> {
  try {
    const key = await deriveKey(password, fromBase64(payload.salt));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.data)
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
