/** BOA-specific, append-only operational check-in and case stream.
 * Uses AirTrust's canonical frms_fadiga_evento + funcionarios without forcing
 * offshore-specific columns or incompatible frms_alerta CHECK constraints.
 * Every read/write must be scoped to the authenticated Bombeiros tenant.
 */
import { z } from 'zod';
import { buildFuncionarioScopeWhere, type EmployeeSectorAccess } from '../../services/employee-sector-access';
import { resolveFrmsWorkforceProfile } from './workforce-profile';
import { FRMS_FIREFIGHTER_AVIATION_PROFILE } from './parameter-governance';
import {
  buildFrmsCaseResolutionNotes, buildFrmsCaseTreatmentNotes, readFrmsPendingTreatment,
} from './case-resolution';

export function isBombeirosManagerTenant(tenant: {
  empresaId: number; empresaCodigo: string; role: string;
} | null | undefined): boolean {
  return Boolean(tenant && Number.isSafeInteger(tenant.empresaId)
    && tenant.empresaId > 0 && tenant.empresaId !== 6
    && tenant.empresaCodigo === 'bombeiros' && tenant.role === 'manager');
}

export const BOA_CHECKIN_TYPE = 'BOA_CHECKIN_V1';
export const BOA_CASE_OPEN_TYPE = 'BOA_CASE_OPENED_V1';
export const BOA_CASE_TREATMENT_TYPE = 'BOA_CASE_TREATMENT_V1';
export const BOA_CASE_CLOSED_TYPE = 'BOA_CASE_CLOSED_V1';

export const BombeirosCheckinSchema = z.object({
  mission_type: z.enum(['RESGATE','SALVAMENTO','TRANSPORTE_AEROMEDICO','COMBATE_AEREO_INCENDIO','TREINAMENTO','OUTRA']),
  duty_period: z.enum(['DIURNO','NOTURNO','MISTO','DESCONHECIDO']),
  standby_activation: z.boolean().nullable(),
  critical_mission: z.boolean().nullable(),
  sleep_hours_24h: z.number().finite().min(0).max(24).nullable(),
  sleep_fragmented: z.boolean().nullable(),
  kss_reported: z.number().int().min(1).max(9).nullable(),
  pvt_60s_completed: z.boolean().nullable(),
  self_declared_unfit: z.boolean().nullable(),
  acknowledge_confidentiality: z.literal(true),
}).strict();
export type BombeirosCheckinInput = z.infer<typeof BombeirosCheckinSchema>;

function assertBoaTenant(empresaId: number): void {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || empresaId === 6) {
    throw new Error('BOMBEIROS_INVALID_TENANT');
  }
}
type Employee = { id: number; empresa_id: number; cargo: string | null; funcao: string | null };
export async function resolveBoaCrewIdentity(
  db: D1Database, empresaId: number, userId: number,
): Promise<number | null> {
  assertBoaTenant(empresaId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const row = await db.prepare(
    `SELECT f.id, f.empresa_id, f.cargo, f.funcao
       FROM usuarios u
       JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       JOIN funcionarios f ON f.id = u.funcionario_id AND f.empresa_id = ue.empresa_id
      WHERE u.id = ? AND f.empresa_id = ?
        AND f.ativo = 1 AND f.deleted_at IS NULL
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND (u.deleted_at IS NULL OR u.deleted_at = 0)
      LIMIT 1`,
  ).bind(empresaId, userId, empresaId).first<Employee>();
  if (!row || Number(row.empresa_id) !== empresaId
    || resolveFrmsWorkforceProfile(row.cargo, row.funcao, FRMS_FIREFIGHTER_AVIATION_PROFILE) !== 'flight') {
    return null;
  }
  return Number(row.id);
}

export interface BoaCheckinWriteResult {
  accepted: boolean;
  checkin_id: string | null;
  case_id: string | null;
  status: 'HUMAN_REVIEW_REQUIRED' | 'ALREADY_RECEIVED';
  dispatch_permission: 'NOT_GRANTED';
  method_version: 'BOA_EVIDENCE_INTAKE_V1';
}

export async function registerBoaCheckin(
  db: D1Database, empresaId: number, funcionarioId: number, userId: number,
  date: string, input: BombeirosCheckinInput,
  governance: { profile_code: string; revision_id: string; policy_version: string },
): Promise<BoaCheckinWriteResult> {
  assertBoaTenant(empresaId);
  if (!Number.isSafeInteger(funcionarioId) || funcionarioId <= 0
    || !Number.isSafeInteger(userId) || userId <= 0
    || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || governance.profile_code !== FRMS_FIREFIGHTER_AVIATION_PROFILE
    || !governance.revision_id || !governance.policy_version) {
    throw new Error('BOMBEIROS_CHECKIN_GOVERNANCE_INVALID');
  }
  const checkin = BombeirosCheckinSchema.parse(input);
  const receiptId = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify({
    schema: 'BOA_CHECKIN_V1',
    funcionario_id: funcionarioId,
    reference_date: date,
    submitted_by: userId,
    submitted_at: createdAt,
    profile_code: governance.profile_code,
    revision_id: governance.revision_id,
    policy_version: governance.policy_version,
    ...checkin,
    evidence_state: 'CREW_SELF_REPORT_NOT_VERIFIED',
    dispatch_permission: 'NOT_GRANTED',
  });
  const event = db.prepare(
    `INSERT INTO frms_fadiga_evento
       (id, empresa_id, checkin_id, tipo, payload_json, created_at)
     SELECT ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM funcionarios f
         WHERE f.id = ? AND f.empresa_id = ?
           AND f.deleted_at IS NULL AND f.ativo = 1
      )
        AND NOT EXISTS (
          SELECT 1 FROM frms_fadiga_evento e
           WHERE e.empresa_id = ? AND e.tipo = ?
             AND json_extract(e.payload_json, '$.funcionario_id') = ?
             AND json_extract(e.payload_json, '$.reference_date') = ?
        )`,
  ).bind(receiptId, empresaId, receiptId, BOA_CHECKIN_TYPE, payload, createdAt,
    funcionarioId, empresaId, empresaId, BOA_CHECKIN_TYPE, funcionarioId, date);
  // Every receipt goes to human review until the BOA scientific method and
  // operational release policy are approved. No invented risk threshold.
  const opening = db.prepare(
    `INSERT INTO frms_fadiga_evento
       (id, empresa_id, checkin_id, tipo, payload_json, created_at)
     SELECT ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM frms_fadiga_evento e
         WHERE e.id = ? AND e.empresa_id = ? AND e.tipo = ?
      )`,
  ).bind(caseId, empresaId, receiptId, BOA_CASE_OPEN_TYPE,
    JSON.stringify({ schema: 'BOA_CASE_OPENED_V1', funcionario_id: funcionarioId,
      reason: checkin.self_declared_unfit === true
        ? 'CREW_REPORTED_UNFIT' : 'BOA_METHOD_REVIEW_PENDING',
      review_required: true, dispatch_permission: 'NOT_GRANTED',
      opened_by: userId, revision_id: governance.revision_id }), createdAt,
    receiptId, empresaId, BOA_CHECKIN_TYPE);
  const [insert, caseInsert] = await db.batch([event, opening]);
  const written = (insert.meta?.changes ?? 0) === 1;
  if (!written) {
    // A prior receipt exists. Never reinterpret that as "safe" or reinsert a case.
    return { accepted: false, checkin_id: null, case_id: null,
      status: 'ALREADY_RECEIVED', dispatch_permission: 'NOT_GRANTED',
      method_version: 'BOA_EVIDENCE_INTAKE_V1' };
  }
  if ((caseInsert.meta?.changes ?? 0) !== 1) {
    // Atomic DB.batch is expected; treat any incoherence as a hard failure.
    throw new Error('BOMBEIROS_CASE_OPEN_INTEGRITY_ERROR');
  }
  return { accepted: true, checkin_id: receiptId, case_id: caseId,
    status: 'HUMAN_REVIEW_REQUIRED', dispatch_permission: 'NOT_GRANTED',
    method_version: 'BOA_EVIDENCE_INTAKE_V1' };
}

export interface BoaCaseStatus {
  case_id: string;
  state: 'ABERTO' | 'EM_TRATAMENTO' | 'RESOLVIDO';
  created_at: string | null;
  closed_at: string | null;
  treatment_recorded: boolean;
}
type BoaEventRow = { id: string; tipo: string; payload_json: string | null; created_at: string };

/** Existing canonical resolution-note format; fail closed on corrupt events. */
function isBoaResolutionEvent(payload: string): boolean {
  try {
    const decoded: unknown = JSON.parse(payload);
    return Boolean(decoded && typeof decoded === 'object'
      && (decoded as { schema?: unknown }).schema === 'FRMS_CASE_RESOLUTION_V1'
      && typeof (decoded as { avaliacao_eficacia?: unknown }).avaliacao_eficacia === 'string'
      && ((decoded as { avaliacao_eficacia: string }).avaliacao_eficacia.trim().length >= 10));
  } catch { return false; }
}
export async function loadBoaOperationalCase(
  db: D1Database, empresaId: number, caseId: string, access: EmployeeSectorAccess,
): Promise<{ status: BoaCaseStatus; treatment: string | null } | null> {
  assertBoaTenant(empresaId);
  if (!caseId || caseId.length > 120 || access.mode !== 'restricted' || access.setorIds.length === 0) return null;
  const scope = buildFuncionarioScopeWhere(access, 'f');
  if (!scope.bindings.length) return null;
  const opened = await db.prepare(
    `SELECT e.id, e.tipo, e.payload_json, e.created_at
       FROM frms_fadiga_evento e
       JOIN funcionarios f ON f.id = CAST(json_extract(e.payload_json, '$.funcionario_id') AS INTEGER)
      WHERE e.id = ? AND e.empresa_id = ? AND e.tipo = ?
        AND f.empresa_id = ? AND f.ativo = 1 AND f.deleted_at IS NULL
        AND ${scope.clause} LIMIT 1`,
  ).bind(caseId, empresaId, BOA_CASE_OPEN_TYPE, empresaId, ...scope.bindings).first<BoaEventRow>();
  if (!opened || opened.id !== caseId) return null;
  const receipt = await db.prepare(
    `SELECT e.id FROM frms_fadiga_evento e
      JOIN frms_fadiga_evento base ON base.id = ?
     WHERE e.id = base.checkin_id
       AND e.empresa_id = ? AND base.empresa_id = ?
       AND e.tipo = ? AND base.tipo = ?
       AND json_extract(e.payload_json, '$.schema') = 'BOA_CHECKIN_V1'
       AND json_extract(e.payload_json, '$.funcionario_id') =
           json_extract(base.payload_json, '$.funcionario_id')
       AND json_extract(e.payload_json, '$.dispatch_permission') = 'NOT_GRANTED'
       LIMIT 1`,
  ).bind(caseId, empresaId, empresaId, BOA_CHECKIN_TYPE, BOA_CASE_OPEN_TYPE)
    .first<{ id: string }>();
  if (!receipt) return null;
  const child = await db.prepare(
    `SELECT id, tipo, payload_json, created_at FROM frms_fadiga_evento
      WHERE empresa_id = ? AND checkin_id = ?
        AND tipo IN (?, ?)
      ORDER BY created_at ASC, id ASC`,
  ).bind(empresaId, caseId, BOA_CASE_TREATMENT_TYPE, BOA_CASE_CLOSED_TYPE)
    .all<BoaEventRow>();
  const events = child.results ?? [];
  const treatments = events.filter(e => e.tipo === BOA_CASE_TREATMENT_TYPE);
  const closures = events.filter(e => e.tipo === BOA_CASE_CLOSED_TYPE);
  // Duplicate or out-of-order state transitions must never be silently accepted.
  if (treatments.length > 1 || closures.length > 1 || (closures.length && !treatments.length)
    || (treatments.length === 1
      && !readFrmsPendingTreatment(treatments[0].payload_json))
    || (closures.length === 1 && (!closures[0].payload_json
      || !isBoaResolutionEvent(closures[0].payload_json)))
    || (treatments.length === 1 && closures.length === 1
      && closures[0].created_at < treatments[0].created_at)) {
    throw new Error('BOMBEIROS_CASE_STREAM_INTEGRITY_ERROR');
  }
  const closed = closures[0] ?? null;
  return {
    status: { case_id: caseId, state: closed ? 'RESOLVIDO' : treatments.length ? 'EM_TRATAMENTO' : 'ABERTO',
      created_at: opened.created_at, closed_at: closed?.created_at ?? null,
      treatment_recorded: treatments.length === 1 },
    treatment: treatments[0]?.payload_json ?? null,
  };
}

/**
 * Manager's operational queue, sanitized. The predicate is applied to every
 * joined employee at the DB, not merely to the API request's active tenant.
 */
export async function loadBoaCaseQueue(
  db: D1Database, empresaId: number, access: EmployeeSectorAccess,
  limit = 50, before?: { created_at: string; id: string },
): Promise<{ items: BoaCaseStatus[]; next_cursor: { created_at: string; id: string } | null } | null> {
  assertBoaTenant(empresaId);
  if (access.mode !== 'restricted' || !access.setorIds.length) return null;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('BOA_CASE_QUEUE_INVALID_PAGE');
  if (before && (!/^\d{4}-\d{2}-\d{2}T[^ ]+Z$/.test(before.created_at)
      || before.id.length === 0 || before.id.length > 120)) {
    throw new Error('BOA_CASE_QUEUE_INVALID_CURSOR');
  }
  const scope = buildFuncionarioScopeWhere(access, 'f');
  if (!scope.bindings.length) return null;
  const query = `SELECT e.id AS case_id, e.created_at,
      CASE WHEN EXISTS (
        SELECT 1 FROM frms_fadiga_evento closed
         WHERE closed.empresa_id = e.empresa_id AND closed.checkin_id = e.id
           AND closed.tipo = 'BOA_CASE_CLOSED_V1'
      ) THEN 'RESOLVIDO' WHEN EXISTS (
        SELECT 1 FROM frms_fadiga_evento treatment
         WHERE treatment.empresa_id = e.empresa_id AND treatment.checkin_id = e.id
           AND treatment.tipo = 'BOA_CASE_TREATMENT_V1'
      ) THEN 'EM_TRATAMENTO' ELSE 'ABERTO' END AS state
    FROM frms_fadiga_evento e
    JOIN funcionarios f
      ON f.id = CAST(json_extract(e.payload_json, '$.funcionario_id') AS INTEGER)
     AND f.empresa_id = e.empresa_id
    WHERE e.empresa_id = ? AND f.empresa_id = ?
      AND e.tipo = ? AND f.deleted_at IS NULL AND f.ativo = 1
      AND EXISTS (SELECT 1 FROM frms_fadiga_evento receipt
         WHERE receipt.id = e.checkin_id AND receipt.empresa_id = e.empresa_id
           AND receipt.tipo = 'BOA_CHECKIN_V1'
           AND json_extract(receipt.payload_json, '$.schema') = 'BOA_CHECKIN_V1'
           AND json_extract(receipt.payload_json, '$.funcionario_id') =
               json_extract(e.payload_json, '$.funcionario_id')
           AND json_extract(receipt.payload_json, '$.dispatch_permission') = 'NOT_GRANTED')
      AND ${scope.clause}
      ${before ? 'AND (e.created_at < ? OR (e.created_at = ? AND e.id < ?))' : ''}
    ORDER BY e.created_at DESC, e.id DESC LIMIT ?`;
  const bindings: (string | number)[] = [
    empresaId, empresaId, BOA_CASE_OPEN_TYPE, ...scope.bindings,
    ...(before ? [before.created_at, before.created_at, before.id] : []),
    limit + 1,
  ];
  const result = await db.prepare(query).bind(...bindings)
    .all<{ case_id: string; created_at: string; state: BoaCaseStatus['state'] }>();
  const entries = result.results ?? [];
  if (entries.some(x => !x.case_id || !['ABERTO','EM_TRATAMENTO','RESOLVIDO'].includes(x.state))) {
    throw new Error('BOA_CASE_QUEUE_INTEGRITY_ERROR');
  }
  const page = entries.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(x => ({
      case_id: x.case_id, state: x.state, created_at: x.created_at, closed_at: null,
      treatment_recorded: x.state !== 'ABERTO',
    })),
    next_cursor: entries.length > limit && last
      ? { created_at: last.created_at, id: last.case_id } : null,
  };
}

export async function registerBoaCaseAction(
  db: D1Database, empresaId: number, caseId: string, actorId: number,
  input: unknown, kind: 'treatment' | 'closure',
  access: EmployeeSectorAccess,
): Promise<'RECORDED' | 'NOT_ALLOWED' | 'INVALID'> {
  assertBoaTenant(empresaId);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return 'NOT_ALLOWED';
  const current = await loadBoaOperationalCase(db, empresaId, caseId, access);
  if (!current || (kind === 'treatment' && current.status.state !== 'ABERTO')
    || (kind === 'closure' && current.status.state !== 'EM_TRATAMENTO')) return 'NOT_ALLOWED';
  const notes = kind === 'treatment'
    ? buildFrmsCaseTreatmentNotes(input, String(actorId))
    : buildFrmsCaseResolutionNotes({
      ...readFrmsPendingTreatment(current.treatment),
      avaliacao_eficacia: input && typeof input === 'object'
        ? (input as Record<string, unknown>).avaliacao_eficacia : null,
    }, String(actorId));
  if (!notes) return 'INVALID';
  const kindType = kind === 'treatment' ? BOA_CASE_TREATMENT_TYPE : BOA_CASE_CLOSED_TYPE;
  const now = new Date().toISOString();
  // Atomic CAS-like append: verify previous state and owner/sector again inside
  // the writing SQL. Two simultaneous actions cannot append the same transition.
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const prerequisite = kind === 'closure'
    ? `AND EXISTS (SELECT 1 FROM frms_fadiga_evento t
          WHERE t.empresa_id = ? AND t.checkin_id = base.id AND t.tipo = ?)`
    : '';
  const result = await db.prepare(
    `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
     SELECT ?, ?, ?, ?, ?, ?
      FROM frms_fadiga_evento base
      JOIN funcionarios f ON f.id = CAST(json_extract(base.payload_json, '$.funcionario_id') AS INTEGER)
     WHERE base.id = ? AND base.empresa_id = ? AND base.tipo = ?
       AND f.empresa_id = ? AND f.deleted_at IS NULL AND f.ativo = 1
       AND EXISTS (SELECT 1 FROM frms_fadiga_evento receipt
         WHERE receipt.id = base.checkin_id
           AND receipt.empresa_id = base.empresa_id
           AND receipt.tipo = 'BOA_CHECKIN_V1'
           AND json_extract(receipt.payload_json, '$.schema') = 'BOA_CHECKIN_V1'
           AND json_extract(receipt.payload_json, '$.funcionario_id') =
               json_extract(base.payload_json, '$.funcionario_id')
           AND json_extract(receipt.payload_json, '$.dispatch_permission') = 'NOT_GRANTED')
       AND ${scope.clause}
       ${prerequisite}
       AND NOT EXISTS (SELECT 1 FROM frms_fadiga_evento t
         WHERE t.empresa_id = ? AND t.checkin_id = base.id AND t.tipo = ?)
       AND NOT EXISTS (SELECT 1 FROM frms_fadiga_evento done
         WHERE done.empresa_id = ? AND done.checkin_id = base.id AND done.tipo = ?)`,
  ).bind(crypto.randomUUID(), empresaId, caseId, kindType, notes, now,
    caseId, empresaId, BOA_CASE_OPEN_TYPE, empresaId, ...scope.bindings,
    ...(kind === 'closure' ? [empresaId, BOA_CASE_TREATMENT_TYPE] : []),
    empresaId, kindType, empresaId, BOA_CASE_CLOSED_TYPE).run();
  return result.meta?.changes === 1 ? 'RECORDED' : 'NOT_ALLOWED';
}
