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
  },
});
