import { describe, expect, it, vi } from 'vitest';
import {
  recordAuditEventV2,
  sanitizeAuditEventV2Metadata,
} from '../../lib/audit/audit-events-v2';

function createMockDb(options: { fail?: boolean } = {}) {
  const calls: Array<{ query: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        run: async () => {
          calls.push({ query, args });
          if (options.fail) throw new Error('synthetic db failure');
          return { meta: { changes: 1 } };
        },
      }),
    })),
  } as unknown as D1Database;
  return { db, calls };
}

describe('recordAuditEventV2', () => {
  it('inserts a minimal canonical event with safe defaults', async () => {
    const { db, calls } = createMockDb();

    const result = await recordAuditEventV2(db, {
      id: 'audit-test-001',
      eventCategory: 'ADMIN_OPERATION',
      eventAction: 'LMS_CURSO_CRIADO',
    });

    expect(result).toEqual({ ok: true, id: 'audit-test-001' });
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain('INSERT INTO audit_events_v2');
    expect(calls[0].query).not.toContain('audit_logs');
    expect(calls[0].args[7]).toBe(0);
    expect(calls[0].args[18]).toBe(1);
    expect(calls[0].args[21]).toBe('standard');
  });

  it('persists tenant, actor and correlation context when available', async () => {
    const { db, calls } = createMockDb();

    await recordAuditEventV2(db, {
      id: 'audit-test-002',
      empresaId: 7,
      targetEmpresaId: 9,
      actorUserId: 42,
      actorEmpresaId: 7,
      actorRole: 'admin',
      requestId: 'req-123',
      correlationId: 'corr-123',
      eventCategory: 'ADMIN_OPERATION',
      eventAction: 'LMS_CURSO_EDITADO',
      entityType: 'lms_cursos',
      entityId: 21,
    });

    expect(calls[0].args.slice(1, 11)).toEqual([
      7,
      9,
      42,
      7,
      'admin',
      'user',
      0,
      null,
      'req-123',
      'corr-123',
    ]);
    expect(calls[0].args[15]).toBe('lms_cursos');
    expect(calls[0].args[16]).toBe('21');
  });

  it('keeps only allowlisted metadata and removes sensitive or raw payload fields', async () => {
    const { db, calls } = createMockDb();

    await recordAuditEventV2(db, {
      id: 'audit-test-003',
      eventCategory: 'SECURITY_GUARD',
      eventAction: 'GUARD_BLOCK',
      metadata: {
        module: 'security',
        resource_kind: 'policy',
        password: 'secret',
        senha: 'secret',
        token: 'token-value',
        accessToken: 'token-value',
        refreshToken: 'token-value',
        cookie: 'session=secret',
        authorization: 'Bearer secret',
        cpf: '123.456.789-00',
        documento: 'raw',
        documento_bruto: 'raw',
        aso: 'raw',
        aso_bruto: 'raw',
        medical: 'raw',
        medico: 'raw',
        saude: 'raw',
        health: 'raw',
        stack: 'raw',
        file_content: 'raw',
        conteudo_arquivo: 'raw',
        raw_payload: { unsafe: true },
      },
    });

    expect(JSON.parse(String(calls[0].args[20]))).toEqual({
      module: 'security',
      resource_kind: 'policy',
    });
  });

  it('drops PII-like values even when an allowlisted metadata key is used', () => {
    expect(
      sanitizeAuditEventV2Metadata({
        module: 'person@example.test',
        source: '123.456.789-00',
        operation: 'https://example.test/private',
        result: 'allowed',
      }),
    ).toEqual({ result: 'allowed' });
  });

  it('requires support reason for support mode and failure reason for failed events', async () => {
    const { db, calls } = createMockDb();

    await expect(
      recordAuditEventV2(db, {
        eventCategory: 'SUPPORT_ACCESS',
        eventAction: 'TENANT_DIAGNOSTIC_ENTER',
        supportMode: 1,
      }),
    ).resolves.toMatchObject({ ok: false, errorCode: 'support_reason_required' });

    await expect(
      recordAuditEventV2(db, {
        eventCategory: 'SECURITY_GUARD',
        eventAction: 'GUARD_BLOCK',
        success: false,
      }),
    ).resolves.toMatchObject({ ok: false, errorCode: 'failure_reason_required' });

    expect(calls).toHaveLength(0);
  });

  it('persists support reason and failure reason when valid', async () => {
    const { db, calls } = createMockDb();

    await recordAuditEventV2(db, {
      id: 'audit-test-004',
      eventCategory: 'SUPPORT_ACCESS',
      eventAction: 'SENSITIVE_READ_DENIED',
      supportMode: 1,
      supportReason: 'ticket-ops-4832',
      success: false,
      failureReasonCode: 'TENANT_SCOPE_DENIED',
      retentionClass: 'SUPPORT_CONTROLLED',
    });

    expect(calls[0].args[7]).toBe(1);
    expect(calls[0].args[8]).toBe('ticket-ops-4832');
    expect(calls[0].args[18]).toBe(0);
    expect(calls[0].args[19]).toBe('TENANT_SCOPE_DENIED');
    expect(calls[0].args[21]).toBe('SUPPORT_CONTROLLED');
  });

  it('returns a controlled failure when D1 write fails', async () => {
    const { db } = createMockDb({ fail: true });

    await expect(
      recordAuditEventV2(db, {
        id: 'audit-test-005',
        eventCategory: 'ADMIN_OPERATION',
        eventAction: 'LMS_CURSO_CRIADO',
      }),
    ).resolves.toEqual({
      ok: false,
      id: 'audit-test-005',
      errorCode: 'db_write_failed',
    });
  });
});
