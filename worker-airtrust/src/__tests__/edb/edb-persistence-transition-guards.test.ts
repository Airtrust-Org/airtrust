import { describe, expect, it } from 'vitest';
import { transitionEdbRevisionState } from '../../repositories/edb/edb-persistence-repository';
import type { EdbLifecycleStatus } from '../../services/edb/contracts';

const neverDb = new Proxy(
  {},
  {
    get() {
      throw new Error('database must not be touched for a reserved transition');
    },
  },
) as D1Database;

async function expectReservedTransition(
  expectedStatus: EdbLifecycleStatus,
  nextStatus: EdbLifecycleStatus,
) {
  await expect(
    transitionEdbRevisionState({
      db: neverDb,
      empresaId: 10,
      revisionId: 'edbrev-1',
      expectedStatus,
      nextStatus,
      expectedVersion: 1,
    }),
  ).rejects.toThrow('EDB_STATE_TRANSITION_NOT_ALLOWED');
}

describe('eDB reserved atomic lifecycle transitions', () => {
  it('requires appendEdbSignature for READY_FOR_PIC_SIGNATURE -> PIC_SIGNED', async () => {
    await expectReservedTransition('READY_FOR_PIC_SIGNATURE', 'PIC_SIGNED');
  });

  it('requires appendEdbSignature for PIC_SIGNED -> OPERATOR_SIGNED', async () => {
    await expectReservedTransition('PIC_SIGNED', 'OPERATOR_SIGNED');
  });

  it('requires queueEdbAnacTransmission for OPERATOR_SIGNED -> ANAC_PENDING', async () => {
    await expectReservedTransition('OPERATOR_SIGNED', 'ANAC_PENDING');
  });
});
