import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../routes/simuladores-fichas.ts'),
  'utf8',
);

describe('simuladores fichas shared-hours contract', () => {
  it('loads the curricular assignment before calculating PF and PM from shared segments', () => {
    expect(routeSource).toContain('fs.atribuicao_curricular_id');
    expect(routeSource).toContain('sa.modo_compartilhado');
    expect(routeSource).toContain("GROUP_CONCAT(participante_nome, ' / ')");
    expect(routeSource).toContain('tripulacao_nomes: f.tripulacao_nomes || null');
    expect(routeSource).toContain('if (f.atribuicao_curricular_id)');
    expect(routeSource).toContain("CASE WHEN ssp.funcao = 'PF'");
    expect(routeSource).toContain("CASE WHEN ssp.funcao = 'PM'");
    expect(routeSource).toContain('sas.deleted_at IS NULL');
    expect(routeSource).toContain('ssp.deleted_at IS NULL');
  });
});
