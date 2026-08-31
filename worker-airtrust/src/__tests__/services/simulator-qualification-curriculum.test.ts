import { describe, expect, it } from 'vitest';
import {
  selectCurriculumForQualification,
  type QualificationCurriculumCatalogModel,
} from '../../services/simulator-qualification-curriculum';

function model(params: {
  id: number;
  code: string;
  qualificationTypeId?: number | null;
  equipment?: string;
}): QualificationCurriculumCatalogModel {
  return {
    id: params.id,
    canonical_code: params.code,
    duration_minutes: 120,
    name: params.code,
    qualification_type_id: params.qualificationTypeId ?? null,
    equipment: params.equipment || 'AW139',
  };
}

const CATALOG: QualificationCurriculumCatalogModel[] = [
  model({ id: 1, code: 'A139-P-01/04-C1' }),
  model({ id: 2, code: 'A139-P-02/04-C1-OFFSHORE' }),
  model({ id: 3, code: 'A139-P-03/04-C1-IFR-LOFT' }),
  model({ id: 4, code: 'A139-P-04/04-C1-CHECK', qualificationTypeId: 33 }),
  model({ id: 5, code: 'A139-S-01/02-C1' }),
  model({ id: 6, code: 'A139-S-02/02-C1', qualificationTypeId: 106 }),
  model({ id: 7, code: 'A139-P-01/04-C2' }),
  model({ id: 8, code: 'A139-P-02/04-C2-OFFSHORE' }),
  model({ id: 9, code: 'A139-P-03/04-C2-IFR-LOFT' }),
  model({ id: 10, code: 'A139-P-04/04-C2-CHECK', qualificationTypeId: 33 }),
  model({ id: 11, code: 'A139-S-01/02-C2' }),
  model({ id: 12, code: 'A139-S-02/02-C2', qualificationTypeId: 106 }),
  model({ id: 13, code: 'A139-P-01/04-C3' }),
  model({ id: 14, code: 'A139-P-02/04-C3-OFFSHORE' }),
  model({ id: 15, code: 'A139-P-03/04-C3-IFR-LOFT' }),
  model({ id: 16, code: 'A139-P-04/04-C3-CHECK', qualificationTypeId: 33 }),
  model({ id: 17, code: 'A139-S-01/02-C3' }),
  model({ id: 18, code: 'A139-S-02/02-C3', qualificationTypeId: 106 }),
];

describe('selectCurriculumForQualification', () => {
  it('expande o Check G1 para as quatro sessões do Periódico correspondente', () => {
    const result = selectCurriculumForQualification({
      qualification_type_id: 33,
      catalog: CATALOG,
      cycle_hint: 1,
    });

    expect(result.equipment).toBe('AW139');
    expect(result.program).toBe('P');
    expect(result.cycle).toBe(1);
    expect(result.models.map((item) => item.canonical_code)).toEqual([
      'A139-P-01/04-C1',
      'A139-P-02/04-C1-OFFSHORE',
      'A139-P-03/04-C1-IFR-LOFT',
      'A139-P-04/04-C1-CHECK',
    ]);
    expect(result.terminal_model_ids).toEqual([4]);
  });

  it('expande G1-SEM para as duas sessões do Semestral do ciclo indicado', () => {
    const result = selectCurriculumForQualification({
      qualification_type_id: 106,
      catalog: CATALOG,
      cycle_hint: 2,
    });

    expect(result.program).toBe('S');
    expect(result.cycle).toBe(2);
    expect(result.models.map((item) => item.canonical_code)).toEqual([
      'A139-S-01/02-C2',
      'A139-S-02/02-C2',
    ]);
  });

  it('avança para o ciclo seguinte usando o último Check concluído', () => {
    const result = selectCurriculumForQualification({
      qualification_type_id: 33,
      catalog: CATALOG,
      last_completed_canonical_code: 'A139-P-04/04-C1-CHECK',
    });

    expect(result.cycle).toBe(2);
    expect(result.models).toHaveLength(4);
  });

  it('falha fechado quando não existe modelo terminal que gere a qualificação', () => {
    expect(() =>
      selectCurriculumForQualification({ qualification_type_id: 999, catalog: CATALOG }),
    ).toThrow('sem modelo terminal canônico');
  });
});
