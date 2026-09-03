// Covers lib/excerpt.ts docToExcerpt: first non-empty top-level node, nested
// mark/wrapper flattening, whitespace collapsing, truncation at max, and
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

test('truncates text longer than max with trailing ellipsis', () => {
  const doc = [{ type: 'paragraph', children: [{ text: 'x'.repeat(100) }] }];
  const result = docToExcerpt(doc, 80);
  assert.equal(result, 'x'.repeat(80) + '…');
  assert.equal(result.length, 81);
});

test('text exactly at max length is not truncated', () => {
  const doc = [{ type: 'paragraph', children: [{ text: 'x'.repeat(80) }] }];
  assert.equal(docToExcerpt(doc, 80), 'x'.repeat(80));
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

test('truncation does not split surrogate pairs', () => {
  const doc = [{ type: 'paragraph', children: [{ text: '😀'.repeat(50) }] }];
  const result = docToExcerpt(doc, 10);
  assert.equal(result, '😀'.repeat(10) + '…');
});
