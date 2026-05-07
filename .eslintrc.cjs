/* eslint-env node */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  ignorePatterns: [
    'node_modules/',
    'frontend/',
    'data/',
    'coverage/',
    'supabase/.branches/',
    'supabase/.temp/',
  ],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['tests/**/*.js', 'tests/**/*.jsx'],
      env: { node: true },
      globals: { vi: 'readonly' },
    },
  ],
};
