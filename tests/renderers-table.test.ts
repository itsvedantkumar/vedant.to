// Covers lib/renderers.tsx's `table` block renderer. Keystatic's actual
// contract (@keystatic/core/dist/declarations/src/renderer.d.ts) is a single
// `block.table` component receiving `{ head?, body }` — arrays of already
// -rendered cells — not a `children`-based tree walked through separate
// table_head/table_body/table_row/table_cell renderers. Those four keys
// aren't part of the Renderers type, and DocumentRenderer's own table case
// (keystatic-core-renderer.node.js) hardcodes the head/body extraction
// itself; it never looks up renderers.block.table_head etc. Before this test
// existed, lib/renderers.tsx defined exactly those four dead keys, and its
// real `table` renderer destructured `{ children }`, which DocumentRenderer
// never passes — the bug was invisible because content/ has no tables yet
// and the `as unknown as ...` cast at the two call sites erases the type
// mismatch a compiler could otherwise have caught.
//
// This drives the actual DocumentRenderer from @keystatic/core/renderer
// (not a shape assertion on the renderers object) through react-dom/server's
// renderToStaticMarkup, and inspects the resulting HTML string.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentRenderer } from '@keystatic/core/renderer';
import ts from 'typescript';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';

// next/link and next/image, like next/server in tests/guard.test.ts, ship
// with no "exports" map entry that ESM resolution accepts for their
// extensionless subpath form, even though next/link.js and next/image.js
// exist on disk — Node's ESM resolver (unlike CJS require) doesn't guess
// extensions for arbitrary bare-specifier subpaths. lib/renderers.tsx uses
// both to build BodyImage/links; patch resolution the same way guard.test.ts
// already does for next/server, rather than inventing a second technique.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export function resolve(specifier, context, nextResolve) {
         if (specifier === 'next/link') return nextResolve('next/link.js', context);
         if (specifier === 'next/image') return nextResolve('next/image.js', context);
         return nextResolve(specifier, context);
       }`
    ),
  import.meta.url
);

// `node --experimental-strip-types` erases TS *types* but cannot parse JSX —
// it's syntax, not a type annotation — so lib/renderers.tsx (real JSX) can't
// be imported the way the other `@/lib/*.ts` modules in this suite are.
// Compile the actual file on disk with the TypeScript compiler already in
// devDependencies (jsx: react-jsx, no new dependency needed), write the
// result to a throwaway file next to this test so relative/bare imports
// (react, next/link, next/image, sugar-high, @/lib/constants) resolve
// exactly as they do for the real module, import it, then delete it. This
// exercises the real lib/renderers.tsx source, not a hand-copied stand-in.
const rendererSourcePath = join(process.cwd(), 'lib/renderers.tsx');
const compiledPath = join(
  process.cwd(),
  `tests/.renderers-compiled.${process.pid}.${Date.now()}.mjs`
);

function cleanup() {
  if (existsSync(compiledPath)) unlinkSync(compiledPath);
}

async function loadRealRenderers(): Promise<{
  renderers: typeof import('@/lib/renderers').renderers;
}> {
  const source = readFileSync(rendererSourcePath, 'utf-8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName: 'renderers.tsx',
  });
  assert.deepEqual(
    diagnostics ?? [],
    [],
    'lib/renderers.tsx failed to transpile for the test harness'
  );
  // `cache` from 'react' is React's server-components memoization API. The
  // plain npm `react@18.3.1` in node_modules doesn't export it (Next.js
  // resolves 'react' to its own vendored, patched build for App Router
  // server components — node_modules/next/dist/compiled/react — a
  // resolution alias only Next's bundler applies, not plain Node ESM).
  // lib/renderers.tsx uses it only to memoize the CDN image-dimension probe
  // (BodyImage/probeImageDims), which this test's table-only document never
  // reaches, so a same-behavior-when-unused identity shim is safe here.
  const patched = outputText.replace(
    /import React, \{ cache \} from ["']react["'];/,
    "import React from 'react';\nconst cache = (fn) => fn; // test-harness shim, see comment above"
  );
  assert.notEqual(
    patched,
    outputText,
    'expected to find the cache import to shim in the transpiled output'
  );
  writeFileSync(compiledPath, patched, 'utf-8');
  try {
    return (await import(`file://${compiledPath}`)) as {
      renderers: typeof import('@/lib/renderers').renderers;
    };
  } finally {
    cleanup();
  }
}

after(cleanup);

const { renderers } = await loadRealRenderers();

// Minimal Keystatic document tree for a 2-column, header + 2-row table.
// Shape mirrors what the Keystatic table toolbar produces: a `table` node
// whose children are a `table_head` (one `table_row` of `table_cell`s) and a
// `table_body` (N `table_row`s of `table_cell`s); each cell holds a
// `paragraph` of text runs, same as any other Slate-style block content.
function cell(text: string) {
  return {
    type: 'table_cell',
    children: [{ type: 'paragraph', children: [{ text }] }],
  };
}
function row(...cells: ReturnType<typeof cell>[]) {
  return { type: 'table_row', children: cells };
}

const document = [
  {
    type: 'table',
    children: [
      { type: 'table_head', children: [row(cell('Name'), cell('Age'))] },
      {
        type: 'table_body',
        children: [row(cell('Ada'), cell('36')), row(cell('Grace'), cell('85'))],
      },
    ],
  },
] as unknown as Parameters<typeof DocumentRenderer>[0]['document'];

// The pre-fix renderer, reconstructed here (not imported — the whole point
// is that it must NOT be the current lib/renderers.tsx). It destructures
// `{ children }`, matching what the four now-deleted table_* keys expected,
// but DocumentRenderer's table case invokes `renderers.block.table` with
// `{ head, body }` only — `children` is never passed, so this renders an
// empty shell. This is the "fails quietly" behavior the task description
// warned about: no throw, just a `<table>` with nothing in it.
const brokenTableRenderers = {
  block: {
    table: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(
        'div',
        { className: 'overflow-x-auto my-6' },
        React.createElement(
          'table',
          {
            className: 'w-full text-sm border-collapse text-gray-800 dark:text-zinc-300',
          },
          children
        )
      ),
  },
} as unknown as Parameters<typeof DocumentRenderer>[0]['renderers'];

test('OLD table renderer ({children}) renders an empty <table> — proves the defect was live, not hypothetical', () => {
  const html = renderToStaticMarkup(
    React.createElement(DocumentRenderer, {
      document,
      renderers: brokenTableRenderers,
    })
  );
  assert.match(html, /<table[^>]*>/);
  // The defect: no thead, no tbody, none of the header/body text made it
  // into the output. DocumentRenderer passed { head, body }; the broken
  // renderer only reads `children`, which is undefined.
  assert.doesNotMatch(html, /<thead/);
  assert.doesNotMatch(html, /<tbody/);
  assert.doesNotMatch(html, /Name|Age|Ada|Grace|36|85/);
});

test('NEW table renderer ({head, body}) renders real thead/tbody with cells in document order', () => {
  const html = renderToStaticMarkup(
    React.createElement(DocumentRenderer, {
      document,
      renderers: renderers as unknown as Parameters<
        typeof DocumentRenderer
      >[0]['renderers'],
    })
  );

  assert.match(html, /<table[^>]*class="[^"]*w-full[^"]*"/);

  // Header row: two <th>, in order, inside <thead>.
  const theadMatch = html.match(/<thead[^>]*>(.*?)<\/thead>/);
  assert.ok(theadMatch, 'expected a <thead> in the output');
  const headCells = [...theadMatch![1].matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '')
  );
  assert.deepEqual(headCells, ['Name', 'Age']);

  // Body: two rows of <td>, each in order, inside <tbody>.
  const tbodyMatch = html.match(/<tbody[^>]*>(.*?)<\/tbody>/);
  assert.ok(tbodyMatch, 'expected a <tbody> in the output');
  const rows = [...tbodyMatch![1].matchAll(/<tr[^>]*>(.*?)<\/tr>/g)];
  assert.equal(rows.length, 2);
  const bodyCells = rows.map((r) =>
    [...r[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
  );
  assert.deepEqual(bodyCells, [
    ['Ada', '36'],
    ['Grace', '85'],
  ]);

  // <th> must precede <td> in document order — head before body, not merged.
  assert.ok(html.indexOf('<th') < html.indexOf('<td'));

  // No trace of the dead table_head/table_body/table_row/table_cell keys:
  // DocumentRenderer never calls them, so nothing in lib/renderers.tsx
  // should reference `header` prop-driven <th> logic outside the new
  // head/body shape. (Sanity: the renderers object itself has no such keys.)
  const blockKeys = Object.keys(renderers.block);
  for (const deadKey of ['table_head', 'table_body', 'table_row', 'table_cell']) {
    assert.ok(!blockKeys.includes(deadKey), `${deadKey} should have been deleted`);
  }
});
