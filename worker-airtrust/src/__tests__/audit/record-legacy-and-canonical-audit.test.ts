import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registrarAuditoriaMock, recordAuditEventV2Mock } = vi.hoisted(() => ({
  registrarAuditoriaMock: vi.fn(),
  recordAuditEventV2Mock: vi.fn(),
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: registrarAuditoriaMock,
}));

vi.mock('../../lib/audit/audit-events-v2', () => ({
  recordAuditEventV2: recordAuditEventV2Mock,
}));

import { recordLegacyAndCanonicalAudit } from '../../lib/audit/record-legacy-and-canonical-audit';

describe('recordLegacyAndCanonicalAudit', () => {
  beforeEach(() => {
    registrarAuditoriaMock.mockReset();
    recordAuditEventV2Mock.mockReset();
  });

  it('writes legacy and canonical events together when both are provided', async () => {
    recordAuditEventV2Mock.mockResolvedValue({ ok: true, id: 'audit-v2-1' });

    const db = {} as D1Database;
    const result = await recordLegacyAndCanonicalAudit({
      db,
      legacyAuditoria: {
        tabela: 'support_access_sessions',
        acao: 'IMPERSONATE',
        registro_id: 'sess-1',
      },
      canonicalEvent: {
        eventCategory: 'SUPPORT_ACCESS',
        eventAction: 'SUPPORT_SESSION_STARTED',
        supportMode: 1,
        supportReason: 'ticket-1',
      },
    });

    expect(registrarAuditoriaMock).toHaveBeenCalledWith({
      db,
      tabela: 'support_access_sessions',
      acao: 'IMPERSONATE',
      registro_id: 'sess-1',
    });
    expect(recordAuditEventV2Mock).toHaveBeenCalledWith(db, {
      eventCategory: 'SUPPORT_ACCESS',
      eventAction: 'SUPPORT_SESSION_STARTED',
      supportMode: 1,
      supportReason: 'ticket-1',
    });
    expect(result).toEqual({
      canonicalResult: { ok: true, id: 'audit-v2-1' },
    });
  });

  it('preserves the legacy write even when the canonical writer reports a controlled failure', async () => {
    recordAuditEventV2Mock.mockResolvedValue({
      ok: false,
      id: 'audit-v2-2',
      errorCode: 'db_write_failed',
    });

    const result = await recordLegacyAndCanonicalAudit({
      db: {} as D1Database,
      legacyAuditoria: {
        tabela: 'support_access_sessions',
        acao: 'IMPERSONATE',
        registro_id: 'sess-2',
      },
      canonicalEvent: {
        eventCategory: 'SUPPORT_ACCESS',
        eventAction: 'SUPPORT_SENSITIVE_VIEW_DENIED',
        supportMode: 1,
        supportReason: 'ticket-2',
        success: false,
        failureReasonCode: 'TENANT_SCOPE_DENIED',
      },
    });

    expect(registrarAuditoriaMock).toHaveBeenCalledTimes(1);
    expect(result.canonicalResult).toEqual({
      ok: false,
      id: 'audit-v2-2',
      errorCode: 'db_write_failed',
    });
  });
});
