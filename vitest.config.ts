/**
 * Vitest config para o FRONTEND (React, jsdom).
 * Para testes do worker: cd worker-airtrust && npx vitest run
 * ou: npm run test:worker
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DISABLE_AUTH: 'true',
      VITEST: 'true',
      // Porta de descarte local: qualquer chamada não mockada falha sem alcançar rede externa.
      VITE_API_URL: 'http://127.0.0.1:9/api',
    },
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      'src/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'text-summary'],
      include: [
        'src/react-app/utils/**/*.ts',
        'src/react-app/components/**/*.tsx',
        'src/react-app/pages/escalas/**/*.ts',
        'src/react-app/pages/escalas/**/*.tsx',
      ],
      exclude: ['node_modules/', 'src/**/*.d.ts', 'src/**/__tests__/**', 'dist/', 'cypress/'],
      // Ratchet baseline from canonical main 52bd7abc CI:
      // statements 22.12%, branches 20.84%, functions 19.42%, lines 22.26%.
      // Keep thresholds at the Vitest-supported root level so the gate is
      // actually enforced; increases should be monotonic as coverage improves.
      thresholds: {
        branches: 20.8,
        functions: 19.4,
        lines: 22.2,
        statements: 22.1,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
