import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'worker-airtrust/src/cron/scheduled-handler.ts',
  'worker-airtrust/src/routes/lms-matriculas-mel-manutencao.ts',
] as const;

describe('temporary exact Prettier export', () => {
  it(
    'prints the exact Prettier 3.9.6 output for PR 880',
    () => {
      const repoRoot = resolve(process.cwd(), '..');
      execFileSync('npx', ['--yes', 'prettier@3.9.6', '--write', ...files], {
        cwd: repoRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      for (const file of files) {
        const content = readFileSync(join(repoRoot, file));
        console.log(`AIRTRUST_FORMATTED_FILE_BEGIN ${file}`);
        console.log(content.toString('base64'));
        console.log(`AIRTRUST_FORMATTED_FILE_END ${file}`);
      }

      expect(files).toHaveLength(2);
    },
    120_000,
  );
});
