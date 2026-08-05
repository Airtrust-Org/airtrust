import { execFileSync } from 'node:child_process';
import { describe, it } from 'vitest';

const FILES = [
  'scripts/guard-no-production-preview-api.mjs',
  'src/__tests__/cors-origins.test.ts',
  'src/react-app/__tests__/api-base-resolution.test.ts',
  'worker-airtrust/src/__tests__/middleware/environment-entrypoint.test.ts',
  'worker-airtrust/src/config/allowed-origins.ts',
] as const;

describe('temporary prettier output diagnostic', () => {
  it(
    'prints the exact formatter output for the five failing files',
    () => {
      for (const file of FILES) {
        const formatted = execFileSync(
          'npx',
          ['--yes', 'prettier@3.9.6', file],
          { encoding: 'utf8' },
        );
        const encoded = Buffer.from(formatted, 'utf8').toString('base64');
        console.log(`PRETTIER_DIAGNOSTIC::${file}::${encoded}`);
      }
    },
    120_000,
  );
});
