// Locks in the metadata-shadowing invariant behind commit 01155f3. Next.js
// merges route metadata SHALLOWLY per top-level key: when a page's metadata
// sets `openGraph` (or `twitter`, or `alternates`), that object REPLACES the
// root layout's object wholesale — nested keys are not merged. That is how
// `alternates.types` (the RSS/JSON feed discovery links) silently vanished
// from every content page for months: createMetadata set
// `alternates: { canonical }` and shadowed the root's `alternates.types`.
//
// The invariant: for every top-level metadata key that BOTH app/layout.tsx
// and createMetadata (lib/metadata.ts) set as an object, the helper must
// re-supply every nested key the root layout sets. Otherwise adding one key
// to the root layout (a second openGraph image, a ttl) silently drops it
// from all six content pages, with no error anywhere.
//
// Comparison approach, and why:
// - Helper side is exercised at RUNTIME — createMetadata is imported and
//   called for both of its shapes (static page, article), so the key sets
//   are the real ones, conditional spreads included.
// - Layout side is read via the TypeScript compiler API (AST), not a runtime
//   import and not a regex. app/layout.tsx contains JSX and imports
//   globals.css; `node --experimental-strip-types` erases types but does not
//   transform JSX or load CSS, so importing the module here is impossible.
//   Parsing the `export const metadata` object literal with ts.createSourceFile
//   is the next-most-robust option: it survives reformatting and renames that
//   would rot a regex, and it fails loudly (rather than passing vacuously) if
//   the object ever gains a spread or computed key it cannot enumerate.
//
// The direction root-only → helper-missing is the only bug: keys the helper
// sets that the root does not are fine and deliberately not asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';
import { createMetadata } from '@/lib/metadata';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const layoutPath = 'app/layout.tsx';

// `title` is resolved by Next's title-template machinery, not by the shallow
// merge: a page's string title is threaded through the root's
// `title.template`, so the root's { default, template } object is consumed,
// not shadowed. Every other object-valued key follows replace-wholesale rules.
const TEMPLATE_RESOLVED_KEYS = new Set(['title']);

// --- layout side: AST extraction ---------------------------------------------

function namedKeys(obj: ts.ObjectLiteralExpression, where: string): Set<string> {
  const keys = new Set<string>();
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
      const name = prop.name;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
        keys.add(name.text);
        continue;
      }
    }
    // A spread, method, or computed name would hide keys from this test and
    // let the invariant rot silently — fail loudly instead of passing vacuously.
    assert.fail(
      `${where} in ${layoutPath} contains a property this test cannot enumerate ` +
        `statically (${ts.SyntaxKind[prop.kind]}). Update ` +
        `tests/metadata-shadowing.test.ts to handle it, or the shadowing ` +
        `invariant goes unchecked.`
    );
  }
  return keys;
}

function layoutMetadataObject(): ts.ObjectLiteralExpression {
  const source = ts.createSourceFile(
    layoutPath,
    readFileSync(join(repoRoot, layoutPath), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  for (const stmt of source.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const exported =
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (!exported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.name.text === 'metadata' &&
        decl.initializer !== undefined &&
        ts.isObjectLiteralExpression(decl.initializer)
      ) {
        return decl.initializer;
      }
    }
  }
  assert.fail(
    `no \`export const metadata = { ... }\` object literal found in ${layoutPath}; ` +
      `update tests/metadata-shadowing.test.ts to find it in its new shape`
  );
}

/** Top-level key -> nested key names (null when the value is not an object literal). */
function layoutKeyMap(): Map<string, Set<string> | null> {
  const map = new Map<string, Set<string> | null>();
  for (const prop of layoutMetadataObject().properties) {
    if (!ts.isPropertyAssignment(prop)) {
      assert.fail(
        `metadata in ${layoutPath} has a non-plain property ` +
          `(${ts.SyntaxKind[prop.kind]}); update tests/metadata-shadowing.test.ts`
      );
    }
    const name = prop.name;
    if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) {
      assert.fail(
        `metadata in ${layoutPath} has a computed key; update ` +
          `tests/metadata-shadowing.test.ts`
      );
    }
    map.set(
      name.text,
      ts.isObjectLiteralExpression(prop.initializer)
        ? namedKeys(prop.initializer, `metadata.${name.text}`)
        : null
    );
  }
  return map;
}

// --- helper side: real runtime output ----------------------------------------

function toRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value));
}

function keySetIfPlainObject(value: unknown): Set<string> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return new Set(Object.keys(value));
  }
  return null;
}

const helperVariants: { label: string; meta: Record<string, unknown> }[] = [
  {
    label: 'static page (no publishedAt)',
    meta: toRecord(
      createMetadata({ title: 'Title', description: 'Desc', path: '/blog' })
    ),
  },
  {
    label: 'article (publishedAt + updatedAt)',
    meta: toRecord(
      createMetadata({
        title: 'Title',
        description: 'Desc',
        path: '/blog/post',
        publishedAt: '2025-01-01',
        updatedAt: '2025-02-01',
      })
    ),
  },
];

// --- self-check ---------------------------------------------------------------
// If the AST extraction rots (metadata export renamed, restructured), the
// superset test below would pass vacuously over an empty map. Fail here first.

test('self-check: layout metadata extraction still sees the shared object keys', () => {
  const layout = layoutKeyMap();
  for (const key of ['openGraph', 'twitter', 'alternates']) {
    const nested = layout.get(key);
    assert.ok(
      nested !== undefined && nested !== null && nested.size > 0,
      `expected metadata.${key} in ${layoutPath} to be an object literal with keys; ` +
        `extraction in tests/metadata-shadowing.test.ts is stale — update it`
    );
  }
});

// --- the invariant ------------------------------------------------------------

for (const { label, meta } of helperVariants) {
  test(`createMetadata (${label}) re-supplies every nested key the root layout sets`, () => {
    for (const [topKey, rootNested] of layoutKeyMap()) {
      if (TEMPLATE_RESOLVED_KEYS.has(topKey)) continue;
      // Key the helper never sets (e.g. robots): the root's value survives
      // Next's shallow merge untouched. Not part of the invariant.
      if (!(topKey in meta)) continue;
      // Root value is not an object literal: nothing nested to lose.
      if (rootNested === null) continue;
      const helperNested = keySetIfPlainObject(meta[topKey]);
      if (helperNested === null) {
        assert.fail(
          `metadata.${topKey} is an object in ${layoutPath} but createMetadata ` +
            `(${label}) sets ${topKey} to a non-object, shadowing every nested ` +
            `key the root supplies`
        );
      }
      for (const key of rootNested) {
        assert.ok(
          helperNested.has(key),
          `${topKey}.${key} is set in ${layoutPath} but not by createMetadata ` +
            `(${label}) in lib/metadata.ts. Next merges metadata shallowly per ` +
            `top-level key, so every content page that calls createMetadata ` +
            `silently drops ${topKey}.${key} — no error, no build failure. ` +
            `Re-supply it in createMetadata (see the FEED_TYPES pattern).`
        );
      }
    }
  });
}

// --- regression: the exact bug that shipped -----------------------------------
// createMetadata sets `alternates` (for the canonical URL), which replaces the
// root layout's `alternates` wholesale. It must therefore carry the feed
// discovery links itself, or no content page emits them — the original bug.

test('createMetadata alternates includes the RSS and JSON feed discovery links', () => {
  for (const { label, meta } of helperVariants) {
    const alternates = meta['alternates'];
    if (typeof alternates !== 'object' || alternates === null) {
      assert.fail(`createMetadata (${label}) does not set alternates to an object`);
    }
    const types = toRecord(alternates)['types'];
    if (typeof types !== 'object' || types === null) {
      assert.fail(
        `createMetadata (${label}) alternates has no \`types\` — the feed ` +
          `discovery links are dropped from every content page (this is the ` +
          `exact bug fixed in 01155f3)`
      );
    }
    const feeds = toRecord(types);
    assert.equal(
      feeds['application/rss+xml'],
      '/rss.xml',
      `createMetadata (${label}) alternates.types is missing the RSS feed link`
    );
    assert.equal(
      feeds['application/feed+json'],
      '/feed.json',
      `createMetadata (${label}) alternates.types is missing the JSON feed link`
    );
  }
});
