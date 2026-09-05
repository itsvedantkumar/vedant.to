#!/usr/bin/env node
/**
 * legacy-verify.mjs
 *
 * Acceptance test for the deployed archive. Everything here runs against the
 * live origin, not against legacy/ on disk, because the failures worth catching
 * are the ones the Worker introduces: a mirror key that never got uploaded, a
 * `?range=` response of the wrong length, a page that reaches Framer at runtime.
 *
 * Two passes:
 *
 *   static   fetch every route and assert the shape of what comes back
 *   runtime  drive a headless browser over every route and assert that not one
 *            request leaves for Framer or an analytics vendor (--runtime)
 *
 * The static pass cannot see a runtime fetch and the runtime pass is slow, so
 * they are separate and the cheap one is the default.
 *
 * Usage:
 *   node scripts/legacy-verify.mjs
 *   node scripts/legacy-verify.mjs --runtime
 *
 * Env: LEGACY_ORIGIN overrides the origin under test (a preview deployment).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from '../site.config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = join(ROOT, 'legacy/site');
const ASSETS_DIR = join(ROOT, 'legacy/assets');
const ORIGIN = (process.env.LEGACY_ORIGIN ?? site.legacyUrl).replace(/\/$/, '');
const RUNTIME = process.argv.includes('--runtime');
const CONCURRENCY = 8;

/** A host named in the served HTML means the rewrite missed something. */
const FORBIDDEN_IN_HTML = [
  'framerusercontent.com',
  'events.framer.com',
  'googletagmanager.com',
  'google-analytics.com',
  'clarity.ms',
  'fonts.gstatic.com',
];

/**
 * A host actually requested at runtime means the archive is not self-contained.
 *
 * Strictly wider than the list above, and it has to be. `framer.com` is left in
 * the markup on purpose (the hidden badge's href, and Framer's attribution
 * comments), so it cannot be banned from the HTML. But nothing may ever fetch
 * it. The on-page editor bar used to `import('https://framer.com/edit/init.mjs')`
 * from inside a JS chunk, and that module pulled icon components straight from
 * framerusercontent.com. No string in any file the mirror rewrites could have
 * revealed that. Only watching the network does.
 */
const FORBIDDEN_REQUESTS = [
  ...FORBIDDEN_IN_HTML,
  'framer.com',
  'framerstatic.com',
  'framer.app',
];

let failures = 0;
const fail = (what, detail) => {
  failures++;
  console.error(`  FAIL ${what}: ${detail}`);
};
const ok = (what) => console.log(`  ok   ${what}`);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** legacy/site/blog/x.html → /blog/x, index.html → /. */
function routes() {
  return walk(SITE_DIR)
    .filter((f) => f.endsWith('.html') && !f.endsWith('404.html'))
    .map((f) => '/' + f.slice(SITE_DIR.length + 1).replace(/\.html$/, ''))
    .map((r) => (r === '/index' ? '/' : r))
    .sort();
}

async function mapLimit(items, fn) {
  let cursor = 0;
  const out = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

// --- pages -------------------------------------------------------------------

async function checkPages(list) {
  console.log(`\npages (${list.length})`);
  let bad = 0;
  await mapLimit(list, async (route) => {
    let res, html;
    try {
      res = await fetch(ORIGIN + route);
      html = await res.text();
    } catch (err) {
      bad++;
      return fail(route, err.message);
    }
    if (res.status !== 200) return (bad++, fail(route, `status ${res.status}`));
    for (const host of FORBIDDEN_IN_HTML) {
      if (html.includes(host)) return (bad++, fail(route, `references ${host}`));
    }
    if (!/<meta name="robots" content="noindex/.test(html)) {
      return (bad++, fail(route, 'no noindex meta'));
    }
    if ((res.headers.get('x-robots-tag') ?? '').indexOf('noindex') === -1) {
      return (bad++, fail(route, 'no x-robots-tag header'));
    }
    // The detail pages are shells until the CMS blob loads, so the served HTML
    // cannot be asserted to hold the post body — but the per-route <title> is
    // server-rendered, and a shell served for the wrong route shows up as the
    // homepage title on all 58 of them.
    if (!/<title>[^<]+<\/title>/.test(html)) return (bad++, fail(route, 'no title'));
  });
  if (bad === 0) ok(`${list.length} routes: 200, noindex, no third-party hosts`);
}

// --- robots and 404 ----------------------------------------------------------

async function checkRobotsAnd404() {
  console.log('\nrobots + 404');
  const robots = await fetch(`${ORIGIN}/robots.txt`);
  const body = await robots.text();
  if (robots.status !== 200 || !/^\s*Disallow:\s*\/\s*$/m.test(body)) {
    fail(
      'robots.txt',
      `status ${robots.status}, body ${JSON.stringify(body.slice(0, 80))}`
    );
  } else {
    ok('robots.txt disallows everything');
  }

  const missing = await fetch(`${ORIGIN}/this-route-does-not-exist`);
  if (missing.status !== 404) fail('unknown route', `status ${missing.status}, want 404`);
  else ok('unknown route serves the archive 404');
}

// --- the ?range= protocol ----------------------------------------------------

/**
 * The one piece of real logic in the Worker, and the one whose failure is
 * silent: a wrong length makes Framer's reader throw and the page render blank
 * with a 200 everywhere else. Checked against a real blob, byte for byte.
 */
async function checkRange() {
  console.log('\n?range= protocol');
  const blob = walk(ASSETS_DIR).find((f) => f.endsWith('.framercms'));
  if (!blob) return fail('range', 'no .framercms in legacy/assets; run legacy:mirror');

  const key = blob
    .slice(ASSETS_DIR.length + 1)
    .split(/[\\/]/)
    .join('/');
  const url = `${ORIGIN}/fr-mirr/${key}`;
  const local = readFileSync(blob);
  const size = statSync(blob).size;

  const whole = await fetch(url);
  const wholeBody = Buffer.from(await whole.arrayBuffer());
  if (whole.status !== 200 || wholeBody.length !== size) {
    fail(
      'whole blob',
      `status ${whole.status}, ${wholeBody.length} bytes, want 200/${size}`
    );
  } else if (!wholeBody.equals(local)) {
    fail('whole blob', 'bytes differ from the local mirror');
  } else {
    ok(`whole blob is byte-identical (${size} bytes)`);
  }

  // Two disjoint slices, out of order, exactly as the reader asks for them.
  const pairs = [
    [100, 199],
    [10, 59],
  ];
  const total = pairs.reduce((n, [a, b]) => n + b - a + 1, 0);
  const spec = pairs.map(([a, b]) => `${a}-${b}`).join(',');
  const sliced = await fetch(`${url}?range=${spec}`);
  const body = Buffer.from(await sliced.arrayBuffer());
  const want = Buffer.concat(pairs.map(([a, b]) => local.subarray(a, b + 1)));

  if (sliced.status !== 200) {
    fail('range', `status ${sliced.status}, want 200 (a 206 breaks the reader)`);
  } else if (sliced.headers.get('content-length') !== String(total)) {
    fail(
      'range',
      `content-length ${sliced.headers.get('content-length')}, want ${total}`
    );
  } else if (!body.equals(want)) {
    fail('range', 'slices returned in the wrong order or from the wrong offsets');
  } else {
    ok(`range=${spec} → 200, ${total} bytes, concatenated in order`);
  }

  for (const badSpec of ['abc', '5-1', `0-${size}`, '1-2,', '-5', '1-2,'.repeat(80)]) {
    const res = await fetch(`${url}?range=${encodeURIComponent(badSpec)}`);
    if (res.status !== 400) {
      fail('bad range', `${JSON.stringify(badSpec)} → ${res.status}, want 400`);
    }
  }
  ok('malformed, inverted, over-length and over-count ranges all 400');
}

// --- icon modules ------------------------------------------------------------

/**
 * Framer's icon loader imports `House.js@0.0.57`, so the version suffix sits
 * where the extension normally would. Type one of these `application/octet-
 * stream` and the browser, holding `nosniff`, refuses to execute it: the import
 * rejects, the icon never renders, and every other check here still passes.
 * That shipped once, and every social icon and the email button were missing
 * until someone looked at the page.
 */
async function checkIconModules() {
  console.log('\nicon modules');
  const modules = walk(ASSETS_DIR).filter((f) => /\.js@[\d.]+$/.test(f));
  if (modules.length === 0) {
    return fail('icon modules', 'none found in legacy/assets; run legacy:mirror');
  }
  let bad = 0;
  for (const file of modules) {
    const key = file
      .slice(ASSETS_DIR.length + 1)
      .split(/[\\/]/)
      .join('/');
    const res = await fetch(`${ORIGIN}/fr-mirr/${key}`);
    const type = res.headers.get('content-type') ?? '';
    if (res.status !== 200) {
      bad++;
      fail(key, `status ${res.status}`);
    } else if (!/^(text|application)\/javascript/.test(type)) {
      bad++;
      fail(key, `content-type ${type}, so the browser will refuse the import`);
    }
  }
  if (bad === 0) ok(`${modules.length} icon modules served as JavaScript`);
}

// --- runtime -----------------------------------------------------------------

function checkRuntime(list) {
  console.log(`\nruntime pass (${list.length} routes)`);
  // The request log is per session and survives navigation, so anything opened
  // before this point, by checkForms or by hand, would be read as the first
  // route's traffic. Start from empty or the first route inherits it.
  spawnSync('npx', ['--yes', 'agent-browser', 'close', '--all'], { stdio: 'ignore' });
  spawnSync('npx', ['--yes', 'agent-browser', 'network', 'requests', '--clear'], {
    stdio: 'ignore',
  });
  const offenders = new Map();
  const rendered = new Map();
  list.forEach((route, i) => {
    spawnSync('npx', ['--yes', 'agent-browser', 'open', ORIGIN + route], {
      stdio: 'ignore',
    });
    // Every detail page ships the same empty shell; its content arrives from a
    // CMS blob after hydration. Reading the rendered text is the only way to
    // tell a working archive from 58 identical blank pages, all of which
    // answer 200.
    const text = spawnSync('npx', ['--yes', 'agent-browser', 'read'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    rendered.set(route, (text.stdout ?? '').trim());
    // `--clear` empties the buffer before printing, so read and clear are two
    // calls, not one (same trap as scripts/legacy-mirror.mjs).
    const res = spawnSync('npx', ['--yes', 'agent-browser', 'network', 'requests'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    for (const host of FORBIDDEN_REQUESTS) {
      if ((res.stdout ?? '').includes(host)) {
        offenders.set(route, [...(offenders.get(route) ?? []), host]);
      }
    }
    spawnSync('npx', ['--yes', 'agent-browser', 'network', 'requests', '--clear'], {
      stdio: 'ignore',
    });
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${list.length}`);
  });
  spawnSync('npx', ['--yes', 'agent-browser', 'close', '--all'], { stdio: 'ignore' });

  if (offenders.size === 0) ok('no route requested Framer or an analytics vendor');
  else
    for (const [route, hosts] of offenders) fail(route, `requested ${hosts.join(', ')}`);

  const MIN_CHARS = 400;
  const thin = [...rendered].filter(([, t]) => t.length < MIN_CHARS).map(([r]) => r);
  if (thin.length) {
    fail(
      'empty pages',
      `${thin.length} under ${MIN_CHARS} chars: ${thin.slice(0, 5).join(', ')}`
    );
  } else {
    ok(`every route rendered at least ${MIN_CHARS} characters`);
  }

  // The shell failure mode is uniform: if the blob never loads, every detail
  // page renders the same nav-and-footer text.
  const distinct = new Set(rendered.values()).size;
  if (distinct < rendered.size) {
    fail(
      'duplicate renders',
      `${rendered.size - distinct} routes rendered identical text`
    );
  } else {
    ok(`all ${rendered.size} routes rendered distinct content`);
  }
}

// --- forms -------------------------------------------------------------------

/**
 * The submit handler is injected as one inline script. A single syntax error in
 * it is silent: the page renders, every other check passes, and the forms just
 * quietly stop submitting. That is exactly how a stray newline inside a string
 * literal shipped once. So assert the handler ran and claimed every form.
 */
function checkForms() {
  console.log('\nforms');
  spawnSync('npx', ['--yes', 'agent-browser', 'open', `${ORIGIN}/`], { stdio: 'ignore' });
  const probe =
    '(async()=>{await new Promise(r=>setTimeout(r,2500));' +
    'var f=[...document.querySelectorAll("form")];' +
    'return JSON.stringify({total:f.length,wired:f.filter(x=>x.dataset.legacyWired).length})})()';
  const res = spawnSync('npx', ['--yes', 'agent-browser', 'eval', probe], {
    encoding: 'utf8',
  });
  // agent-browser prints the eval result as a JSON-encoded string, so the
  // payload needs unwrapping twice.
  const match = (res.stdout ?? '').match(/"\{.*\}"/s);
  if (!match) return fail('forms', 'could not read the page');
  const { total, wired } = JSON.parse(JSON.parse(match[0]));
  if (total === 0) return fail('forms', 'no form on the homepage');
  if (wired !== total) {
    return fail('forms', `${wired}/${total} wired; the injected handler did not run`);
  }
  ok(`${total} forms wired to the endpoint`);
}

// --- run ---------------------------------------------------------------------

const list = routes();
console.log(`legacy-verify: ${ORIGIN}`);
await checkPages(list);
await checkRobotsAnd404();
await checkRange();
await checkIconModules();
if (RUNTIME) {
  checkForms();
  checkRuntime(list);
} else console.log('\nruntime pass skipped (pass --runtime to run it)');

console.log(
  failures === 0
    ? '\nlegacy-verify: all checks passed'
    : `\nlegacy-verify: ${failures} failed`
);
process.exit(failures === 0 ? 0 : 1);
