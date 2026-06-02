// ESLint v9 flat config (replaces .eslintrc.cjs).
// Scope: backend JS only — frontend keeps Vite/React's defaults via its own config.
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/',
      'frontend/',
      'data/',
      'coverage/',
      'supabase/.branches/',
      'supabase/.temp/',
      '.claude/',
    ],
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.js', 'tests/**/*.jsx'],
    languageOptions: {
      globals: { ...globals.node, vi: 'readonly' },
    },
  },
  {
    // Frontend smoke tests use JSX; the React renderer is jsdom-resolved at
    // runtime (frontend/vitest.config.js). We just need the parser to accept
    // angle-bracket syntax — no React lint rules applied here.
    files: ['**/*.jsx'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node, vi: 'readonly' },
    },
  },
];
