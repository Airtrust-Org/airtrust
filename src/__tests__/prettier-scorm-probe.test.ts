import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TARGETS = [
  join(
    process.cwd(),
    'worker-airtrust/src/__tests__/routes/lms-relatorios-scorm-pagination.test.ts',
  ),
  join(process.cwd(), 'worker-airtrust/src/repositories/lmsRelatoriosRepository.ts'),
];

function prettierDiff(path: string): string {
  const formatted = execFileSync('npx', ['--yes', 'prettier@3.9.6', path], {
    encoding: 'utf8',
  });
  const directory = mkdtempSync(join(tmpdir(), 'airtrust-prettier-'));
  const formattedPath = join(directory, basename(path));

  try {
    writeFileSync(formattedPath, formatted, 'utf8');
    return spawnSync('git', ['diff', '--no-index', '--', path, formattedPath], {
      encoding: 'utf8',
    }).stdout;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('temporary Prettier SCORM probe', () => {
  it('prints the exact Prettier 3.9.6 delta', () => {
    const diffs = TARGETS.map(prettierDiff).filter(Boolean).join('\n');
    console.error('\nPRETTIER_SCORM_PROBE_BEGIN\n' + diffs + '\nPRETTIER_SCORM_PROBE_END\n');
    expect(diffs).toBe('');
  });
});
