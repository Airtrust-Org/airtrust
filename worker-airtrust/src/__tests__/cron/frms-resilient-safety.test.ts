import { describe, expect, it } from 'vitest';

import {
  FRMS_REPROCESS_BATCH,
  resolveNextSigvoosDay,
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
  });

  it('executa SIGVOOS somente na hora operacional configurada', () => {
    expect(shouldRunSigvoosAtCurrentHour('19', new Date('2026-08-02T19:50:00.000Z'))).toBe(true);
    expect(shouldRunSigvoosAtCurrentHour('19', new Date('2026-08-02T20:00:00.000Z'))).toBe(false);
  });
});
