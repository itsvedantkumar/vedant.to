/**
 * Tells you when someone opens a redacted line.
 *
 * The reveal is not sticky: nothing is stored in the browser, so the same
 * reader unlocks the same line again on every reload. Mailing on each of those
 * would turn one visitor into a dozen notifications and the alert into noise,
 * so the first unlock of a line by an address wins and the rest of the day is
 * quiet.
 *
 * Dependencies are passed in rather than imported: the whole point of this
 * module is that it does not send twice, and that is only worth claiming if a
 * test can watch it not send twice.
 */

/** The slice of the Upstash client this needs. `set` resolves to 'OK' or null. */
export type NoticeStore = {
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<unknown>;
};

export type NoticeDeps = {
  /** Null when Redis is unconfigured, which in production is already a 503. */
  store: NoticeStore | null;
  send: (subject: string, text: string) => Promise<void>;
};

export type UnlockEvent = {
  /** The line the reader clicked, and the half of the dedup key that is not the address. */
  id: string;
  /** Caller address, the other half of the dedup key. */
  ip: string;
  /** Preformatted request context: address, user agent, timestamp. */
  context: string;
  /**
   * Every line the password opened, the clicked one included. One password
   * covers the whole page, so an unlock is one event and one mail, not one
   * per line. Defaults to just `id`.
   */
  opened?: string[];
};

export type NoticeOutcome = 'sent' | 'deduped' | 'failed';

/** One day. Long enough that a reader browsing around does not re-trigger. */
export const NOTICE_WINDOW_SECONDS = 60 * 60 * 24;

const SUBJECT = 'redacted line unlocked';

export async function announceUnlock(
  deps: NoticeDeps,
  event: UnlockEvent
): Promise<NoticeOutcome> {
  try {
    if (deps.store) {
      // NX makes claiming the window and checking it one round trip, so two
      // simultaneous unlocks cannot both decide they are the first.
      const claimed = await deps.store.set(
        `redact:notified:${event.id}:${event.ip}`,
        '1',
        { nx: true, ex: NOTICE_WINDOW_SECONDS }
      );
      if (claimed !== 'OK') return 'deduped';
    }
    const lines = event.opened?.length ? event.opened : [event.id];
    await deps.send(SUBJECT, `lines: ${lines.join(', ')}\n${event.context}`);
    return 'sent';
  } catch (err) {
    // Never surface: the reader has already been given the line, and failing
    // their unlock because an alert did not go out would be the wrong trade.
    console.error('[redact] unlock notice failed:', err);
    return 'failed';
  }
}
