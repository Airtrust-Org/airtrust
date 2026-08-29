import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import {
  createEmptyEdbFlightRecord,
  type EdbPersonIdentity,
  type EdbTechnicalDiscrepancy,
} from '../services/edb/contracts';
import {
  loadCanonicalEdbFlightSource,
  parseEdbOperatorRegulation,
} from '../services/edb/server-flight-record-source';
import { loadLatestEdbPreflightEvidence } from '../repositories/edb/edb-technical-awareness-repository';
import { persistEdbDraftRevision } from '../repositories/edb/edb-persistence-repository';
import { loadVerifiedEdbRevisionView } from '../repositories/edb/edb-revision-view-repository';
import { finalizePostflightEdbRecord } from '../services/edb/postflight-finalization';
import { createCorrectionRevision } from '../services/edb/lifecycle';
import { validateForPicFlightSignature } from '../services/edb/regulatory-validation';

const router = new Hono<AppEnv>();
type EdbContext = Context<AppEnv>;
type JsonObject = Record<string, unknown>;

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

function timestampOrNow(value: unknown, code: string): string {
  if (value === null || value === undefined || value === '') return new Date().toISOString();
  const text = requiredText(value, code);
  if (!Number.isFinite(Date.parse(text))) throw new Error(code);
  return text;
}

function objectBody(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('EDB_INVALID_JSON_BODY');
  }
  return value as JsonObject;
}

async function actorIdentity(c: EdbContext): Promise<EdbPersonIdentity> {
  const empresaId = getEmpresaId(c);
  let funcionarioId = Number(c.get('funcionarioId') || 0);
  if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
    const row = await c.env.DB
      .prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
      .bind(Number(c.get('userId') || 0))
      .first<{ funcionario_id: number | null }>();
    funcionarioId = Number(row?.funcionario_id || 0);
  }
  if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
    throw new Error('EDB_ACTOR_EMPLOYEE_REQUIRED');
  }
  const employee = await c.env.DB
    .prepare(
      `SELECT id, nome, codigo_anac
         FROM funcionarios
        WHERE empresa_id = ? AND id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(empresaId, funcionarioId)
    .first<{ id: number; nome: string; codigo_anac: string | null }>();
  if (!employee?.nome?.trim()) throw new Error('EDB_ACTOR_EMPLOYEE_NOT_FOUND');
  return {
    employeeId: employee.id,
    fullName: employee.nome.trim(),
    anacCode: employee.codigo_anac?.trim() || null,
  };
}

async function parseDiscrepancies(
  c: EdbContext,
  value: unknown,
): Promise<EdbTechnicalDiscrepancy[]> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('EDB_TECHNICAL_DISCREPANCIES_INVALID');
  const actor = await actorIdentity(c);
  return value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('EDB_TECHNICAL_DISCREPANCY_INVALID');
    }
    const description = requiredText(
      (item as JsonObject).description,
      'EDB_TECHNICAL_DISCREPANCY_DESCRIPTION_REQUIRED',
    );
    return { description, detectedBy: { ...actor } };
  });
}

function mapError(c: EdbContext, error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const code = /EDB_[A-Z0-9_]+/.exec(message)?.[0] ?? 'EDB_SHADOW_REVISION_FAILED';
  const status = code.includes('NOT_FOUND') ? 404 : code.includes('CONFLICT') ? 409 : 400;
  return c.json({ success: false, error: 'Operação de revisão eDB rejeitada', code }, status as 400 | 404 | 409);
}

router.post('/voos/:vooId/etapas/:etapaId/revisions', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const vooId = positiveInt(c.req.param('vooId'), 'EDB_FLIGHT_ID_INVALID');
    const etapaId = positiveInt(c.req.param('etapaId'), 'EDB_STAGE_ID_INVALID');
    const body = objectBody(await c.req.json<unknown>().catch(() => null));
    const diaryId = positiveInt(body.diaryId, 'EDB_DIARY_ID_REQUIRED');
    const volumeId = requiredText(body.volumeId, 'EDB_VOLUME_ID_REQUIRED');
    const nature = requiredText(body.nature, 'EDB_NATURE_REQUIRED');
    const preflight = await loadLatestEdbPreflightEvidence({ db: c.env.DB, empresaId, vooId });
    if (!preflight.technicalSituation || !preflight.technicalAcknowledgement) {
      throw new Error('EDB_PREFLIGHT_EVIDENCE_REQUIRED');
    }

    const source = await loadCanonicalEdbFlightSource({
      db: c.env.DB,
      empresaId,
      vooId,
      etapaId,
      nature,
      technicalDiscrepancies: await parseDiscrepancies(c, body.technicalDiscrepancies),
    });
    const record = createEmptyEdbFlightRecord({
      operatorCompanyId: empresaId,
      operatorRegulation: parseEdbOperatorRegulation(body.operatorRegulation),
      sourceFlightId: vooId,
      sourceRdvId: source.rdvId,
      sourceRdvVersion: source.rdvVersion,
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
    record.flight = source.flight;

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
      createdBy: Number(c.get('userId') || 0),
    });
    return c.json({ success: true, data: persisted }, 201);
  } catch (error) {
    return mapError(c, error);
  }
});

router.post('/revisions/:revisionId/corrections', async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const revisionId = requiredText(c.req.param('revisionId'), 'EDB_REVISION_ID_REQUIRED');
    const original = await loadVerifiedEdbRevisionView({ db: c.env.DB, empresaId, revisionId });
    if (!original) throw new Error('EDB_REVISION_NOT_FOUND');
    const body = objectBody(await c.req.json<unknown>().catch(() => null));
    const nature = optionalText(body.nature, 'EDB_NATURE_INVALID') ?? original.record.flight.nature;
    if (!nature?.trim()) throw new Error('EDB_NATURE_REQUIRED');

    const source = await loadCanonicalEdbFlightSource({
      db: c.env.DB,
      empresaId,
      vooId: original.sourceFlightId,
      etapaId: original.sourceStageId,
      nature,
      technicalDiscrepancies: original.record.flight.technicalDiscrepancies ?? [],
    });
    const correction = createCorrectionRevision({
      original: original.record,
      newRevisionId:
        optionalText(body.newRevisionId, 'EDB_CORRECTION_REVISION_ID_INVALID') ??
        `edbrev_${crypto.randomUUID()}`,
      correctionReason: requiredText(body.correctionReason, 'EDB_CORRECTION_REASON_REQUIRED'),
      capturedAt: timestampOrNow(body.capturedAt, 'EDB_CORRECTION_CAPTURED_AT_INVALID'),
    });
    correction.source.sourceRdvId = source.rdvId;
    correction.source.sourceRdvVersion = source.rdvVersion;
    correction.flight = source.flight;

    const validation = validateForPicFlightSignature(correction);
    const blocking = validation.issues.filter((issue) => issue.severity === 'BLOCKING');
    if (blocking.length > 0) {
      throw new Error(`EDB_CORRECTION_REGULATORY_VALIDATION_FAILED:${blocking.map((item) => item.code).join(',')}`);
    }
    const ack = correction.signatures.picTechnicalAcknowledgement;
    if (!ack) throw new Error('EDB_TECHNICAL_ACK_REQUIRED');
    const persisted = await persistEdbDraftRevision(c.env.DB, {
      empresaId,
      diarioId: original.diaryId,
      volumeId: original.volumeId,
      technicalAcknowledgementSignatureId: ack.signatureId,
      record: correction,
      createdBy: Number(c.get('userId') || 0),
    });
    return c.json({ success: true, data: persisted }, 201);
  } catch (error) {
    return mapError(c, error);
  }
});

export default router;
