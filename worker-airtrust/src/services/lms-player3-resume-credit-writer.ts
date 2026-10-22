/**
 * Append-only, transaction-scoped administrative resume position credit.
 *
 * This is an internal backend service, not an HTTP trust boundary. Callers
 * MUST build the intent from the private Front C sealed handoff, perform
 * authenticated tenant RBAC for both reviewers, verify the source archive,
 * and keep the staging feature flags disabled until Schema V2 0565 is applied
 * by its reviewed workflow. No legacy enrollment, SCORM, grade, attempt,
 * completion, qualification or certificate row is changed here.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { ResumeCreditIntent } from '../lib/lms-player3/admin-resume-credit';
import type { Env } from '../types';

export class Player3ResumeCreditWriteError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'Player3ResumeCreditWriteError';
  }
}

export type Player3ResumeCreditReceipt = Readonly<{
  state: 'APPLIED' | 'IDEMPOTENT_REPLAY';
  creditId: number;
  empresaId: number;
  matriculaId: number;
  cicloId: number;
  resumeUnitId: string;
  historicalProgressPct: number;
  meaning: 'POSITION_ONLY_NOT_EXAM_OR_COMPLETION';
  grantsAssessmentPass: false;
  grantsCompletion: false;
  grantsQualification: false;
  grantsCertificate: false;
}>;

type Stored = {
  id: number; idempotency_key: string; decision_key: string;
  empresa_id: number; curso_id: number; matricula_id: number;
  ciclo_id: number; funcionario_id: number; binding_id: number;
  source_snapshot_sha256: string; source_t0_sha256: string;
  source_row_sha256: string; original_edition_sha256: string;
  destination_edition_sha256: string; source_updated_at: string;
  source_scorm_commit_at: string | null; historical_progress_pct: number;
  resume_unit_id: string; manager_user_id: number;
  second_reviewer_user_id: number; approved_at: string; justification: string;
};

const SHA = /^[a-f0-9]{64}$/;
const UNIT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
const reject = (code: string): never => {
  throw new Player3ResumeCreditWriteError(`PLAYER3_RESUME_CREDIT_${code}`);
};
const tenantAllowed = (raw: string | undefined, tenant: number) =>
  !!raw && !raw.includes('*') && raw.split(',').some(value => value.trim() === String(tenant));

/** Independent staging-only gate; every absent/wildcard flag remains OFF. */
export function canWritePlayer3ResumeCredit(env: Env, tenant: number): boolean {
  return env.ENVIRONMENT === 'staging' && positive(tenant) &&
    tenantAllowed(env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS, tenant) &&
    tenantAllowed(env.NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS, tenant) &&
    tenantAllowed(env.NATIVE_LEARNER_WRITE_ENABLED_TENANTS, tenant) &&
    tenantAllowed(env.PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS, tenant) &&
    tenantAllowed(env.PLAYER3_RESUME_CREDIT_WRITE_ENABLED_TENANTS, tenant);
}

const rowsEqual = (row: Stored, intent: ResumeCreditIntent, bindingId: number) =>
  row.idempotency_key === intent.front_c_decision_key &&
  row.decision_key === intent.front_c_decision_key &&
  row.empresa_id === intent.empresa_id && row.curso_id === intent.curso_id &&
  row.matricula_id === intent.matricula_id && row.ciclo_id === intent.ciclo_id &&
  row.funcionario_id === intent.funcionario_id && row.binding_id === bindingId &&
  row.source_snapshot_sha256 === intent.source_snapshot_sha256 &&
  row.source_t0_sha256 === intent.front_c_t0_sha256 &&
  row.source_row_sha256 === intent.front_c_latest_row_sha256 &&
  row.original_edition_sha256 === intent.original_edition_sha256 &&
  row.destination_edition_sha256 === intent.new_edition_sha256 &&
  row.source_updated_at === intent.source_updated_at &&
  row.source_scorm_commit_at === intent.source_scorm_commit_at &&
  row.historical_progress_pct === intent.original_progress_pct &&
  row.resume_unit_id === intent.resume_unit_id &&
  row.manager_user_id === intent.actor_user_id &&
  row.second_reviewer_user_id === intent.approver_user_id &&
  row.approved_at === intent.approved_at &&
  row.justification === intent.justification;

function asReceipt(row: Stored, state: Player3ResumeCreditReceipt['state']): Player3ResumeCreditReceipt {
  return {
    state, creditId: row.id, empresaId: row.empresa_id,
    matriculaId: row.matricula_id, cicloId: row.ciclo_id,
    resumeUnitId: row.resume_unit_id,
    historicalProgressPct: row.historical_progress_pct,
    meaning: 'POSITION_ONLY_NOT_EXAM_OR_COMPLETION',
    grantsAssessmentPass: false, grantsCompletion: false,
    grantsQualification: false, grantsCertificate: false,
  };
}

/**
 * Atomically records the approved position credit and consumes its intent.
 * The deferred sentinel FK rolls back a partial batch. A duplicate decision
 * is acknowledged only when every immutable field matches the prior receipt.
 */
export async function applyPlayer3ResumeCredit(input: {
  env: Env;
  db: D1Database;
  intent: ResumeCreditIntent;
  bindingId: number;
}): Promise<Player3ResumeCreditReceipt> {
  const { env, db, intent, bindingId } = input;
  if (!intent || intent.kind !== 'AIRTRUST_PLAYER3_ADMIN_RESUME_CREDIT_V1' ||
      !canWritePlayer3ResumeCredit(env, intent.empresa_id) ||
      !positive(intent.empresa_id) || !positive(intent.curso_id) ||
      !positive(intent.matricula_id) || !positive(intent.ciclo_id) ||
      !positive(intent.funcionario_id) || !positive(bindingId) ||
      !positive(intent.actor_user_id) || !positive(intent.approver_user_id) ||
      intent.actor_user_id === intent.approver_user_id ||
      ![intent.source_snapshot_sha256, intent.front_c_decision_key,
        intent.front_c_t0_sha256, intent.front_c_latest_row_sha256,
        intent.original_edition_sha256, intent.new_edition_sha256].every(v => SHA.test(v)) ||
      !UNIT.test(intent.resume_unit_id) ||
      !Number.isFinite(intent.original_progress_pct) ||
      intent.original_progress_pct <= 0 || intent.original_progress_pct >= 100 ||
      intent.advances_navigation_only !== true ||
      intent.grants_assessment_pass !== false || intent.grants_completion !== false ||
      intent.grants_certificate !== false ||
      typeof intent.source_updated_at !== 'string' || !intent.source_updated_at ||
      typeof intent.approved_at !== 'string' || !intent.approved_at.endsWith('Z') ||
      typeof intent.justification !== 'string' || intent.justification.length < 20) {
    reject('INVALID_INTENT');
  }

  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  const currentContext = [
    'FROM lms_matriculas m',
    'JOIN lms_matricula_ciclos cy ON cy.id=? AND cy.matricula_id=m.id',
    'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
    'AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1',
    "AND cy.status=m.status AND cy.status IN ('NAO_INICIADO','EM_ANDAMENTO') AND cy.deleted_at IS NULL",
    'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
    "AND c.tipo_conteudo='scorm' AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL",
    'JOIN lms_native_catalog_activation a ON a.curso_id=c.id AND a.empresa_id=c.empresa_id',
    'JOIN lms_native_matricula_edicoes b ON b.id=? AND b.matricula_id=m.id',
    'AND b.ciclo_id=cy.id AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id',
    'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id AND ed.empresa_id=b.empresa_id',
    "AND ed.curso_id=b.curso_id AND ed.artifact_sha256=? AND ed.status='PUBLISHED'",
    'JOIN usuarios manager ON manager.id=? AND manager.active=1 AND manager.deleted_at IS NULL',
    "JOIN usuarios_empresas_perfis manager_profile ON manager_profile.usuario_id=manager.id AND manager_profile.empresa_id=m.empresa_id AND manager_profile.ativo=1 AND UPPER(manager_profile.perfil)='GESTOR'",
    'JOIN usuarios reviewer ON reviewer.id=? AND reviewer.active=1 AND reviewer.deleted_at IS NULL',
    "JOIN usuarios_empresas_perfis reviewer_profile ON reviewer_profile.usuario_id=reviewer.id AND reviewer_profile.empresa_id=m.empresa_id AND reviewer_profile.ativo=1 AND UPPER(reviewer_profile.perfil) IN ('ADMIN','ADMINISTRADOR','GESTOR','MANAGER')",
    'WHERE m.id=? AND m.empresa_id=? AND m.curso_id=? AND m.funcionario_id=?',
    "AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO') AND m.deleted_at IS NULL",
    'AND m.updated_at=?',
    'AND COALESCE((SELECT s.last_commit_at FROM lms_progresso_scorm s',
    'WHERE s.matricula_id=m.id AND s.empresa_id=m.empresa_id LIMIT 1),\'\')=COALESCE(?,\'\')',
  ].join(' ');
  const valid = `EXISTS(SELECT 1 ${currentContext})`;
  const intentSql = [
    'INSERT INTO lms_player3_resume_credit_intents',
    '(nonce,empresa_id,curso_id,matricula_id,ciclo_id,funcionario_id,binding_id,actor_user_id,approver_user_id)',
    `VALUES(CASE WHEN ${valid} THEN ? ELSE NULL END,?,?,?,?,?,?,?,?)`,
  ].join(' ');
  const scopeBindings = [
    intent.ciclo_id, bindingId, intent.new_edition_sha256,
    intent.actor_user_id, intent.approver_user_id,
    intent.matricula_id, intent.empresa_id, intent.curso_id,
    intent.funcionario_id, intent.source_updated_at,
    intent.source_scorm_commit_at,
  ];
  const insertCredit = [
    'INSERT INTO lms_player3_resume_credit_ledger',
    '(idempotency_key,decision_key,empresa_id,curso_id,matricula_id,ciclo_id,funcionario_id,binding_id,',
    'source_snapshot_sha256,source_t0_sha256,source_row_sha256,original_edition_sha256,destination_edition_sha256,',
    'source_updated_at,source_scorm_commit_at,historical_progress_pct,resume_unit_id,manager_user_id,',
    'second_reviewer_user_id,approved_at,justification)',
    'SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM lms_player3_resume_credit_intents i',
    'JOIN lms_native_matricula_edicoes b ON b.id=i.binding_id AND b.empresa_id=i.empresa_id',
    'AND b.curso_id=i.curso_id AND b.matricula_id=i.matricula_id AND b.ciclo_id=i.ciclo_id',
    'WHERE i.nonce=? AND i.uncommittable=1',
  ].join(' ');
  const values = [
    intent.front_c_decision_key,intent.front_c_decision_key,
    intent.empresa_id,intent.curso_id,intent.matricula_id,intent.ciclo_id,
    intent.funcionario_id,bindingId,intent.source_snapshot_sha256,
    intent.front_c_t0_sha256,intent.front_c_latest_row_sha256,
    intent.original_edition_sha256,intent.new_edition_sha256,
    intent.source_updated_at,intent.source_scorm_commit_at,
    intent.original_progress_pct,intent.resume_unit_id,
    intent.actor_user_id,intent.approver_user_id,intent.approved_at,
    intent.justification,nonce,
  ];
  try {
    const result = await db.batch([
      db.prepare(intentSql).bind(...scopeBindings, nonce,
        intent.empresa_id,intent.curso_id,intent.matricula_id,intent.ciclo_id,
        intent.funcionario_id,bindingId,intent.actor_user_id,intent.approver_user_id),
      db.prepare(insertCredit).bind(...values),
      db.prepare('DELETE FROM lms_player3_resume_credit_intents WHERE nonce=?').bind(nonce),
    ]);
    if (result.length !== 3 || Number(result[1]?.meta?.changes ?? 0) !== 1) {
      reject('ATOMIC_APPLY_REJECTED');
    }
    const row = await db.prepare('SELECT * FROM lms_player3_resume_credit_ledger WHERE idempotency_key=?')
      .bind(intent.front_c_decision_key).first<Stored>();
    if (!row || !rowsEqual(row, intent, bindingId)) return reject('RECEIPT_MISMATCH');
    return asReceipt(row, 'APPLIED');
  } catch (error) {
    if (error instanceof Player3ResumeCreditWriteError) throw error;
    const prior = await db.prepare('SELECT * FROM lms_player3_resume_credit_ledger WHERE idempotency_key=?')
      .bind(intent.front_c_decision_key).first<Stored>().catch(() => null);
    if (prior) {
      if (!rowsEqual(prior, intent, bindingId)) reject('IDEMPOTENCY_CONFLICT');
      return asReceipt(prior, 'IDEMPOTENT_REPLAY');
    }
    return reject('ATOMIC_APPLY_REJECTED');
  }
}
