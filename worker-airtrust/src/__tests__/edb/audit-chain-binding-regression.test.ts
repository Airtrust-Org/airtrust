import { describe, expect, it } from 'vitest';

import {
  appendEdbAuditEvent,
  hashEdbAuditEventDraft,
  verifyEdbAuditChain,
  type EdbAuditEvent,
} from '../../services/edb/audit-chain';

const actor = {
  actorRef: 'employee:10',
  displayName: 'PIC',
};

const scope = {
  diaryId: 1,
  sourceFlightId: 100,
  technicalSituationId: 'tech-1',
  revisionId: 'edb-rev-1',
};

async function buildChain(): Promise<EdbAuditEvent[]> {
  let chain: EdbAuditEvent[] = [];

  chain = await appendEdbAuditEvent(chain, {
    eventId: 'evt-1',
    scope,
    type: 'RECORD_CREATED',
    actor,
    occurredAt: '2026-09-04T12:05:00.000Z',
    payload: { revision: 1 },
  });

  chain = await appendEdbAuditEvent(chain, {
    eventId: 'evt-2',
    scope,
    type: 'PIC_FLIGHT_RECORD_SIGNED',
    actor,
    occurredAt: '2026-09-04T12:10:00.000Z',
    payload: { signatureId: 'sig-pic-1' },
  });

  return chain;
}

async function expectHistoricalMutationRejected(
  mutate: (event: EdbAuditEvent) => EdbAuditEvent,
): Promise<void> {
  const chain = await buildChain();
  const tampered = [mutate(chain[0]), chain[1]];

  const result = await verifyEdbAuditChain(tampered);

  expect(result.valid).toBe(false);
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ index: 0, code: 'EVENT_HASH_MISMATCH' }),
    ]),
  );
  expect(result.issues).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ index: 1, code: 'PREVIOUS_HASH_MISMATCH' }),
    ]),
  );
}

describe('eDB audit-chain evidence binding regression', () => {
  it('binds the actor identity and display evidence into the historical event hash', async () => {
    await expectHistoricalMutationRejected((event) => ({
      ...event,
      actor: { actorRef: 'employee:999', displayName: 'Other PIC' },
    }));
  });

  it('binds source-flight, technical-situation and revision scope into the event hash', async () => {
    for (const changedScope of [
      { ...scope, sourceFlightId: 101 },
      { ...scope, technicalSituationId: 'tech-2' },
      { ...scope, revisionId: 'edb-rev-2' },
    ]) {
      await expectHistoricalMutationRejected((event) => ({
        ...event,
        scope: changedScope,
      }));
    }
  });

  it('binds the event type and occurrence timestamp into the event hash', async () => {
    await expectHistoricalMutationRejected((event) => ({
      ...event,
      type: 'REGULATORY_DATA_UPDATED',
    }));

    await expectHistoricalMutationRejected((event) => ({
      ...event,
      occurredAt: '2026-09-04T12:06:00.000Z',
    }));
  });

  it('detects a rewritten historical hash through the next event link', async () => {
    const chain = await buildChain();
    const mutated = {
      ...chain[0],
      actor: { actorRef: 'employee:999', displayName: 'Other PIC' },
    };
    const { eventHashSha256: _storedHash, ...draft } = mutated;
    const rewritten = {
      ...mutated,
      eventHashSha256: await hashEdbAuditEventDraft(draft),
    };

    const result = await verifyEdbAuditChain([rewritten, chain[1]]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 1, code: 'PREVIOUS_HASH_MISMATCH' }),
      ]),
    );
    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, code: 'EVENT_HASH_MISMATCH' }),
      ]),
    );
  });

  it('detects diary substitution independently of the cryptographic hash mismatch', async () => {
    const chain = await buildChain();
    const tampered = [
      chain[0],
      {
        ...chain[1],
        scope: { ...chain[1].scope, diaryId: 2 },
      },
    ];

    const result = await verifyEdbAuditChain(tampered);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 1, code: 'DIARY_SCOPE_MISMATCH' }),
        expect.objectContaining({ index: 1, code: 'EVENT_HASH_MISMATCH' }),
      ]),
    );
  });

  it('detects timestamp regression independently of the cryptographic hash mismatch', async () => {
    const chain = await buildChain();
    const tampered = [
      chain[0],
      {
        ...chain[1],
        occurredAt: '2026-09-04T12:04:59.000Z',
      },
    ];

    const result = await verifyEdbAuditChain(tampered);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 1, code: 'EVENT_TIME_REGRESSION' }),
        expect.objectContaining({ index: 1, code: 'EVENT_HASH_MISMATCH' }),
      ]),
    );
  });

  it('rejects a non-null predecessor hash on the first event even when the stored hash is unchanged', async () => {
    const chain = await buildChain();
    const tampered = [
      {
        ...chain[0],
        previousEventHashSha256: 'a'.repeat(64),
      },
      chain[1],
    ];

    const result = await verifyEdbAuditChain(tampered);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, code: 'FIRST_EVENT_PREVIOUS_HASH_NOT_NULL' }),
        expect.objectContaining({ index: 0, code: 'EVENT_HASH_MISMATCH' }),
      ]),
    );
  });
});
