import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'docs/ops/LMS_COMPLETION_EVIDENCE_INTEGRITY_20260804.md',
  'worker-airtrust/src/__tests__/architecture/lms-completion-single-entry-point.test.ts',
  'worker-airtrust/src/__tests__/services/lms-completion-evidence.test.ts',
  'worker-airtrust/src/middleware/lms-completion-integrity.ts',
  'worker-airtrust/src/middleware/lms-completion-persisted-progress.ts',
  'worker-airtrust/src/middleware/lms-completion-reversal.ts',
  'worker-airtrust/src/middleware/lms-enrollment-integrity.ts',
  'worker-airtrust/src/middleware/rbac.ts',
] as const;

describe('temporary exact Prettier export', () => {
  it(
    'prints the exact Prettier 3.9.6 output for the LMS delta',
    () => {
      const repoRoot = resolve(process.cwd(), '..');
      execFileSync(
        'npx',
        ['--yes', 'prettier@3.9.6', '--write', ...files],
        {
          cwd: repoRoot,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      for (const file of files) {
        const content = readFileSync(join(repoRoot, file));
        console.log(`AIRTRUST_FORMATTED_FILE_BEGIN ${file}`);
        console.log(content.toString('base64'));
        console.log(`AIRTRUST_FORMATTED_FILE_END ${file}`);
      }

      expect(files).toHaveLength(8);
    },
    120_000,
  );
});
