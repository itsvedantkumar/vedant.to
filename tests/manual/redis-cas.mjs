/**
 * Integration test for the signature-counter compare-and-set.
 *
 * `tests/counter.test.ts` locks the decision table, but it cannot run the Lua —
 * that needs a real Redis. This does, by standing up a tiny Upstash-REST-shaped
 * proxy in front of a local redis-server so the real @upstash/redis client and
 * the real script are exercised together.
 *
 * Manual because CI has no Redis. Run it when touching bumpCounter or the Lua:
 *
 *   brew install redis
 *   redis-server --port 6399 --save '' --appendonly no --daemonize yes
 *   node --experimental-strip-types --import ./tests/alias-loader.mjs tests/manual/redis-cas.mjs
 *   redis-cli -p 6399 shutdown
 *
 * The last case is the one that matters: it asserts that concurrent assertions
 * at the same counter produce exactly one winner. The pre-CAS implementation
 * accepted all 25 — every clone got in.
 */
import http from 'node:http';
import net from 'node:net';
import { Redis } from '@upstash/redis';

const REDIS_PORT = 6399;
const PROXY_PORT = 8079;

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

const { bumpCounter } = await import('@/lib/webauthn/store');

const r = new Redis({ url: `http://127.0.0.1:${PROXY_PORT}`, token: 'x' });
const K = (id) => `ks:wa:ctr:${id}`;
let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name} (got ${got}, want ${want})`);
};

await r.del(K('a'));
check('fresh, seed 0, new 1', await bumpCounter('a', 1, 0), 'ok');
check('advance 1 -> 2', await bumpCounter('a', 2, 0), 'ok');
check('replay at 2', await bumpCounter('a', 2, 0), 'regressed');
check('regress 2 -> 1', await bumpCounter('a', 1, 0), 'regressed');

await r.del(K('b'));
check('synced passkey 0/0', await bumpCounter('b', 0, 0), 'ok');
check('synced passkey 0/0 again', await bumpCounter('b', 0, 0), 'ok');

await r.del(K('c'));
check('seeds from record (stale)', await bumpCounter('c', 3, 5), 'regressed');
await r.del(K('c'));
check('seeds from record (fresh)', await bumpCounter('c', 6, 5), 'ok');

await r.del(K('d'));
await bumpCounter('d', 7, 0);
check('counter stops advancing', await bumpCounter('d', 0, 0), 'regressed');

await r.del(K('race'));
await bumpCounter('race', 5, 0);
const results = await Promise.all(
  Array.from({ length: 25 }, () => bumpCounter('race', 6, 0))
);
check('CONCURRENCY: one winner', results.filter((x) => x === 'ok').length, 1);
check('CONCURRENCY: 24 rejected', results.filter((x) => x === 'regressed').length, 24);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
server.close();
process.exit(fails === 0 ? 0 : 1);
