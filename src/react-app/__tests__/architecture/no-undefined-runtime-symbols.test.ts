import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// F14-03: independent regression guard. AGENTS.md V7 forbids changing the
// protected TypeScript baseline/ratchet. This guard does not edit either one.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function typecheckOutput(): string {
  try {
    return execFileSync(
      join(repoRoot, 'node_modules', '.bin', 'tsc'),
      ['-p', 'tsconfig.app.json', '--noEmit', '--pretty', 'false'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 20 * 1024 * 1024 },
    );
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    if (typeof stdout !== 'string' || stdout.length === 0) throw error;
    return stdout;
  }
}

describe('F14-03: runtime-unsafe missing symbols are not tolerated', () => {
  it('rejects undefined names/modules without touching the protected baseline', () => {
    const diagnostics = typecheckOutput()
      .split(/\r?\n/)
      .map((line) => {
        const m = line.match(/^(.+?\.(?:ts|tsx))\(\d+,\d+\): error TS(2304|2307|2552):/);
        return m ? { file: m[1].replaceAll('\\', '/'), code: 'TS' + m[2], line } : null;
      })
      .filter((d): d is { file: string; code: string; line: string } => d !== null);

    // Legacy un-routed component is an explicit exception, not permission to
    // accumulate new TS2307 errors anywhere else. Remove exception when fixed.
    const allowed = diagnostics.filter(
      (d) => d.code === 'TS2307' &&
        d.file === 'src/react-app/components/admin/FuncoesManagement.tsx',
    );
    const blocked = diagnostics.filter((d) => !allowed.includes(d));

    expect(blocked.map((d) => d.line), 'TS2304/TS2552 or unexpected TS2307').toEqual([]);
    expect(allowed.length, 'only one legacy un-routed TS2307 is currently known').toBeLessThanOrEqual(1);
  }, 300_000);
});
