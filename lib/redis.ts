import { Redis } from '@upstash/redis';

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if ((upstashUrl && !upstashToken) || (!upstashUrl && upstashToken)) {
  throw new Error(
    'Upstash misconfigured: set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN or neither'
  );
}

export const redis = upstashUrl && upstashToken ? Redis.fromEnv() : null;
