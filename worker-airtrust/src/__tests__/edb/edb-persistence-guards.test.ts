import { describe, expect, it } from 'vitest';
import { persistEdbDraftRevision } from '../../repositories/edb/edb-persistence-repository';
import { createEmptyEdbFlightRecord } from '../../services/edb/contracts';

const neverDb = new Proxy(
  {},
  {
    get() {
      throw new Error('database must not be touched when a persistence guard fails');
    },
  },
) as D1Database;

function baseRecord() {
  return createEmptyEdbFlightRecord({
    operatorCompanyId: 10,
    operatorRegulation: 'RBAC135',
    sourceFlightId: 20,
    sourceRdvId: 30,
    sourceRdvVersion: 1,
    sourceStageId: 40,
    capturedAt: '2026-08-28T12:00:00Z',
  });
}

const common = {
  empresaId: 10,
  diarioId: 1,
  volumeId: 'volume-1',
  logicalRecordId: 'flight-20-stage-40',
  technicalAcknowledgementId: 'techack-1',
};

describe('eDB persistence guards', () => {
  it('fails closed before D1 when the record has no explicit source stage', async () => {
    const record = baseRecord();
    record.source.sourceStageId = null;

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        record,
      }),
    ).rejects.toThrow('requires an explicit source stage');
  });

  it('fails closed before D1 on cross-tenant persistence', async () => {
    const record = baseRecord();

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        empresaId: 11,
        record,
      }),
    ).rejects.toThrow('tenant does not match');
  });

  it('refuses to persist a non-draft record as a new revision', async () => {
    const record = baseRecord();
    record.status = 'PIC_SIGNED';

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        record,
      }),
    ).rejects.toThrow('Only DRAFT');
  });

  it('requires the preflight acknowledgement evidence before touching D1', async () => {
    const record = baseRecord();

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        record,
      }),
    ).rejects.toThrow('payload requires the preflight PIC technical acknowledgement');
  });
});
