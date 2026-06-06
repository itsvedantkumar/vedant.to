'use client';

import { useEffect, useRef, useState } from 'react';

const QUESTIONS = [
  "what's my favourite color?",
  "what's my fav movie?",
  "who's my fav director?",
  "what's my dob?",
];

export default function WhisperPage() {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [tokenReady, setTokenReady] = useState(false);
  const [question, setQuestion] = useState('');
  const tokenRef = useRef<string>('');

  // Fetch submission proof token on mount — proves page was loaded before submitting
  useEffect(() => {
    setQuestion(QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]);
    fetch('/api/whisper')
      .then((r) => r.json())
      .then((d) => {
        tokenRef.current = d.token ?? '';
        setTokenReady(true);
      })
      .catch(() => setTokenReady(true)); // fail-open in dev/offline
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || text.trim().length < 5) return;
    setState('sending');
    try {
      const res = await fetch('/api/whisper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          _trap: '',
          token: tokenRef.current,
        }),
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <div>
        <h1 className="font-medium text-2xl mb-6 tracking-tight">{question}</h1>
        <p className="text-gray-500 dark:text-zinc-400 text-sm">received.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-medium text-2xl mb-8 tracking-tight">{question}</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="whisper something to me"
          aria-label="your message"
          rows={6}
          maxLength={1000}
          className="w-full bg-transparent border border-gray-200 dark:border-zinc-800 rounded-lg p-4 text-sm text-gray-800 dark:text-zinc-200 placeholder-gray-300 dark:placeholder-zinc-700 resize-none focus:outline-none focus:border-gray-400 dark:focus:border-zinc-600 transition-colors leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-300 dark:text-zinc-700">
            {text.length}/1000
          </span>
          <button
            type="submit"
            disabled={
              !tokenReady || !text.trim() || text.trim().length < 5 || state === 'sending'
            }
            className="text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-zinc-100 disabled:opacity-30 transition-colors tracking-tight"
          >
            {state === 'sending' ? 'sending...' : 'send →'}
          </button>
        </div>
        {state === 'error' && (
          <p className="text-xs text-red-400">something went wrong. try again.</p>
        )}
      </form>
    </div>
  );
}
