// Pure helpers for the PostHog client in instrumentation-client.ts. No
// posthog import here so tests can load this without a browser.

/**
 * Route prefixes that never reach PostHog: the CMS, its login, APIs, and the
 * anonymous whisper form. Masking inputs is not enough for /whisper; a replay
 * still ties mouse movement, referrer and timing to a message meant to be
 * anonymous, so nothing on that route is captured.
 */
export const UNTRACKED_PREFIXES = ['/keystatic', '/auth', '/api', '/whisper'] as const;

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

/** The slice of the posthog-js client the recorder switch needs. */
export type RecordingControl = {
  startSessionRecording(): void;
  stopSessionRecording(): void;
};

/**
 * Point the recorder at the current route. Called at init and on every
 * client-side navigation: the App Router never reloads the page, so a
 * one-time check at load would keep recording through a link into
 * /keystatic, or stay off for good after landing there first.
 */
export function syncSessionRecording(client: RecordingControl, pathname: string): void {
  if (isTrackedPath(pathname)) client.startSessionRecording();
  else client.stopSessionRecording();
}
