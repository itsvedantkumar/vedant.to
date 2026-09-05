'use client';

/**
 * Every redacted line on a page shares one password, so one unlock earns the
 * whole set: /api/redact answers with every line that password decrypts and
 * this store holds them.
 *
 * Earning a line is not the same as showing it. A reader who unlocks one
 * bullet should not have the rest of the page dumped on them at once, so the
 * other strips stay strips. They just stop asking for the password, and open
 * on a click.
 *
 * A module-level store rather than context: the page holding the strips is a
 * server component and the instances are unrelated siblings, so there is no
 * shared client parent to put a provider on.
 *
 * Not persisted. A reload re-seals every line, which is what makes the
 * once-per-reader-per-day unlock notice worth deduping (see lib/redact-notify).
 */

/** Lines the password has bought, whether or not they are on screen yet. */
let known: Record<string, string> = {};
/** The subset the reader has actually opened. */
let shown: Record<string, string> = {};
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The plaintext on screen for one line, or null while it is still a strip. */
export function getShown(id: string): string | null {
  return shown[id] ?? null;
}

/** The plaintext this reader has earned but not yet opened, or null. */
export function getKnown(id: string): string | null {
  return known[id] ?? null;
}

/** Nothing is known or shown during SSR, so the server renders every strip. */
export function getSealed(): null {
  return null;
}

/**
 * Bank every line the password opened, and put only the one the reader asked
 * for on screen.
 */
export function learn(texts: Record<string, string>, reveal: string): void {
  known = { ...known, ...texts };
  const text = known[reveal];
  if (text !== undefined) shown = { ...shown, [reveal]: text };
  emit();
}

/** Open a line already paid for. No-op for one that is not. */
export function show(id: string): void {
  const text = known[id];
  if (text === undefined || shown[id] !== undefined) return;
  shown = { ...shown, [id]: text };
  emit();
}
