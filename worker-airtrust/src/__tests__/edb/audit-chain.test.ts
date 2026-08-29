import { describe, expect, it } from 'vitest';
import {
  appendEdbAuditEvent,
  verifyEdbAuditChain,
  type EdbAuditEvent,
} from '../../services/edb/audit-chain';

const actor = {
  employeeId: 10,
  fullName: 'Piloto em Comando',
  anacCode: '123456',
};

const preflightScope = {
  diaryId: 1,
  sourceFlightId: 100,
  technicalSituationId: 'tech-1',
  revisionId: null,
};

const finalScope = {
  diaryId: 1,
  sourceFlightId: 100,
  technicalSituationId: 'tech-1',
  revisionId: 'edbrev-1',
};

describe('eDB audit chain', () => {
  it('builds a diary-anchored preflight chain before any final revision exists', async () => {
    let chain: EdbAuditEvent[] = [];
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-1',
      scope: preflightScope,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      actor,
      occurredAt: '2026-08-28T09:00:00.000Z',
      payload: { canonicalSnapshotSha256: 'a'.repeat(64) },
    });
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-2',
      scope: preflightScope,
      type: 'PIC_TECHNICAL_ACK_SIGNED',
      actor,
      occurredAt: '2026-08-28T09:05:00.000Z',
      payload: { signatureId: 'sig-tech-1' },
    });

    expect(chain[0].scope.revisionId).toBeNull();
    expect(chain[0].previousEventHashSha256).toBeNull();
    expect(chain[1].previousEventHashSha256).toBe(chain[0].eventHashSha256);
    expect(await verifyEdbAuditChain(chain)).toEqual({ valid: true, issues: [] });
  });

  it('continues the same diary chain with postflight revision events', async () => {
    let chain: EdbAuditEvent[] = [];
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-pre',
      scope: preflightScope,
      type: 'PIC_TECHNICAL_ACK_SIGNED',
      actor,
      occurredAt: '2026-08-28T09:05:00.000Z',
      payload: { signatureId: 'sig-tech-1' },
    });
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-final',
      scope: finalScope,
      type: 'RECORD_CREATED',
      actor,
      occurredAt: '2026-08-28T11:05:00.000Z',
      payload: { revision: 1 },
    });

    expect(chain[1].scope.revisionId).toBe('edbrev-1');
    expect(await verifyEdbAuditChain(chain)).toEqual({ valid: true, issues: [] });
  });

  it('detects mutation of historical event payloads', async () => {
    let chain: EdbAuditEvent[] = [];
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-1',
      scope: finalScope,
      type: 'RECORD_CREATED',
      actor,
      occurredAt: '2026-08-28T11:05:00.000Z',
      payload: { sourceFlightId: 100 },
    });
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-2',
      scope: finalScope,
      type: 'REGULATORY_DATA_UPDATED',
      actor,
      occurredAt: '2026-08-28T11:06:00.000Z',
      payload: { personsOnBoard: 8 },
    });

    const tampered: EdbAuditEvent[] = [
      { ...chain[0], payload: { sourceFlightId: 999 } },
      { ...chain[1] },
    ];
    const result = await verifyEdbAuditChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, code: 'EVENT_HASH_MISMATCH' }),
      ]),
    );
  });

  it('detects a broken previous-event link', async () => {
    let chain: EdbAuditEvent[] = [];
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-1',
      scope: finalScope,
      type: 'RECORD_CREATED',
      actor,
      occurredAt: '2026-08-28T11:05:00.000Z',
      payload: {},
    });
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-2',
      scope: finalScope,
      type: 'OPERATOR_RECORD_SIGNED',
      actor,
      occurredAt: '2026-08-28T12:00:00.000Z',
      payload: {},
    });

    const broken: EdbAuditEvent[] = [
      chain[0],
      { ...chain[1], previousEventHashSha256: 'b'.repeat(64) },
    ];
    const result = await verifyEdbAuditChain(broken);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 1, code: 'PREVIOUS_HASH_MISMATCH' }),
        expect.objectContaining({ index: 1, code: 'EVENT_HASH_MISMATCH' }),
      ]),
    );
  });

  it('rejects a preflight event that depends on a postflight revision', async () => {
    await expect(
      appendEdbAuditEvent([], {
        eventId: 'evt-bad',
        scope: finalScope,
        type: 'PIC_TECHNICAL_ACK_SIGNED',
        actor,
        occurredAt: '2026-08-28T09:05:00.000Z',
        payload: {},
      }),
    ).rejects.toThrow('must not depend on a postflight revision');
  });

  it('rejects appending another diary into the same hash chain', async () => {
    const chain = await appendEdbAuditEvent([], {
      eventId: 'evt-1',
      scope: finalScope,
      type: 'RECORD_CREATED',
      actor,
      occurredAt: '2026-08-28T11:05:00.000Z',
      payload: {},
    });

    await expect(
      appendEdbAuditEvent(chain, {
        eventId: 'evt-other-diary',
        scope: { ...finalScope, diaryId: 2 },
        type: 'RECORD_CREATED',
        actor,
        occurredAt: '2026-08-28T11:06:00.000Z',
        payload: {},
      }),
    ).rejects.toThrow('EDB_AUDIT_DIARY_SCOPE_MISMATCH');
  });
});
