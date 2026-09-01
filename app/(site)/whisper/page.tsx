'use client';

import { useEffect, useRef, useState } from 'react';
import { FOCUS_RING } from '@/lib/styles';

// No question bank here on purpose: it used to ship dob + personal answers to
// every visitor in the JS bundle. GET /api/whisper now hands out one question's
// text + opaque id, and the server checks the answer (see lib/whisper-quiz.ts).

export default function WhisperPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answered, setAnswered] = useState(false);
  const [wrongAnswer, setWrongAnswer] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [tokenReady, setTokenReady] = useState(false);
  const tokenRef = useRef<string>('');
  // Kept so the real submission can re-send it: the server is stateless and
  // re-validates the answer against the question id signed into the token.
  const acceptedAnswerRef = useRef<string>('');

  useEffect(() => {
    fetch('/api/whisper')
      .then((r) => r.json())
      .then((d) => {
        tokenRef.current = d.token ?? '';
        setQuestion(d.quiz?.question ?? '');
        setTokenReady(true);
      })
      .catch(() => setTokenReady(true));
  }, []);

  /** Error code from the API body ('too_soon' | 'expired' | 'invalid'), if any. */
  async function errorCode(res: Response): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    return body.code ?? '';
  }

  /** Fetch a fresh token + question. Returns null if the request failed. */
  async function fetchToken(): Promise<{
    token: string;
    question: string;
  } | null> {
    try {
      const d = await fetch('/api/whisper').then((r) => r.json());
      if (!d?.token) return null;
      tokenRef.current = d.token;
      return { token: d.token, question: d.quiz?.question ?? '' };
    } catch {
      return null;
    }
  }

  // The token carries a minimum age (anti-bot); answering faster than that gets
  // a 425, not a rejection of the answer. The answers are one word, so honest
  // users hit this routinely — wait out the remainder and retry once. The wait
  // is only a courtesy: the server re-checks the age against the signed
  // timestamp, so skipping it client-side gains nothing.
  async function postWhisper(body: Record<string, unknown>): Promise<Response> {
    const send = () =>
      fetch('/api/whisper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const res = await send();
    if (res.status !== 425) return res;
    const { retryAfterMs } = (await res.json().catch(() => ({}))) as {
      retryAfterMs?: number;
    };
    // Honour whatever the server asked for (ceiling only as a sanity bound): a
    // retry that fires EARLY just gets another 425 and surfaces as an error, so
    // this must not undercut a future increase in the server's minimum age.
    const waitMs = Math.min(Math.max(retryAfterMs ?? 3000, 0), 10_000) + 150; // +skew
    await new Promise((r) => setTimeout(r, waitMs));
    return send();
  }

  function handleAnswerChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAnswer(e.target.value);
    setWrongAnswer(false);
    setCheckError(false);
  }

  // Validation moved server-side, so this is a round-trip. A wrong answer is
  // free: it burns neither the token nor a submission slot.
  async function handleAnswerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || checking) return;
    setChecking(true);
    setWrongAnswer(false);
    setCheckError(false);
    try {
      const check = {
        quizOnly: true,
        quizAnswer: answer,
        token: tokenRef.current,
      };
      const res = await postWhisper(check);
      if (res.ok) {
        acceptedAnswerRef.current = answer;
        setAnswered(true);
        return;
      }
      // Only an explicit 'wrong_answer' means the answer was wrong. A token
      // problem is not the user's fault and must never render as "wrong."
      const code = await errorCode(res);
      if (code === 'expired') {
        // Tab left open past the 30-min token TTL. Refresh silently rather than
        // calling a correct answer wrong — but the question rotates hourly, so
        // only re-check this answer if it's still the same question.
        const fresh = await fetchToken();
        if (!fresh) {
          setCheckError(true);
        } else if (fresh.question !== question) {
          setQuestion(fresh.question);
          setAnswer('');
        } else {
          const retry = await postWhisper({ ...check, token: fresh.token });
          if (retry.ok) {
            acceptedAnswerRef.current = answer;
            setAnswered(true);
          } else if ((await errorCode(retry)) === 'wrong_answer') {
            setWrongAnswer(true);
          } else {
            setCheckError(true);
          }
        }
      } else if (code === 'wrong_answer') {
        setWrongAnswer(true);
      } else {
        setCheckError(true);
      }
    } catch {
      setCheckError(true);
    } finally {
      setChecking(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || text.trim().length < 5) return;
    setState('sending');
    try {
      // Same 425 handling. No silent token refresh here: the token is burned on
      // success, and a refreshed one may carry a different question, so the
      // answer would have to be re-taken — surface the error instead.
      const res = await postWhisper({
        message: text.trim(),
        _trap: '',
        token: tokenRef.current,
        quizAnswer: acceptedAnswerRef.current,
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <div>
        <h1 className="font-medium text-2xl mb-2 tracking-tight">whisper</h1>
        {/* The whole form is replaced by this view, so no pre-existing live
            region survives to announce into. role="status" (implicit polite
            live region) on the inserted confirmation is the WCAG 4.1.3 pattern
            for success messages. */}
        <p role="status" className="text-gray-500 dark:text-zinc-400 text-sm">
          sent :)
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Static heading. This used to render {question}, which is an empty <h1>
          until the fetch resolves and disappears entirely once answered — an
          empty/vanishing heading is an accessibility failure. The question is
          body copy now, and describes the input. */}
      <h1 className={`font-medium text-2xl tracking-tight ${answered ? 'mb-8' : 'mb-2'}`}>
        whisper
      </h1>
      {!answered && (
        <p
          id="whisper-question"
          className="text-gray-600 dark:text-zinc-400 mb-8 tracking-tight"
        >
          {question}
        </p>
      )}

      {!answered ? (
        <form onSubmit={handleAnswerSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={answer}
            onChange={handleAnswerChange}
            placeholder="your answer"
            aria-label="answer the question"
            aria-describedby={question ? 'whisper-question' : undefined}
            autoComplete="off"
            className={`w-full bg-transparent border-b border-gray-200 dark:border-zinc-800 pb-2 text-sm text-gray-800 dark:text-zinc-200 placeholder-gray-500 dark:placeholder-zinc-500 focus:border-gray-400 dark:focus:border-zinc-600 transition-colors ${FOCUS_RING}`}
          />
          <div className="flex items-center justify-between">
            {/* This slot always rendered a span (empty when no error), so the
                live region can exist before the message does — text swapped
                into an already-mounted region is what screen readers announce
                most reliably (WCAG 4.1.3). role="alert" (assertive) because
                both messages are errors blocking the user's current task. */}
            <span role="alert" className="text-xs text-red-600 dark:text-red-400">
              {wrongAnswer
                ? 'wrong.'
                : checkError
                  ? 'something went wrong. try again.'
                  : null}
            </span>
            <button
              type="submit"
              disabled={!tokenReady || !answer.trim() || checking}
              className={`text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 disabled:opacity-30 transition-colors tracking-tight ${FOCUS_RING}`}
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
            className={`w-full bg-transparent border border-gray-200 dark:border-zinc-800 rounded-lg p-4 text-sm text-gray-800 dark:text-zinc-200 placeholder-gray-500 dark:placeholder-zinc-500 resize-none focus:border-gray-400 dark:focus:border-zinc-600 transition-colors leading-relaxed ${FOCUS_RING}`}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-zinc-400">
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
              className={`text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 disabled:opacity-30 transition-colors tracking-tight ${FOCUS_RING}`}
            >
              {state === 'sending' ? 'sending...' : 'send →'}
            </button>
          </div>
          {/* Conditional mount rather than a persistent region: an always-
              rendered empty <p> would add a phantom gap-4 slot below the send
              row. role="alert" is announced on insertion into the DOM, which
              covers the mount case. */}
          {state === 'error' && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              something went wrong. try again.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
