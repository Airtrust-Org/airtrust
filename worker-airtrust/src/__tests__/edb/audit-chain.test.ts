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

describe('eDB audit chain', () => {
  it('builds and verifies a hash-linked append-only event chain', async () => {
    let chain: EdbAuditEvent[] = [];
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-1',
      recordId: 'edb-1-r1',
      revision: 1,
      type: 'RECORD_CREATED',
      actor,
      occurredAt: '2026-08-28T10:00:00.000Z',
      payload: { sourceFlightId: 100 },
    });
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-2',
      recordId: 'edb-1-r1',
      revision: 1,
      type: 'PIC_TECHNICAL_ACK_SIGNED',
      actor,
      occurredAt: '2026-08-28T10:01:00.000Z',
      payload: { signatureId: 'sig-tech-1' },
    });

    expect(chain[0].previousEventHashSha256).toBeNull();
    expect(chain[1].previousEventHashSha256).toBe(chain[0].eventHashSha256);
    expect(await verifyEdbAuditChain(chain)).toEqual({ valid: true, issues: [] });
  });

  it('detects mutation of historical event payloads', async () => {
    let chain: EdbAuditEvent[] = [];
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-1',
      recordId: 'edb-1-r1',
      revision: 1,
      type: 'RECORD_CREATED',
      actor,
      occurredAt: '2026-08-28T10:00:00.000Z',
      payload: { sourceFlightId: 100 },
    });
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-2',
      recordId: 'edb-1-r1',
      revision: 1,
      type: 'REGULATORY_DATA_UPDATED',
      actor,
      occurredAt: '2026-08-28T10:02:00.000Z',
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
      recordId: 'edb-1-r1',
      revision: 1,
      type: 'RECORD_CREATED',
      actor,
      occurredAt: '2026-08-28T10:00:00.000Z',
      payload: {},
    });
    chain = await appendEdbAuditEvent(chain, {
      eventId: 'evt-2',
      recordId: 'edb-1-r1',
      revision: 1,
      type: 'OPERATOR_RECORD_SIGNED',
      actor,
      occurredAt: '2026-08-28T10:03:00.000Z',
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
});
