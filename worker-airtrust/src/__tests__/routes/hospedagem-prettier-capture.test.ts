import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-hospedagem-prettier-'));
let routePatch = '';
let testPatch = '';

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function diffFiles(source: string, formatted: string): string {
  const result = spawnSync(
    'diff',
    ['-u', '--label', 'source', '--label', 'formatted', source, formatted],
    { encoding: 'utf8' },
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || 'diff failed');
  }
  return result.stdout;
}

function encode(content: string): string {
  return Buffer.from(content, 'utf8').toString('base64');
}

beforeAll(() => {
  const routeSource = join(process.cwd(), 'src/routes/hospedagem.ts');
  const testSource = join(
    process.cwd(),
    'src/__tests__/routes/hospedagem-keyset-pagination.test.ts',
  );
  const routeCopy = join(tempDir, 'hospedagem.ts');
  const testCopy = join(tempDir, 'hospedagem-keyset-pagination.test.ts');

  copyFileSync(routeSource, routeCopy);
  copyFileSync(testSource, testCopy);

  execFileSync(
    'npx',
    [
      '--yes',
      'prettier@3.9.6',
      '--config',
      join(process.cwd(), '..', '.prettierrc'),
      '--write',
      routeCopy,
      testCopy,
    ],
    { stdio: 'pipe' },
  );

  routePatch = diffFiles(routeSource, routeCopy);
  testPatch = diffFiles(testSource, testCopy);
});

describe('capture canonical Prettier patches', () => {
  it('captures the route patch', () => {
    expect.fail(`AIRTRUST_PATCH_ROUTE:${encode(routePatch)}`);
  });

  it('captures the focused-test patch', () => {
    expect.fail(`AIRTRUST_PATCH_TEST:${encode(testPatch)}`);
  });
});
