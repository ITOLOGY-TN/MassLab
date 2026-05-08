import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.test.js',
      'tests/contract/**/*.test.js',
    ],
    environment: 'node',
    testTimeout: 30000,
    // Integration + contract tests share a single cloud Supabase athlete, so
    // parallel test files race on the at-most-one-active-program invariant
    // and on profile mutations. Running test files serially keeps shared
    // remote state coherent; pure unit tests are still cheap to run this way.
    fileParallelism: false,
  },
});
