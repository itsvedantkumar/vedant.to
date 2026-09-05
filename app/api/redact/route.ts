import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getIP } from '@/lib/request';
import { redis } from '@/lib/redis';
import { makeRatelimit } from '@/lib/ratelimit';
import { isProduction, rawRedactedLines } from '@/lib/env';
import { parseJson } from '@/lib/validation';
import { SITE_ORIGIN_RE } from '@/lib/constants';
import { decryptLine, parseRedactedLines } from '@/lib/redact';
import { announceUnlock } from '@/lib/redact-notify';
import { notifySecurityEvent, requestContext } from '@/lib/auth/notify';

// scrypt (128 MiB per guess) needs the Node runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Every attempt spends a slot, right or wrong, and it is spent BEFORE the
// key derivation: `.limit()` is one atomic Redis call, whereas a
// getRemaining() peek followed by a spend-on-miss lets N concurrent requests
// all read the same count and all run scrypt (proxy.ts documents the same
// trap). 5 per IP per hour is plenty for a friend with a typo.
const ipRatelimit = makeRatelimit('redact', 5, '1 h');
// Backstop for IP rotation: 60 attempts per hour across the whole site. Real
// traffic here is a handful of humans, so this only trips under a distributed
// brute force — and then it closes the gate for everyone until the window
// passes, which is the intended failure mode.
const globalRatelimit = makeRatelimit('redact-global', 60, '1 h');

const bodySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  password: z.string().min(1).max(256),
});

const MAX_BODY_BYTES = 1024;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function isLocalhost(origin: string): boolean {
  try {
    return new URL(origin).hostname === 'localhost';
  } catch {
    return false;
  }
}

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Run the notice after the response, so the reader waits on scrypt and nothing
 * else. `after` throws when there is no request scope, which is exactly how the
 * route tests call POST, so fall back to running it inline there.
 */
function afterResponse(work: () => Promise<unknown>): void {
  try {
    after(work);
  } catch {
    void work();
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'too large' }, 413);
  }

  // Same-origin only: the page is the sole legitimate caller.
  const origin = req.headers.get('origin') ?? '';
  const validOrigin =
    SITE_ORIGIN_RE.test(origin) || (!isProduction() && isLocalhost(origin));
  if (!validOrigin) return json({ error: 'forbidden' }, 403);

  // Fail closed: without Redis there is no limiter, and an unthrottled
  // password check is an online brute-force oracle. Dev degrades to open.
  if (!redis && isProduction()) return json({ error: 'unavailable' }, 503);

  const parsed = await parseJson(req, bodySchema, {
    invalid: { status: 400, error: 'bad request', includeIssues: false },
  });
  if (!parsed.ok) return parsed.response;
  const { id, password } = parsed.data;

  // Spend both budgets atomically BEFORE the scrypt call, so a blocked or
  // flooding client can neither guess nor burn 128 MiB per request.
  const ip = getIP(req);
  if (ipRatelimit && !(await ipRatelimit.limit(ip)).success) {
    return json({ error: 'slow down' }, 429);
  }
  if (globalRatelimit && !(await globalRatelimit.limit('all')).success) {
    return json({ error: 'slow down' }, 429);
  }

  const lines = parseRedactedLines(rawRedactedLines());
  const payload = lines[id];
  // Unknown id and wrong password are the same answer, and both cost a guess,
  // so the id space cannot be enumerated any faster than the password.
  const text = payload ? await decryptLine(payload, password) : null;
  if (text === null) return json({ error: 'wrong' }, 401);

  // Read the headers now: by the time the notice runs the request is gone.
  const context = requestContext(req);
  afterResponse(() =>
    announceUnlock({ store: redis, send: notifySecurityEvent }, { id, ip, context })
  );
  return json({ text }, 200);
}
