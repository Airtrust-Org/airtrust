import { defineConfig } from 'vitest/config';

// Static, no-environment-secrets QA contract suite; browser acceptance stays
// in Playwright and is never counted as a passing staging test by Vitest.
export default defineConfig({
  test: {
    include: [
      'e2e/player3/fixture-contract.test.ts',
      'e2e/player3/rc81-authored-driver.test.ts',
      'e2e/player3/qa-storage-state.test.ts',
    ],
    environment: 'node',
  },
});
