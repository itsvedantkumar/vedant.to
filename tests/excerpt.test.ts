// Covers lib/excerpt.ts docToExcerpt: first non-empty top-level node, nested
// mark/wrapper flattening, whitespace collapsing, truncation after maxWords, and
// empty/null/undefined input handling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docToExcerpt } from '@/lib/excerpt';

test('returns first top-level node text, ignores later nodes', () => {
  const doc = [
    { type: 'paragraph', children: [{ text: 'first' }] },
    { type: 'paragraph', children: [{ text: 'second' }] },
  ];
  assert.equal(docToExcerpt(doc), 'first');
});

test('skips leading empty paragraph, uses next non-empty one', () => {
  const doc = [
    { type: 'paragraph', children: [{ text: '' }] },
    { type: 'paragraph', children: [{ text: 'hello' }] },
  ];
  assert.equal(docToExcerpt(doc), 'hello');
});

test('flattens nested marks and wrapper nodes', () => {
  const doc = [
    {
      type: 'paragraph',
      children: [
        { text: 'A ' },
        { text: 'b', bold: true },
        { type: 'link', children: [{ text: 'x' }] },
      ],
    },
  ];
  assert.equal(docToExcerpt(doc), 'A bx');
});

test('truncates after maxWords with trailing ellipsis', () => {
  const doc = [
    {
      type: 'paragraph',
      children: [{ text: 'one two three four five six seven eight' }],
    },
  ];
  assert.equal(docToExcerpt(doc, 6), 'one two three four five six…');
});

test('default maxWords is 6', () => {
  const doc = [{ type: 'paragraph', children: [{ text: 'a b c d e f g' }] }];
  assert.equal(docToExcerpt(doc), 'a b c d e f…');
});

test('text with exactly maxWords words is not truncated', () => {
  const doc = [
    { type: 'paragraph', children: [{ text: 'one two three four five six' }] },
  ];
  assert.equal(docToExcerpt(doc, 6), 'one two three four five six');
});

test('collapses internal whitespace, including newlines, to single spaces', () => {
  const doc = [{ type: 'paragraph', children: [{ text: 'a\n\n  b' }] }];
  assert.equal(docToExcerpt(doc), 'a b');
});

test('empty array, null, and undefined all produce an empty string', () => {
  assert.equal(docToExcerpt([]), '');
  assert.equal(docToExcerpt(null), '');
  assert.equal(docToExcerpt(undefined), '');
});

test('word truncation keeps multi-codepoint words intact', () => {
  const doc = [{ type: 'paragraph', children: [{ text: '😀😀 b c d e f g' }] }];
  assert.equal(docToExcerpt(doc, 6), '😀😀 b c d e f…');
});
