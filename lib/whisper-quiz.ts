/**
 * Whisper gate question bank — SERVER ONLY.
 *
 * These answers are personal data (dob, tastes). Importing this module from a
 * `'use client'` component would inline it into the public JS bundle, which is
 * exactly the leak this file exists to prevent. Only `app/api/whisper/route.ts`
 * may import it. (No `server-only` import: that package is only a transitive
 * dep here, so relying on it would be fragile.)
 *
 * `id` is opaque and stable: it travels to the client inside the signed token
 * so POST can recover which question was asked, and it reveals nothing about
 * the answer.
 */

export type QuizQuestion = {
  readonly id: string;
  readonly question: string;
  readonly answers: readonly string[];
};

const QUIZ: readonly QuizQuestion[] = [
  // redacted: personal quiz bank purged from history; the live bank comes from the WHISPER_QUIZ env var

];

/** Size of the bank — callers derive an index from it. */
export const QUIZ_COUNT = QUIZ.length;

/**
 * Pick by index, wrapping. Lets the caller choose the question *deterministically*
 * (per client, per time window) instead of at random, so re-requesting a question
 * returns the same one and can't be re-rolled until the easiest one comes up.
 */
export function questionAt(index: number): QuizQuestion {
  return QUIZ[(((index % QUIZ.length) + QUIZ.length) % QUIZ.length) | 0];
}

/** Fallback when there's nothing stable to derive an index from (no client key). */
export function randomQuestion(): QuizQuestion {
  return QUIZ[Math.floor(Math.random() * QUIZ.length)];
}

/** Look up by the id recovered from a verified token. */
export function findQuestion(id: string): QuizQuestion | undefined {
  return QUIZ.find((q) => q.id === id);
}

/** Same normalization the client used to do: trim, lowercase, collapse whitespace. */
export function isCorrectAnswer(input: string, q: QuizQuestion): boolean {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  return q.answers.some((a) => a.toLowerCase() === normalized);
}
