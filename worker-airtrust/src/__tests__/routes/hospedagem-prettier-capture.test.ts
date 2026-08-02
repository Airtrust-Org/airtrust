import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-hospedagem-prettier-'));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function emitChunks(name: string, content: string): void {
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  for (let offset = 0; offset < encoded.length; offset += 4000) {
    const chunk = encoded.slice(offset, offset + 4000);
    const index = String(offset / 4000).padStart(3, '0');
    process.stdout.write(`AIRTRUST_${name}_${index}:${chunk}\n`);
  }
}

describe('capture canonical Prettier output', () => {
  it('prints exact Prettier 3.9.6 output for the scoped files', () => {
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

    emitChunks('ROUTE', readFileSync(routeCopy, 'utf8'));
    emitChunks('TEST', readFileSync(testCopy, 'utf8'));
    expect.fail('AIRTRUST_PRETTIER_CAPTURE');
  });
});
