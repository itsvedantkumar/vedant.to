import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getIP } from '@/lib/request';
import { redis } from '@/lib/redis';
import { makeRatelimit } from '@/lib/ratelimit';
import { isProduction, rawRedactedLines } from '@/lib/env';
import { parseJson } from '@/lib/validation';
import { SITE_ORIGIN_RE } from '@/lib/constants';
import { decryptLine, parseRedactedLines } from '@/lib/redact';

// scrypt (128 MiB per guess) needs the Node runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Wrong guesses only. A correct password never spends a slot, so the owner's
// friends can retry a typo; an attacker gets 5 tries per IP per hour.
const ipRatelimit = makeRatelimit('redact', 5, '1 h');
// Backstop for IP rotation: 30 wrong guesses per hour across the whole site.
// Real traffic here is a handful of humans, so this only trips under a
// distributed brute force — and then it closes the gate for everyone until
// the window passes, which is the intended failure mode.
const globalRatelimit = makeRatelimit('redact-global', 30, '1 h');

const bodySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  password: z.string().min(1).max(256),
});

const MAX_BODY_BYTES = 1024;
const LOCALHOST_RE = /^https?:\/\/localhost(:\d+)?$/;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'too large' }, 413);
  }

  // Same-origin only: the page is the sole legitimate caller.
  const origin = req.headers.get('origin') ?? '';
  const validOrigin =
    SITE_ORIGIN_RE.test(origin) || (!isProduction() && LOCALHOST_RE.test(origin));
  if (!validOrigin) return json({ error: 'forbidden' }, 403);

  // Fail closed: without Redis there is no limiter, and an unthrottled
  // password check is an online brute-force oracle. Dev degrades to open.
  if (!redis && isProduction()) return json({ error: 'unavailable' }, 503);

  const ip = getIP(req);
  // Check both limiters BEFORE the scrypt call: a blocked IP must not be able
  // to burn 128 MiB of server memory per request either.
  if (ipRatelimit && (await ipRatelimit.getRemaining(ip)).remaining <= 0) {
    return json({ error: 'slow down' }, 429);
  }
  if (globalRatelimit && (await globalRatelimit.getRemaining('all')).remaining <= 0) {
    return json({ error: 'slow down' }, 429);
  }

  const parsed = await parseJson(req, bodySchema, {
    invalid: { status: 400, error: 'bad request', includeIssues: false },
  });
  if (!parsed.ok) return parsed.response;
  const { id, password } = parsed.data;

  const lines = parseRedactedLines(rawRedactedLines());
  const payload = lines[id];
  // Unknown id and wrong password are the same answer, and both cost a guess,
  // so the id space cannot be enumerated any faster than the password.
  const text = payload ? await decryptLine(payload, password) : null;
  if (text === null) {
    if (ipRatelimit) await ipRatelimit.limit(ip);
    if (globalRatelimit) await globalRatelimit.limit('all');
    return json({ error: 'wrong' }, 401);
  }
  return json({ text }, 200);
}
