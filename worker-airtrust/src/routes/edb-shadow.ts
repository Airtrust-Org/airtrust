import { Hono } from 'hono';
import type { Context } from 'hono';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import type { AppEnv } from '../types';
import { isEdbShadowEnabledForTenant } from '../lib/edb/edb-shadow-flag';
import {
  createControleVoosRegulatoryStage,
  replaceControleVoosRegulatoryStage,
  type RegulatoryStageWriteInput,
} from '../repositories/edb/edb-regulatory-input-repository';
import { setControleVoosRegulatoryCrewFunction } from '../repositories/edb/edb-regulatory-crew-repository';
import {
  getControleVoosRegulatoryStage,
  listControleVoosRegulatoryCrew,
  listControleVoosRegulatoryStages,
} from '../repositories/edb/edb-source-repository';
import {
  appendEdbPicTechnicalAcknowledgement,
  loadLatestEdbPreflightEvidence,
  persistEdbTechnicalSituation,
} from '../repositories/edb/edb-technical-awareness-repository';
import {
  appendEdbSignature,
  getEdbRevisionState,
  markEdbRevisionReadyForPicSignature,
  persistEdbDraftRevision,
  transitionEdbRevisionState,
} from '../repositories/edb/edb-persistence-repository';
import {
  listVerifiedEdbRevisionViewsForFlight,
  loadVerifiedEdbRevisionView,
} from '../repositories/edb/edb-revision-view-repository';
import {
  appendEdbCorrectiveAction,
  appendEdbDeferredActionAuthorization,
  appendEdbReturnToServiceApproval,
  createEdbTechnicalDiscrepancy,
  loadEdbTechnicalDiscrepancyCase,
} from '../repositories/edb/edb-technical-discrepancy-repository';
import {
  closeEdbDiary,
  closePersistedEdbDiaryVolume,
  createEdbDiary,
  createEdbDiaryVolume,
  createEdbIntegrityIncident,
  getActiveEdbDiaryForAircraft,
  loadEdbDiaryVolume,
  loadEdbIntegrityIncident,
  recordEdbAnacInformationLossNotification,
  recordEdbImpossibleReconstitution,
  recordEdbPoliceOccurrence,
  recordEdbSuccessfulReconstitution,
} from '../repositories/edb/edb-diary-repository';
import { loadAndVerifyEdbAuditChain } from '../repositories/edb/edb-audit-repository';
import { getActiveRdvByFlight, getFlightOrThrow } from '../repositories/controle-voos/rdv-repository';
import { listEtapas } from '../services/controle-voos/rdv-etapas';
import {
  createEmptyEdbFlightRecord,
  type EdbAircraftIdentity,
  type EdbCrewMember,
  type EdbFlightData,
  type EdbMaintenanceSnapshot,
  type EdbPersonIdentity,
  type EdbSignatureProof,
  type EdbTechnicalDiscrepancy,
} from '../services/edb/contracts';
import {
  buildExplicitRegulatoryStageData,
  parseExplicitOccurrencesJson,
} from '../services/edb/operational-regulatory-source';
import { createTechnicalSituationSnapshot, bindPicTechnicalAcknowledgement } from '../services/edb/technical-awareness';
import { finalizePostflightEdbRecord } from '../services/edb/postflight-finalization';
import { assessEdbRegulatoryReadiness } from '../services/edb/regulatory-readiness';
import { hashSignableEdbPayload } from '../services/edb/canonicalization';
import { createCorrectionRevision } from '../services/edb/lifecycle';

const router = new Hono<AppEnv>();
router.use('*', auth());
router.use('*', async (c, next) => {
  const empresaId = getEmpresaId(c);
  if (!isEdbShadowEnabledForTenant(c.env, empresaId)) {
    return c.json({ success: false, error: 'Not found', code: 'EDB_SHADOW_DISABLED' }, 404);
  }
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('X-AirTrust-eDB-Mode', 'staging-shadow-not-regulatory');
});

type EdbContext = Context<AppEnv>;
type JsonObject = Record<string, unknown>;

type CrewSourceRow = {
  id: number;
  etapa_id: number | null;
  funcionario_id: number;
  funcao: string;
  funcionario_nome: string | null;
  funcionario_codigo_anac: string | null;
  codigo_funcao_anac: string | null;
};

function actorUserId(c: EdbContext): number {
  const value = Number(c.get('userId') || 0);
  if (!Number.isInteger(value) || value <= 0) throw new Error('EDB_ACTOR_USER_ID_REQUIRED');
  return value;
}

function positiveInt(value: unknown, code: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(code);
  return parsed;
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function optionalText(value: unknown, code: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error(code);
  return value.trim() || null;
}

function optionalNumber(value: unknown, code: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function optionalInteger(value: unknown, code: string): number | null {
  const parsed = optionalNumber(value, code);
  if (parsed !== null && !Number.isInteger(parsed)) throw new Error(code);
  return parsed;
}

function timestampOrNow(value: unknown, code: string): string {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  const text = requiredText(value, code);
  if (!Number.isFinite(Date.parse(text))) throw new Error(code);
  return text;
}

function objectValue(value: unknown, code: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as JsonObject;
}

async function bodyObject(c: EdbContext): Promise<JsonObject> {
  const body = await c.req.json<unknown>().catch(() => null);
  return objectValue(body, 'EDB_INVALID_JSON_BODY');
}

function safeCode(error: unknown): { code: string; status: 400 | 404 | 409 | 500 } {
  const message = error instanceof Error ? error.message : '';
  const match = /EDB_[A-Z0-9_]+/.exec(message);
  if (!match) return { code: 'EDB_SHADOW_INTERNAL_ERROR', status: 500 };
  const code = match[0];
  if (code.includes('NOT_FOUND') || code.includes('DISAPPEARED')) return { code, status: 404 };
  if (
    code.includes('CONFLICT') ||
    code.includes('ALREADY') ||
    code.includes('STATE_') ||
    code.includes('_REQUIRES_') ||
    code.includes('_REQUIRED_FOR_STATE')
  ) {
    return { code, status: 409 };
  }
  return { code, status: 400 };
}

function failure(c: EdbContext, error: unknown) {
  const { code, status } = safeCode(error);
  return c.json({ success: false, error: 'Operação eDB shadow rejeitada', code }, status);
}

async function requireActorIdentity(c: EdbContext): Promise<EdbPersonIdentity> {
  const empresaId = getEmpresaId(c);
  let funcionarioId = Number(c.get('funcionarioId') || 0);
  if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
    const user = await c.env.DB
      .prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(actorUserId(c))
      .first<{ funcionario_id: number | null }>();
    funcionarioId = Number(user?.funcionario_id || 0);
  }
  if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
    throw new Error('EDB_ACTOR_EMPLOYEE_REQUIRED');
  }
  const employee = await c.env.DB
    .prepare(
      `SELECT id, nome, codigo_anac
         FROM funcionarios
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ id: number; nome: string; codigo_anac: string | null }>();
  if (!employee || !employee.nome?.trim()) throw new Error('EDB_ACTOR_EMPLOYEE_NOT_FOUND');
  return {
    employeeId: employee.id,
    fullName: employee.nome.trim(),
    anacCode: employee.codigo_anac?.trim() || null,
  };
}

function parseAircraft(value: unknown): EdbAircraftIdentity {
  const source = objectValue(value, 'EDB_AIRCRAFT_INVALID');
  const aircraftId = source.aircraftId === null ? null : positiveInt(source.aircraftId, 'EDB_AIRCRAFT_ID_INVALID');
  const parseStringArray = (candidate: unknown, code: string): string[] | null => {
    if (candidate === null) return null;
    if (!Array.isArray(candidate) || candidate.some((item) => typeof item !== 'string')) throw new Error(code);
    return candidate.map((item) => item.trim()).filter(Boolean);
  };
  return {
    aircraftId,
    manufacturer: optionalText(source.manufacturer, 'EDB_AIRCRAFT_MANUFACTURER_INVALID'),
    model: optionalText(source.model, 'EDB_AIRCRAFT_MODEL_INVALID'),
    serialNumber: optionalText(source.serialNumber, 'EDB_AIRCRAFT_SERIAL_INVALID'),
    registrationMarks: optionalText(source.registrationMarks, 'EDB_AIRCRAFT_MARKS_INVALID'),
    owners: parseStringArray(source.owners, 'EDB_AIRCRAFT_OWNERS_INVALID'),
    operators: parseStringArray(source.operators, 'EDB_AIRCRAFT_OPERATORS_INVALID'),
  };
}

function parseMaintenance(value: unknown): EdbMaintenanceSnapshot {
  const source = objectValue(value, 'EDB_MAINTENANCE_INVALID');
  const last = objectValue(source.lastIntervention, 'EDB_LAST_MAINTENANCE_INVALID');
  const next = objectValue(source.nextIntervention, 'EDB_NEXT_MAINTENANCE_INVALID');
  return {
    lastIntervention: {
      type: optionalText(last.type, 'EDB_LAST_MAINTENANCE_TYPE_INVALID'),
      date: optionalText(last.date, 'EDB_LAST_MAINTENANCE_DATE_INVALID'),
      returnToServiceApprovedBy: optionalText(
        last.returnToServiceApprovedBy,
        'EDB_LAST_MAINTENANCE_RTS_INVALID',
      ),
    },
    nextIntervention: {
      type: optionalText(next.type, 'EDB_NEXT_MAINTENANCE_TYPE_INVALID'),
      dueAtAirframeHours: optionalNumber(next.dueAtAirframeHours, 'EDB_NEXT_MAINTENANCE_HOURS_INVALID'),
    },
  };
}

function parseRegulatoryStageInput(body: JsonObject): RegulatoryStageWriteInput {
  const occurrences = body.occurrences;
  if (
    occurrences !== null &&
    (!Array.isArray(occurrences) || occurrences.some((item) => typeof item !== 'string'))
  ) {
    throw new Error('EDB_OCCURRENCES_INVALID');
  }
  const occurrenceList = occurrences === null
    ? null
    : (occurrences as string[]).map((item) => item.trim()).filter(Boolean);
  return {
    tempo_voo_diurno_minutos: optionalNumber(body.dayMinutes, 'EDB_DAY_TIME_INVALID'),
    tempo_voo_noturno_minutos: optionalNumber(body.nightMinutes, 'EDB_NIGHT_TIME_INVALID'),
    tempo_voo_total_minutos: optionalNumber(body.totalMinutes, 'EDB_TOTAL_TIME_INVALID'),
    tempo_ifr_real_minutos: optionalNumber(body.ifrActualMinutes, 'EDB_IFR_ACTUAL_INVALID'),
    tempo_ifr_simulado_minutos: optionalNumber(body.ifrSimulatedMinutes, 'EDB_IFR_SIMULATED_INVALID'),
    tempo_ifr_nao_classificado_minutos: optionalNumber(
      body.ifrUnclassifiedMinutes,
      'EDB_IFR_UNCLASSIFIED_INVALID',
    ),
    pousos_total: optionalInteger(body.landingsTotal, 'EDB_LANDINGS_INVALID'),
    ciclos: optionalInteger(body.cycles, 'EDB_CYCLES_INVALID'),
    combustivel_antes_partida_motor: optionalNumber(
      body.fuelBeforeEngineStart,
      'EDB_FUEL_PRESTART_INVALID',
    ),
    pessoas_a_bordo_total: optionalInteger(body.personsOnBoard, 'EDB_POB_INVALID'),
    carga_regulatoria_kg: optionalNumber(body.cargoKg, 'EDB_CARGO_INVALID'),
    ocorrencias_json: occurrenceList === null ? null : JSON.stringify(occurrenceList),
    origem_dados: 'MANUAL',
  };
}

function parseSignature(value: unknown): EdbSignatureProof {
  const source = objectValue(value, 'EDB_SIGNATURE_INVALID');
  const signer = objectValue(source.signer, 'EDB_SIGNATURE_SIGNER_INVALID');
  const employeeId = signer.employeeId === null ? null : positiveInt(signer.employeeId, 'EDB_SIGNATURE_SIGNER_ID_INVALID');
  return {
    signatureId: requiredText(source.signatureId, 'EDB_SIGNATURE_ID_REQUIRED'),
    type: requiredText(source.type, 'EDB_SIGNATURE_TYPE_REQUIRED') as EdbSignatureProof['type'],
    targetType: optionalText(source.targetType, 'EDB_SIGNATURE_TARGET_TYPE_INVALID') as EdbSignatureProof['targetType'],
    targetId: optionalText(source.targetId, 'EDB_SIGNATURE_TARGET_ID_INVALID') ?? undefined,
    signer: {
      employeeId,
      fullName: requiredText(signer.fullName, 'EDB_SIGNATURE_SIGNER_NAME_REQUIRED'),
      anacCode: optionalText(signer.anacCode, 'EDB_SIGNATURE_SIGNER_ANAC_INVALID'),
    },
    signedAt: timestampOrNow(source.signedAt, 'EDB_SIGNATURE_TIMESTAMP_INVALID'),
    canonicalPayloadHashSha256: requiredText(source.canonicalPayloadHashSha256, 'EDB_SIGNATURE_HASH_REQUIRED'),
    method: requiredText(source.method, 'EDB_SIGNATURE_METHOD_REQUIRED') as EdbSignatureProof['method'],
    proofReference: requiredText(source.proofReference, 'EDB_SIGNATURE_PROOF_REFERENCE_REQUIRED'),
  };
}

function canonicalSignerProof(signature: EdbSignatureProof, actor: EdbPersonIdentity): EdbSignatureProof {
  if (signature.signer.employeeId !== actor.employeeId) throw new Error('EDB_SIGNATURE_SIGNER_MISMATCH');
  return { ...signature, signer: { ...actor } };
}

function mapRole(value: string): EdbCrewMember['operationalRole'] {
  const role = value.trim().toUpperCase();
  if (role === 'PIC') return 'PIC';
  if (role === 'SIC') return 'SIC';
  if (role === 'COM') return 'COM';
  if (role === 'MEC') return 'MEC';
  return 'OTHER';
}

async function loadCrewSource(db: D1Database, empresaId: number, vooId: number): Promise<CrewSourceRow[]> {
  const result = await db
    .prepare(
      `
      SELECT t.id, t.etapa_id, t.funcionario_id, t.funcao,
             f.nome AS funcionario_nome, f.codigo_anac AS funcionario_codigo_anac,
             t.codigo_funcao_anac
      FROM cv_voo_tripulantes t
      LEFT JOIN funcionarios f
        ON f.id = t.funcionario_id AND f.empresa_id = t.empresa_id AND f.deleted_at IS NULL
      WHERE t.empresa_id = ? AND t.voo_id = ? AND t.deleted_at IS NULL
      ORDER BY t.etapa_id ASC, t.id ASC
    `,
    )
    .bind(empresaId, vooId)
    .all<CrewSourceRow>();
  return result.results ?? [];
}

const REQUIRED_STAGE_FIELDS = [
  'tempo_voo_diurno_minutos',
  'tempo_voo_noturno_minutos',
  'tempo_voo_total_minutos',
  'tempo_ifr_real_minutos',
  'tempo_ifr_simulado_minutos',
  'pousos_total',
  'ciclos',
  'combustivel_antes_partida_motor',
  'pessoas_a_bordo_total',
  'carga_regulatoria_kg',
  'ocorrencias_json',
] as const;

async function readinessForFlight(c: EdbContext, vooId: number) {
  const empresaId = getEmpresaId(c);
  const flight = await getFlightOrThrow(c.env.DB, String(vooId), empresaId);
  const stages = await listEtapas(c.env.DB, empresaId, vooId);
  const regulatoryStages = await listControleVoosRegulatoryStages(c.env.DB, empresaId, vooId);
  const regulatoryCrew = await listControleVoosRegulatoryCrew(c.env.DB, empresaId, vooId);
  const preflight = await loadLatestEdbPreflightEvidence({ db: c.env.DB, empresaId, vooId });
  const revisions = await listVerifiedEdbRevisionViewsForFlight({ db: c.env.DB, empresaId, vooId });
  const stageById = new Map(regulatoryStages.map((item) => [item.etapa_id, item]));
  const stageReadiness = stages.map((stage) => {
    const regulatory = stageById.get(stage.id) ?? null;
    const missingFields = regulatory
      ? REQUIRED_STAGE_FIELDS.filter((field) => regulatory[field] === null)
      : [...REQUIRED_STAGE_FIELDS];
    const crewMissingFunction = regulatoryCrew
      .filter((member) => member.etapa_id === null || member.etapa_id === stage.id)
      .filter((member) => !member.codigo_funcao_anac?.trim())
      .map((member) => member.tripulante_voo_id);
    return {
      stageId: stage.id,
      stageNumber: stage.numero_etapa,
      origin: stage.origem_icao,
      destination: stage.destino_icao,
      regulatory,
      missingFields,
      crewMissingFunction,
      complete: missingFields.length === 0 && crewMissingFunction.length === 0,
    };
  });

  const revisionReadiness = [];
  for (const view of revisions) {
    const evidence = view.record.source.sourceFlightId === vooId ? preflight : undefined;
    const readiness = await assessEdbRegulatoryReadiness(view.record, new Date(), evidence);
    revisionReadiness.push({
      revisionId: view.record.revisionId,
      logicalRecordId: view.record.logicalRecordId,
      stageId: view.sourceStageId,
      revision: view.revision,
      stateVersion: view.stateVersion,
      readiness,
    });
  }

  let nextAction = 'FLIGHT_RECORD';
  if (stages.length === 0) nextAction = 'SOURCE_STAGE';
  else if (stageReadiness.some((item) => item.missingFields.length > 0)) nextAction = 'REGULATORY_STAGE';
  else if (stageReadiness.some((item) => item.crewMissingFunction.length > 0)) nextAction = 'CREW_FUNCTION';
  else if (!preflight.technicalSituation) nextAction = 'TECHNICAL_SNAPSHOT';
  else if (!preflight.technicalAcknowledgement) nextAction = 'PIC_TECHNICAL_ACK';
  else if (revisionReadiness.length > 0) {
    nextAction = revisionReadiness.at(-1)?.readiness.nextAction ?? 'COMPLETE';
  }

  return {
    mode: 'STAGING_SHADOW_NOT_REGULATORY',
    flight: {
      id: flight.id,
      aircraftId: flight.aeronave_id,
      prefix: flight.prefixo,
      date: flight.data_programacao,
      status: flight.status,
    },
    stages: stageReadiness,
    crew: regulatoryCrew,
    preflight: {
      technicalSituationId: preflight.technicalSituation?.snapshotId ?? null,
      technicalSnapshotPresent: Boolean(preflight.technicalSituation),
      technicalAcknowledgementPresent: Boolean(preflight.technicalAcknowledgement),
      technicalAcknowledgementSignatureId:
        preflight.technicalAcknowledgement?.signature.signatureId ?? null,
    },
    revisions: revisionReadiness,
    nextAction,
  };
}

router.get('/capability', (c) =>
  c.json({
    success: true,
    data: {
      enabled: true,
      mode: 'STAGING_SHADOW_NOT_REGULATORY',
      externalAnacTransmissionEnabled: false,
      productionEnabled: false,
    },
  }),
);

router.get('/voos/:vooId/readiness', async (c) => {
  try {
    return c.json({ success: true, data: await readinessForFlight(c, positiveInt(c.req.param('vooId'), 'EDB_FLIGHT_ID_INVALID')) });
  } catch (error) {
    return failure(c, error);
  }
});

router.put('/voos/:vooId/etapas/:etapaId/regulatory', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const vooId = positiveInt(c.req.param('vooId'), 'EDB_FLIGHT_ID_INVALID');
    const etapaId = positiveInt(c.req.param('etapaId'), 'EDB_STAGE_ID_INVALID');
    await getFlightOrThrow(c.env.DB, String(vooId), empresaId);
    const current = await getControleVoosRegulatoryStage(c.env.DB, empresaId, etapaId);
    if (!current || current.voo_id !== vooId) throw new Error('EDB_REGULATORY_STAGE_NOT_FOUND_OR_SCOPE_MISMATCH');
    const body = await bodyObject(c);
    const input = parseRegulatoryStageInput(body);
    if (current.preenchido_em === null) {
      await createControleVoosRegulatoryStage({
        db: c.env.DB,
        empresaId,
        vooId,
        etapaId,
        input,
        actorId: actorUserId(c),
      });
    } else {
      const expectedVersion = positiveInt(body.expectedVersion, 'EDB_REGULATORY_STAGE_VERSION_REQUIRED');
      await replaceControleVoosRegulatoryStage({
        db: c.env.DB,
        empresaId,
        vooId,
        etapaId,
        expectedVersion,
        input,
        actorId: actorUserId(c),
      });
    }
    return c.json({ success: true, data: await readinessForFlight(c, vooId) });
  } catch (error) {
    return failure(c, error);
  }
});

router.put('/voos/:vooId/tripulantes/:tripulanteId/function', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const vooId = positiveInt(c.req.param('vooId'), 'EDB_FLIGHT_ID_INVALID');
    const tripulanteRecordId = positiveInt(c.req.param('tripulanteId'), 'EDB_CREW_RECORD_ID_INVALID');
    const body = await bodyObject(c);
    await setControleVoosRegulatoryCrewFunction({
      db: c.env.DB,
      empresaId,
      vooId,
      tripulanteRecordId,
      functionCode: requiredText(body.functionCode, 'EDB_CREW_FUNCTION_CODE_REQUIRED'),
      origin: 'MANUAL',
      actorId: actorUserId(c),
    });
    return c.json({ success: true, data: await readinessForFlight(c, vooId) });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/voos/:vooId/preflight/snapshot', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const vooId = positiveInt(c.req.param('vooId'), 'EDB_FLIGHT_ID_INVALID');
    const flight = await getFlightOrThrow(c.env.DB, String(vooId), empresaId);
    const body = await bodyObject(c);
    const aircraft = parseAircraft(body.aircraft);
    if (flight.aeronave_id !== null && aircraft.aircraftId !== flight.aeronave_id) {
      throw new Error('EDB_TECHNICAL_SNAPSHOT_AIRCRAFT_SCOPE_MISMATCH');
    }
    const snapshot = await createTechnicalSituationSnapshot({
      snapshotId:
        optionalText(body.snapshotId, 'EDB_TECHNICAL_SNAPSHOT_ID_INVALID') ??
        `edbtech_${crypto.randomUUID()}`,
      operatorCompanyId: empresaId,
      sourceFlightId: vooId,
      aircraft,
      maintenance: parseMaintenance(body.maintenance),
      capturedAt: timestampOrNow(body.capturedAt, 'EDB_TECHNICAL_SNAPSHOT_TIMESTAMP_INVALID'),
    });
    await persistEdbTechnicalSituation({ db: c.env.DB, snapshot, createdBy: actorUserId(c) });
    return c.json({ success: true, data: snapshot }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/voos/:vooId/preflight/signing-payload', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const vooId = positiveInt(c.req.param('vooId'), 'EDB_FLIGHT_ID_INVALID');
    const evidence = await loadLatestEdbPreflightEvidence({ db: c.env.DB, empresaId, vooId });
    if (!evidence.technicalSituation) throw new Error('EDB_TECHNICAL_SNAPSHOT_NOT_FOUND');
    return c.json({
      success: true,
      data: {
        signatureType: 'PIC_TECHNICAL_ACK',
        targetType: 'TECHNICAL_SITUATION',
        targetId: evidence.technicalSituation.snapshotId,
        payloadHashSha256: evidence.technicalSituation.canonicalSnapshotSha256,
      },
    });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/voos/:vooId/preflight/ack', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const vooId = positiveInt(c.req.param('vooId'), 'EDB_FLIGHT_ID_INVALID');
    const body = await bodyObject(c);
    const evidence = await loadLatestEdbPreflightEvidence({ db: c.env.DB, empresaId, vooId });
    if (!evidence.technicalSituation) throw new Error('EDB_TECHNICAL_SNAPSHOT_NOT_FOUND');
    const actor = await requireActorIdentity(c);
    const signature = canonicalSignerProof(parseSignature(body.signature), actor);
    const acknowledgement = bindPicTechnicalAcknowledgement({
      snapshot: evidence.technicalSituation,
      signature,
    });
    await appendEdbPicTechnicalAcknowledgement({
      db: c.env.DB,
      acknowledgement,
      signerUserId: actorUserId(c),
      authenticationEvidence: body.authenticationEvidence,
    });
    return c.json({ success: true, data: acknowledgement }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/voos/:vooId/etapas/:etapaId/revisions', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const vooId = positiveInt(c.req.param('vooId'), 'EDB_FLIGHT_ID_INVALID');
    const etapaId = positiveInt(c.req.param('etapaId'), 'EDB_STAGE_ID_INVALID');
    const body = await bodyObject(c);
    const diaryId = positiveInt(body.diaryId, 'EDB_DIARY_ID_REQUIRED');
    const volumeId = requiredText(body.volumeId, 'EDB_VOLUME_ID_REQUIRED');
    const nature = requiredText(body.nature, 'EDB_NATURE_REQUIRED');
    const flight = await getFlightOrThrow(c.env.DB, String(vooId), empresaId);
    const rdv = await getActiveRdvByFlight(c.env.DB, vooId, empresaId);
    if (!rdv) throw new Error('EDB_ACTIVE_RDV_NOT_FOUND');
    const stages = await listEtapas(c.env.DB, empresaId, vooId);
    const stage = stages.find((item) => item.id === etapaId);
    if (!stage) throw new Error('EDB_STAGE_NOT_FOUND_OR_SCOPE_MISMATCH');
    const regulatory = await getControleVoosRegulatoryStage(c.env.DB, empresaId, etapaId);
    if (!regulatory || regulatory.voo_id !== vooId) throw new Error('EDB_REGULATORY_STAGE_NOT_FOUND_OR_SCOPE_MISMATCH');
    const explicit = buildExplicitRegulatoryStageData({ row: regulatory, technicalDiscrepancies: [] });
    const preflight = await loadLatestEdbPreflightEvidence({ db: c.env.DB, empresaId, vooId });
    if (!preflight.technicalSituation || !preflight.technicalAcknowledgement) {
      throw new Error('EDB_PREFLIGHT_EVIDENCE_REQUIRED');
    }
    const crewSource = await loadCrewSource(c.env.DB, empresaId, vooId);
    const crew = crewSource
      .filter((member) => member.etapa_id === null || member.etapa_id === etapaId)
      .map<EdbCrewMember>((member) => ({
        employeeId: member.funcionario_id,
        fullName: member.funcionario_nome?.trim() || '',
        anacCode: member.funcionario_codigo_anac?.trim() || null,
        operationalRole: mapRole(member.funcao),
        regulatoryFunctionCode: member.codigo_funcao_anac?.trim() || null,
      }));

    const technicalDiscrepancies: EdbTechnicalDiscrepancy[] = [];
    const discrepancyInput = body.technicalDiscrepancies;
    if (discrepancyInput !== undefined && discrepancyInput !== null) {
      if (!Array.isArray(discrepancyInput)) throw new Error('EDB_TECHNICAL_DISCREPANCIES_INVALID');
      const actor = await requireActorIdentity(c);
      for (const item of discrepancyInput) {
        const parsed = objectValue(item, 'EDB_TECHNICAL_DISCREPANCY_INVALID');
        technicalDiscrepancies.push({
          description: requiredText(parsed.description, 'EDB_TECHNICAL_DISCREPANCY_DESCRIPTION_REQUIRED'),
          detectedBy: { ...actor },
        });
      }
    }

    const record = createEmptyEdbFlightRecord({
      operatorCompanyId: empresaId,
      operatorRegulation: requiredText(body.operatorRegulation, 'EDB_OPERATOR_REGULATION_REQUIRED') as 'RBAC121' | 'RBAC135' | 'OTHER',
      sourceFlightId: vooId,
      sourceRdvId: rdv.id,
      sourceRdvVersion: rdv.versao,
      sourceStageId: etapaId,
      capturedAt: timestampOrNow(body.capturedAt, 'EDB_REVISION_CAPTURED_AT_INVALID'),
      logicalRecordId:
        optionalText(body.logicalRecordId, 'EDB_LOGICAL_RECORD_ID_INVALID') ??
        `flight-${vooId}-stage-${etapaId}`,
      revisionId:
        optionalText(body.revisionId, 'EDB_REVISION_ID_INVALID') ?? `edbrev_${crypto.randomUUID()}`,
    });
    record.identity.aircraft = { ...preflight.technicalSituation.aircraft };
    record.maintenance = {
      lastIntervention: { ...preflight.technicalSituation.maintenance.lastIntervention },
      nextIntervention: { ...preflight.technicalSituation.maintenance.nextIntervention },
    };
    record.flight = {
      date: rdv.data_voo || flight.data_programacao,
      origin: stage.origem_icao,
      destination: stage.destino_icao,
      times: {
        engineStartAt: stage.horario_motor_ligado,
        takeoffAt: stage.horario_decolagem,
        landingAt: stage.horario_pouso,
        engineShutdownAt: stage.horario_motor_desligado,
      },
      landingsTotal: explicit.landingsTotal,
      cycles: explicit.cycles,
      duration: {
        dayMinutes: explicit.dayMinutes,
        nightMinutes: explicit.nightMinutes,
        totalMinutes: explicit.totalMinutes,
        ifrActualMinutes: explicit.ifrActualMinutes,
        ifrSimulatedMinutes: explicit.ifrSimulatedMinutes,
      },
      fuelBeforeEngineStart: explicit.fuelBeforeEngineStart,
      personsOnBoard: explicit.personsOnBoard,
      cargoKg: explicit.cargoKg,
      nature,
      occurrences: parseExplicitOccurrencesJson(regulatory.ocorrencias_json),
      technicalDiscrepancies,
      crew,
    } satisfies EdbFlightData;

    const finalized = await finalizePostflightEdbRecord({
      draftRecord: record,
      technicalSituation: preflight.technicalSituation,
      technicalAcknowledgement: preflight.technicalAcknowledgement,
    });
    const persisted = await persistEdbDraftRevision(c.env.DB, {
      empresaId,
      diarioId: diaryId,
      volumeId,
      technicalAcknowledgementSignatureId:
        preflight.technicalAcknowledgement.signature.signatureId,
      record: finalized.record,
      createdBy: actorUserId(c),
    });
    return c.json({ success: true, data: persisted }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/revisions/:revisionId', async (c) => {
  try {
    const view = await loadVerifiedEdbRevisionView({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      revisionId: requiredText(c.req.param('revisionId'), 'EDB_REVISION_ID_REQUIRED'),
    });
    if (!view) throw new Error('EDB_REVISION_NOT_FOUND');
    const preflight = await loadLatestEdbPreflightEvidence({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      vooId: view.sourceFlightId,
    });
    return c.json({
      success: true,
      data: {
        ...view,
        readiness: await assessEdbRegulatoryReadiness(view.record, new Date(), preflight),
      },
    });
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/revisions/:revisionId/signing-payload/:type', async (c) => {
  try {
    const type = c.req.param('type');
    if (type !== 'PIC_FLIGHT_RECORD' && type !== 'OPERATOR_RECORD') {
      throw new Error('EDB_SIGNATURE_TYPE_INVALID');
    }
    const view = await loadVerifiedEdbRevisionView({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      revisionId: requiredText(c.req.param('revisionId'), 'EDB_REVISION_ID_REQUIRED'),
    });
    if (!view) throw new Error('EDB_REVISION_NOT_FOUND');
    return c.json({
      success: true,
      data: {
        signatureType: type,
        targetType: 'FINAL_RECORD_REVISION',
        targetId: view.record.revisionId,
        payloadHashSha256: await hashSignableEdbPayload(view.record, type),
        lifecycleStatus: view.record.status,
      },
    });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/revisions/:revisionId/ready', async (c) => {
  try {
    await markEdbRevisionReadyForPicSignature({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      revisionId: requiredText(c.req.param('revisionId'), 'EDB_REVISION_ID_REQUIRED'),
      updatedBy: actorUserId(c),
    });
    return c.json({ success: true });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/revisions/:revisionId/signatures', async (c) => {
  try {
    const revisionId = requiredText(c.req.param('revisionId'), 'EDB_REVISION_ID_REQUIRED');
    const body = await bodyObject(c);
    const actor = await requireActorIdentity(c);
    const signature = canonicalSignerProof(parseSignature(body.signature), actor);
    if (signature.type === 'PIC_TECHNICAL_ACK') throw new Error('EDB_FINAL_SIGNATURE_TYPE_INVALID');
    await appendEdbSignature({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      revisionId,
      signature,
      signerUserId: actorUserId(c),
      authenticationEvidence: body.authenticationEvidence,
      updatedBy: actorUserId(c),
    });
    return c.json({ success: true });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/revisions/:revisionId/cancel', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const revisionId = requiredText(c.req.param('revisionId'), 'EDB_REVISION_ID_REQUIRED');
    const state = await getEdbRevisionState(c.env.DB, empresaId, revisionId);
    if (!state) throw new Error('EDB_REVISION_NOT_FOUND');
    await transitionEdbRevisionState({
      db: c.env.DB,
      empresaId,
      revisionId,
      expectedStatus: state.status,
      nextStatus: 'CANCELLED',
      expectedVersion: state.versao,
      updatedBy: actorUserId(c),
    });
    return c.json({ success: true });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/revisions/:revisionId/corrections', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const revisionId = requiredText(c.req.param('revisionId'), 'EDB_REVISION_ID_REQUIRED');
    const original = await loadVerifiedEdbRevisionView({ db: c.env.DB, empresaId, revisionId });
    if (!original) throw new Error('EDB_REVISION_NOT_FOUND');
    const body = await bodyObject(c);
    const correction = createCorrectionRevision({
      original: original.record,
      newRevisionId:
        optionalText(body.newRevisionId, 'EDB_CORRECTION_REVISION_ID_INVALID') ??
        `edbrev_${crypto.randomUUID()}`,
      correctionReason: requiredText(body.correctionReason, 'EDB_CORRECTION_REASON_REQUIRED'),
      capturedAt: timestampOrNow(body.capturedAt, 'EDB_CORRECTION_CAPTURED_AT_INVALID'),
    });
    if (body.flight !== undefined) {
      const flight = objectValue(body.flight, 'EDB_CORRECTION_FLIGHT_INVALID');
      correction.flight = { ...correction.flight, ...flight } as EdbFlightData;
    }
    const ack = correction.signatures.picTechnicalAcknowledgement;
    if (!ack) throw new Error('EDB_TECHNICAL_ACK_REQUIRED');
    const persisted = await persistEdbDraftRevision(c.env.DB, {
      empresaId,
      diarioId: original.diaryId,
      volumeId: original.volumeId,
      technicalAcknowledgementSignatureId: ack.signatureId,
      record: correction,
      createdBy: actorUserId(c),
    });
    return c.json({ success: true, data: persisted }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/revisions/:revisionId/discrepancies', async (c) => {
  try {
    const actor = await requireActorIdentity(c);
    const body = await bodyObject(c);
    const data = await createEdbTechnicalDiscrepancy({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      discrepancyId:
        optionalText(body.discrepancyId, 'EDB_DISCREPANCY_ID_INVALID') ??
        `edbdisc_${crypto.randomUUID()}`,
      revisionId: requiredText(c.req.param('revisionId'), 'EDB_REVISION_ID_REQUIRED'),
      description: requiredText(body.description, 'EDB_DISCREPANCY_DESCRIPTION_REQUIRED'),
      detectedBy: actor,
      detectedAt: timestampOrNow(body.detectedAt, 'EDB_DISCREPANCY_TIMESTAMP_INVALID'),
      createdAt: new Date().toISOString(),
    });
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/discrepancies/:id', async (c) => {
  try {
    const data = await loadEdbTechnicalDiscrepancyCase({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      discrepancyId: requiredText(c.req.param('id'), 'EDB_DISCREPANCY_ID_REQUIRED'),
    });
    if (!data) throw new Error('EDB_DISCREPANCY_NOT_FOUND');
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/discrepancies/:id/deferred-actions', async (c) => {
  try {
    const body = await bodyObject(c);
    const actor = await requireActorIdentity(c);
    const data = await appendEdbDeferredActionAuthorization({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      discrepancyId: requiredText(c.req.param('id'), 'EDB_DISCREPANCY_ID_REQUIRED'),
      action: {
        actionId: optionalText(body.actionId, 'EDB_MAINTENANCE_ACTION_ID_INVALID') ?? `edbmaint_${crypto.randomUUID()}`,
        reason: requiredText(body.reason, 'EDB_DEFERRED_ACTION_REASON_REQUIRED'),
        limitationOrControl: optionalText(body.limitationOrControl, 'EDB_DEFERRED_ACTION_LIMITATION_INVALID'),
        authorizedBy: actor,
        authorizedAt: timestampOrNow(body.authorizedAt, 'EDB_DEFERRED_ACTION_TIMESTAMP_INVALID'),
        reference: optionalText(body.reference, 'EDB_DEFERRED_ACTION_REFERENCE_INVALID'),
      },
    });
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/discrepancies/:id/corrective-actions', async (c) => {
  try {
    const body = await bodyObject(c);
    const actor = await requireActorIdentity(c);
    const data = await appendEdbCorrectiveAction({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      discrepancyId: requiredText(c.req.param('id'), 'EDB_DISCREPANCY_ID_REQUIRED'),
      action: {
        actionId: optionalText(body.actionId, 'EDB_MAINTENANCE_ACTION_ID_INVALID') ?? `edbmaint_${crypto.randomUUID()}`,
        description: requiredText(body.description, 'EDB_CORRECTIVE_ACTION_DESCRIPTION_REQUIRED'),
        performedBy: actor,
        performedAt: timestampOrNow(body.performedAt, 'EDB_CORRECTIVE_ACTION_TIMESTAMP_INVALID'),
        reference: optionalText(body.reference, 'EDB_CORRECTIVE_ACTION_REFERENCE_INVALID'),
      },
    });
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/discrepancies/:id/rts', async (c) => {
  try {
    const body = await bodyObject(c);
    const actor = await requireActorIdentity(c);
    const data = await appendEdbReturnToServiceApproval({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      discrepancyId: requiredText(c.req.param('id'), 'EDB_DISCREPANCY_ID_REQUIRED'),
      approval: {
        approvalId: optionalText(body.approvalId, 'EDB_RTS_APPROVAL_ID_INVALID') ?? `edbrts_${crypto.randomUUID()}`,
        correctiveActionId: requiredText(body.correctiveActionId, 'EDB_RTS_CORRECTIVE_ACTION_ID_REQUIRED'),
        description: requiredText(body.description, 'EDB_RTS_DESCRIPTION_REQUIRED'),
        approvedBy: actor,
        approvedAt: timestampOrNow(body.approvedAt, 'EDB_RTS_TIMESTAMP_INVALID'),
        reference: optionalText(body.reference, 'EDB_RTS_REFERENCE_INVALID'),
      },
    });
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/diaries', async (c) => {
  try {
    const body = await bodyObject(c);
    const data = await createEdbDiary({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      aircraftId: positiveInt(body.aircraftId, 'EDB_DIARY_AIRCRAFT_ID_REQUIRED'),
      operatorRegulation: requiredText(body.operatorRegulation, 'EDB_OPERATOR_REGULATION_REQUIRED') as 'RBAC121' | 'RBAC135' | 'OTHER',
      createdBy: actorUserId(c),
    });
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/aircraft/:aircraftId/active-diary', async (c) => {
  try {
    const data = await getActiveEdbDiaryForAircraft({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      aircraftId: positiveInt(c.req.param('aircraftId'), 'EDB_DIARY_AIRCRAFT_ID_INVALID'),
    });
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/diaries/:diaryId/volumes', async (c) => {
  try {
    const body = await bodyObject(c);
    const data = await createEdbDiaryVolume({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      diaryId: positiveInt(c.req.param('diaryId'), 'EDB_DIARY_ID_INVALID'),
      volumeId: optionalText(body.volumeId, 'EDB_VOLUME_ID_INVALID') ?? `edbvol_${crypto.randomUUID()}`,
      aircraftRegistrationMarks: requiredText(body.aircraftRegistrationMarks, 'EDB_VOLUME_AIRCRAFT_MARKS_REQUIRED'),
      sequence: positiveInt(body.sequence, 'EDB_VOLUME_SEQUENCE_REQUIRED'),
      openedAt: timestampOrNow(body.openedAt, 'EDB_VOLUME_OPENED_AT_INVALID'),
      openedBy: await requireActorIdentity(c),
      observations: optionalText(body.observations, 'EDB_VOLUME_OBSERVATIONS_INVALID'),
    });
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/volumes/:volumeId', async (c) => {
  try {
    const data = await loadEdbDiaryVolume({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      volumeId: requiredText(c.req.param('volumeId'), 'EDB_VOLUME_ID_REQUIRED'),
    });
    if (!data) throw new Error('EDB_VOLUME_NOT_FOUND');
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/volumes/:volumeId/close', async (c) => {
  try {
    const body = await bodyObject(c);
    const data = await closePersistedEdbDiaryVolume({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      volumeId: requiredText(c.req.param('volumeId'), 'EDB_VOLUME_ID_REQUIRED'),
      closedAt: timestampOrNow(body.closedAt, 'EDB_VOLUME_CLOSED_AT_INVALID'),
      closedBy: await requireActorIdentity(c),
      observations: optionalText(body.observations, 'EDB_VOLUME_OBSERVATIONS_INVALID'),
      retentionMinimumUntil: optionalText(body.retentionMinimumUntil, 'EDB_VOLUME_RETENTION_INVALID'),
    });
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/diaries/:diaryId/close', async (c) => {
  try {
    await closeEdbDiary({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      diaryId: positiveInt(c.req.param('diaryId'), 'EDB_DIARY_ID_INVALID'),
      updatedBy: actorUserId(c),
    });
    return c.json({ success: true });
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/diaries/:diaryId/audit', async (c) => {
  try {
    const data = await loadAndVerifyEdbAuditChain({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      diaryId: positiveInt(c.req.param('diaryId'), 'EDB_DIARY_ID_INVALID'),
    });
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/diaries/:diaryId/incidents', async (c) => {
  try {
    const body = await bodyObject(c);
    const kind = requiredText(body.kind, 'EDB_INTEGRITY_INCIDENT_KIND_REQUIRED');
    if (!['LOSS', 'MISPLACEMENT', 'CORRUPTION'].includes(kind)) {
      throw new Error('EDB_INTEGRITY_INCIDENT_KIND_INVALID');
    }
    const data = await createEdbIntegrityIncident({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      incidentId: optionalText(body.incidentId, 'EDB_INTEGRITY_INCIDENT_ID_INVALID') ?? `edbinc_${crypto.randomUUID()}`,
      diaryId: positiveInt(c.req.param('diaryId'), 'EDB_DIARY_ID_INVALID'),
      volumeId: optionalText(body.volumeId, 'EDB_VOLUME_ID_INVALID'),
      kind: kind as 'LOSS' | 'MISPLACEMENT' | 'CORRUPTION',
      detectedAt: timestampOrNow(body.detectedAt, 'EDB_INTEGRITY_INCIDENT_TIMESTAMP_INVALID'),
      description: requiredText(body.description, 'EDB_INTEGRITY_INCIDENT_DESCRIPTION_REQUIRED'),
      createdBy: actorUserId(c),
    });
    return c.json({ success: true, data }, 201);
  } catch (error) {
    return failure(c, error);
  }
});

router.get('/incidents/:id', async (c) => {
  try {
    const data = await loadEdbIntegrityIncident({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      incidentId: requiredText(c.req.param('id'), 'EDB_INTEGRITY_INCIDENT_ID_REQUIRED'),
    });
    if (!data) throw new Error('EDB_INTEGRITY_INCIDENT_NOT_FOUND');
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/incidents/:id/police', async (c) => {
  try {
    const body = await bodyObject(c);
    const data = await recordEdbPoliceOccurrence({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      incidentId: requiredText(c.req.param('id'), 'EDB_INTEGRITY_INCIDENT_ID_REQUIRED'),
      reference: requiredText(body.reference, 'EDB_POLICE_OCCURRENCE_REFERENCE_REQUIRED'),
      reportedAt: timestampOrNow(body.reportedAt, 'EDB_POLICE_OCCURRENCE_TIMESTAMP_INVALID'),
      updatedBy: actorUserId(c),
    });
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/incidents/:id/regulator-notification-evidence', async (c) => {
  try {
    const body = await bodyObject(c);
    const data = await recordEdbAnacInformationLossNotification({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      incidentId: requiredText(c.req.param('id'), 'EDB_INTEGRITY_INCIDENT_ID_REQUIRED'),
      reference: requiredText(body.reference, 'EDB_ANAC_NOTIFICATION_REFERENCE_REQUIRED'),
      notifiedAt: timestampOrNow(body.notifiedAt, 'EDB_ANAC_NOTIFICATION_TIMESTAMP_INVALID'),
      updatedBy: actorUserId(c),
    });
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/incidents/:id/reconstituted', async (c) => {
  try {
    const body = await bodyObject(c);
    const data = await recordEdbSuccessfulReconstitution({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      incidentId: requiredText(c.req.param('id'), 'EDB_INTEGRITY_INCIDENT_ID_REQUIRED'),
      completedAt: timestampOrNow(body.completedAt, 'EDB_RECONSTITUTION_TIMESTAMP_INVALID'),
      updatedBy: actorUserId(c),
    });
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

router.post('/incidents/:id/impossible', async (c) => {
  try {
    const body = await bodyObject(c);
    const data = await recordEdbImpossibleReconstitution({
      db: c.env.DB,
      empresaId: getEmpresaId(c),
      incidentId: requiredText(c.req.param('id'), 'EDB_INTEGRITY_INCIDENT_ID_REQUIRED'),
      completedAt: timestampOrNow(body.completedAt, 'EDB_RECONSTITUTION_TIMESTAMP_INVALID'),
      newDiaryOpeningObservation: requiredText(
        body.newDiaryOpeningObservation,
        'EDB_RECONSTITUTION_OPENING_OBSERVATION_REQUIRED',
      ),
      updatedBy: actorUserId(c),
    });
    return c.json({ success: true, data });
  } catch (error) {
    return failure(c, error);
  }
});

export default router;
