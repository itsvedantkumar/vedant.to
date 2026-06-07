'use client';

import { useEffect, useRef, useState } from 'react';

const QUIZ = [
  // redacted: personal quiz bank purged from history; the live bank comes from the WHISPER_QUIZ env var

];

function checkAnswer(input: string, answers: string[]): boolean {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  return answers.some((a) => a.toLowerCase() === normalized);
}

export default function WhisperPage() {
  const [quizIdx, setQuizIdx] = useState(-1);
  const [answer, setAnswer] = useState('');
  const [answered, setAnswered] = useState(false);
  const [wrongAnswer, setWrongAnswer] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [tokenReady, setTokenReady] = useState(false);
  const tokenRef = useRef<string>('');

  useEffect(() => {
    setQuizIdx(Math.floor(Math.random() * QUIZ.length));
    fetch('/api/whisper')
      .then((r) => r.json())
      .then((d) => {
        tokenRef.current = d.token ?? '';
        setTokenReady(true);
      })
      .catch(() => setTokenReady(true));
  }, []);

  const quiz = quizIdx >= 0 ? QUIZ[quizIdx] : null;
  const question = quiz?.question ?? '';

  function handleAnswerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setAnswer(val);
    setWrongAnswer(false);
    if (quiz && checkAnswer(val, quiz.answers)) {
      setAnswered(true);
    }
  }

  function handleAnswerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quiz && checkAnswer(answer, quiz.answers)) {
      setAnswered(true);
    } else {
      setWrongAnswer(true);
    }
  }

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
        <p className="text-gray-500 dark:text-zinc-400 text-sm">sent :)</p>
      </div>
    );
  }

  return (
    <div>
      {!answered && (
        <h1 className="font-medium text-2xl mb-8 tracking-tight">{question}</h1>
      )}

      {!answered ? (
        <form onSubmit={handleAnswerSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={answer}
            onChange={handleAnswerChange}
            placeholder="your answer"
            aria-label="answer the question"
            autoComplete="off"
            className="w-full bg-transparent border-b border-gray-200 dark:border-zinc-800 pb-2 text-sm text-gray-800 dark:text-zinc-200 placeholder-gray-300 dark:placeholder-zinc-700 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-600 transition-colors"
          />
          <div className="flex items-center justify-between">
            {wrongAnswer ? (
              <span className="text-xs text-red-400">wrong.</span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={!answer.trim()}
              className="text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-zinc-100 disabled:opacity-30 transition-colors tracking-tight"
            >
              submit →
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="whisper something to me"
            aria-label="your message"
            rows={6}
            maxLength={1000}
            autoFocus
            className="w-full bg-transparent border border-gray-200 dark:border-zinc-800 rounded-lg p-4 text-sm text-gray-800 dark:text-zinc-200 placeholder-gray-300 dark:placeholder-zinc-700 resize-none focus:outline-none focus:border-gray-400 dark:focus:border-zinc-600 transition-colors leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 dark:text-zinc-700">
              {text.length}/1000
            </span>
            <button
              type="submit"
              disabled={
                !tokenReady ||
                !text.trim() ||
                text.trim().length < 5 ||
                state === 'sending'
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
      )}
    </div>
  );
}
