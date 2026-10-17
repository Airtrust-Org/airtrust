import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const staging = readFileSync(resolve(process.cwd(), '../scripts/staging/validate-0537-preflight.sh'), 'utf8');
const production = readFileSync(resolve(process.cwd(), '../scripts/schema-v2/validate-0537-production-preflight.sh'), 'utf8');

describe('0537 Doutrinação preflight', () => {
  it('checks identity before apply, not target hours produced by 0537 itself', () => {
    for (const source of [staging, production]) {
      expect(source).toContain("codigo='MNT_INTEGRACAO_DOUTRINACAO' AND ativo=1");
      expect(source).not.toContain("codigo='MNT_INTEGRACAO_DOUTRINACAO' AND carga_horaria_inicial=8 AND carga_horaria_recorrente=4");
    }
  });
});
