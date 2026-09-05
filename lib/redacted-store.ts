'use client';

/**
 * Every redacted line on a page shares one password, so one unlock opens all
 * of them: /api/redact answers with every line that password decrypts, and
 * this store hands those texts to whichever <Redacted> instances are mounted.
 *
 * A module-level store rather than context: the page holding the strips is a
 * server component and the instances are unrelated siblings, so there is no
 * shared client parent to put a provider on.
 *
 * Not persisted. A reload re-seals every line, which is what makes the
 * once-per-reader-per-day unlock notice worth deduping (see lib/redact-notify).
 */

let revealed: Record<string, string> = {};
const listeners = new Set<() => void>();

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The plaintext for one line, or null while it is still sealed. */
export function getRevealed(id: string): string | null {
  return revealed[id] ?? null;
}

/** Nothing is revealed during SSR, so the server always renders the strip. */
export function getSealed(): null {
  return null;
}

export function revealAll(texts: Record<string, string>): void {
  revealed = { ...revealed, ...texts };
  for (const listener of listeners) listener();
}
