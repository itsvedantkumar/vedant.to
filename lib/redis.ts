import { Redis } from '@upstash/redis';

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Log, never throw: seven modules import this, including proxy.ts, which is on
// the path of every /keystatic and /api/keystatic request. A module-scope throw
// on a half-set env pair would 500 the auth gate and every route handler that
// touches Redis. Callers all handle `null` (they degrade to no rate limiting).
if ((upstashUrl && !upstashToken) || (!upstashUrl && upstashToken)) {
  console.error(
    'Upstash misconfigured: set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN or neither — Redis disabled'
  );
}

export const redis = upstashUrl && upstashToken ? Redis.fromEnv() : null;
