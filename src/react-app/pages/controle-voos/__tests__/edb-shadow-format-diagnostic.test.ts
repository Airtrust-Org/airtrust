import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { format, resolveConfig } from 'prettier';

const targets = [
  'src/react-app/pages/controle-voos/EdbShadowPrototype.tsx',
  'src/react-app/pages/controle-voos/__tests__/edb-shadow-prototype.test.tsx',
] as const;

describe('temporary eDB shadow formatter diagnostic', () => {
  it('prints the canonical formatted sources', async () => {
    for (const target of targets) {
      const absolutePath = resolve(process.cwd(), target);
      const source = readFileSync(absolutePath, 'utf8');
      const config = (await resolveConfig(absolutePath)) || {};
      const formatted = await format(source, { ...config, filepath: absolutePath });
      const marker = target.includes('__tests__') ? 'EDB_TEST_FORMATTED' : 'EDB_UI_FORMATTED';
      console.log(`${marker}=${gzipSync(formatted).toString('base64')}`);
    }

    expect(targets).toHaveLength(2);
  });
});
