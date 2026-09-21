import { describe, expect, it } from 'vitest';
import {
  COMPLETE_QUALIFICATION_HISTORY_STATUSES,
  createDefaultQualificationHistoryStatusSet,
  normalizeQualificationHistoryStatuses,
  shouldSendQualificationHistoryStatusFilter,
} from '@/react-app/lib/qualificationHistoryFilters';

describe('qualification history filters', () => {
  it('abre o historico com todos os status visiveis', () => {
    expect([...createDefaultQualificationHistoryStatusSet()]).toEqual([
      ...COMPLETE_QUALIFICATION_HISTORY_STATUSES,
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

  it('mantem filtro server-side quando o usuario escolhe um subconjunto', () => {
    expect(shouldSendQualificationHistoryStatusFilter(['VENCIDA', 'VENCENDO_30'])).toBe(true);
    expect(normalizeQualificationHistoryStatuses([' vencida ', 'VENCIDA'])).toEqual(['VENCIDA']);
  });
});
