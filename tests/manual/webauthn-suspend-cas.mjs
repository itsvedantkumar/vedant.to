/**
 * Integration test for the credential-suspension race fixed alongside
 * bumpCounter's counter CAS (tests/manual/redis-cas.mjs).
 *
 * Commit 21ce0e9 made the signature COUNTER atomic via ctrKey, but left
 * `updateCredential` as a plain get-then-set on credKey. Two callers on the
 * same unauthenticated verify path raced on that key: the clone-suspect path
 * writing `{suspended: true}` and the success path writing
 * `{lastUsedAt, backedUp, deviceType}`. Interleaving — A(success) reads,
 * B(suspend) reads, B writes suspended:true, A writes its stale read —
 * silently clobbers the suspension and leaves a clone-suspect credential
 * usable, even though `suspended` is genuinely enforced at verify time.
 *
 * The fix mirrors ctrKey's shape: `suspended` moved to its own key (suspKey)
 * with its own setter (suspendCredential), so the metadata writer never
 * touches it and cannot carry a stale copy of it back to unset. No CAS is
 * needed for suspKey itself — suspension is one-directional (false -> true),
 * so a plain SET cannot lose a race the way a compare-then-write can.
 *
 * This harness proves the fix two ways against a real Redis (a local
 * redis-server behind the same Upstash-REST-shaped proxy as redis-cas.mjs,
 * so the real @upstash/redis client and the real store.ts functions run):
 *
 *   1. A deterministic reproduction of the exact interleave in the bug
 *      report (A reads, B reads, B writes suspended, A writes stale) run
 *      25 times against a hand-reproduction of the OLD pre-fix code
 *      (verbatim from lib/webauthn/store.ts before this fix) and against
 *      the real, current store.ts functions.
 *   2. An organic concurrency stress: both writers fired together with
 *      Promise.all (real network-timing race, not manually sequenced),
 *      50 rounds, against both implementations.
 *
 * If the OLD implementation does not fail here, this harness is wrong, not
 * the code it is meant to catch.
 *
 * Manual because CI has no Redis. Run it when touching updateCredential,
 * suspendCredential, or the verify route's suspension path:
 *
 *   brew install redis
 *   redis-server --port 6397 --save '' --appendonly no --daemonize yes
 *   node --experimental-strip-types --import ./tests/alias-loader.mjs tests/manual/webauthn-suspend-cas.mjs
 *   redis-cli -p 6397 shutdown
 */
import http from 'node:http';
import net from 'node:net';
import { Redis } from '@upstash/redis';

const REDIS_PORT = 6397;
const PROXY_PORT = 8077;

// lib/redis.ts builds its client from env at module load, and ESM hoists static
// imports above any code — so these must be set here and the store pulled in
// dynamically below, or it would import with no client and throw.
process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${PROXY_PORT}`;
process.env.UPSTASH_REDIS_REST_TOKEN = 'local-test';

const encode = (args) =>
  `*${args.length}\r\n` +
  args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join('');

function parse(buf, i = 0) {
  if (i >= buf.length) return null;
  const type = String.fromCharCode(buf[i]);
  const end = buf.indexOf('\r\n', i);
  if (end === -1) return null;
  const head = buf.slice(i + 1, end).toString();
  if (type === '+') return [head, end + 2];
  if (type === '-') return [{ __err: head }, end + 2];
  if (type === ':') return [Number(head), end + 2];
  if (type === '$') {
    const len = Number(head);
    if (len === -1) return [null, end + 2];
    const start = end + 2;
    if (buf.length < start + len + 2) return null;
    return [buf.slice(start, start + len).toString(), start + len + 2];
  }
  if (type === '*') {
    const n = Number(head);
    if (n === -1) return [null, end + 2];
    let pos = end + 2;
    const arr = [];
    for (let k = 0; k < n; k++) {
      const r = parse(buf, pos);
      if (!r) return null;
      arr.push(r[0]);
      pos = r[1];
    }
    return [arr, pos];
  }
  throw new Error('unsupported RESP type: ' + type);
}

const redisCommand = (args) =>
  new Promise((resolve, reject) => {
    const sock = net.createConnection(REDIS_PORT, '127.0.0.1');
    let buf = Buffer.alloc(0);
    sock.on('connect', () => sock.write(encode(args)));
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const r = parse(buf);
      if (r) {
        sock.end();
        resolve(r[0]);
      }
    });
    sock.on('error', reject);
  });

// Fail loudly, not obscurely, when there is no Redis to talk to.
try {
  const pong = await redisCommand(['PING']);
  if (pong !== 'PONG') throw new Error(`unexpected PING reply: ${pong}`);
} catch (e) {
  console.error(
    `No redis-server reachable on 127.0.0.1:${REDIS_PORT} (${e.message ?? e}).`
  );
  console.error('Install and start one:');
  console.error('  brew install redis');
  console.error(
    `  redis-server --port ${REDIS_PORT} --save '' --appendonly no --daemonize yes`
  );
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    const wrap = (o) => (o && o.__err ? { error: o.__err } : { result: o });
    try {
      const parsed = JSON.parse(body || '[]');
      res.setHeader('content-type', 'application/json');
      // The client auto-pipelines, so the batch shape is the common path.
      if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
        const outs = [];
        for (const cmd of parsed) outs.push(wrap(await redisCommand(cmd)));
        res.end(JSON.stringify(outs));
      } else {
        res.end(JSON.stringify(wrap(await redisCommand(parsed))));
      }
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

await new Promise((r) => server.listen(PROXY_PORT, r));

const { saveCredential, getCredential, updateCredential, suspendCredential } =
  await import('@/lib/webauthn/store');

const r = new Redis({ url: `http://127.0.0.1:${PROXY_PORT}`, token: 'x' });

// Own namespace, isolated from real credential ids — this redis-server is a
// throwaway instance dedicated to this harness, but the prefix keeps every
// key this file touches easy to find and delete.
const NS = 'zeep-susp-test';
const createdKeys = new Set();
const track = (...keys) => keys.forEach((k) => createdKeys.add(k));

function baseRecord(id) {
  return {
    id,
    publicKey: 'dGVzdA',
    counter: 5,
    transports: [],
    deviceType: 'singleDevice',
    backedUp: false,
    label: 'test',
    createdAt: Date.now(),
    lastUsedAt: null,
  };
}

// Verbatim reproduction of lib/webauthn/store.ts as it stood at HEAD faa5e8e,
// before this fix: `suspended` lived inside the JSON record at credKey, and
// updateCredential was a plain read-modify-write with no CAS and no lock.
const oldCredKey = (id) => `ks:wa:cred:${id}`;
async function oldGetCredential(id) {
  return r.get(oldCredKey(id));
}
// A small jitter between the read and the write, standing in for the real
// gap in verify/route.ts (crypto verification, the counter CAS round-trip)
// between `getCredential` and `updateCredential`. Without it, two calls
// issued back-to-back on loopback Redis resolve too close together for the
// organic Promise.all stress case below to reliably interleave — the
// deterministic case (which does not depend on this) already proves the race
// exists; this just makes it show up reliably under real concurrency too.
const jitter = () => new Promise((res) => setTimeout(res, Math.random() * 15));
async function oldUpdateCredential(id, patch) {
  const existing = await oldGetCredential(id);
  if (!existing) return;
  await jitter();
  await r.set(oldCredKey(id), { ...existing, ...patch });
}
async function oldSeed(id) {
  const key = oldCredKey(id);
  track(key);
  await r.set(key, baseRecord(id));
}

async function newSeed(id) {
  track(`ks:wa:cred:${id}`, `ks:wa:ctr:${id}`, `ks:wa:susp:${id}`);
  await saveCredential(baseRecord(id));
}

let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name} (got ${got}, want ${want})`);
};

// --- Case 1: deterministic forced interleave -------------------------------
// The exact sequence from the bug report: A (success/metadata writer) reads,
// B (regressed/suspend writer) reads the same stale snapshot, B commits its
// suspend write first, then A commits its stale metadata write, clobbering B.

async function oldForcedRace(id) {
  await oldSeed(id);
  const a = await oldGetCredential(id); // metadata writer's read
  const b = await oldGetCredential(id); // suspend writer's read — same stale snapshot
  // Write directly with each writer's own pre-fetched snapshot rather than
  // going through oldUpdateCredential (which would re-read internally and
  // hide the TOCTOU) — this is exactly what oldUpdateCredential's own
  // get-then-set does, with the ordering pinned instead of left to chance.
  await r.set(oldCredKey(id), { ...b, suspended: true }); // B commits first
  await r.set(oldCredKey(id), {
    ...a,
    lastUsedAt: Date.now(),
    backedUp: false,
    deviceType: 'singleDevice',
  }); // A commits second, clobbering B with its stale read
  const final = await oldGetCredential(id);
  return final.suspended === true;
}

async function newForcedRace(id) {
  await newSeed(id);
  // Real callers: the success path calls getCredential too, but nothing in
  // suspendCredential or updateCredential depends on that read any more —
  // reproducing it here would just be theatre. What matters is commit order.
  await suspendCredential(id); // B commits first
  await updateCredential(id, {
    lastUsedAt: Date.now(),
    backedUp: false,
    deviceType: 'singleDevice',
  }); // A commits second
  const final = await getCredential(id);
  return final.suspended === true;
}

const FORCED_N = 25;
{
  let survived = 0;
  for (let i = 0; i < FORCED_N; i++) {
    if (await oldForcedRace(`${NS}:old-forced:${i}`)) survived++;
  }
  check(`OLD FORCED INTERLEAVE: suspended survives (${FORCED_N} trials)`, survived, 0);
}
{
  let survived = 0;
  for (let i = 0; i < FORCED_N; i++) {
    if (await newForcedRace(`${NS}:new-forced:${i}`)) survived++;
  }
  check(
    `NEW FORCED INTERLEAVE: suspended survives (${FORCED_N} trials)`,
    survived,
    FORCED_N
  );
}

// --- Case 2: organic concurrency stress -------------------------------------
// Both writers fired together via Promise.all — a real network-timing race,
// not a manually sequenced one — mirroring the attacker firing two concurrent
// verify POSTs against the live route.

async function oldConcurrentRound(id) {
  await oldSeed(id);
  await Promise.all([
    oldUpdateCredential(id, {
      lastUsedAt: Date.now(),
      backedUp: false,
      deviceType: 'singleDevice',
    }),
    oldUpdateCredential(id, { suspended: true }),
  ]);
  const final = await oldGetCredential(id);
  return final.suspended === true;
}

async function newConcurrentRound(id) {
  await newSeed(id);
  await Promise.all([
    updateCredential(id, {
      lastUsedAt: Date.now(),
      backedUp: false,
      deviceType: 'singleDevice',
    }),
    suspendCredential(id),
  ]);
  const final = await getCredential(id);
  return final.suspended === true;
}

const ROUNDS = 50;
{
  const results = await Promise.all(
    Array.from({ length: ROUNDS }, (_, i) =>
      oldConcurrentRound(`${NS}:old-concurrent:${i}`)
    )
  );
  const survived = results.filter(Boolean).length;
  console.log(
    `      OLD CONCURRENT STRESS: suspended survived ${survived}/${ROUNDS} rounds`
  );
  if (survived === ROUNDS) {
    fails++;
    console.log(
      'FAIL  OLD CONCURRENT STRESS: expected at least one lost suspension — the old code did not fail, so this harness is not exercising the race'
    );
  } else {
    console.log(
      `ok    OLD CONCURRENT STRESS: lost suspension in ${ROUNDS - survived}/${ROUNDS} rounds — race reproduced`
    );
  }
}
{
  const results = await Promise.all(
    Array.from({ length: ROUNDS }, (_, i) =>
      newConcurrentRound(`${NS}:new-concurrent:${i}`)
    )
  );
  const survived = results.filter(Boolean).length;
  check(`NEW CONCURRENT STRESS: suspended survives (${ROUNDS} rounds)`, survived, ROUNDS);
}

// --- cleanup -----------------------------------------------------------------
if (createdKeys.size > 0) await r.del(...createdKeys);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
server.close();
process.exit(fails === 0 ? 0 : 1);
