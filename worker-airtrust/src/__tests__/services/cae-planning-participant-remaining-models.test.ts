import { describe, expect, it } from 'vitest';
import { resolveIndividualRemainingModels } from '../../services/cae-planning-participant-model-resolver';

const SEQUENCE = [
  { id: 501, ordem_no_treinamento: 1 },
  { id: 502, ordem_no_treinamento: 2 },
  { id: 503, ordem_no_treinamento: 3 },
  { id: 504, ordem_no_treinamento: 4 },
];

function dbReturning(rows: Array<{ modelo_id: number | null; origin: 'shared' | 'normal' }>) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db: any = {
    prepare(sql: string) {
      const call = { sql, binds: [] as unknown[] };
      calls.push(call);
      const statement: any = {
        bind(...values: unknown[]) {
          call.binds = values;
          return statement;
        },
        async all() {
          return { results: rows };
        },
      };
      return statement;
    },
  };
  return { db, calls };
}

describe('resolveIndividualRemainingModels', () => {
  it('sem histórico retorna o treinamento completo', async () => {
    const { db } = dbReturning([]);
    const result = await resolveIndividualRemainingModels({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });

    expect(result.source).toBe('no_history');
    expect(result.remaining.map((item) => item.id)).toEqual([501, 502, 503, 504]);
  });

  it('após a primeira sessão retorna todas as três sessões restantes', async () => {
    const { db } = dbReturning([{ modelo_id: 501, origin: 'normal' }]);
    const result = await resolveIndividualRemainingModels({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });

    expect(result.source).toBe('normal_history');
    expect(result.remaining.map((item) => item.id)).toEqual([502, 503, 504]);
  });

  it('preserva progressão de sessão compartilhada e retorna o restante', async () => {
    const { db } = dbReturning([
      { modelo_id: 501, origin: 'normal' },
      { modelo_id: 502, origin: 'shared' },
    ]);
    const result = await resolveIndividualRemainingModels({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: '2026-08-31',
      models: SEQUENCE,
    });

    expect(result.source).toBe('shared_history');
    expect(result.completed_model_ids).toEqual([501, 502]);
    expect(result.remaining.map((item) => item.id)).toEqual([503, 504]);
  });

  it('quando as quatro sessões estão concluídas não reinicia o treinamento', async () => {
    const { db } = dbReturning([{ modelo_id: 504, origin: 'normal' }]);
    const result = await resolveIndividualRemainingModels({
      db,
      empresaId: 1,
      employeeId: 100,
      cycleStartDate: null,
      models: SEQUENCE,
    });

    expect(result.source).toBe('sequence_complete');
    expect(result.remaining).toEqual([]);
  });

  it('mantém escopo por tenant, funcionário, ciclo e somente sessões aprovadas', async () => {
    const { db, calls } = dbReturning([]);
    await resolveIndividualRemainingModels({
      db,
      empresaId: 77,
      employeeId: 123,
      cycleStartDate: '2026-09-01',
      models: SEQUENCE,
    });

    expect(calls[0].sql).toContain('fs.aprovado = 1');
    expect(calls[0].sql).toContain('fs.empresa_id = ?');
    expect(calls[0].sql).toContain('sac.empresa_id = ?');
    expect(calls[0].sql).toContain('sa.empresa_id = ?');
    expect(calls[0].sql).toContain('date(fs.data_sessao) >= date(?)');
    expect(calls[0].binds).toEqual([77, 77, 77, 123, 123, '2026-09-01', '2026-09-01']);
  });
});
