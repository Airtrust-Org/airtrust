import { describe, expect, it } from 'vitest';

import {
  CANCELLED_STATUS_VALUES,
  isActiveOrCompletedSessionStatus,
  isCancelledStatus,
  isCompletedStatus,
  isCertificateEligibleQualificationStatus,
  isCertificateEligibleQualificationRecord,
  isPlannedQualificationStatus,
  SCHEDULED_SESSION_STATUS_VALUES,
  sqlStatusEqualsAny,
  sqlStatusNotEqualsAny,
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

  it('accepts realized qualification lifecycle statuses for certificate emission', () => {
    for (const status of [
      'CONCLUIDA',
      'CONCLUIDO',
      'VALIDA',
      'VÁLIDA',
      'VENCIDA',
      'RENOVADA',
      'PROXIMA_VENCIMENTO',
      'VENCENDO',
      'VENCENDO_30',
      'ATENCAO',
      'INDETERMINADA',
    ]) {
      expect(isCertificateEligibleQualificationStatus(status)).toBe(true);
    }

    for (const status of ['PLANEJADA', 'PLANEJADO', 'CANCELADA', 'CANCELADO', '', null, 'INDEFINIDA']) {
      expect(isCertificateEligibleQualificationStatus(status)).toBe(false);
    }
  });

  it('permits a real legacy NULL/blank status only when completion and expiry prove realization', () => {
    const completed = '2020-01-23';
    const expires = '2021-01-23';
    for (const status of [null, '', '  ']) {
      expect(isCertificateEligibleQualificationRecord({
        status, dataConclusao: completed, dataVencimento: expires,
      })).toBe(true);
      for (const dataVencimento of [null, '', '2020-01-22', '2020-02-31']) {
        expect(isCertificateEligibleQualificationRecord({
          status, dataConclusao: completed, dataVencimento,
        })).toBe(false);
      }
      for (const dataConclusao of [null, '', '2020-02-31', '2099-01-23']) {
        expect(isCertificateEligibleQualificationRecord({
          status, dataConclusao, dataVencimento: expires,
        })).toBe(false);
      }
    }
    for (const status of ['PLANEJADA', 'CANCELADA', 'NAO_REALIZADA', 'DESCONHECIDO_123']) {
      expect(isCertificateEligibleQualificationRecord({
        status, dataConclusao: completed, dataVencimento: expires,
      })).toBe(false);
    }
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

  it('emits SQL fragments with legacy-compatible status lists', () => {
    const scheduledSql = sqlStatusEqualsAny(
      "UPPER(COALESCE(sa.status, 'AGENDADO'))",
      SCHEDULED_SESSION_STATUS_VALUES,
    );
    const cancelledSql = sqlStatusNotEqualsAny(
      "UPPER(COALESCE(qh.status, 'CONCLUIDA'))",
      CANCELLED_STATUS_VALUES,
    );

    expect(scheduledSql).toContain("'AGENDADA'");
    expect(scheduledSql).toContain("'PENDING'");
    expect(cancelledSql).toContain("<> 'CANCELADA'");
    expect(cancelledSql).toContain("<> 'CANCELADO'");
  });
});
