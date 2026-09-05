'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { decryptRedacted, type RedactedPayload } from '@/lib/redact';

type Phase = 'sealed' | 'asking' | 'checking' | 'open';

export function Redacted({ payload }: { payload: RedactedPayload }) {
  const [phase, setPhase] = useState<Phase>('sealed');
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on open and again after a miss: disabling the input while checking
  // blurs it, and the reader should not have to click back into it.
  useEffect(() => {
    if (phase === 'asking') inputRef.current?.focus();
  }, [phase]);

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase('checking');
    const plain = await decryptRedacted(payload, password);
    if (plain === null) {
      setWrong(true);
      setPassword('');
      setPhase('asking');
      return;
    }
    setText(plain);
    setPhase('open');
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
          setWrong(false);
        }}
        placeholder="password"
        readOnly={phase === 'checking'}
        className={`redacted-input ${wrong ? 'redacted-input-wrong' : ''}`}
        aria-invalid={wrong}
        aria-describedby={wrong ? `${inputId}-hint` : undefined}
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
      {wrong && (
        <span id={`${inputId}-hint`} className="text-sm text-red-600 dark:text-red-400">
          nope.
        </span>
      )}
    </form>
  );
}
