import { describe, expect, it } from 'vitest';
import { classificationBatchHasAuditedWrite } from '../../routes/admin-operational-domain-rbac';

describe('classification D1 batch evidence', () => {
  it('accepts the guarded audit write when update metadata reports zero', () => {
    expect(
      classificationBatchHasAuditedWrite([
        { success: true, meta: { changes: 0, rows_written: 0 } },
        { success: true, meta: { changes: 1, rows_written: 1 } },
      ]),
    ).toBe(true);
  });

  it('accepts rows_written fallback on the guarded audit insert', () => {
    expect(
      classificationBatchHasAuditedWrite([
        { success: true, meta: { changes: 0, rows_written: 0 } },
        { success: true, meta: { changes: 0, rows_written: 1 } },
      ]),
    ).toBe(true);
  });

  it('rejects a true CAS conflict when no audit row is inserted', () => {
    expect(
      classificationBatchHasAuditedWrite([
        { success: true, meta: { changes: 0, rows_written: 0 } },
        { success: true, meta: { changes: 0, rows_written: 0 } },
      ]),
    ).toBe(false);
  });

  it('rejects an explicit batch statement failure', () => {
    expect(
      classificationBatchHasAuditedWrite([
        { success: false, meta: { changes: 1, rows_written: 1 } },
        { success: true, meta: { changes: 1, rows_written: 1 } },
      ]),
    ).toBe(false);
  });
});
