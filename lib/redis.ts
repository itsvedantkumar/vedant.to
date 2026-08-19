import { Redis } from '@upstash/redis';

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Log, never throw: middleware.ts imports this and its matcher covers every
// route, so a module-scope throw on a half-set env pair 500s the entire site.
// Callers all handle `null` (they degrade to no rate limiting).
if ((upstashUrl && !upstashToken) || (!upstashUrl && upstashToken)) {
  console.error(
    'Upstash misconfigured: set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN or neither — Redis disabled'
  );
}

export const redis = upstashUrl && upstashToken ? Redis.fromEnv() : null;
