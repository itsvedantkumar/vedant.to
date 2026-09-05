/**
 * Serves the frozen archive of the previous (Framer-built) site.
 *
 *   /**            static assets (the rewritten HTML written by legacy-mirror)
 *   /fr-mirr/**    mirrored Framer runtime: JS chunks, fonts, images, CMS blobs
 *
 * The one piece of real logic here is `?range=`. Framer's CMS reader fetches
 * slices of a binary blob with its own query parameter, not an HTTP Range
 * header, and it rejects the response unless the status is 200 and the body is
 * exactly the concatenated slices:
 *
 *     if (res.status !== 200) throw Error(...)
 *     if (bytes.length !== expectedTotal) throw Error(...)
 *
 * So a 206 from R2's native range support does not work, and returning too many
 * bytes is worse than an error: the reader throws and the page renders blank.
 * Anything malformed therefore fails loudly with a 400.
 */

const MIRROR_PREFIX = '/fr-mirr/';
const RANGE_SPEC = /^\d+-\d+(,\d+-\d+)*$/;
const MAX_RANGES = 64;
const MAX_RANGE_BYTES = 8 * 1024 * 1024;
const IMMUTABLE = 'public, max-age=31536000, immutable';

const CONTENT_TYPES = {
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  css: 'text/css; charset=utf-8',
  woff2: 'font/woff2',
  woff: 'font/woff',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  framercms: 'application/octet-stream',
};

const contentType = (key) => CONTENT_TYPES[key.split('.').pop().toLowerCase()] ?? 'application/octet-stream';

const bad = (message) => new Response(message, { status: 400, headers: { 'content-type': 'text/plain' } });

/** Inclusive `from-to` pairs, in the order given. Returns null when unusable. */
function parseRanges(spec, size) {
  if (!RANGE_SPEC.test(spec)) return null;
  const pairs = spec.split(',').map((p) => p.split('-').map(Number));
  if (pairs.length > MAX_RANGES) return null;
  let total = 0;
  for (const [from, to] of pairs) {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return null;
    if (from > to || to >= size) return null;
    total += to - from + 1;
    if (total > MAX_RANGE_BYTES) return null;
  }
  return { pairs, total };
}

async function serveMirror(request, env, url) {
  const key = url.pathname.slice(1);
  if (!key || key.includes('..')) return bad('bad key');

  // Framer names these files by a hash of *its* content, and the mirror
  // rewrites that content under the same name, so the filename is not a
  // truthful cache key. MIRROR_VERSION is a digest of the mirror manifest, set
  // at deploy time, and folding it into the key is what makes a re-mirror
  // actually reach visitors. Without it the edge serves the pre-rewrite bytes
  // for a year, which is exactly how the Framer editor-bar leak survived its
  // own fix once already.
  const keyUrl = new URL(url);
  keyUrl.searchParams.set('__v', env.MIRROR_VERSION ?? '0');
  const cacheKey = new Request(keyUrl.toString(), { method: 'GET' });

  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const object = await env.MIRROR.get(key);
  if (!object) return new Response('not found', { status: 404 });

  const body = new Uint8Array(await object.arrayBuffer());
  const spec = url.searchParams.get('range');

  let payload = body;
  if (spec !== null) {
    const parsed = parseRanges(spec, body.length);
    if (!parsed) return bad('bad range');
    payload = new Uint8Array(parsed.total);
    let at = 0;
    for (const [from, to] of parsed.pairs) {
      payload.set(body.subarray(from, to + 1), at);
      at += to - from + 1;
    }
  }

  const response = new Response(payload, {
    status: 200,
    headers: {
      'content-type': object.httpMetadata?.contentType ?? contentType(key),
      'content-length': String(payload.length),
      'cache-control': IMMUTABLE,
      'x-content-type-options': 'nosniff',
    },
  });
  if (request.method === 'GET') await cache.put(cacheKey, response.clone());
  return response;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
    if (url.pathname.startsWith(MIRROR_PREFIX)) return serveMirror(request, env, url);

    const res = await env.ASSETS.fetch(request);
    // The archive duplicates writing that also lives on the main site; keep it
    // out of the index rather than compete with it.
    const headers = new Headers(res.headers);
    headers.set('x-robots-tag', 'noindex, nofollow');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    return new Response(res.body, { status: res.status, headers });
  },
};
