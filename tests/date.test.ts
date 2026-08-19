// Covers lib/date.ts formatDate across its three monthFormat values. Locked
// to en-US — asserted explicitly so a future locale change is caught here
// rather than silently shipping a differently-formatted date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate } from '@/lib/date';

test('default monthFormat ("short")', () => {
  assert.equal(formatDate('2024-01-15'), 'Jan 15, 2024');
});

test('monthFormat "long"', () => {
  assert.equal(formatDate('2024-01-15', 'long'), 'January 15, 2024');
});

test('monthFormat "numeric"', () => {
  assert.equal(formatDate('2024-01-15', 'numeric'), '1/15/2024');
});

test('locale is hardcoded en-US, not the host environment locale', () => {
  // If this module ever grows a locale parameter or reads Intl.NumberFormat
  // defaults from the environment, this test should start failing.
  const withEnUS = new Date('2024-03-05').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  assert.equal(formatDate('2024-03-05'), withEnUS);
  assert.equal(formatDate('2024-03-05'), 'Mar 5, 2024');
});

test('handles end-of-year / single-digit day and month boundaries', () => {
  assert.equal(formatDate('2024-12-01', 'long'), 'December 1, 2024');
});
