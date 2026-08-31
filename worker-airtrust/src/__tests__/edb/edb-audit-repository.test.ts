import { describe, expect, it } from 'vitest';
import {
  appendPersistedEdbAuditEvent,
  hydrateEdbAuditEventRow,
  loadAndVerifyEdbAuditChain,
  type EdbAuditEventRow,
} from '../../repositories/edb/edb-audit-repository';
import { canonicalJson } from '../../services/edb/canonicalization';
import { createEdbAuditEvent } from '../../services/edb/audit-chain';

const actor = {
  employeeId: 10,
  fullName: 'PIC Test',
  anacCode: '123456',
};

function draft(eventId: string) {
  return {
    eventId,
    scope: {
      diaryId: 1,
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      revisionId: null,
    },
    type: 'SOURCE_SNAPSHOT_CAPTURED' as const,
    actor,
    occurredAt: '2026-08-29T01:00:00.000Z',
    payload: { source: 'maintenance-snapshot' },
  };
}

describe('eDB audit persistence', () => {
  it('chains a new event to the latest persisted diary hash and stores all canonical scope/actor data', async () => {
    const latestHash = 'a'.repeat(64);
    let inserted: unknown[] | null = null;
    const db = {
      prepare(sql: string) {
        if (sql.includes('SELECT event_hash_sha256')) {
          return {
            bind: () => ({
              first: async () => ({ event_hash_sha256: latestHash }),
            }),
          };
        }
        if (sql.includes('INSERT INTO edb_auditoria_eventos')) {
          return {
            bind: (...values: unknown[]) => ({
              run: async () => {
                inserted = values;
                return { meta: { changes: 1 } };
              },
            }),
          };
        }
        throw new Error('unexpected SQL');
      },
    } as unknown as D1Database;

    const event = await appendPersistedEdbAuditEvent({
      db,
      empresaId: 10,
      draft: draft('audit-2'),
      actorUserId: 50,
    });

    expect(event.previousEventHashSha256).toBe(latestHash);
    expect(event.eventHashSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(inserted).not.toBeNull();
    expect(inserted?.[0]).toBe('audit-2');
    expect(inserted?.[1]).toBe(10);
    expect(inserted?.[2]).toBe(1);
    expect(inserted?.[3]).toBe(100);
    expect(inserted?.[4]).toBe('tech-1');
    expect(inserted?.[7]).toBe(50);
    expect(inserted?.[8]).toBe(10);
    expect(inserted?.[9]).toBe(canonicalJson(actor));
    expect(inserted?.[11]).toBe(latestHash);
    expect(inserted?.[12]).toBe(event.eventHashSha256);
  });

  it('rehydrates a persisted event with the actor snapshot needed to recompute its hash', async () => {
    const event = await createEdbAuditEvent({
      ...draft('audit-1'),
      previousEventHashSha256: null,
    });
    const row: EdbAuditEventRow = {
      id: event.eventId,
      empresa_id: 10,
      diario_id: event.scope.diaryId,
      voo_id: event.scope.sourceFlightId,
      situacao_tecnica_id: event.scope.technicalSituationId,
      revision_id: event.scope.revisionId,
      event_type: event.type,
      actor_user_id: 50,
      actor_funcionario_id: event.actor?.employeeId ?? null,
      actor_json: canonicalJson(event.actor),
      payload_json: canonicalJson(event.payload),
      previous_event_hash_sha256: event.previousEventHashSha256,
      event_hash_sha256: event.eventHashSha256,
      occurred_at: event.occurredAt,
    };

    expect(hydrateEdbAuditEventRow(row)).toEqual(event);
  });

  it('rejects actor identity drift between indexed employee id and canonical actor snapshot', async () => {
    const event = await createEdbAuditEvent({
      ...draft('audit-1'),
      previousEventHashSha256: null,
    });
    const row: EdbAuditEventRow = {
      id: event.eventId,
      empresa_id: 10,
      diario_id: 1,
      voo_id: 100,
      situacao_tecnica_id: 'tech-1',
      revision_id: null,
      event_type: event.type,
      actor_user_id: 50,
      actor_funcionario_id: 99,
      actor_json: canonicalJson(actor),
      payload_json: canonicalJson(event.payload),
      previous_event_hash_sha256: null,
      event_hash_sha256: event.eventHashSha256,
      occurred_at: event.occurredAt,
    };

    expect(() => hydrateEdbAuditEventRow(row)).toThrow('EDB_AUDIT_ACTOR_EMPLOYEE_ID_MISMATCH');
  });

  it('loads and cryptographically verifies the persisted diary chain', async () => {
    const first = await createEdbAuditEvent({
      ...draft('audit-1'),
      previousEventHashSha256: null,
    });
    const second = await createEdbAuditEvent({
      eventId: 'audit-2',
      scope: {
        diaryId: 1,
        sourceFlightId: 100,
        technicalSituationId: null,
        revisionId: 'rev-1',
      },
      type: 'RECORD_CREATED',
      actor,
      occurredAt: '2026-08-29T02:00:00.000Z',
      payload: { revision: 1 },
      previousEventHashSha256: first.eventHashSha256,
    });

    const rows: EdbAuditEventRow[] = [first, second].map((event) => ({
      id: event.eventId,
      empresa_id: 10,
      diario_id: event.scope.diaryId,
      voo_id: event.scope.sourceFlightId,
      situacao_tecnica_id: event.scope.technicalSituationId,
      revision_id: event.scope.revisionId,
      event_type: event.type,
      actor_user_id: 50,
      actor_funcionario_id: event.actor?.employeeId ?? null,
      actor_json: event.actor === null ? null : canonicalJson(event.actor),
      payload_json: canonicalJson(event.payload),
      previous_event_hash_sha256: event.previousEventHashSha256,
      event_hash_sha256: event.eventHashSha256,
      occurred_at: event.occurredAt,
    }));

    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: rows }),
        }),
      }),
    } as unknown as D1Database;

    const result = await loadAndVerifyEdbAuditChain({ db, empresaId: 10, diaryId: 1 });
    expect(result.events).toHaveLength(2);
    expect(result.verification).toEqual({ valid: true, issues: [] });
  });
});
