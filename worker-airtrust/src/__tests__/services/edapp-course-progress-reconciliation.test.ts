import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const retiredPaths = [
  '../../services/edapp-course-progress-reconciliation.ts',
  '../../routes/integracoes-edapp-eventos.ts',
] as const;

describe('processamento externo EdApp aposentado', () => {
  it.each(retiredPaths)('não mantém o executor obsoleto %s no Worker', (relativePath) => {
    const retiredFile = resolve(currentDir, relativePath);

    expect(existsSync(retiredFile)).toBe(false);
  });
});
