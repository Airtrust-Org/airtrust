import { describe, expect, it } from 'vitest';
import {
  hydrateEdbPicTechnicalAcknowledgementRow,
  hydrateEdbTechnicalSituationRow,
  type EdbPicTechnicalAcknowledgementRow,
  type EdbTechnicalSituationRow,
} from '../../repositories/edb/edb-technical-awareness-repository';
import { canonicalJson } from '../../services/edb/canonicalization';
import { createTechnicalSituationSnapshot } from '../../services/edb/technical-awareness';

async function rows() {
  const snapshot = await createTechnicalSituationSnapshot({
    snapshotId: 'tech-1',
    operatorCompanyId: 1,
    sourceFlightId: 100,
    aircraft: {
      aircraftId: 12,
      manufacturer: 'Leonardo',
      model: 'AW139',
      serialNumber: 'SN-001',
      registrationMarks: 'PR-ABC',
      owners: ['Owner'],
      operators: ['Operator'],
    },
    maintenance: {
      lastIntervention: {
        type: 'Inspection',
        date: '2026-08-20',
        returnToServiceApprovedBy: 'Maintenance',
      },
      nextIntervention: { type: '50h', dueAtAirframeHours: 1520 },
    },
    capturedAt: '2026-08-28T09:00:00.000Z',
  });

  const situationRow: EdbTechnicalSituationRow = {
    id: snapshot.snapshotId,
    empresa_id: snapshot.operatorCompanyId,
    voo_id: snapshot.sourceFlightId,
    aeronave_id: snapshot.aircraft.aircraftId,
    aircraft_json: canonicalJson(snapshot.aircraft),
    maintenance_json: canonicalJson(snapshot.maintenance),
    technical_content_sha256: snapshot.technicalContentSha256,
    canonical_snapshot_sha256: snapshot.canonicalSnapshotSha256,
    captured_at: snapshot.capturedAt,
    created_by: 10,
    created_at: '2026-08-28T09:00:01.000Z',
  };

  const acknowledgementRow: EdbPicTechnicalAcknowledgementRow = {
    id: 'sig-tech-1',
    empresa_id: 1,
    situacao_tecnica_id: 'tech-1',
    voo_id: 100,
    signer_funcionario_id: 10,
    signer_user_id: 50,
    signer_nome: 'Piloto em Comando',
    signer_codigo_anac: '123456',
    signed_at: '2026-08-28T09:30:00.000Z',
    canonical_snapshot_sha256: snapshot.canonicalSnapshotSha256,
    metodo: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proof_reference: 'proof/tech-1',
    auth_evidence_json: '{"mfa":true}',
    created_at: '2026-08-28T09:30:01.000Z',
  };

  return { snapshot, situationRow, acknowledgementRow };
}

describe('eDB persisted preflight evidence hydration', () => {
  it('rehydrates a technical snapshot only after recomputing both hashes', async () => {
    const { snapshot, situationRow } = await rows();
    const hydrated = await hydrateEdbTechnicalSituationRow(situationRow);
    expect(hydrated).toEqual(snapshot);
  });

  it('rehydrates the PIC acknowledgement with signature identity and exact technical target', async () => {
    const { situationRow, acknowledgementRow } = await rows();
    const snapshot = await hydrateEdbTechnicalSituationRow(situationRow);
    const acknowledgement = await hydrateEdbPicTechnicalAcknowledgementRow({
      row: acknowledgementRow,
      snapshot,
    });
    expect(acknowledgement.signature.signatureId).toBe('sig-tech-1');
    expect(acknowledgement.signature.targetType).toBe('TECHNICAL_SITUATION');
    expect(acknowledgement.signature.targetId).toBe('tech-1');
    expect(acknowledgement.technicalSituationId).toBe('tech-1');
  });

  it('rejects a persisted technical snapshot whose JSON no longer matches its hashes', async () => {
    const { situationRow } = await rows();
    situationRow.aircraft_json = canonicalJson({
      aircraftId: 12,
      manufacturer: 'Leonardo',
      model: 'AW139',
      serialNumber: 'SN-CHANGED',
      registrationMarks: 'PR-ABC',
      owners: ['Owner'],
      operators: ['Operator'],
    });
    await expect(hydrateEdbTechnicalSituationRow(situationRow)).rejects.toThrow(
      'EDB_TECHNICAL_CONTENT_HASH_MISMATCH',
    );
  });

  it('rejects acknowledgement rows from another flight or snapshot', async () => {
    const { situationRow, acknowledgementRow } = await rows();
    const snapshot = await hydrateEdbTechnicalSituationRow(situationRow);
    acknowledgementRow.voo_id = 101;
    await expect(
      hydrateEdbPicTechnicalAcknowledgementRow({ row: acknowledgementRow, snapshot }),
    ).rejects.toThrow('EDB_TECHNICAL_ACK_NOT_FOUND_OR_SCOPE_MISMATCH');
  });
});
