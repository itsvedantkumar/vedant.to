import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';

/**
 * Factory for constructing Upstash Ratelimit instances.
 * Handles the common pattern: redis ? new Ratelimit({...}) : null
 * Centralizes the construction to avoid duplication.
 */
export function makeRatelimit(
  prefix: string,
  count: number,
  window: Duration
): Ratelimit | null {
  return redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(count, window),
        prefix,
      })
    : null;
}
