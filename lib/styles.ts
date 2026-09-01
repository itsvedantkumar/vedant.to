/**
 * Shared Tailwind class strings.
 *
 * FOCUS_RING lived as two identical copies, in app/(site)/layout.tsx and
 * app/(site)/whisper/page.tsx, with a comment explaining that the copy existed
 * to keep the server layout out of the client bundle. A plain string constant
 * does that too: this module has no imports and no runtime, so importing it
 * from a client component pulls in nothing but the string.
 *
 * One definition matters beyond tidiness. app/auth/keystatic/page.tsx used no
 * focus ring at all and set focus:outline-none on its password input, which
 * removed the browser's own indicator and left keyboard users with nothing.
 * Copies do not get audited; a shared constant does.
 */
export const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 rounded-sm';
