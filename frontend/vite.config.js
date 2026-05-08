import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.PORT || 3000;

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The root workspace pulls in its own React via @testing-library/react. We
    // dedupe so both runtime and test renders use the frontend workspace's copy.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api/v1': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: false,
      },
    },
  },
});
