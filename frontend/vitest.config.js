import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['../tests/frontend/**/*.test.jsx'],
      setupFiles: ['../tests/frontend/setup.js'],
    },
  }),
);
