// Covers lib/whisper-quiz.ts isCorrectAnswer — the comparison the /whisper gate
// funnels every submitted answer through. The bank is operator-supplied via the
// WHISPER_QUIZ env var, so an answer can arrive with stray whitespace or odd
// casing that no code review ever sees. Before this, only the submitted input
// was normalized and the stored answer was merely lowercased, which made an
// answer stored as ' black' unmatchable by any input at all — the question went
// silently unanswerable with no error raised anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCorrectAnswer, type QuizQuestion } from '@/lib/whisper-quiz';

const q = (answers: string[]): QuizQuestion => ({
  id: 'test',
  question: 'test?',
  answers,
});

test('matches an exact answer', () => {
  assert.equal(isCorrectAnswer('black', q(['black'])), true);
});

test('matches regardless of case on either side', () => {
  assert.equal(isCorrectAnswer('BLACK', q(['black'])), true);
  assert.equal(isCorrectAnswer('black', q(['BLACK'])), true);
});

test('matches any answer in the list, not just the first', () => {
  assert.equal(isCorrectAnswer('ak', q(['anurag kashyap', 'kashyap', 'ak'])), true);
});

test('rejects a wrong answer', () => {
  assert.equal(isCorrectAnswer('blue', q(['black'])), false);
});

test('ignores surrounding whitespace in the submitted input', () => {
  assert.equal(isCorrectAnswer('  black  ', q(['black'])), true);
});

// The regression this file exists for: the stored side gets the same treatment
// as the submitted side. A bank entry with stray whitespace stays answerable.
test('ignores surrounding whitespace in the stored answer', () => {
  assert.equal(isCorrectAnswer('black', q([' black '])), true);
});

test('collapses repeated internal whitespace on both sides', () => {
  assert.equal(isCorrectAnswer('anurag  kashyap', q(['anurag kashyap'])), true);
  assert.equal(isCorrectAnswer('anurag kashyap', q(['anurag  kashyap'])), true);
});

test('a blank submission never matches, even against a blank answer', () => {
  assert.equal(isCorrectAnswer('', q(['black'])), false);
  assert.equal(isCorrectAnswer('   ', q(['black'])), false);
  assert.equal(isCorrectAnswer('', q([' '])), false);
});

test('does not match on a substring or a prefix', () => {
  assert.equal(isCorrectAnswer('bla', q(['black'])), false);
  assert.equal(isCorrectAnswer('blackish', q(['black'])), false);
});
