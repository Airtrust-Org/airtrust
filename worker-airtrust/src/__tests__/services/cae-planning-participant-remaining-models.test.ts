import { describe, expect, it } from 'vitest';
import { resolveIndividualRemainingModels } from '../../services/cae-planning-participant-model-resolver';

const SEQUENCE = [
  { id: 501, ordem_no_treinamento: 1 },
  { id: 502, ordem_no_treinamento: 2 },
  { id: 503, ordem_no_treinamento: 3 },
  { id: 504, ordem_no_treinamento: 4 },
];

function dbReturning(rows: Array<{ modelo_id: number | null; origin: 'shared' | 'normal' }>) {
  const db: any = {
    prepare() {
      const statement: any = {
        bind() {
          return statement;
        },
        async all() {
          return { results: rows };
        },
      };
      return statement;
    },
  };
  return db;
}

describe('resolveIndividualRemainingModels', () => {
  it('plans the whole training when no session was completed in the current cycle', async () => {
    const result = await resolveIndividualRemainingModels({
      db: dbReturning([]),
      empresaId: 1,
      employeeId: 10,
      cycleStartDate: '2026-01-01',
      models: SEQUENCE,
    });
    expect(result.models.map((model) => model.id)).toEqual([501, 502, 503, 504]);
    expect(result.source).toBe('no_history');
  });

  it('plans every remaining session after the last approved normal session', async () => {
    const result = await resolveIndividualRemainingModels({
      db: dbReturning([{ modelo_id: 502, origin: 'normal' }]),
      empresaId: 1,
      employeeId: 10,
      cycleStartDate: '2026-01-01',
      models: SEQUENCE,
    });
    expect(result.models.map((model) => model.id)).toEqual([503, 504]);
    expect(result.source).toBe('normal_history');
  });

  it('keeps shared-session progress and returns the rest of the curriculum', async () => {
    const result = await resolveIndividualRemainingModels({
      db: dbReturning([{ modelo_id: 501, origin: 'shared' }]),
      empresaId: 1,
      employeeId: 10,
      cycleStartDate: '2026-01-01',
      models: SEQUENCE,
    });
    expect(result.models.map((model) => model.id)).toEqual([502, 503, 504]);
    expect(result.source).toBe('shared_history');
  });

  it('returns no remaining sessions when the curriculum is complete', async () => {
    const result = await resolveIndividualRemainingModels({
      db: dbReturning([{ modelo_id: 504, origin: 'normal' }]),
      empresaId: 1,
      employeeId: 10,
      cycleStartDate: '2026-01-01',
      models: SEQUENCE,
    });
    expect(result.models).toEqual([]);
    expect(result.source).toBe('sequence_complete');
  });
});
