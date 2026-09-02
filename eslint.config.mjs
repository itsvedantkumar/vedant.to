import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import security from 'eslint-plugin-security';

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'content/**'],
  },
  ...nextVitals,
  ...nextTs,
  {
    ...security.configs.recommended,
    rules: {
      ...security.configs.recommended.rules,
      // Flags any bracket-notation property access with a non-literal key
      // (e.g. `obj[key]`) regardless of where `key` comes from. Firing on
      // every dynamic lookup drowns out real findings; disabled at the
      // config level rather than sprinkling per-line disables.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'warn',
    },
  },
];

export default config;
