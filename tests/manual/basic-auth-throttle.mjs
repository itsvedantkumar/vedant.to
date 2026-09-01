/**
 * Integration test for the break-glass basic-auth rate limiter.
 *
 * proxy.ts shipped this bug twice in one day. Version 1 compared the
 * password before the limiter, so every request was a free guess. Version 2
 * gated on `getRemaining()` and spent with `limit()` only on failure — a
 * TOCTOU, because getRemaining is a plain read while limit is an atomic Lua
 * script, so N concurrent requests all read the same remaining count and all
 * proceed. Version 3 calls `limit()` once before the compare and gates on
 * `.success`. This test proves the property version 3 relies on — an atomic
 * `limit()` gate holds its budget under concurrency — and documents why
 * version 2 was rejected, using the real Ratelimit client from makeRatelimit
 * against a real Redis behind the same Upstash-REST-shaped proxy as
 * tests/manual/redis-cas.mjs.
 *
 * Manual because CI has no Redis. Run it when touching the proxy auth gate or
 * lib/ratelimit.ts:
 *
 *   brew install redis
 *   redis-server --port 6398 --save '' --appendonly no --daemonize yes
 *   node --experimental-strip-types --import ./tests/alias-loader.mjs tests/manual/basic-auth-throttle.mjs
 *   redis-cli -p 6398 shutdown
 *
 * The peek-then-spend case is the one that matters: with a budget of N it
 * admits far more than N concurrent attempts, while the atomic gate admits
 * exactly N.
 */
import http from 'node:http';
import net from 'node:net';
import { Redis } from '@upstash/redis';

const REDIS_PORT = 6398;
const PROXY_PORT = 8078;

// lib/redis.ts builds its client from env at module load, and ESM hoists static
// imports above any code — so these must be set here and makeRatelimit pulled
// in dynamically below, or it would import with no client and return null.
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

const { makeRatelimit } = await import('@/lib/ratelimit');

const r = new Redis({ url: `http://127.0.0.1:${PROXY_PORT}`, token: 'x' });

const N = 10;
const ATTEMPTS = 5 * N;
const ID = 'attacker';

// Idempotence: a re-run must not inherit a drained bucket, so each case wipes
// its own prefix before starting. Distinct prefixes keep cases independent.
async function freshLimiter(prefix) {
  const keys = await r.keys(`${prefix}*`);
  if (keys.length > 0) await r.del(...keys);
  const rl = makeRatelimit(prefix, N, '60 s');
  if (!rl) throw new Error('makeRatelimit returned null — env not seen at import');
  return rl;
}

let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name} (got ${got}, want ${want})`);
};
const checkAtLeast = (name, got, floor) => {
  const ok = got >= floor;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name} (got ${got}, want >= ${floor})`);
};

// Case 1 — atomic gate: 5*N concurrent limit() calls, exactly N admitted.
// This is the property version 3 of the gate relies on.
{
  const rl = await freshLimiter('test:throttle:atomic');
  const results = await Promise.all(Array.from({ length: ATTEMPTS }, () => rl.limit(ID)));
  const admitted = results.filter((x) => x.success).length;
  check(`ATOMIC: ${ATTEMPTS} concurrent, exactly ${N} admitted`, admitted, N);
  check(`ATOMIC: ${ATTEMPTS - N} refused`, results.length - admitted, ATTEMPTS - N);
}

// Case 2 — peek-then-spend is unsafe: 5*N concurrent workers each read
// getRemaining() and proceed only if remaining > 0 (version 2's gate). The
// read is not a reservation, so concurrent workers all see the same remaining
// count and far more than N proceed. Lower bound rather than exact count —
// the overshoot depends on scheduling — but well above N either way.
{
  const rl = await freshLimiter('test:throttle:peek');
  const proceeded = await Promise.all(
    Array.from({ length: ATTEMPTS }, async () => {
      const { remaining } = await rl.getRemaining(ID);
      if (remaining <= 0) return false;
      await rl.limit(ID); // spend after the peek, as version 2 did
      return true; // this worker got a password guess
    })
  );
  const got = proceeded.filter(Boolean).length;
  checkAtLeast(`PEEK-THEN-SPEND: budget ${N}, admits at least ${2 * N}`, got, 2 * N);
}

// Case 3 — sequential sanity: N sequential limit() calls succeed, the N+1th
// is refused.
{
  const rl = await freshLimiter('test:throttle:seq');
  let ok = 0;
  for (let i = 0; i < N; i++) {
    if ((await rl.limit(ID)).success) ok++;
  }
  check(`SEQUENTIAL: first ${N} succeed`, ok, N);
  check('SEQUENTIAL: N+1th refused', (await rl.limit(ID)).success, false);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
server.close();
process.exit(fails === 0 ? 0 : 1);
