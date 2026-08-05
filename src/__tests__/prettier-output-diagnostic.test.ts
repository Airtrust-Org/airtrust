import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    'prints concise unified diffs for the five failing files',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'prettier-diagnostic-'));

      for (const [index, file] of FILES.entries()) {
        const formatted = execFileSync(
          'npx',
          ['--yes', 'prettier@3.9.6', file],
          { encoding: 'utf8' },
        );
        const outputPath = join(directory, `${index}.formatted`);
        writeFileSync(outputPath, formatted, 'utf8');
        const diff = spawnSync('diff', ['-u', file, outputPath], {
          encoding: 'utf8',
        });
        console.log(`PRETTIER_DIFF_START::${file}`);
        console.log(diff.stdout || 'NO_DIFF');
        console.log(`PRETTIER_DIFF_END::${file}`);
      }
    },
    120_000,
  );
});
