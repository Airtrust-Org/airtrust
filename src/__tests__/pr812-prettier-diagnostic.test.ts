import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'worker-airtrust/src/__tests__/cron/domain-events-resilience.test.ts',
  'worker-airtrust/src/cron/resilient/job-runner.ts',
  'worker-airtrust/src/observability/operational-metrics.ts',
  'worker-airtrust/src/observability/operational-status.ts',
  'worker-airtrust/src/routes/system.ts',
] as const;

describe('temporary PR812 Prettier diagnostic', () => {
  for (const [index, file] of files.entries()) {
    it(`emits exact Prettier diff for ${file}`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'pr812-prettier-'));
      const formatted = execFileSync('npx', ['--yes', 'prettier@3.9.6', file], {
        encoding: 'utf8',
      });
      const outputPath = join(directory, `${index}.formatted`);
      writeFileSync(outputPath, formatted, 'utf8');
      const diff = spawnSync('diff', ['-u', file, outputPath], {
        encoding: 'utf8',
      }).stdout;

      expect(diff || 'CLEAN').toBe('CLEAN');
    });
  }
});
