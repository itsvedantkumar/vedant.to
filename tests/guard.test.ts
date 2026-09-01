// Covers the pure request-shape checks in lib/auth/guard.ts that the
// webauthn verify routes and the password route gate on before doing any
// crypto or Redis work: checkOrigin (CSRF-style allowlist), checkContentType
// (forces a CORS preflight), and sessionSecret (fails closed when unset).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// next/server ships with no package.json "exports" map, so Node's strict ESM
// resolver refuses the extensionless "next/server" specifier that
// lib/auth/guard.ts imports (only CJS `require`/webpack tolerate that).
// Patch resolution for this one specifier before dynamically importing
// guard.ts. This mirrors tests/alias-hook.mjs's existing "@/*" workaround —
// test-only module plumbing, not a change to any source file.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export function resolve(specifier, context, nextResolve) {
         if (specifier === 'next/server') return nextResolve('next/server.js', context);
         return nextResolve(specifier, context);
       }`
    ),
  import.meta.url
);

const { checkContentType, checkOrigin, sessionSecret } = await import('@/lib/auth/guard');

function reqWithHeaders(headers: Record<string, string>): {
  headers: { get(name: string): string | null };
} {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null } };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) original[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// --- checkOrigin -----------------------------------------------------------

test('checkOrigin: production accepts the real prod origin', () => {
  withEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined }, () => {
    assert.equal(checkOrigin(reqWithHeaders({ origin: 'https://vedant.to' })), true);
  });
});

// Subdomains used to pass. They no longer do: a delegated or dangling
// *.vedant.to CNAME would otherwise be a valid CSRF origin for the admin API,
// and nothing serves a subdomain of the site.
test('checkOrigin: production rejects a subdomain of the prod origin', () => {
  withEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined }, () => {
    assert.equal(checkOrigin(reqWithHeaders({ origin: 'https://www.vedant.to' })), false);
  });
});

test('checkOrigin: production rejects a mismatched origin', () => {
  withEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined }, () => {
    assert.equal(checkOrigin(reqWithHeaders({ origin: 'https://evil.com' })), false);
  });
});

test('checkOrigin: production rejects a lookalike domain (vedant.to.evil.com)', () => {
  withEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined }, () => {
    assert.equal(
      checkOrigin(reqWithHeaders({ origin: 'https://vedant.to.evil.com' })),
      false
    );
  });
});

test('checkOrigin: production rejects a random *.vercel.app origin outside preview', () => {
  withEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined }, () => {
    assert.equal(
      checkOrigin(reqWithHeaders({ origin: 'https://some-app.vercel.app' })),
      false
    );
  });
});

test('checkOrigin: preview deploys accept a *.vercel.app origin', () => {
  withEnv({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }, () => {
    assert.equal(
      checkOrigin(reqWithHeaders({ origin: 'https://vedant-to-abc123.vercel.app' })),
      true
    );
  });
});

test('checkOrigin: a missing Origin header is rejected, not waved through', () => {
  withEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined }, () => {
    assert.equal(checkOrigin(reqWithHeaders({})), false);
  });
  withEnv({ NODE_ENV: 'development' }, () => {
    assert.equal(checkOrigin(reqWithHeaders({})), false);
  });
});

test('checkOrigin: non-production accepts localhost', () => {
  withEnv({ NODE_ENV: 'development' }, () => {
    assert.equal(checkOrigin(reqWithHeaders({ origin: 'http://localhost:3000' })), true);
    assert.equal(checkOrigin(reqWithHeaders({ origin: 'https://localhost' })), true);
  });
});

test('checkOrigin: non-production rejects an unrelated origin', () => {
  withEnv({ NODE_ENV: 'development' }, () => {
    assert.equal(checkOrigin(reqWithHeaders({ origin: 'https://evil.com' })), false);
  });
});

// --- checkContentType --------------------------------------------------------

test('checkContentType: accepts exact application/json', () => {
  assert.equal(
    checkContentType(reqWithHeaders({ 'content-type': 'application/json' })),
    true
  );
});

test('checkContentType: accepts application/json with a charset parameter', () => {
  assert.equal(
    checkContentType(
      reqWithHeaders({ 'content-type': 'application/json; charset=utf-8' })
    ),
    true
  );
});

test('checkContentType: rejects other content types', () => {
  assert.equal(checkContentType(reqWithHeaders({ 'content-type': 'text/plain' })), false);
  assert.equal(
    checkContentType(
      reqWithHeaders({ 'content-type': 'application/x-www-form-urlencoded' })
    ),
    false
  );
  assert.equal(
    checkContentType(reqWithHeaders({ 'content-type': 'multipart/form-data' })),
    false
  );
});

test('checkContentType: rejects a missing content-type header', () => {
  assert.equal(checkContentType(reqWithHeaders({})), false);
});

// --- sessionSecret -----------------------------------------------------------

test('sessionSecret: returns undefined when KEYSTATIC_SESSION_SECRET is unset', () => {
  withEnv({ KEYSTATIC_SESSION_SECRET: undefined }, () => {
    assert.equal(sessionSecret(), undefined);
  });
});

test('sessionSecret: returns the configured value when set', () => {
  withEnv({ KEYSTATIC_SESSION_SECRET: 'test-secret-value' }, () => {
    assert.equal(sessionSecret(), 'test-secret-value');
  });
});
