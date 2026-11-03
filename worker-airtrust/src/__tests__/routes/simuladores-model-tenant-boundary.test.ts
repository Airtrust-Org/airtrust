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
    // As consultas de ficha/modelo/manobras vivem no repository (fase participantes + fichas).
    const repository = readFileSync(
      resolve(process.cwd(), 'src/repositories/simuladores/session-participants-repository.ts'),
      'utf8',
    );
    expect(repository).toContain(
      'SELECT tipo_aeronave FROM fichas_sessao WHERE agendamento_slot_id=? AND empresa_id=?',
    );
    expect(repository).toContain('AND empresa_id = ?\n                  AND deleted_at IS NULL');
    expect(repository).toContain('AND ts.empresa_id = ?');
    expect(repository).toContain('AND ms.empresa_id = ?');
    expect(repository).toContain('AND m.empresa_id = ?');
    expect(repository).toContain('.bind(modeloId, empresaId)');
    expect(repository).toContain(
      '.bind(input.empresaId, input.tipoSessaoCodigo, input.tipoAeronave, input.empresaId)',
    );
    expect(repository).toContain('.bind(empresaId, modeloId)');
  });
});
