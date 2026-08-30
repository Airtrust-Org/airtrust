import { describe, expect, it } from 'vitest';
import {
  hydrateEdbTechnicalDiscrepancyCase,
  type EdbStoredDiscrepancyRow,
  type EdbStoredMaintenanceActionRow,
} from '../../repositories/edb/edb-technical-discrepancy-repository';
import { canonicalJson } from '../../services/edb/canonicalization';
import {
  getTechnicalDiscrepancyStatus,
  isTechnicalDiscrepancyClosedForReturnToService,
} from '../../services/edb/technical-discrepancy-workflow';

const discrepancy: EdbStoredDiscrepancyRow = {
  id: 'disc-1',
  empresa_id: 10,
  revision_id: 'rev-1',
  descricao: 'Vibracao anormal',
  detectado_por_funcionario_id: 100,
  detectado_por_nome: 'Piloto em Comando',
  detectado_por_codigo_anac: '123456',
  detectado_em: '2026-08-28T10:50:00.000Z',
  created_at: '2026-08-28T11:00:00.000Z',
};

function evidence(reference: string | null, limitationOrControl?: string | null) {
  return canonicalJson({
    reference,
    actorAnacCode: null,
    ...(limitationOrControl === undefined ? {} : { limitationOrControl }),
  });
}

function action(
  overrides: Partial<EdbStoredMaintenanceActionRow>,
): EdbStoredMaintenanceActionRow {
  return {
    id: 'action-1',
    empresa_id: 10,
    discrepancia_id: 'disc-1',
    tipo: 'CORRECTIVE_ACTION',
    referencia_acao_id: null,
    descricao: 'Acao executada',
    executado_por_funcionario_id: 200,
    executado_por_nome: 'Responsavel Manutencao',
    executado_em: '2026-08-29T09:00:00.000Z',
    evidencia_json: evidence('OS-123'),
    created_at: '2026-08-29T09:00:01.000Z',
    ...overrides,
  };
}

describe('eDB discrepancy/maintenance persisted hydration', () => {
  it('rehydrates deferred, corrective and RTS history without losing explicit evidence', () => {
    const hydrated = hydrateEdbTechnicalDiscrepancyCase({
      empresaId: 10,
      discrepancy,
      actions: [
        action({
          id: 'defer-1',
          tipo: 'DEFERRED_ACTION_AUTHORIZATION',
          descricao: 'Diferimento autorizado',
          executado_em: '2026-08-28T11:30:00.000Z',
          evidencia_json: evidence('MEL-001', 'Operacao condicionada ao controle registrado'),
        }),
        action({ id: 'corrective-1' }),
        action({
          id: 'rts-1',
          tipo: 'RTS_APPROVAL',
          referencia_acao_id: 'corrective-1',
          descricao: 'Retorno ao servico aprovado',
          executado_em: '2026-08-29T09:15:00.000Z',
          evidencia_json: evidence('RTS-123'),
        }),
      ],
    });

    expect(hydrated.identity).toMatchObject({
      discrepancyId: 'disc-1',
      revisionId: 'rev-1',
      description: 'Vibracao anormal',
    });
    expect(hydrated.maintenanceActions).toHaveLength(2);
    expect(hydrated.maintenanceActions[0]).toMatchObject({
      kind: 'DEFERRED_ACTION_AUTHORIZATION',
      actionId: 'defer-1',
      limitationOrControl: 'Operacao condicionada ao controle registrado',
      reference: 'MEL-001',
    });
    expect(hydrated.returnToServiceApprovals).toEqual([
      expect.objectContaining({
        approvalId: 'rts-1',
        correctiveActionId: 'corrective-1',
        description: 'Retorno ao servico aprovado',
        reference: 'RTS-123',
      }),
    ]);
    expect(getTechnicalDiscrepancyStatus(hydrated)).toBe('RETURN_TO_SERVICE_RECORDED');
    expect(isTechnicalDiscrepancyClosedForReturnToService(hydrated)).toBe(true);
  });

  it('fails closed when a stored maintenance row belongs to another tenant/discrepancy', () => {
    expect(() =>
      hydrateEdbTechnicalDiscrepancyCase({
        empresaId: 10,
        discrepancy,
        actions: [action({ empresa_id: 20 })],
      }),
    ).toThrow('EDB_MAINTENANCE_ACTION_SCOPE_MISMATCH');
  });

  it('fails closed when persisted evidence JSON omits required actor/reference fields', () => {
    expect(() =>
      hydrateEdbTechnicalDiscrepancyCase({
        empresaId: 10,
        discrepancy,
        actions: [action({ evidencia_json: '{}' })],
      }),
    ).toThrow('EDB_MAINTENANCE_EVIDENCE_REFERENCE_MISSING');
  });

  it('rejects an RTS row that does not reference a prior persisted corrective action', () => {
    expect(() =>
      hydrateEdbTechnicalDiscrepancyCase({
        empresaId: 10,
        discrepancy,
        actions: [
          action({
            id: 'rts-orphan',
            tipo: 'RTS_APPROVAL',
            referencia_acao_id: 'missing',
            descricao: 'RTS sem acao corretiva',
          }),
        ],
      }),
    ).toThrow('existing corrective action');
  });

  it('rejects persisted maintenance chronology that predates discrepancy detection', () => {
    expect(() =>
      hydrateEdbTechnicalDiscrepancyCase({
        empresaId: 10,
        discrepancy,
        actions: [action({ executado_em: '2026-08-28T10:00:00.000Z' })],
      }),
    ).toThrow('cannot predate discrepancy detection');
  });
});
