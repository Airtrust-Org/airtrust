import { describe, expect, it } from 'vitest';
import {
  COMPLETE_QUALIFICATION_HISTORY_STATUSES,
  DEFAULT_QUALIFICATION_HISTORY_STATUSES,
  createDefaultQualificationHistoryStatusSet,
  normalizeQualificationHistoryStatuses,
  normalizeQualificationHistorySectorFilter,
  shouldSendQualificationHistoryStatusFilter,
} from '@/react-app/lib/qualificationHistoryFilters';

describe('qualification history filters', () => {
  it('abre o historico com renovadas, planejadas e canceladas desmarcadas por padrao', () => {
    const defaultStatuses = [...createDefaultQualificationHistoryStatusSet()];

    expect(defaultStatuses).toEqual([...DEFAULT_QUALIFICATION_HISTORY_STATUSES]);
    expect(defaultStatuses).toEqual(['VALIDA', 'VENCIDA', 'VENCENDO_30']);
    expect(defaultStatuses).not.toContain('RENOVADA');
    expect(defaultStatuses).not.toContain('PLANEJADA');
    expect(defaultStatuses).not.toContain('CANCELADA');
  });

  it('mantem todos os status disponiveis para escolha do usuario', () => {
    expect(COMPLETE_QUALIFICATION_HISTORY_STATUSES).toEqual([
      'VALIDA',
      'VENCIDA',
      'VENCENDO_30',
      'RENOVADA',
      'PLANEJADA',
      'CANCELADA',
    ]);
  });

  it('nao envia filtro de status quando todos estao selecionados', () => {
    expect(
      shouldSendQualificationHistoryStatusFilter([
        'cancelada',
        'planejada',
        'renovada',
        'vencendo_30',
        'vencida',
        'valida',
      ]),
    ).toBe(false);
  });

  it('trata todos os setores selecionados como histórico sem filtro de setor', () => {
    expect(normalizeQualificationHistorySectorFilter(['14', '12'], ['12', '14'])).toEqual([]);
    expect(normalizeQualificationHistorySectorFilter(['12'], ['12', '14'])).toEqual(['12']);
  });

  it('mantem filtro server-side quando o usuario escolhe um subconjunto', () => {
    expect(shouldSendQualificationHistoryStatusFilter(['VENCIDA', 'VENCENDO_30'])).toBe(true);
    expect(normalizeQualificationHistoryStatuses([' vencida ', 'VENCIDA'])).toEqual(['VENCIDA']);
  });
});
