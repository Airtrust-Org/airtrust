import { describe, expect, it } from 'vitest';
import {
  chooseModelsForQualification,
  normalizeEquipmentFilter,
  type ModelRow,
  type QualificationRow,
} from '../../routes/simuladores-planejamento-v2';

const qualification: QualificationRow = {
  funcionario_id: 10,
  funcionario_nome: 'Piloto QA',
  funcionario_funcao: 'Comandante',
  qualificacao_tipo_id: 1,
  qualificacao_codigo: 'Q-TEST',
  qualificacao_nome: 'Currículo de voo',
  data_vencimento: '2026-12-31',
  cycle_start_date: null,
};

const models: ModelRow[] = [
  {
    id: 1,
    qualificacao_tipo_id: 1,
    codigo: 'AW169-S1',
    nome: 'AW169 sessão 1',
    duracao_estimada: 120,
    ordem_no_treinamento: 1,
    modelo_aeronave: 'AW169',
  },
  {
    id: 2,
    qualificacao_tipo_id: 1,
    codigo: 'S76-S1',
    nome: 'S76 sessão 1',
    duracao_estimada: 120,
    ordem_no_treinamento: 1,
    modelo_aeronave: 'S-76',
  },
];

describe('simulator planning aircraft filter', () => {
  it('normalizes a single model and treats all as no filter', () => {
    expect(normalizeEquipmentFilter('AW169')).toBe('AW169');
    expect(normalizeEquipmentFilter('S-76')).toBe('SK76');
    expect(normalizeEquipmentFilter('todas')).toBeNull();
    expect(normalizeEquipmentFilter('ALL')).toBeNull();
  });

  it('selects only the requested configured equipment', () => {
    const aw169 = chooseModelsForQualification(qualification, models, 'AW169');
    expect(aw169.filteredOut).toBe(false);
    expect(aw169.equipment).toBe('AW169');
    expect(aw169.models.map((model) => model.id)).toEqual([1]);

    const s76 = chooseModelsForQualification(qualification, models, 'SK76');
    expect(s76.filteredOut).toBe(false);
    expect(s76.models.map((model) => model.id)).toEqual([2]);
  });

  it('silently filters a qualification that has no curriculum for the selected model', () => {
    const selected = chooseModelsForQualification(qualification, models, 'AW139');
    expect(selected).toMatchObject({
      equipment: 'AW139',
      models: [],
      ambiguous: false,
      filteredOut: true,
    });
  });
});
