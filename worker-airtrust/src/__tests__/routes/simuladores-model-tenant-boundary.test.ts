import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('simuladores session update tenant model boundary', () => {
  it('pins candidate, fallback model, simulator model and maneuver catalog to empresa_id', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/routes/simuladores-sessoes-update.ts'),
      'utf8',
    );

    expect(source).toContain(
      '(a as { simulador_id?: string | number | null }).simulador_id',
    );
    expect(source).toContain(
      'SELECT tipo_aeronave FROM fichas_sessao WHERE agendamento_slot_id=? AND empresa_id=?',
    );
    expect(source).toContain('AND empresa_id = ?\n                  AND deleted_at IS NULL');
    expect(source).toContain('AND ts.empresa_id = ?');
    expect(source).toContain('AND ms.empresa_id = ?');
    expect(source).toContain('AND m.empresa_id = ?');
    expect(source).toContain('.bind(modeloIdCandidate, empresaId)');
    expect(source).toContain('.bind(empresaId, tipoSessao, tipoAeronave, empresaId)');
    expect(source).toContain('.bind(empresaId, modeloIdFinal)');
  });
});
