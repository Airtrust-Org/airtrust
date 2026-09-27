import { describe, expect, it } from 'vitest';
import {
  QUALIFICATION_AREA_UNCLASSIFIED_FILTER,
  filterUnclassifiedQualificationAreas,
  getQualificationAreaBadgeClass,
} from '../qualificationAreaUi';

describe('qualificationAreaUi', () => {
  it('filtra somente modelos sem área quando selecionado Não classificada', () => {
    const rows = [
      { id: 1, area_id: 10, area_nome: 'Operações' },
      { id: 2, area_id: null, area_nome: null },
      { id: 3, area_id: 12, area_nome: '' },
    ];

    expect(
      filterUnclassifiedQualificationAreas(rows, QUALIFICATION_AREA_UNCLASSIFIED_FILTER).map(
        (row) => row.id,
      ),
    ).toEqual([2, 3]);
  });

  it('mantém a lista quando outro filtro de área está selecionado', () => {
    const rows = [{ id: 1, area_id: 10, area_nome: 'Operações' }];
    expect(filterUnclassifiedQualificationAreas(rows, '10')).toBe(rows);
  });

  it('atribui cores estáveis e diferentes para áreas distintas', () => {
    const operacoes = getQualificationAreaBadgeClass(1, 'Operações');
    const manutencao = getQualificationAreaBadgeClass(2, 'Manutenção');
    expect(operacoes).not.toBe(manutencao);
    expect(getQualificationAreaBadgeClass(1, 'Operações')).toBe(operacoes);
  });
});
