// Covers requestContext in lib/auth/notify.ts, the block appended to every
// security alert. Its whole job is to make an unexpected alert actionable, so
// what matters is that it reports the platform's view of the caller and stays
// quiet about what the platform did not tell it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { requestContext } from '@/lib/auth/notify';

/** Minimal stand-in for the header bag both NextRequest and Request expose. */
function req(headers: Record<string, string>): {
  headers: { get(name: string): string | null };
} {
  return { headers: { get: (name) => headers[name.toLowerCase()] ?? null } };
}

test('reports the platform address, not a spoofable one', () => {
  const context = requestContext(
    req({
      'x-vercel-forwarded-for': '110.235.233.48',
      'x-forwarded-for': '1.2.3.4',
      'user-agent': 'Mozilla/5.0 (iPhone)',
    })
  );

  assert.match(context, /^ip: 110\.235\.233\.48$/m);
  assert.doesNotMatch(context, /1\.2\.3\.4/);
  assert.match(context, /user-agent: Mozilla\/5\.0 \(iPhone\)/);
});

test('names the place the edge resolved, timezone included', () => {
  const context = requestContext(
    req({
      'x-vercel-forwarded-for': '110.235.233.48',
      'x-vercel-ip-city': 'Delhi',
      'x-vercel-ip-country-region': 'DL',
      'x-vercel-ip-country': 'IN',
      'x-vercel-ip-timezone': 'Asia/Kolkata',
    })
  );

  assert.match(context, /^where: Delhi, DL, IN \(Asia\/Kolkata\)$/m);
});

test('decodes a percent-encoded city, which is how they arrive', () => {
  const context = requestContext(
    req({ 'x-vercel-ip-city': 'New%20Delhi', 'x-vercel-ip-country': 'IN' })
  );

  assert.match(context, /where: New Delhi, IN/);
});

test('a malformed city is passed through, never thrown at the alert', () => {
  const context = requestContext(req({ 'x-vercel-ip-city': '%E0%A4' }));

  assert.match(context, /where: %E0%A4/);
});

test('off-platform there is no where line at all, rather than unknowns', () => {
  const context = requestContext(req({ 'user-agent': 'curl/8.7.1' }));

  assert.doesNotMatch(context, /where:/);
  assert.match(context, /^ip: unknown$/m);
  assert.match(context, /user-agent: curl\/8\.7\.1/);
});

test('a missing user agent still yields a complete block', () => {
  const context = requestContext(req({ 'x-vercel-forwarded-for': '203.0.113.7' }));

  assert.match(context, /user-agent: unknown/);
  assert.match(context, /at: \d{4}-\d{2}-\d{2}T/);
});
