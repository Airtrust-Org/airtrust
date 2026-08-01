import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const corsSource = readFileSync(resolve(currentDir, '../../middleware/cors.ts'), 'utf8');
const retiredScript = resolve(currentDir, '../../../../scripts/test_edapp_integration.sh');

describe('retirada dos resíduos HTTP do EdApp', () => {
  it('não autoriza o cabeçalho do webhook descontinuado no CORS', () => {
    expect(corsSource).not.toContain('X-EdApp-Secret');
  });

  it('não mantém o script que apontava por padrão para produção', () => {
    expect(existsSync(retiredScript)).toBe(false);
  });
});
