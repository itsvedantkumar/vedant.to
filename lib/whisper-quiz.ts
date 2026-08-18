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

export type QuizQuestion = {
  readonly id: string;
  readonly question: string;
  readonly answers: readonly string[];
};

function isQuestion(v: unknown): v is QuizQuestion {
  if (typeof v !== 'object' || v === null) return false;
  const q = v as Record<string, unknown>;
  return (
    typeof q.id === 'string' &&
    q.id.length > 0 &&
    typeof q.question === 'string' &&
    q.question.length > 0 &&
    Array.isArray(q.answers) &&
    q.answers.length > 0 &&
    q.answers.every((a) => typeof a === 'string' && a.trim().length > 0)
  );
}

function loadQuiz(): readonly QuizQuestion[] {
  const raw = process.env.WHISPER_QUIZ;
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('[whisper] WHISPER_QUIZ is not valid JSON — gate disabled');
    return [];
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.error('[whisper] WHISPER_QUIZ must be a non-empty array — gate disabled');
    return [];
  }
  const questions = parsed.filter(isQuestion);
  if (questions.length !== parsed.length) {
    // Partial acceptance would silently shrink the bank and skew the derived
    // index, so treat any malformed entry as a config error.
    console.error('[whisper] WHISPER_QUIZ has malformed entries — gate disabled');
    return [];
  }
  const ids = new Set(questions.map((q) => q.id));
  if (ids.size !== questions.length) {
    // findQuestion() resolves by id; duplicates would make it ambiguous.
    console.error('[whisper] WHISPER_QUIZ has duplicate ids — gate disabled');
    return [];
  }
  return questions;
}

const QUIZ = loadQuiz();

/** Size of the bank — callers derive an index from it. 0 means unconfigured. */
export const QUIZ_COUNT = QUIZ.length;

/** False when the bank is missing or malformed; the route answers 503. */
export function isQuizConfigured(): boolean {
  return QUIZ.length > 0;
}

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
export function isCorrectAnswer(input: string, q: QuizQuestion): boolean {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  return q.answers.some((a) => a.toLowerCase() === normalized);
}
