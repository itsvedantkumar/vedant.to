/**
 * Whisper gate question bank — SERVER ONLY.
 *
 * The bank lives in the `WHISPER_QUIZ` env var, not in this file, because the
 * answers are personal data (dob, tastes). Keeping them out of the repo is what
 * makes the repo safe to publish. Importing this module from a `'use client'`
 * component would still inline the *parsed* bank into the public JS bundle, so
 * only `app/api/whisper/route.ts` may import it. (No `server-only` import: that
 * package is only a transitive dep here, so relying on it would be fragile.)
 *
 * Format: a JSON array of `{ id, question, answers }`. `id` is opaque and
 * stable — it travels to the client inside the signed token so POST can recover
 * which question was asked, and it reveals nothing about the answer. Changing an
 * id invalidates tokens already in flight that carry it, which is harmless: the
 * client just gets a fresh question.
 *
 * There is deliberately no built-in fallback bank. A missing or malformed var
 * yields an empty bank, and the route turns that into a 503 — failing closed is
 * correct, since a default bank would be a publicly-known gate that anyone
 * reading this repo could walk straight through.
 */

import { quizBankSchema, rawQuizBank } from '@/lib/env';

export type QuizQuestion = {
  readonly id: string;
  readonly question: string;
  readonly answers: readonly string[];
};

/**
 * The bank is operator input, so it is parsed by a schema like any other
 * external value (lib/env.ts: quizBankSchema — non-empty array, non-empty
 * fields, unique ids). Any failure yields an empty bank, never a partial one:
 * partial acceptance would silently shrink the bank and skew the index
 * questionForClient() derives from QUIZ_COUNT.
 */
function loadQuiz(): readonly QuizQuestion[] {
  const raw = rawQuizBank();
  if (!raw) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    console.error('[whisper] WHISPER_QUIZ is not valid JSON — gate disabled');
    return [];
  }
  const parsed = quizBankSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      '[whisper] WHISPER_QUIZ is malformed — gate disabled:',
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    );
    return [];
  }
  return parsed.data;
}

const QUIZ = loadQuiz();

/** Size of the bank — callers derive an index from it. 0 means unconfigured. */
export const QUIZ_COUNT = QUIZ.length;

/**
 * Pick by index, wrapping. Lets the caller choose the question *deterministically*
 * (per client, per time window) instead of at random, so re-requesting a question
 * returns the same one and can't be re-rolled until the easiest one comes up.
 */
export function questionAt(index: number): QuizQuestion | undefined {
  if (QUIZ.length === 0) return undefined;
  return QUIZ[(((index % QUIZ.length) + QUIZ.length) % QUIZ.length) | 0];
}

/** Fallback when there's nothing stable to derive an index from (no client key). */
export function randomQuestion(): QuizQuestion | undefined {
  if (QUIZ.length === 0) return undefined;
  return QUIZ[Math.floor(Math.random() * QUIZ.length)];
}

/** Look up by the id recovered from a verified token. */
export function findQuestion(id: string): QuizQuestion | undefined {
  return QUIZ.find((q) => q.id === id);
}

/** Same normalization the client used to do: trim, lowercase, collapse whitespace. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Both sides go through normalize() so stored whitespace can't make a question unanswerable. */
export function isCorrectAnswer(input: string, q: QuizQuestion): boolean {
  const normalized = normalize(input);
  if (!normalized) return false;
  return q.answers.some((a) => normalize(a) === normalized);
}
