import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const corsSource = readFileSync(resolve(currentDir, '../../middleware/cors.ts'), 'utf8');
const retiredScript = resolve(currentDir, '../../../../scripts/test_edapp_integration.sh');

const LEGACY_HEADERS = [
  'X-EdApp-Secret',
  'X-Dev-Auth-Bypass',
  'X-Maintenance-Secret',
  'X-AirTrust-Maintenance',
];
// P10-05: nenhuma resposta de preflight do Worker deve anunciar cabecalhos de
// bypass/manutencao/webhook legado; o navegador nunca precisa envia-los.
const CORS_SURFACES = ['../../middleware/cors.ts', '../../index.ts', '../../routes/lms-assets.ts'];

describe('P10-05 cabecalhos legados fora do CORS', () => {
  for (const surface of CORS_SURFACES) {
    it(`nao anuncia cabecalhos legados em ${surface}`, () => {
      const source = readFileSync(resolve(currentDir, surface), 'utf8');
      const allowHeaders = source
        .split('\n')
        .filter((line) => /Content-Type, Authorization/.test(line))
        .join('\n');
      for (const header of LEGACY_HEADERS) {
        expect(allowHeaders).not.toContain(header);
      }
    });
  }
});

describe('retirada dos resíduos HTTP do EdApp', () => {
  it('não autoriza o cabeçalho do webhook descontinuado no CORS', () => {
    expect(corsSource).not.toContain('X-EdApp-Secret');
  });

  it('não mantém o script que apontava por padrão para produção', () => {
    expect(existsSync(retiredScript)).toBe(false);
  });
});
