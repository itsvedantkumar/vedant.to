// Pure helpers for the PostHog client in instrumentation-client.ts. No
// posthog import here so tests can load this without a browser.

/** Route prefixes that never reach PostHog: the CMS, its login, and APIs. */
export const UNTRACKED_PREFIXES = ['/keystatic', '/auth', '/api'] as const;

/** True for public pages worth analytics and replay; false for admin paths. */
export function isTrackedPath(pathname: string): boolean {
  return !UNTRACKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Pathname of an absolute URL, or null when it does not parse. */
export function pathnameOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}
