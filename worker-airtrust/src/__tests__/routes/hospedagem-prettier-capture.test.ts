import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-hospedagem-prettier-'));
let formattedRoute = '';
let formattedTest = '';

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

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

  formattedRoute = readFileSync(routeCopy, 'utf8');
  formattedTest = readFileSync(testCopy, 'utf8');
});

function encode(content: string): string {
  return gzipSync(Buffer.from(content, 'utf8')).toString('base64');
}

describe('capture canonical Prettier output', () => {
  it('captures the route', () => {
    expect.fail(`AIRTRUST_GZIP_ROUTE:${encode(formattedRoute)}`);
  });

  it('captures the focused test', () => {
    expect.fail(`AIRTRUST_GZIP_TEST:${encode(formattedTest)}`);
  });
});
