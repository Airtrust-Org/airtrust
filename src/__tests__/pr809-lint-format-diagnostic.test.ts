import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const prettierFiles = [
  'docs/ops/PREVIEW_ORIGIN_ENVIRONMENT_ISOLATION.md',
  'scripts/__tests__/guard-no-production-preview-api.test.mjs',
  'scripts/guard-no-production-preview-api.mjs',
  'src/__tests__/cors-origins.test.ts',
  'src/__tests__/lms-cross-origin-cookie-contract.test.ts',
  'src/react-app/__tests__/api-base-resolution.test.ts',
  'src/react-app/config/api-environment.ts',
  'src/react-app/config/api.ts',
  'worker-airtrust/src/__tests__/middleware/environment-entrypoint.test.ts',
  'worker-airtrust/src/__tests__/routes/simuladores-guias-instrutor-cors.test.ts',
  'worker-airtrust/src/config/allowed-origins.ts',
  'worker-airtrust/src/environment-entrypoint.ts',
  'worker-airtrust/src/middleware/cors.ts',
] as const;

const eslintFiles = prettierFiles.filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file));

describe('temporary PR809 lint and format diagnostic', () => {
  it('lists files still different from Prettier 3.9.6', () => {
    const result = spawnSync(
      'npx',
      ['--yes', 'prettier@3.9.6', '--list-different', '--', ...prettierFiles],
      { encoding: 'utf8' },
    );
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    expect(output || 'CLEAN').toBe('CLEAN');
  });

  it('surfaces residual ESLint failures', () => {
    const result = spawnSync('npx', ['eslint', '--max-warnings=0', '--', ...eslintFiles], {
      encoding: 'utf8',
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    expect(output || 'CLEAN').toBe('CLEAN');
  });
});
