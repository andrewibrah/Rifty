// @ts-nocheck
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  optimizeDeps: {
    exclude: ['react-native'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'react-native': resolve(__dirname, 'tests/mocks/react-native.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [resolve(__dirname, 'tests/test-setup.ts')],
    coverage: {
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
  },
});
