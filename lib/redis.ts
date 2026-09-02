import { Redis } from '@upstash/redis';
import { redisEnv, redisHalfConfigured } from '@/lib/env';

// Log, never throw: seven modules import this, including proxy.ts, which is on
// the path of every /keystatic and /api/keystatic request. A module-scope throw
// on a half-set env pair would 500 the auth gate and every route handler that
// touches Redis. Callers all handle `null` (they degrade to no rate limiting).
if (redisHalfConfigured()) {
  console.error(
    'Upstash misconfigured: set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN or neither — Redis disabled'
  );
}

// Explicit credentials rather than Redis.fromEnv(): same two variables, but
// they arrive already validated by lib/env.ts (a URL that is a URL, a non-empty
// token) instead of being re-read raw from process.env inside the client.
const upstash = redisEnv();

export const redis = upstash
  ? new Redis({ url: upstash.url, token: upstash.token })
  : null;
