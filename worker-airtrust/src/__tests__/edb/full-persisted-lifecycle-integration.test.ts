import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  appendPersistedEdbAuditEvent,
  loadAndVerifyEdbAuditChain,
} from '../../repositories/edb/edb-audit-repository';
import {
  closeEdbDiary,
  closePersistedEdbDiaryVolume,
  createEdbDiary,
  createEdbDiaryVolume,
  createEdbIntegrityIncident,
  loadEdbIntegrityIncident,
  recordEdbAnacInformationLossNotification,
  recordEdbPoliceOccurrence,
  recordEdbSuccessfulReconstitution,
} from '../../repositories/edb/edb-diary-repository';
import {
  appendEdbSignature,
  getEdbRevisionState,
  markEdbRevisionReadyForPicSignature,
  persistEdbDraftRevision,
  queueEdbAnacTransmission,
} from '../../repositories/edb/edb-persistence-repository';
import {
  appendEdbPicTechnicalAcknowledgement,
  persistEdbTechnicalSituation,
} from '../../repositories/edb/edb-technical-awareness-repository';
import {
  appendEdbCorrectiveAction,
  appendEdbDeferredActionAuthorization,
  appendEdbReturnToServiceApproval,
  createEdbTechnicalDiscrepancy,
  loadEdbTechnicalDiscrepancyCase,
} from '../../repositories/edb/edb-technical-discrepancy-repository';
import { hashSignableEdbPayload } from '../../services/edb/canonicalization';
import {
  createEmptyEdbFlightRecord,
  type EdbFlightRecord,
  type EdbPersonIdentity,
  type EdbSignatureProof,
} from '../../services/edb/contracts';
import { finalizePostflightEdbRecord } from '../../services/edb/postflight-finalization';
import {
  bindPicTechnicalAcknowledgement,
  createTechnicalSituationSnapshot,
} from '../../services/edb/technical-awareness';
import {
  getTechnicalDiscrepancyStatus,
  isTechnicalDiscrepancyClosedForReturnToService,
} from '../../services/edb/technical-discrepancy-workflow';

class SqliteD1PreparedStatement {
  constructor(
    private readonly sqlite: DatabaseSync,
    readonly sql: string,
    readonly values: readonly unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1PreparedStatement {
    return new SqliteD1PreparedStatement(this.sqlite, this.sql, values);
  }

  async first<T = unknown>(): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.values);
    return (row ?? null) as T | null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const rows = this.sqlite.prepare(this.sql).all(...this.values) as T[];
    return {
      success: true,
      results: rows,
      meta: { changes: 0 },
    } as D1Result<T>;
  }

  async run(): Promise<D1Result<unknown>> {
    return this.runSync();
  }

  runSync(): D1Result<unknown> {
    const result = this.sqlite.prepare(this.sql).run(...this.values);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    } as D1Result<unknown>;
  }
}

class SqliteD1Adapter {
  constructor(readonly sqlite: DatabaseSync) {}

  prepare(sql: string): D1PreparedStatement {
    return new SqliteD1PreparedStatement(this.sqlite, sql) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) =>
        (statement as unknown as SqliteD1PreparedStatement).runSync(),
      ) as D1Result<T>[];
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

const EMPRESA_ID = 91001;
const AIRCRAFT_ID = 91002;
const FLIGHT_ID = 91003;
const STAGE_ID = 91004;
const VOLUME_ID = 'qa-edb-persisted-volume-1';
const REVISION_ID = 'qa-edb-persisted-r1';

const pic: EdbPersonIdentity = {
  employeeId: 91011,
  fullName: 'QA Persisted PIC',
  anacCode: 'QA91011',
};
const operator: EdbPersonIdentity = {
  employeeId: 91012,
  fullName: 'QA Persisted Operator',
  anacCode: null,
};
const mechanic: EdbPersonIdentity = {
  employeeId: 91013,
  fullName: 'QA Persisted Maintenance',
  anacCode: null,
};

function applyEdbSchema(sqlite: DatabaseSync): void {
  sqlite.exec(`
    CREATE TABLE cv_voo_etapas (id INTEGER PRIMARY KEY);
    CREATE TABLE cv_voo_tripulantes (id INTEGER PRIMARY KEY);
    INSERT INTO cv_voo_etapas (id) VALUES (${STAGE_ID});
  `);
  for (const migration of [
    '0477_edb_operational_core.sql',
    '0478_edb_anac_receipt_integrity.sql',
    '0479_edb_relational_integrity.sql',
    '0480_edb_diary_lifecycle_integrity.sql',
  ]) {
    const url = new URL(`../../../migrations/${migration}`, import.meta.url);
    sqlite.exec(readFileSync(url, 'utf8'));
  }
}

function draftRecord(): EdbFlightRecord {
  const record = createEmptyEdbFlightRecord({
    operatorCompanyId: EMPRESA_ID,
    operatorRegulation: 'RBAC135',
    sourceFlightId: FLIGHT_ID,
    sourceRdvId: 91005,
    sourceRdvVersion: 1,
    sourceStageId: STAGE_ID,
    capturedAt: '2026-08-30T12:05:00.000Z',
    logicalRecordId: 'qa-edb-persisted-flight-stage',
    revisionId: REVISION_ID,
  });
  record.identity.aircraft = {
    aircraftId: AIRCRAFT_ID,
    manufacturer: 'QA Manufacturer',
    model: 'QA Model',
    serialNumber: 'QA-PERSISTED-SN',
    registrationMarks: 'QA-PST',
    owners: ['QA Synthetic Owner'],
    operators: ['QA Synthetic Operator'],
  };
  record.maintenance = {
    lastIntervention: {
      type: 'QA synthetic scheduled inspection',
      date: '2026-08-29',
      returnToServiceApprovedBy: mechanic.fullName,
    },
    nextIntervention: {
      type: 'QA synthetic next inspection',
      dueAtAirframeHours: 2000,
    },
  };
  record.flight = {
    date: '2026-08-30',
    origin: 'SBJR',
    destination: 'SBJR',
    times: {
      engineStartAt: '2026-08-30T11:00:00.000Z',
      takeoffAt: '2026-08-30T11:05:00.000Z',
      landingAt: '2026-08-30T11:55:00.000Z',
      engineShutdownAt: '2026-08-30T12:00:00.000Z',
    },
    landingsTotal: 1,
    cycles: 1,
    duration: {
      dayMinutes: 50,
      nightMinutes: 0,
      totalMinutes: 50,
      ifrActualMinutes: 0,
      ifrSimulatedMinutes: 0,
    },
    fuelBeforeEngineStart: 900,
    personsOnBoard: 2,
    cargoKg: 0,
    nature: 'QA_SYNTHETIC',
    occurrences: [],
    technicalDiscrepancies: [],
    crew: [
      {
        ...pic,
        operationalRole: 'PIC',
        regulatoryFunctionCode: null,
      },
    ],
  };
  return record;
}

function signature(params: {
  type: 'PIC_FLIGHT_RECORD' | 'OPERATOR_RECORD';
  signer: EdbPersonIdentity;
  hash: string;
  signedAt: string;
}): EdbSignatureProof {
  return {
    signatureId: `qa-persisted-${params.type.toLowerCase()}`,
    type: params.type,
    targetType: 'FINAL_RECORD_REVISION',
    targetId: REVISION_ID,
    signer: { ...params.signer },
    signedAt: params.signedAt,
    canonicalPayloadHashSha256: params.hash,
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: `qa-proof/persisted/${params.type.toLowerCase()}`,
  };
}

describe('eDB full persisted lifecycle integration in isolated SQLite', () => {
  it('persists the governed lifecycle end-to-end without shared D1 or external ANAC side effects', async () => {
    const sqlite = new DatabaseSync(':memory:');
    applyEdbSchema(sqlite);
    const db = new SqliteD1Adapter(sqlite) as unknown as D1Database;

    try {
      const diary = await createEdbDiary({
        db,
        empresaId: EMPRESA_ID,
        aircraftId: AIRCRAFT_ID,
        operatorRegulation: 'RBAC135',
        createdBy: operator.employeeId,
      });
      const volume = await createEdbDiaryVolume({
        db,
        empresaId: EMPRESA_ID,
        diaryId: diary.diaryId,
        volumeId: VOLUME_ID,
        aircraftRegistrationMarks: 'QA-PST',
        sequence: 1,
        openedAt: '2026-08-30T08:00:00.000Z',
        openedBy: operator,
        observations: 'QA isolated persisted lifecycle',
      });
      expect(volume.status).toBe('OPEN');

      const draft = draftRecord();
      const technicalSituation = await createTechnicalSituationSnapshot({
        snapshotId: 'qa-persisted-tech-1',
        operatorCompanyId: EMPRESA_ID,
        sourceFlightId: FLIGHT_ID,
        aircraft: draft.identity.aircraft,
        maintenance: draft.maintenance,
        capturedAt: '2026-08-30T10:00:00.000Z',
      });
      await persistEdbTechnicalSituation({ db, snapshot: technicalSituation, createdBy: operator.employeeId });

      const technicalSignature: EdbSignatureProof = {
        signatureId: 'qa-persisted-tech-ack-1',
        type: 'PIC_TECHNICAL_ACK',
        targetType: 'TECHNICAL_SITUATION',
        targetId: technicalSituation.snapshotId,
        signer: { ...pic },
        signedAt: '2026-08-30T10:30:00.000Z',
        canonicalPayloadHashSha256: technicalSituation.canonicalSnapshotSha256,
        method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
        proofReference: 'qa-proof/persisted/technical',
      };
      const technicalAcknowledgement = bindPicTechnicalAcknowledgement({
        snapshot: technicalSituation,
        signature: technicalSignature,
      });
      await appendEdbPicTechnicalAcknowledgement({
        db,
        acknowledgement: technicalAcknowledgement,
        signerUserId: pic.employeeId,
        authenticationEvidence: { synthetic: true, isolated: true },
      });

      const finalized = await finalizePostflightEdbRecord({
        draftRecord: draft,
        technicalSituation,
        technicalAcknowledgement,
      });
      const record = finalized.record;
      await persistEdbDraftRevision(db, {
        empresaId: EMPRESA_ID,
        diarioId: diary.diaryId,
        volumeId: VOLUME_ID,
        technicalAcknowledgementSignatureId: technicalSignature.signatureId,
        record,
        createdBy: operator.employeeId,
      });

      await markEdbRevisionReadyForPicSignature({
        db,
        empresaId: EMPRESA_ID,
        revisionId: REVISION_ID,
        updatedBy: operator.employeeId,
      });
      expect(await getEdbRevisionState(db, EMPRESA_ID, REVISION_ID)).toMatchObject({
        status: 'READY_FOR_PIC_SIGNATURE',
        versao: 2,
      });

      const picProof = signature({
        type: 'PIC_FLIGHT_RECORD',
        signer: pic,
        hash: await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD'),
        signedAt: '2026-08-30T12:10:00.000Z',
      });
      await appendEdbSignature({
        db,
        empresaId: EMPRESA_ID,
        revisionId: REVISION_ID,
        signature: picProof,
        signerUserId: pic.employeeId,
        authenticationEvidence: { synthetic: true, role: 'PIC' },
      });
      expect(await getEdbRevisionState(db, EMPRESA_ID, REVISION_ID)).toMatchObject({
        status: 'PIC_SIGNED',
        versao: 3,
      });

      const withPic = structuredClone(record);
      withPic.signatures.picFlightRecord = picProof;
      const operatorProof = signature({
        type: 'OPERATOR_RECORD',
        signer: operator,
        hash: await hashSignableEdbPayload(withPic, 'OPERATOR_RECORD'),
        signedAt: '2026-08-30T12:20:00.000Z',
      });
      await appendEdbSignature({
        db,
        empresaId: EMPRESA_ID,
        revisionId: REVISION_ID,
        signature: operatorProof,
        signerUserId: operator.employeeId,
        authenticationEvidence: { synthetic: true, role: 'OPERATOR' },
      });
      expect(await getEdbRevisionState(db, EMPRESA_ID, REVISION_ID)).toMatchObject({
        status: 'OPERATOR_SIGNED',
        versao: 4,
      });

      const outboxId = await queueEdbAnacTransmission({
        db,
        empresaId: EMPRESA_ID,
        revisionId: REVISION_ID,
        operationKind: 'CREATE',
        idempotencyKey: 'qa-edb-persisted:create:r1',
        payload: { synthetic: true, externalTransmission: false },
        outboxId: 'qa-edb-persisted-outbox-1',
        updatedBy: operator.employeeId,
      });
      expect(outboxId).toBe('qa-edb-persisted-outbox-1');
      expect(await getEdbRevisionState(db, EMPRESA_ID, REVISION_ID)).toMatchObject({
        status: 'ANAC_PENDING',
        versao: 5,
      });
      expect(
        sqlite.prepare('SELECT COUNT(*) AS count FROM edb_anac_recibos').get(),
      ).toMatchObject({ count: 0 });

      await createEdbTechnicalDiscrepancy({
        db,
        empresaId: EMPRESA_ID,
        discrepancyId: 'qa-persisted-disc-1',
        revisionId: REVISION_ID,
        description: 'QA isolated persisted discrepancy',
        detectedBy: pic,
        detectedAt: '2026-08-30T11:50:00.000Z',
        createdAt: '2026-08-30T12:55:00.000Z',
      });
      await appendEdbDeferredActionAuthorization({
        db,
        empresaId: EMPRESA_ID,
        discrepancyId: 'qa-persisted-disc-1',
        action: {
          actionId: 'qa-persisted-deferred-1',
          reason: 'QA isolated deferred authorization',
          limitationOrControl: 'QA isolated limitation',
          authorizedBy: mechanic,
          authorizedAt: '2026-08-30T13:00:00.000Z',
          reference: 'QA-MEL-PERSISTED-1',
        },
      });
      await appendEdbCorrectiveAction({
        db,
        empresaId: EMPRESA_ID,
        discrepancyId: 'qa-persisted-disc-1',
        action: {
          actionId: 'qa-persisted-corrective-1',
          description: 'QA isolated corrective action',
          performedBy: mechanic,
          performedAt: '2026-08-30T13:30:00.000Z',
          reference: 'QA-OS-PERSISTED-1',
        },
      });
      await appendEdbReturnToServiceApproval({
        db,
        empresaId: EMPRESA_ID,
        discrepancyId: 'qa-persisted-disc-1',
        approval: {
          approvalId: 'qa-persisted-rts-1',
          correctiveActionId: 'qa-persisted-corrective-1',
          description: 'QA isolated return to service',
          approvedBy: mechanic,
          approvedAt: '2026-08-30T13:45:00.000Z',
          reference: 'QA-RTS-PERSISTED-1',
        },
      });
      const discrepancy = await loadEdbTechnicalDiscrepancyCase({
        db,
        empresaId: EMPRESA_ID,
        discrepancyId: 'qa-persisted-disc-1',
      });
      expect(discrepancy).not.toBeNull();
      expect(getTechnicalDiscrepancyStatus(discrepancy!)).toBe('RETURN_TO_SERVICE_RECORDED');
      expect(isTechnicalDiscrepancyClosedForReturnToService(discrepancy!)).toBe(true);

      await appendPersistedEdbAuditEvent({
        db,
        empresaId: EMPRESA_ID,
        draft: {
          eventId: 'qa-persisted-audit-1',
          scope: {
            diaryId: diary.diaryId,
            sourceFlightId: FLIGHT_ID,
            technicalSituationId: technicalSituation.snapshotId,
            revisionId: REVISION_ID,
          },
          type: 'PIC_FLIGHT_RECORD_SIGNED',
          actor: pic,
          occurredAt: '2026-08-30T12:10:00.000Z',
          payload: { signatureId: picProof.signatureId },
        },
        actorUserId: pic.employeeId,
      });
      await appendPersistedEdbAuditEvent({
        db,
        empresaId: EMPRESA_ID,
        draft: {
          eventId: 'qa-persisted-audit-2',
          scope: {
            diaryId: diary.diaryId,
            sourceFlightId: FLIGHT_ID,
            technicalSituationId: technicalSituation.snapshotId,
            revisionId: REVISION_ID,
          },
          type: 'ANAC_SYNC_QUEUED',
          actor: operator,
          occurredAt: '2026-08-30T12:25:00.000Z',
          payload: { outboxId },
        },
        actorUserId: operator.employeeId,
      });
      const audit = await loadAndVerifyEdbAuditChain({
        db,
        empresaId: EMPRESA_ID,
        diaryId: diary.diaryId,
      });
      expect(audit.events).toHaveLength(2);
      expect(audit.verification).toEqual({ valid: true, issues: [] });

      await createEdbIntegrityIncident({
        db,
        empresaId: EMPRESA_ID,
        incidentId: 'qa-persisted-incident-1',
        diaryId: diary.diaryId,
        volumeId: VOLUME_ID,
        kind: 'CORRUPTION',
        detectedAt: '2026-08-30T14:00:00.000Z',
        description: 'QA isolated persisted integrity incident',
        createdBy: operator.employeeId,
      });
      await recordEdbPoliceOccurrence({
        db,
        empresaId: EMPRESA_ID,
        incidentId: 'qa-persisted-incident-1',
        reference: 'QA-BO-PERSISTED-1',
        reportedAt: '2026-08-30T14:10:00.000Z',
        updatedBy: operator.employeeId,
      });
      await recordEdbAnacInformationLossNotification({
        db,
        empresaId: EMPRESA_ID,
        incidentId: 'qa-persisted-incident-1',
        reference: 'QA-INTERNAL-ANAC-PERSISTED-1',
        notifiedAt: '2026-08-30T14:20:00.000Z',
        updatedBy: operator.employeeId,
      });
      await recordEdbSuccessfulReconstitution({
        db,
        empresaId: EMPRESA_ID,
        incidentId: 'qa-persisted-incident-1',
        completedAt: '2026-08-30T14:30:00.000Z',
        updatedBy: operator.employeeId,
      });
      expect(
        await loadEdbIntegrityIncident({
          db,
          empresaId: EMPRESA_ID,
          incidentId: 'qa-persisted-incident-1',
        }),
      ).toMatchObject({ reconstitutionOutcome: 'RECONSTITUTED' });

      const closedVolume = await closePersistedEdbDiaryVolume({
        db,
        empresaId: EMPRESA_ID,
        volumeId: VOLUME_ID,
        closedAt: '2026-08-30T15:00:00.000Z',
        closedBy: operator,
        observations: 'QA isolated persisted lifecycle completed',
        retentionMinimumUntil: '2031-08-31',
      });
      expect(closedVolume.status).toBe('CLOSED');
      await closeEdbDiary({
        db,
        empresaId: EMPRESA_ID,
        diaryId: diary.diaryId,
        updatedBy: operator.employeeId,
      });

      expect(() =>
        sqlite.exec(`UPDATE edb_registro_revisoes SET payload_json = '{}' WHERE id = '${REVISION_ID}'`),
      ).toThrow(/EDB_REVISION_IMMUTABLE/);
      expect(() =>
        sqlite.exec(`UPDATE edb_assinaturas SET signer_nome = 'tampered' WHERE revision_id = '${REVISION_ID}'`),
      ).toThrow(/EDB_SIGNATURE_IMMUTABLE/);
      expect(() =>
        sqlite.exec(`UPDATE edb_auditoria_eventos SET payload_json = '{}' WHERE empresa_id = ${EMPRESA_ID}`),
      ).toThrow(/EDB_AUDIT_IMMUTABLE/);
    } finally {
      sqlite.close();
    }
  });
});
