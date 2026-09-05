'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { getRevealed, getSealed, revealAll, subscribe } from '@/lib/redacted-store';

type Phase = 'sealed' | 'asking' | 'checking';
type Miss = 'wrong' | 'slow' | 'down';

/** What one round trip to /api/redact came back with. */
type Attempt =
  { kind: 'opened'; texts: Record<string, string> } | { kind: 'missed'; miss: Miss };

const MISS_TEXT: Record<Miss, string> = {
  wrong: 'nope.',
  slow: 'too many tries. come back in an hour.',
  down: 'unavailable right now.',
};

/** `{ texts: { id: line } }` — every line the password opened. */
function parseTexts(body: unknown): Record<string, string> | null {
  if (typeof body !== 'object' || body === null || !('texts' in body)) return null;
  const { texts } = body;
  if (typeof texts !== 'object' || texts === null) return null;
  const entries = Object.entries(texts).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * A line that only the server can reveal. The ciphertext is not in the page;
 * the password goes to /api/redact, which answers with every line that
 * password opens, or a 401.
 *
 * Every line shares one password, so a single unlock opens all of them: the
 * response carries every line it fits, and lib/redacted-store hands each one
 * to its instance. Nobody types the password twice.
 */
export function Redacted({ id }: { id: string }) {
  const [phase, setPhase] = useState<Phase>('sealed');
  const [password, setPassword] = useState('');
  const [miss, setMiss] = useState<Miss | null>(null);
  const text = useSyncExternalStore(subscribe, () => getRevealed(id), getSealed);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on open and again after a miss: the input is read-only (not
  // disabled) while checking so it never drops focus mid-flow.
  useEffect(() => {
    if (phase === 'asking') inputRef.current?.focus();
  }, [phase]);

  async function attempt(): Promise<Attempt> {
    try {
      const res = await fetch('/api/redact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      if (res.status === 401) return { kind: 'missed', miss: 'wrong' };
      if (res.status === 429) return { kind: 'missed', miss: 'slow' };
      if (!res.ok) return { kind: 'missed', miss: 'down' };
      const texts = parseTexts(await res.json());
      // A 200 the client cannot read is as good as no answer.
      return texts ? { kind: 'opened', texts } : { kind: 'missed', miss: 'down' };
    } catch {
      return { kind: 'missed', miss: 'down' };
    }
  }

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase('checking');
    const outcome = await attempt();
    if (outcome.kind === 'opened') {
      // Reveals this line and every sibling at once.
      revealAll(outcome.texts);
      return;
    }
    setMiss(outcome.miss);
    setPassword('');
    setPhase('asking');
  }

  if (text !== null) {
    return <span className="redacted-reveal">{text}</span>;
  }

  if (phase === 'sealed') {
    return (
      <button
        type="button"
        onClick={() => setPhase('asking')}
        className="redacted-strip"
        aria-label="Redacted. Click to enter the password."
      >
        <span className="redacted-strip-label">redacted · click to unlock</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={unlock}
      className="inline-flex flex-wrap items-center gap-2 align-middle"
    >
      <label htmlFor={inputId} className="sr-only">
        Password
      </label>
      <input
        id={inputId}
        type="password"
        autoComplete="off"
        ref={inputRef}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setMiss(null);
        }}
        placeholder="password"
        readOnly={phase === 'checking'}
        className={`redacted-input ${miss === 'wrong' ? 'redacted-input-wrong' : ''}`}
        aria-invalid={miss === 'wrong'}
        aria-describedby={miss ? `${inputId}-hint` : undefined}
      />
      <button
        type="submit"
        disabled={phase === 'checking' || password.length === 0}
        className="redacted-strip redacted-strip-sm"
      >
        <span className="redacted-strip-label">
          {phase === 'checking' ? 'checking…' : 'unlock'}
        </span>
      </button>
      {miss && (
        <span id={`${inputId}-hint`} className="text-sm text-red-600 dark:text-red-400">
          {MISS_TEXT[miss]}
        </span>
      )}
    </form>
  );
}
