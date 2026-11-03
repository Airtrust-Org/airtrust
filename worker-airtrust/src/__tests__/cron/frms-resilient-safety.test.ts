import { describe, expect, it } from 'vitest';

import {
  FRMS_REPROCESS_BATCH,
  resolveNextSigvoosDay,
  resolveSigvoosNoopWatermark,
  shouldRunSigvoosAtCurrentHour,
  SIGVOOS_TENANT_BATCH,
  SIGVOOS_TRIPULANTE_ENQUEUE_BATCH,
} from '../../cron/resilient/sigvoos-frms';

describe('FRMS resilient safety', () => {
  it('mantém lotes limitados para tenants, handoff e reprocessamento', () => {
    expect(SIGVOOS_TENANT_BATCH).toBeLessThanOrEqual(25);
    expect(SIGVOOS_TRIPULANTE_ENQUEUE_BATCH).toBeLessThanOrEqual(100);
    expect(FRMS_REPROCESS_BATCH).toBeLessThanOrEqual(25);
  });

  it('retoma no máximo um dia por execução sem pular dias atrasados', () => {
    expect(resolveNextSigvoosDay('2026-07-30', null, '2026-08-02')).toBe('2026-07-31');
    expect(resolveNextSigvoosDay('2026-06-01', null, '2026-08-02')).toBe('2026-06-02');
    expect(resolveNextSigvoosDay('2026-08-02', null, '2026-08-02')).toBeNull();
    expect(resolveNextSigvoosDay('2026-08-01', null, '2026-08-02')).toBeNull();
    expect(resolveNextSigvoosDay(null, null, '2026-08-02')).toBe('2026-08-01');
    expect(resolveNextSigvoosDay(null, null, '2027-01-01')).toBe('2026-12-31');
  });

  it('never marks in-progress operational data as a completed SIGVOOS watermark', () => {
    expect(resolveNextSigvoosDay(null, '2026-08-01', '2026-08-02')).toBeNull();
    expect(resolveSigvoosNoopWatermark(null, '2026-08-01', '2026-08-02')).toBe('2026-08-01');
    expect(resolveSigvoosNoopWatermark('2026-08-01', '2026-07-31', '2026-08-02')).toBe('2026-08-01');
    expect(resolveNextSigvoosDay('2026-08-01', null, '2026-08-03')).toBe('2026-08-02');
    expect(resolveSigvoosNoopWatermark(null, '2026-12-31', '2027-01-01')).toBe('2026-12-31');
    expect(() => resolveSigvoosNoopWatermark(null, '2026-08-02', '2026-08-02'))
      .toThrow('SIGVOOS_WATERMARK_NOT_CLOSED');
  });

  it('executa SIGVOOS somente na hora operacional configurada', () => {
    expect(shouldRunSigvoosAtCurrentHour('19', new Date('2026-08-02T19:50:00.000Z'))).toBe(true);
    expect(shouldRunSigvoosAtCurrentHour('19', new Date('2026-08-02T20:00:00.000Z'))).toBe(false);
  });
});
