import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/staging/__tests__/**/*.test.mjs'],
  },
});
