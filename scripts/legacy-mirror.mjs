#!/usr/bin/env node
/**
 * legacy-mirror.mjs
 *
 * Snapshots the previous (Framer-built) site into legacy/, rewritten so that it
 * runs entirely from our own infrastructure and never contacts Framer.
 *
 *   legacy/site/**    rewritten HTML, one file per route (tracked in git)
 *   legacy/assets/**  every JS chunk, font, image and CMS blob (gitignored;
 *                     uploaded to R2 by scripts/legacy-upload-r2.mjs)
 *
 * Two things about this archive are not obvious and constrain everything else.
 *
 * 1. The blog and poetry pages are empty HTML shells. Their content lives in
 *    binary `.framercms` blobs that the runtime reads by absolute byte offset,
 *    which is why the URL rewrite below must preserve byte length exactly.
 * 2. Those blobs are requested with a Framer-proprietary `?range=a-b,c-d` query
 *    parameter and the reader rejects anything that is not a 200 whose body is
 *    exactly the concatenated slices. HTTP Range (206) does not satisfy it.
 *    legacy/worker/index.mjs implements the slicing.
 *
 * Asset discovery is a union of two passes because neither alone is complete:
 * a static crawl misses the icon components the runtime builds URLs for, and a
 * runtime crawl misses anything not exercised by simply loading a page.
 *
 * Usage:
 *   node scripts/legacy-mirror.mjs              # full mirror
 *   node scripts/legacy-mirror.mjs --no-runtime # skip the headless-browser pass
 *   node scripts/legacy-mirror.mjs --dry        # report only, no writes
 *
 * Env: LEGACY_SOURCE overrides the published Framer origin being mirrored.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from '../site.config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_SITE = join(ROOT, 'legacy/site');
const OUT_ASSETS = join(ROOT, 'legacy/assets');
const RUNTIME_CACHE = join(ROOT, 'legacy/runtime-assets.txt');

const DRY = process.argv.includes('--dry');
const NO_RUNTIME = process.argv.includes('--no-runtime');
const SOURCE = (
  process.env.LEGACY_SOURCE ?? 'https://super-exercise-846163.framer.app'
).replace(/\/$/, '');

const FRAMER = 'https://framerusercontent.com/';
const MIRROR = `${site.legacyUrl}/fr-mirr/`;
const GSTATIC = 'https://fonts.gstatic.com/';
const GSTATIC_MIRROR = `${MIRROR}gstatic/`;

// The archive's binary CMS blobs address themselves by absolute byte offset, so
// rewriting a URL inside one must not move a single byte. Fail here rather than
// ship a mirror whose blog pages silently render blank.
if (Buffer.byteLength(FRAMER) !== Buffer.byteLength(MIRROR)) {
  console.error(
    `legacy-mirror: "${MIRROR}" is ${Buffer.byteLength(MIRROR)} bytes but must be exactly ` +
      `${Buffer.byteLength(FRAMER)} to match "${FRAMER}". Adjust the mirror path segment in ` +
      'site.config.mjs (legacyUrl) so the two are the same length.'
  );
  process.exit(2);
}

/**
 * Two live Framer endpoints survive inside the JS chunks, and neither is a
 * `framerusercontent.com` URL, so the host rewrite never saw them.
 *
 * The editor bar is the one that matters. `script_main.*.mjs` does
 * `await import('https://framer.com/edit/init.mjs')`, that module pulls
 * `framer.com/m/phosphor-icons/<Icon>.js`, and *those* fetch the real icon
 * modules from framerusercontent.com. So the archive reaches Framer on every
 * route through code that exists in no file we can rewrite. Swapping the
 * import for a data: URL that exports the same symbol keeps the destructure
 * and the call site intact while rendering nothing.
 *
 * The forms endpoint is belt and braces. The injected handler below cancels
 * submission at capture phase, so this action should never fire; if it ever
 * did, a 404 on our own origin beats posting someone's message to Framer.
 */
const FRAMER_ENDPOINTS = [
  [
    'https://framer.com/edit/init.mjs',
    'data:text/javascript,export const createEditorBar=()=>()=>null',
  ],
  // The icon loader, and the reason the editor-bar fix alone was not enough.
  // `shared-lib.*.mjs` holds `Se = 'https://framer.com/m/phosphor-icons/'` and
  // does `import(`${Se}${name}.js@0.0.57`)` whenever an icon renders, so every
  // route pulled from framer.com and, through it, framerusercontent.com. The
  // resolved modules are already mirrored under `modules/`; aliasIconModules()
  // copies them to the path this now-local URL builds. The call site is
  // wrapped in try/catch and renders null on failure, so an icon the crawl
  // never saw fails closed here instead of escaping to Framer.
  ['https://framer.com/m/phosphor-icons/', `${site.legacyUrl}/fr-mirr/m/phosphor-icons/`],
  ['https://api.framer.com/forms/v1/', `${site.legacyUrl}/fr-mirr/forms-disabled/`],
];

const TEXT_EXT = /\.(mjs|js|json|css|map)$/;
const log = (...a) => console.log('[legacy-mirror]', ...a);

async function fetchBuf(url, { tries = 3, accept404 = false } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'legacy-mirror/1.0' } });
      // The archive has a real /404 route, and the origin serves it with a 404
      // status. The body is the page we want.
      if (!res.ok && !(accept404 && res.status === 404)) {
        throw new Error(`${res.status} ${res.statusText}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (i === tries - 1) throw new Error(`fetch ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
}

async function pool(items, limit, worker) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    })
  );
  return out;
}

/** Every mirrored origin, keyed by the local path prefix it maps onto. */
function localPath(url) {
  const u = new URL(url);
  if (u.origin === 'https://framerusercontent.com') return u.pathname.replace(/^\//, '');
  if (u.origin === 'https://fonts.gstatic.com') return `gstatic${u.pathname}`;
  return null;
}

/** Discovery pass 1: what a real browser actually requests, per route. */
function runtimeAssets(routes) {
  if (NO_RUNTIME) {
    if (!existsSync(RUNTIME_CACHE)) return [];
    log('runtime pass skipped, using cached', RUNTIME_CACHE);
    return readFileSync(RUNTIME_CACHE, 'utf8').split('\n').filter(Boolean);
  }
  const found = new Set();
  routes.forEach((route, i) => {
    const url = SOURCE + route;
    spawnSync('npx', ['--yes', 'agent-browser', 'open', url], { stdio: 'ignore' });
    // `--clear` empties the buffer *before* printing, so read and clear are two
    // calls, not one.
    const res = spawnSync(
      'npx',
      ['--yes', 'agent-browser', 'network', 'requests', '--filter', 'framerusercontent'],
      { encoding: 'utf8' }
    );
    for (const m of (res.stdout ?? '').matchAll(
      /https:\/\/framerusercontent\.com\/[^\s]+/g
    )) {
      found.add(m[0]);
    }
    spawnSync('npx', ['--yes', 'agent-browser', 'network', 'requests', '--clear'], {
      stdio: 'ignore',
    });
    if ((i + 1) % 10 === 0)
      log(`runtime pass ${i + 1}/${routes.length} routes, ${found.size} urls`);
  });
  spawnSync('npx', ['--yes', 'agent-browser', 'close', '--all'], { stdio: 'ignore' });
  const list = [...found].sort();
  if (!DRY) writeFileSync(RUNTIME_CACHE, list.join('\n') + '\n');
  return list;
}

const stripQuery = (u) => u.split('?')[0].split('#')[0];

/**
 * A discovered string is only an asset if it names a file. Preconnect hints and
 * bare directory prefixes match the URL regexes too and would 404, or worse,
 * resolve to a directory on disk.
 */
const isAssetUrl = (u) => /\/[^/]+\.[A-Za-z0-9]+$/.test(new URL(u).pathname);

async function main() {
  // ---- routes ------------------------------------------------------------
  const sitemap = (await fetchBuf(`${SOURCE}/sitemap.xml`)).toString('utf8');
  const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => decodeURIComponent(new URL(m[1]).pathname))
    .sort();
  if (!routes.length) throw new Error('sitemap yielded no routes');
  log(`${routes.length} routes`);

  // ---- fetch every page --------------------------------------------------
  const pages = new Map();
  await pool(routes, 8, async (route) => {
    const buf = await fetchBuf(SOURCE + encodeURI(route), { accept404: true });
    pages.set(route, buf.toString('utf8'));
  });
  log(`${pages.size} pages fetched`);

  // ---- discovery ---------------------------------------------------------
  const queue = new Set();
  const enqueue = (raw) => {
    const url = stripQuery(raw);
    if (isAssetUrl(url)) queue.add(url);
  };
  runtimeAssets(routes).forEach(enqueue);
  log(`runtime pass: ${queue.size} assets`);

  const reFramer = /https:\/\/framerusercontent\.com\/[A-Za-z0-9._/@-]+/g;
  const reGstatic = /https:\/\/fonts\.gstatic\.com\/[A-Za-z0-9._/@-]+/g;
  for (const html of pages.values()) {
    for (const m of html.matchAll(reFramer)) enqueue(m[0]);
    for (const m of html.matchAll(reGstatic)) enqueue(m[0]);
  }

  // Static BFS: text assets reference further assets, including the .framercms
  // blobs, whose URL is built as `new URL('./x.framercms', <modules url>)` and
  // then has /modules/ swapped for /cms/.
  const bodies = new Map();
  const seen = new Set();
  while (true) {
    const batch = [...queue].filter((u) => !seen.has(u));
    if (!batch.length) break;
    batch.forEach((u) => seen.add(u));
    await pool(batch, 16, async (url) => {
      try {
        bodies.set(url, await fetchBuf(url));
      } catch (err) {
        log(`WARN ${err.message}`);
        return;
      }
      if (!TEXT_EXT.test(url)) return;
      const src = bodies.get(url).toString('utf8');
      const base = url.slice(0, url.lastIndexOf('/') + 1);
      for (const m of src.matchAll(reFramer)) enqueue(m[0]);
      for (const m of src.matchAll(reGstatic)) enqueue(m[0]);
      for (const m of src.matchAll(
        /["'`](\.\/[A-Za-z0-9._-]+\.(?:mjs|js|framercms))["'`]/g
      )) {
        const abs = base + m[1].slice(2);
        // A blob is only ever addressed relative to its collection module, and
        // the reader swaps /modules/ for /cms/ before fetching. Resolving one
        // against any other base just invents a 404.
        if (abs.endsWith('.framercms')) {
          if (base.includes('/modules/')) enqueue(abs.replace('/modules/', '/cms/'));
          continue;
        }
        enqueue(abs);
      }
    });
  }
  log(`${bodies.size} assets downloaded`);

  // ---- rewrite + write assets -------------------------------------------
  const rewriteBuf = (buf, url) => {
    if (url.endsWith('.framercms')) {
      // Equal-length replacement only; offsets in this blob are absolute. The
      // endpoint swaps below change length, so a blob containing one would have
      // to be handled differently; none does, and this says so out loud.
      for (const [from] of FRAMER_ENDPOINTS) {
        if (buf.includes(from)) throw new Error(`${from} appears in blob ${url}`);
      }
      return Buffer.from(buf.toString('latin1').split(FRAMER).join(MIRROR), 'latin1');
    }
    if (!TEXT_EXT.test(url)) return buf;
    let text = buf
      .toString('utf8')
      .split(FRAMER)
      .join(MIRROR)
      .split(GSTATIC)
      .join(GSTATIC_MIRROR);
    for (const [from, to] of FRAMER_ENDPOINTS) text = text.split(from).join(to);
    return Buffer.from(text, 'utf8');
  };

  let written = 0;
  for (const [url, buf] of bodies) {
    const rel = localPath(url);
    if (!rel) continue;
    const dest = join(OUT_ASSETS, rel);
    const out = rewriteBuf(buf, url);
    if (url.endsWith('.framercms') && out.length !== buf.length) {
      throw new Error(`byte-offset invariant broken rewriting ${url}`);
    }
    if (!DRY) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, out);
    }
    written++;
  }
  log(`${written} assets written to legacy/assets`);
  log(`${aliasIconModules()} icon module aliases written`);

  // ---- rewrite + write pages --------------------------------------------
  for (const [route, raw] of pages) {
    const html = transformPage(raw);
    const rel =
      route === '/'
        ? 'index.html'
        : `${route.replace(/^\//, '').replace(/\/$/, '')}.html`;
    const dest = join(OUT_SITE, rel);
    if (!DRY) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, html, 'utf8');
    }
  }
  log(`${pages.size} pages written to legacy/site`);

  if (!DRY) {
    writeFileSync(join(OUT_SITE, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  }
  log(DRY ? 'dry run, nothing written' : 'done');
}

/** Scripts that phone home. The archive keeps the owner's JSON-LD and nothing else. */
const SCRIPT_BLOCKLIST = [
  'googletagmanager.com',
  'window.dataLayer',
  'clarity.ms',
  'events.framer.com',
  '__framer_force_showing_editorbar_since',
];

/**
 * The archive's two forms ("Send Anonymous Message", "Send Message") posted to
 * Framer's API, which the mirror cannot reach. They are rewired to the live
 * site's /api/whisper instead, keeping their markup byte-identical: the handler
 * is attached at capture phase so React's own submit handler never runs.
 *
 * /api/whisper normally asks a quiz question, and these forms have one textarea
 * and nowhere to put it. Tokens minted for this origin carry a sentinel that
 * attests to skipping the quiz — see LEGACY_QUIZ_ID in app/api/whisper/route.ts.
 */
const formScript = (endpoint) => `<script>(function(){
  var ENDPOINT = ${JSON.stringify(endpoint)};
  var token = null, pending = null;
  function mintToken(){
    if (pending) return pending;
    pending = fetch(ENDPOINT, { credentials: 'omit' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ token = j && j.token; return token; })
      .catch(function(){ return null; });
    return pending;
  }
  function say(form, text){
    var note = form.querySelector('[data-legacy-note]');
    if (!note) {
      note = document.createElement('p');
      note.setAttribute('data-legacy-note', '');
      note.style.cssText = 'margin-top:8px;font-size:13px;opacity:.75';
      form.appendChild(note);
    }
    note.textContent = text;
  }
  function wire(form){
    if (form.dataset.legacyWired) return;
    var field = form.querySelector('textarea[name="Message"]');
    if (!field) return;
    form.dataset.legacyWired = '1';
    field.addEventListener('focus', mintToken, { once: true });
    form.addEventListener('submit', function(event){
      event.preventDefault();
      event.stopImmediatePropagation();
      var message = (field.value || '').trim();
      if (message.length < 5) { say(form, 'A little longer, please.'); return; }
      var trap = form.querySelector('input[name="website"]');
      say(form, 'Sending…');
      mintToken().then(function(t){
        return fetch(ENDPOINT, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: message, token: t || '', _trap: trap ? trap.value : '' })
        });
      }).then(function(res){
        if (res && res.ok) { field.value = ''; token = null; pending = null; say(form, 'Sent. Thank you.'); }
        else { token = null; pending = null; say(form, 'That did not go through. Try again in a moment.'); }
      }).catch(function(){ say(form, 'That did not go through. Try again in a moment.'); });
    }, true);
  }
  function wireAll(){ document.querySelectorAll('form').forEach(wire); }
  wireAll();
  new MutationObserver(wireAll).observe(document.documentElement, { childList: true, subtree: true });
})();</script>`;

/**
 * Resource hints name a bare origin, with no path for the URL rewrite above to
 * catch, so they survive it and still open a TLS connection to Google on every
 * page load. The fonts they were warming up are mirrored now, so the hint is
 * both useless and the last thing leaving the archive.
 */
const HINT_BLOCKLIST = ['fonts.gstatic.com', 'fonts.googleapis.com', 'events.framer.com'];

/**
 * Motion, removed, with one deliberate exception.
 *
 * Three mechanisms drove the animation and none of them answered to
 * `prefers-reduced-motion` (measured against the deployed archive), so each
 * one gets its own rule:
 *
 *  - Scroll reveal. React renders these elements at `will-change:transform;
 *    opacity:0;transform:none` and the runtime fades them in when they enter
 *    the viewport. An `!important` rule outranks the inline style the runtime
 *    keeps rewriting, so the element simply starts and stays visible. The
 *    selector keys on `will-change`, not on opacity, so it goes on matching
 *    while the runtime animates the opacity out from under it. Both spellings
 *    are listed because React serialises without a space and CSSOM with one.
 *    `transform:none` is safe here: the badge is the only node in any page
 *    that pairs `will-change:transform` with a real transform, and it is
 *    already hidden above.
 *  - Bare `opacity:0` containers, which fade in the same way with no
 *    `will-change`. Matching on `opacity:0;` and on end-of-attribute avoids
 *    swallowing `opacity:0.5`, which shares the prefix.
 *  - CSS transitions, keyframes and smooth scroll, via the catch-all.
 *
 * The exception is the Pulse Indicator's ripple, `BG Circle`, which loops
 * opacity 0 -> 0.23 behind a solid dot. That pulse is the one piece of motion
 * that says something (the indicator is live) rather than decorating, so it
 * keeps running. Excluding it from the rules above is not optional: important
 * declarations outrank animations in the cascade, so pinning its opacity
 * would freeze the ripple fully opaque instead of leaving it alone, which
 * looks worse than either the pulse or no pulse at all.
 */
const PULSE = ':not([data-framer-name="BG Circle"])';

const NO_MOTION =
  '<style>' +
  `[style*="will-change:transform"]${PULSE},[style*="will-change: transform"]${PULSE}` +
  '{opacity:1!important}' +
  `[style*="will-change:transform"]${PULSE}{transform:none!important}` +
  `[style*="opacity:0;"]${PULSE},[style$="opacity:0"]${PULSE}{opacity:1!important}` +
  `*${PULSE},*::before,*::after` +
  '{animation:none!important;transition:none!important;scroll-behavior:auto!important}' +
  '</style>';

const INJECT = [
  '<meta name="robots" content="noindex,nofollow">',
  // The badge markup stays so React hydration still matches; the runtime
  // re-injects it after hydration, so removing the tag alone would not hold.
  '<style>#__framer-badge-container,.__framer-badge{display:none!important}</style>',
  NO_MOTION,
].join('');

/**
 * Framer's icon loader addresses a module by name and version
 * (`m/phosphor-icons/House.js@0.0.57`), while the mirror stores it under the
 * opaque pair the CDN resolved to (`modules/<a>/<b>/House.js`). Nothing in the
 * archive maps one to the other, so copy each module to the name the loader
 * asks for. Versions are read out of the chunks rather than hardcoded, so a
 * Framer bump changes one number in one place.
 */
function aliasIconModules() {
  if (DRY) return 0;
  const versions = new Set();
  for (const file of walkFiles(OUT_ASSETS)) {
    if (!/\.(mjs|js)$/.test(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/\.js@(\d+\.\d+\.\d+)/g)) {
      versions.add(m[1]);
    }
  }
  if (versions.size === 0) {
    log('WARN no .js@<version> literal found; icon aliases skipped');
    return 0;
  }

  let n = 0;
  const dir = join(OUT_ASSETS, 'm/phosphor-icons');
  for (const file of walkFiles(join(OUT_ASSETS, 'modules'))) {
    if (!file.endsWith('.js')) continue;
    const name = file.slice(file.lastIndexOf('/') + 1, -'.js'.length);
    const body = readFileSync(file);
    for (const version of versions) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${name}.js@${version}`), body);
      n++;
    }
  }
  return n;
}

/** Every file under `dir`, recursively. Returns [] when `dir` does not exist. */
function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function transformPage(raw) {
  let html = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (tag) =>
      SCRIPT_BLOCKLIST.some((needle) => tag.includes(needle)) ? '' : tag
    )
    .replace(/<link\b[^>]*>/g, (tag) =>
      /rel=["']?(?:preconnect|dns-prefetch)/i.test(tag) &&
      HINT_BLOCKLIST.some((needle) => tag.includes(needle))
        ? ''
        : tag
    )
    .split(FRAMER)
    .join(MIRROR)
    .split(GSTATIC)
    .join(GSTATIC_MIRROR)
    .split(SOURCE)
    .join(site.legacyUrl);

  const headClose = html.indexOf('</head>');
  if (headClose === -1) throw new Error('page has no </head>');
  html = html.slice(0, headClose) + INJECT + html.slice(headClose);

  // After hydration, so the observer sees the forms React renders.
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) throw new Error('page has no </body>');
  html =
    html.slice(0, bodyClose) +
    formScript(`${site.url}/api/whisper`) +
    html.slice(bodyClose);
  return html;
}

main().catch((err) => {
  console.error(`legacy-mirror: ${err.message}`);
  process.exit(1);
});
