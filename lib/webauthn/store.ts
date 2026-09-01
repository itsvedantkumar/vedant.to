/**
 * Redis persistence for WebAuthn credentials and in-flight challenges.
 * Owns every `ks:*` key string — nothing else in the codebase should build one.
 * Node runtime only.
 */

import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { redis } from '@/lib/redis';
import { CHALLENGE_TTL_SEC } from '@/lib/auth/session';

const CREDS_SET = 'ks:wa:creds';
const credKey = (id: string) => `ks:wa:cred:${id}`;
const chalKey = (nonce: string) => `ks:wa:chal:${nonce}`;
/**
 * The signature counter lives in its own integer key, separate from the record.
 * It is the one field that needs a compare-and-set, and keeping it scalar means
 * the Lua below never has to decode/re-encode the credential JSON — cjson would
 * turn an empty `transports: []` into `{}` and `null` into a sentinel, quietly
 * changing the record's shape on every authentication.
 */
const ctrKey = (id: string) => `ks:wa:ctr:${id}`;
/**
 * `suspended` lives in its own key for the same reason the counter does:
 * updateCredential is a plain read-modify-write on credKey, and two callers
 * on the same unauthenticated verify path race on it — bumpCounter's clone
 * check writing `{suspended: true}` and the success path writing
 * `{lastUsedAt, backedUp, deviceType}`. If suspended stayed inside the JSON
 * record, a metadata writer that read the record *before* the suspend write
 * would overwrite it back to unset, silently un-suspending a clone-suspect
 * credential. Splitting it out means the metadata write never touches this
 * key, so it cannot carry a stale copy of it — no CAS needed here, unlike
 * ctrKey, because suspension is one-directional (false -> true only) and a
 * plain SET is already race-free for that.
 */
const suspKey = (id: string) => `ks:wa:susp:${id}`;

export type StoredCredential = {
  /** base64url credential id */
  id: string;
  /**
   * base64url of the COSE public key. MUST be a string: Upstash serialises to
   * JSON, and a raw Uint8Array round-trips as {"0":4,"1":167,…} — silently
   * corrupting the key and failing every subsequent assertion.
   */
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  deviceType: string;
  backedUp: boolean;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** Set when the signature counter regressed — a possible cloned authenticator. */
  suspended?: boolean;
};

export type ChallengeRecord = {
  kind: 'reg' | 'auth';
  challenge: string;
  ip: string;
};

class RedisUnavailableError extends Error {
  constructor() {
    super('Upstash Redis is not configured — passkeys are unavailable');
    this.name = 'RedisUnavailableError';
  }
}

function db() {
  if (!redis) throw new RedisUnavailableError();
  return redis;
}

export function isRedisUnavailable(err: unknown): boolean {
  return err instanceof RedisUnavailableError;
}

async function listCredentialIds(): Promise<string[]> {
  return db().smembers(CREDS_SET);
}

export async function countCredentials(): Promise<number> {
  return db().scard(CREDS_SET);
}

export async function getCredential(id: string): Promise<StoredCredential | null> {
  const client = db();
  const [record, susp] = await Promise.all([
    client.get<StoredCredential>(credKey(id)),
    client.get<boolean>(suspKey(id)),
  ]);
  if (!record) return null;
  // suspKey is authoritative once set. Falls back to a legacy embedded
  // `suspended` field (pre-split records) when suspKey hasn't been written.
  return susp ? { ...record, suspended: true } : record;
}

export async function listCredentials(): Promise<StoredCredential[]> {
  const ids = await listCredentialIds();
  if (ids.length === 0) return [];
  const records = await Promise.all(ids.map((id) => getCredential(id)));
  return records.filter((c): c is StoredCredential => c !== null);
}

export async function saveCredential(cred: StoredCredential): Promise<void> {
  const client = db();
  await client.set(credKey(cred.id), cred);
  // Seed the counter key with the record, so a re-enrolled credential id can
  // never inherit a stale counter from a previous registration.
  await client.set(ctrKey(cred.id), cred.counter);
  // Same reasoning for suspension: a re-enrolled id must start trusted, not
  // inherit a clone-suspect flag left behind by whatever used this id before.
  await client.del(suspKey(cred.id));
  await client.sadd(CREDS_SET, cred.id);
}

/**
 * `suspended` is deliberately excluded from the patch type: it has its own
 * key (suspKey) and its own setter (suspendCredential) below, precisely so
 * this read-modify-write can never be the thing that carries a stale copy of
 * it back to unset. See suspKey's comment for the race this closes.
 */
export async function updateCredential(
  id: string,
  patch: Partial<Omit<StoredCredential, 'suspended'>>
): Promise<void> {
  const existing = await getCredential(id);
  if (!existing) return;
  await db().set(credKey(id), { ...existing, ...patch });
}

/**
 * Mark a credential suspended. A plain SET, not a CAS: suspension only ever
 * moves false -> true, so there is nothing to compare against — unlike the
 * counter, two concurrent callers writing `true` cannot disagree. Writing to
 * suspKey instead of credKey is what keeps this safe from updateCredential's
 * read-modify-write: that path never touches this key, so it cannot clobber
 * a suspension that happened between its read and its write.
 */
export async function suspendCredential(id: string): Promise<void> {
  await db().set(suspKey(id), true);
}

/**
 * Compare-and-set the signature counter, atomically.
 *
 * WebAuthn's clone check is read-compare-write, so doing it in application code
 * races: two concurrent assertions can both read counter=5, both accept 6, and
 * both write — which is exactly the cloned-authenticator case the check exists
 * to catch. Redis runs this script atomically, so only one of the two wins.
 *
 * `seed` backfills from the credential record the first time a given credential
 * authenticates after this key existed; without it an existing credential would
 * start from zero and accept one stale counter.
 *
 * Mirrors the spec rule the library uses: a regression only counts when at least
 * one side is non-zero. Authenticators with synced passkeys (iCloud Keychain,
 * Google Password Manager) always report 0 and must never trip it.
 */
const BUMP_COUNTER_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur == false then cur = ARGV[2] end
cur = tonumber(cur)
local new = tonumber(ARGV[1])
if cur == nil or new == nil then return -1 end
if (new > 0 or cur > 0) and new <= cur then return 0 end
redis.call('SET', KEYS[1], new)
return 1
`;

/**
 * The exact rule BUMP_COUNTER_LUA implements, in TypeScript so it can be tested.
 * The Lua is the atomic implementation; this is the specification. Change one
 * and you must change the other — `tests/counter.test.ts` locks the table.
 */
export function counterAdvances(current: number, next: number): boolean {
  if ((next > 0 || current > 0) && next <= current) return false;
  return true;
}

export type CounterBump = 'ok' | 'regressed' | 'error';

export async function bumpCounter(
  id: string,
  newCounter: number,
  seed: number
): Promise<CounterBump> {
  let result: unknown;
  try {
    result = await db().eval(
      BUMP_COUNTER_LUA,
      [ctrKey(id)],
      [String(newCounter), String(seed)]
    );
  } catch (err) {
    if (isRedisUnavailable(err)) throw err;
    console.error('[webauthn] counter CAS failed:', err);
    return 'error';
  }
  if (result === 1) return 'ok';
  if (result === 0) return 'regressed';
  // -1 means a non-numeric counter reached Redis. Refuse rather than guess:
  // the caller turns this into a retryable 401, not a suspension.
  console.error('[webauthn] counter CAS returned', result, 'for', id);
  return 'error';
}

export async function deleteCredential(id: string): Promise<void> {
  const client = db();
  await client.del(credKey(id), ctrKey(id), suspKey(id));
  await client.srem(CREDS_SET, id);
}

/**
 * Atomically remove an id from the index, returning 1 if it was present.
 * Callers that need a "never delete the last credential" guard must remove
 * first and re-add on regret — a read-then-delete check races with a concurrent
 * delete of a different credential and can empty the set.
 */
export async function unlinkCredentialId(id: string): Promise<number> {
  return db().srem(CREDS_SET, id);
}

export async function relinkCredentialId(id: string): Promise<void> {
  await db().sadd(CREDS_SET, id);
}

export async function deleteCredentialRecord(id: string): Promise<void> {
  await db().del(credKey(id), ctrKey(id), suspKey(id));
}

export async function putChallenge(
  nonce: string,
  record: ChallengeRecord
): Promise<void> {
  await db().set(chalKey(nonce), record, { ex: CHALLENGE_TTL_SEC });
}

/**
 * Atomic read-and-delete. Single-use by construction, so a replayed assertion
 * finds no challenge. A non-atomic get-then-del would race.
 */
export async function burnChallenge(nonce: string): Promise<ChallengeRecord | null> {
  return db().getdel<ChallengeRecord>(chalKey(nonce));
}

export function newNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
