import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const file = 'worker-airtrust/src/__tests__/routes/simuladores-guias-instrutor-cors.test.ts';

describe('temporary PR809 prettier diagnostic', () => {
  it('emits exact prettier diff for the last residual file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pr809-prettier-'));
    const formatted = execFileSync('npx', ['--yes', 'prettier@3.9.6', file], {
      encoding: 'utf8',
    });
    const outputPath = join(directory, 'formatted.ts');
    writeFileSync(outputPath, formatted, 'utf8');
    const diff = spawnSync('diff', ['-u', file, outputPath], {
      encoding: 'utf8',
    }).stdout;

    expect(diff || 'CLEAN').toBe('CLEAN');
  });
});
