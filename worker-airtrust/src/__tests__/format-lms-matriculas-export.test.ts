import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('temporary prettier diagnostic', () => {
  it('exports the exact prettier delta for lms-matriculas', () => {
    execFileSync('npx', ['prettier', '--write', 'src/routes/lms-matriculas.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    const diff = execFileSync('git', ['diff', '--', 'src/routes/lms-matriculas.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    console.log('PRETTIER_LMS_MATRICULAS_DIFF_START');
    console.log(diff);
    console.log('PRETTIER_LMS_MATRICULAS_DIFF_END');
    expect(diff.length).toBeGreaterThan(0);
  });
});
