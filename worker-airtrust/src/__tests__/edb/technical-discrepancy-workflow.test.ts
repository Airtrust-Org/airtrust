import { describe, expect, it } from 'vitest';
import type { EdbPersonIdentity } from '../../services/edb/contracts';
import {
  appendCorrectiveAction,
  appendDeferredActionAuthorization,
  appendReturnToServiceApproval,
  createTechnicalDiscrepancyCase,
  getTechnicalDiscrepancyStatus,
  isTechnicalDiscrepancyClosedForReturnToService,
} from '../../services/edb/technical-discrepancy-workflow';

const pic: EdbPersonIdentity = {
  employeeId: 10,
  fullName: 'Piloto em Comando',
  anacCode: '123456',
};

const mechanic: EdbPersonIdentity = {
  employeeId: 20,
  fullName: 'Responsavel Manutencao',
  anacCode: null,
};

function discrepancy() {
  return createTechnicalDiscrepancyCase({
    discrepancyId: 'disc-1',
    revisionId: 'edbrev-100-300-r1',
    description: 'Vibracao anormal observada pela tripulacao',
    detectedBy: pic,
    detectedAt: '2026-08-28T10:50:00.000Z',
    createdAt: '2026-08-28T11:00:00.000Z',
  });
}

describe('eDB technical discrepancy workflow', () => {
  it('keeps discrepancy evidence append-only through deferment, correction and RTS', () => {
    const original = discrepancy();
    expect(getTechnicalDiscrepancyStatus(original)).toBe('OPEN');

    const deferred = appendDeferredActionAuthorization(original, {
      actionId: 'maint-1',
      reason: 'Acao corretiva retardada conforme documento aplicavel',
      limitationOrControl: 'Operacao condicionada ao controle registrado',
      authorizedBy: mechanic,
      authorizedAt: '2026-08-28T11:30:00.000Z',
      reference: 'DOC-DEF-001',
    });

    expect(getTechnicalDiscrepancyStatus(deferred)).toBe('DEFERRED_ACTION_AUTHORIZED');
    expect(original.maintenanceActions).toHaveLength(0);

    const corrected = appendCorrectiveAction(deferred, {
      actionId: 'maint-2',
      description: 'Acao corretiva executada',
      performedBy: mechanic,
      performedAt: '2026-08-29T09:00:00.000Z',
      reference: 'OS-123',
    });

    expect(getTechnicalDiscrepancyStatus(corrected)).toBe('CORRECTIVE_ACTION_RECORDED');
    expect(corrected.maintenanceActions).toHaveLength(2);
    expect(deferred.maintenanceActions).toHaveLength(1);

    const released = appendReturnToServiceApproval(corrected, {
      approvalId: 'rts-1',
      correctiveActionId: 'maint-2',
      description: 'Aprovacao para retorno ao servico registrada pelo responsavel',
      approvedBy: mechanic,
      approvedAt: '2026-08-29T09:15:00.000Z',
      reference: 'RTS-123',
    });

    expect(getTechnicalDiscrepancyStatus(released)).toBe('RETURN_TO_SERVICE_RECORDED');
    expect(isTechnicalDiscrepancyClosedForReturnToService(released)).toBe(true);
    expect(corrected.returnToServiceApprovals).toHaveLength(0);
  });

  it('fails closed when RTS does not reference an existing corrective action', () => {
    expect(() =>
      appendReturnToServiceApproval(discrepancy(), {
        approvalId: 'rts-orphan',
        correctiveActionId: 'missing-action',
        description: 'Tentativa de RTS sem acao corretiva',
        approvedBy: mechanic,
        approvedAt: '2026-08-28T12:00:00.000Z',
        reference: null,
      }),
    ).toThrow('existing corrective action');
  });

  it('rejects maintenance evidence recorded before discrepancy detection', () => {
    expect(() =>
      appendCorrectiveAction(discrepancy(), {
        actionId: 'maint-before',
        description: 'Acao cronologicamente impossivel',
        performedBy: mechanic,
        performedAt: '2026-08-28T10:40:00.000Z',
        reference: null,
      }),
    ).toThrow('cannot predate discrepancy detection');
  });

  it('rejects RTS evidence recorded before its corrective action', () => {
    const corrected = appendCorrectiveAction(discrepancy(), {
      actionId: 'maint-2',
      description: 'Acao corretiva executada',
      performedBy: mechanic,
      performedAt: '2026-08-29T09:00:00.000Z',
      reference: null,
    });

    expect(() =>
      appendReturnToServiceApproval(corrected, {
        approvalId: 'rts-before',
        correctiveActionId: 'maint-2',
        description: 'RTS invalido',
        approvedBy: mechanic,
        approvedAt: '2026-08-29T08:59:59.000Z',
        reference: null,
      }),
    ).toThrow('cannot predate the corrective action');
  });

  it('rejects duplicate maintenance actions and duplicate RTS evidence', () => {
    const corrected = appendCorrectiveAction(discrepancy(), {
      actionId: 'maint-2',
      description: 'Acao corretiva executada',
      performedBy: mechanic,
      performedAt: '2026-08-29T09:00:00.000Z',
      reference: null,
    });

    expect(() =>
      appendDeferredActionAuthorization(corrected, {
        actionId: 'maint-2',
        reason: 'Tentativa duplicada',
        limitationOrControl: null,
        authorizedBy: mechanic,
        authorizedAt: '2026-08-29T09:05:00.000Z',
        reference: null,
      }),
    ).toThrow('Duplicate maintenance actionId');

    const released = appendReturnToServiceApproval(corrected, {
      approvalId: 'rts-1',
      correctiveActionId: 'maint-2',
      description: 'RTS valido',
      approvedBy: mechanic,
      approvedAt: '2026-08-29T09:15:00.000Z',
      reference: null,
    });

    expect(() =>
      appendReturnToServiceApproval(released, {
        approvalId: 'rts-2',
        correctiveActionId: 'maint-2',
        description: 'Segundo RTS indevido',
        approvedBy: mechanic,
        approvedAt: '2026-08-29T09:20:00.000Z',
        reference: null,
      }),
    ).toThrow('already has a return-to-service approval');
  });

  it('requires stable discrepancy identity and valid chronology', () => {
    expect(() =>
      createTechnicalDiscrepancyCase({
        discrepancyId: ' ',
        revisionId: 'edbrev-100-300-r1',
        description: 'Teste',
        detectedBy: pic,
        detectedAt: '2026-08-28T10:50:00.000Z',
        createdAt: '2026-08-28T11:00:00.000Z',
      }),
    ).toThrow('discrepancyId is required');

    expect(() =>
      createTechnicalDiscrepancyCase({
        discrepancyId: 'disc-2',
        revisionId: 'edbrev-100-300-r1',
        description: 'Teste',
        detectedBy: pic,
        detectedAt: '2026-08-28T11:00:00.000Z',
        createdAt: '2026-08-28T10:59:59.000Z',
      }),
    ).toThrow('createdAt cannot predate detectedAt');
  });
});
