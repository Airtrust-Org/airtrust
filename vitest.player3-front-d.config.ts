import {defineConfig} from 'vitest/config';

/** Isolated Front D preflight tests; not part of repository-wide frontend ratchet. */
export default defineConfig({
  test: {
    include: ['e2e/player3/fixture-contract.test.ts','e2e/player3/rc81-authored-driver.test.ts'],
    environment: 'node',
  },
});
