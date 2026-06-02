import { describe, expect, it } from 'vitest';

import {
  isActiveOrCompletedSessionStatus,
  isCancelledStatus,
  isCompletedStatus,
  isPlannedQualificationStatus,
  normalizeCompletedStatusForNewWrites,
  normalizeQualificationStatusForCompatibility,
  normalizeSessionStatusForCompatibility,
  QUALIFICACAO_STATUS,
  SESSION_STATUS,
} from '../../lib/status/status-codes';

describe('status codes compatibility', () => {
  it('accepts canonical and legacy completed statuses', () => {
    expect(isCompletedStatus('CONCLUIDA')).toBe(true);
    expect(isCompletedStatus('CONCLUIDO')).toBe(true);
    expect(normalizeCompletedStatusForNewWrites('CONCLUIDO')).toBe(SESSION_STATUS.CONCLUIDA);
  });

  it('accepts canonical and legacy cancelled statuses', () => {
    expect(isCancelledStatus('CANCELADA')).toBe(true);
    expect(isCancelledStatus('CANCELADO')).toBe(true);
  });

  it('accepts canonical and legacy planned qualification statuses in reads', () => {
    expect(isPlannedQualificationStatus('PLANEJADA')).toBe(true);
    expect(isPlannedQualificationStatus('PLANEJADO')).toBe(true);
    expect(normalizeQualificationStatusForCompatibility('PLANEJADO')).toBe(
      QUALIFICACAO_STATUS.PLANEJADA,
    );
  });

  it('normalizes session compatibility variants without changing semantic meaning', () => {
    expect(normalizeSessionStatusForCompatibility('AGENDADA')).toBe(SESSION_STATUS.AGENDADO);
    expect(normalizeSessionStatusForCompatibility('PENDING')).toBe(SESSION_STATUS.PENDENTE);
    expect(isActiveOrCompletedSessionStatus('AGENDADA')).toBe(true);
    expect(isActiveOrCompletedSessionStatus('CONCLUIDO')).toBe(true);
    expect(isActiveOrCompletedSessionStatus('PENDENTE')).toBe(false);
  });
});
