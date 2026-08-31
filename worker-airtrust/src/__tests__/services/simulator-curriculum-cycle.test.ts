import { describe, expect, it } from 'vitest';
import {
  nextCycleNumber,
  parseCanonicalSessionIdentity,
  selectCurriculumCycle,
  type CurriculumCycleModel,
} from '../../services/simulator-curriculum-cycle';

function model(id: number, code: string): CurriculumCycleModel {
  return {
    id,
    canonical_code: code,
    duration_minutes: 120,
    name: code,
    qualification_type_id: 33,
  };
}

const AW139_PERIODIC = [
  model(1, 'A139-P-01/04-C1'),
  model(2, 'A139-P-02/04-C1-OFFSHORE'),
  model(3, 'A139-P-03/04-C1-IFR-LOFT'),
  model(4, 'A139-P-04/04-C1-CHECK'),
  model(5, 'A139-P-01/04-C2'),
  model(6, 'A139-P-02/04-C2-OFFSHORE'),
  model(7, 'A139-P-03/04-C2-IFR-LOFT'),
  model(8, 'A139-P-04/04-C2-CHECK'),
  model(9, 'A139-P-01/04-C3'),
  model(10, 'A139-P-02/04-C3-OFFSHORE'),
  model(11, 'A139-P-03/04-C3-IFR-LOFT'),
  model(12, 'A139-P-04/04-C3-CHECK'),
];

const AW139_SEMESTRAL = [
  model(20, 'A139-S-01/02-C1'),
  model(21, 'A139-S-02/02-C1'),
  model(22, 'A139-S-01/02-C2'),
  model(23, 'A139-S-02/02-C2'),
  model(24, 'A139-S-01/02-C3'),
  model(25, 'A139-S-02/02-C3'),
];

describe('simulator curriculum cycle', () => {
  it('extrai posição, total, ciclo e check do código canônico', () => {
    expect(parseCanonicalSessionIdentity('A139-P-04/04-C2-CHECK')).toMatchObject({
      equipment: 'A139',
      program: 'P',
      session_position: 4,
      session_total: 4,
      cycle: 2,
      check: true,
    });
  });

  it('não transforma os 12 modelos periódicos C1/C2/C3 em 12 sessões', () => {
    const selected = selectCurriculumCycle({ models: AW139_PERIODIC });
    expect(selected.cycle).toBe(1);
    expect(selected.models).toHaveLength(4);
    expect(selected.models.map((item) => item.canonical_code)).toEqual([
      'A139-P-01/04-C1',
      'A139-P-02/04-C1-OFFSHORE',
      'A139-P-03/04-C1-IFR-LOFT',
      'A139-P-04/04-C1-CHECK',
    ]);
  });

  it('avança C1 -> C2 -> C3 -> C1', () => {
    expect(nextCycleNumber(1, [1, 2, 3])).toBe(2);
    expect(nextCycleNumber(2, [1, 2, 3])).toBe(3);
    expect(nextCycleNumber(3, [1, 2, 3])).toBe(1);
  });

  it('escolhe o ciclo seguinte ao último Periódico concluído', () => {
    const selected = selectCurriculumCycle({
      models: AW139_PERIODIC,
      last_completed_canonical_code: 'A139-P-04/04-C2-CHECK',
    });
    expect(selected.cycle).toBe(3);
    expect(selected.source).toBe('NEXT_AFTER_LAST_COMPLETED');
    expect(selected.models).toHaveLength(4);
  });

  it('permite propagar o ciclo do Periódico para o Semestral relacionado', () => {
    const selected = selectCurriculumCycle({
      models: AW139_SEMESTRAL,
      cycle_hint: 2,
    });
    expect(selected.cycle).toBe(2);
    expect(selected.source).toBe('HINT');
    expect(selected.models.map((item) => item.canonical_code)).toEqual([
      'A139-S-01/02-C2',
      'A139-S-02/02-C2',
    ]);
  });

  it('falha fechado se o ciclo estiver incompleto', () => {
    expect(() =>
      selectCurriculumCycle({
        models: AW139_PERIODIC.filter((item) => item.canonical_code !== 'A139-P-03/04-C1-IFR-LOFT'),
        cycle_hint: 1,
      }),
    ).toThrow('Ciclo curricular incompleto');
  });
});
