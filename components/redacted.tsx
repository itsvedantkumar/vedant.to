'use client';

import { useEffect, useId, useRef, useState } from 'react';

type Phase = 'sealed' | 'asking' | 'checking' | 'open';
type Miss = 'wrong' | 'slow' | 'down' | null;

const MISS_TEXT: Record<NonNullable<Miss>, string> = {
  wrong: 'nope.',
  slow: 'too many tries. come back in an hour.',
  down: 'unavailable right now.',
};

/**
 * A line that only the server can reveal. The ciphertext is not in the page;
 * the password goes to /api/redact, which answers with the text or a 401.
 */
export function Redacted({ id }: { id: string }) {
  const [phase, setPhase] = useState<Phase>('sealed');
  const [password, setPassword] = useState('');
  const [miss, setMiss] = useState<Miss>(null);
  const [text, setText] = useState<string | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on open and again after a miss: the input is read-only (not
  // disabled) while checking so it never drops focus mid-flow.
  useEffect(() => {
    if (phase === 'asking') inputRef.current?.focus();
  }, [phase]);

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase('checking');
    let outcome: Miss | { text: string } = 'down';
    try {
      const res = await fetch('/api/redact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      if (res.ok) {
        const body: unknown = await res.json();
        if (
          typeof body === 'object' &&
          body !== null &&
          'text' in body &&
          typeof body.text === 'string'
        ) {
          outcome = { text: body.text };
        }
      } else if (res.status === 401) {
        outcome = 'wrong';
      } else if (res.status === 429) {
        outcome = 'slow';
      }
    } catch {
      outcome = 'down';
    }
    if (typeof outcome === 'object') {
      setText(outcome.text);
      setPhase('open');
      return;
    }
    setMiss(outcome);
    setPassword('');
    setPhase('asking');
  }

  if (phase === 'open' && text !== null) {
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
