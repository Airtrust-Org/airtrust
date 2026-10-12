/**
 * Transactional Native enrollment provisioner — NOT EXPOSED BY AN HTTP ROUTE.
 *
 * Requires the future governed activation/intent/edition Schema V2 contract.
 * The default-disabled triple staging guard protects legacy D1 installations.
 * Do not mount until FK deferral and D1.batch are rehearsed in governed D1
 * and the exact reviewed private R2 edition has been validated.
 */
import type { Env } from '../types';
import { canReadNativeCatalogActivation } from './lms-native-catalog-legacy-guard';

export class NativeProvisionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeProvisionError';
  }
}

const tenantAllowed = (raw: string | undefined, tenant: number) =>
  !!raw && !raw.includes('*') &&
  raw.split(',').some((piece) => piece.trim() === String(tenant));

export function canProvisionNative(env: Env, tenant: number): boolean {
  return canReadNativeCatalogActivation(env, tenant) &&
    tenantAllowed(env.NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS, tenant) &&
    tenantAllowed(env.NATIVE_LEARNER_WRITE_ENABLED_TENANTS, tenant);
}

const SCOPE = [
  'FROM lms_cursos c',
  'JOIN lms_native_catalog_activation a ON a.curso_id=c.id AND a.empresa_id=c.empresa_id',
  'JOIN lms_native_edicoes ed ON ed.curso_id=c.id AND ed.empresa_id=c.empresa_id',
  'JOIN usuarios u ON u.id=? AND u.deleted_at IS NULL',
  'JOIN funcionarios f ON f.id=u.funcionario_id',
  'AND f.empresa_id=c.empresa_id AND f.deleted_at IS NULL AND f.ativo=1',
  "AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'",
  'WHERE c.id=? AND c.empresa_id=?',
  "AND c.tipo_conteudo='scorm' AND c.ativo=1 AND c.publicado=1",
  'AND c.deleted_at IS NULL AND ed.id=? AND ed.status=\'PUBLISHED\'',
  'AND NOT EXISTS (SELECT 1 FROM lms_matriculas m',
  'WHERE m.empresa_id=c.empresa_id AND m.curso_id=c.id',
  'AND m.funcionario_id=u.funcionario_id)',
].join(' ');

// A failed assertion aborts the whole D1.batch transaction, not merely a
// statement with zero updated rows. All runtime data uses bind parameters.
const assertSql = (predicate: string, failure: string) =>
  `SELECT json(CASE WHEN (${predicate}) THEN 'null' ELSE '${failure}' END)`;

const preflight = assertSql(
  `(SELECT COUNT(*) ${SCOPE})=1`, 'NATIVE_PROVISION_SCOPE_OR_EDITION_INVALID');
const insertIntent = [
  'INSERT INTO lms_native_enrollment_intents',
  '(nonce,empresa_id,curso_id,funcionario_id,actor_user_id,edicao_id)',
  'SELECT ?,c.empresa_id,c.id,u.funcionario_id,u.id,ed.id',
  SCOPE,
].join(' ');
const checkIntent = assertSql(
  '(SELECT COUNT(*) FROM lms_native_enrollment_intents i ' +
    'WHERE i.nonce=? AND i.empresa_id=? AND i.curso_id=? ' +
    'AND i.actor_user_id=? AND i.edicao_id=? AND i.matricula_id IS NULL)=1',
  'NATIVE_PROVISION_INTENT_MISSING');
const insertEnrollment = [
  'INSERT INTO lms_matriculas(empresa_id,curso_id,funcionario_id,status)',
  "SELECT i.empresa_id,i.curso_id,i.funcionario_id,'NAO_INICIADO'",
  'FROM lms_native_enrollment_intents i WHERE i.nonce=?',
].join(' ');
const pinEnrollment = [
  'UPDATE lms_native_enrollment_intents SET matricula_id=(',
  'SELECT m.id FROM lms_matriculas m',
  'WHERE m.empresa_id=lms_native_enrollment_intents.empresa_id',
  'AND m.curso_id=lms_native_enrollment_intents.curso_id',
  'AND m.funcionario_id=lms_native_enrollment_intents.funcionario_id',
  "AND m.deleted_at IS NULL AND m.status='NAO_INICIADO'",
  ') WHERE nonce=?',
].join(' ');
const checkEnrollment = assertSql(
  '(SELECT COUNT(*) FROM lms_native_enrollment_intents i ' +
    'JOIN lms_matriculas m ON m.id=i.matricula_id ' +
    "AND m.empresa_id=i.empresa_id AND m.curso_id=i.curso_id AND m.funcionario_id=i.funcionario_id AND m.status='NAO_INICIADO' " +
    'WHERE i.nonce=? AND i.matricula_id IS NOT NULL)=1',
  'NATIVE_PROVISION_ENROLLMENT_NOT_PINNED');
const insertCycle = [
  'INSERT INTO lms_matricula_ciclos',
  '(matricula_id,empresa_id,curso_id,funcionario_id,numero_ciclo,origem,status,ciclo_atual)',
  "SELECT i.matricula_id,i.empresa_id,i.curso_id,i.funcionario_id,1,'LMS','NAO_INICIADO',1",
  'FROM lms_native_enrollment_intents i WHERE i.nonce=?',
].join(' ');
const pinCycle = [
  'UPDATE lms_native_enrollment_intents SET ciclo_id=(',
  'SELECT cy.id FROM lms_matricula_ciclos cy',
  'WHERE cy.empresa_id=lms_native_enrollment_intents.empresa_id',
  'AND cy.curso_id=lms_native_enrollment_intents.curso_id',
  'AND cy.funcionario_id=lms_native_enrollment_intents.funcionario_id',
  'AND cy.matricula_id=lms_native_enrollment_intents.matricula_id',
  'AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL',
  "AND cy.status='NAO_INICIADO'",
  ') WHERE nonce=?',
].join(' ');
const checkCycle = assertSql(
  '(SELECT COUNT(*) FROM lms_native_enrollment_intents i ' +
    'JOIN lms_matricula_ciclos cy ON cy.id=i.ciclo_id ' +
    'AND cy.matricula_id=i.matricula_id AND cy.empresa_id=i.empresa_id ' +
    'AND cy.curso_id=i.curso_id AND cy.funcionario_id=i.funcionario_id ' +
    "AND cy.ciclo_atual=1 AND cy.status='NAO_INICIADO' " +
    'WHERE i.nonce=? AND i.ciclo_id IS NOT NULL)=1',
  'NATIVE_PROVISION_CYCLE_NOT_PINNED');
const insertEditionPin = [
  'INSERT INTO lms_native_matricula_edicoes',
  '(empresa_id,curso_id,matricula_id,ciclo_id,edicao_id)',
  'SELECT i.empresa_id,i.curso_id,i.matricula_id,i.ciclo_id,i.edicao_id',
  'FROM lms_native_enrollment_intents i',
  'JOIN lms_matriculas m ON m.id=i.matricula_id',
  'AND m.empresa_id=i.empresa_id AND m.curso_id=i.curso_id',
  'AND m.funcionario_id=i.funcionario_id',
  'JOIN lms_matricula_ciclos cy ON cy.id=i.ciclo_id',
  'AND cy.matricula_id=m.id AND cy.ciclo_atual=1 AND cy.status=m.status',
  'JOIN lms_native_edicoes ed ON ed.id=i.edicao_id',
  'AND ed.empresa_id=i.empresa_id AND ed.curso_id=i.curso_id',
  "AND ed.status='PUBLISHED' WHERE i.nonce=?",
].join(' ');
const checkEditionPin = assertSql(
  '(SELECT COUNT(*) FROM lms_native_matricula_edicoes b ' +
    'JOIN lms_native_enrollment_intents i ON i.matricula_id=b.matricula_id ' +
    'AND i.ciclo_id=b.ciclo_id AND i.edicao_id=b.edicao_id ' +
    'AND i.empresa_id=b.empresa_id AND i.curso_id=b.curso_id ' +
    'WHERE i.nonce=?)=1',
  'NATIVE_PROVISION_EDITION_NOT_PINNED');
const consumeIntent = 'DELETE FROM lms_native_enrollment_intents WHERE nonce=?';
const endCheck = assertSql(
  '(SELECT COUNT(*) FROM lms_native_enrollment_intents)=0',
  'NATIVE_PROVISION_ORPHAN_INTENT');

type ProvisionRow = { matricula_id: number; ciclo_id: number; edicao_id: number };
export type NativeProvisionReceipt = Readonly<{
  matriculaId: number; cicloId: number; edicaoId: number;
}>;

/**
 * New enrollments only. Existing enrollment/cycles must be reconciled by a
 * separately reviewed service; never silently reset a regulated LMS record.
 */
export async function provisionNativeEnrollment(params: {
  env: Env; empresaId: number; cursoId: number; actorUserId: number;
  edicaoId: number;
}): Promise<NativeProvisionReceipt> {
  const { env, empresaId, cursoId, actorUserId, edicaoId } = params;
  if (![empresaId, cursoId, actorUserId, edicaoId].every(
    value => Number.isSafeInteger(value) && value > 0
  )) throw new NativeProvisionError('NATIVE_PROVISION_INVALID_CONTEXT');
  if (!canProvisionNative(env, empresaId)) {
    throw new NativeProvisionError('NATIVE_PROVISION_NOT_ENABLED');
  }
  // This is a critical prerequisite for deferred FK to reject a leftover
  // intent. A real D1 environment still needs its own governed rehearsal.
  let foreignKeys: { foreign_keys: number } | null;
  try {
    foreignKeys = await env.DB.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>();
  } catch {
    throw new NativeProvisionError('NATIVE_PROVISION_FK_PREFLIGHT_UNAVAILABLE');
  }
  if (foreignKeys?.foreign_keys !== 1) {
    throw new NativeProvisionError('NATIVE_PROVISION_FK_PREFLIGHT_FAILED');
  }
  const nonce = [...crypto.getRandomValues(new Uint8Array(32))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  const db = env.DB;
  const bind = (sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values);
  try {
    const results = await db.batch([
      bind(preflight, actorUserId, cursoId, empresaId, edicaoId),
      bind(insertIntent, nonce, actorUserId, cursoId, empresaId, edicaoId),
      bind(checkIntent, nonce, empresaId, cursoId, actorUserId, edicaoId),
      bind(insertEnrollment, nonce),
      bind(pinEnrollment, nonce),
      bind(checkEnrollment, nonce),
      bind(insertCycle, nonce),
      bind(pinCycle, nonce),
      bind(checkCycle, nonce),
      bind(insertEditionPin, nonce),
      bind(checkEditionPin, nonce),
      bind(consumeIntent, nonce),
      bind(endCheck),
    ]);
    if (results.length !== 13 || results.some(result => !result.success) ||
        results[3]?.meta.changes !== 1 || results[6]?.meta.changes !== 1 ||
        results[9]?.meta.changes !== 1 || results[11]?.meta.changes !== 1) {
      throw new NativeProvisionError('NATIVE_PROVISION_BATCH_INCONSISTENT');
    }
  } catch {
    // D1.batch is atomic; never retry a partial or conflicted enrollment by
    // bypassing uniqueness or creating a second current cycle.
    throw new NativeProvisionError('NATIVE_PROVISION_ATOMIC_REJECTED');
  }

  const result = await db.prepare([
    'SELECT m.id AS matricula_id,cy.id AS ciclo_id,b.edicao_id',
    'FROM lms_matriculas m',
    'JOIN usuarios u ON u.funcionario_id=m.funcionario_id AND u.id=?',
    'AND u.deleted_at IS NULL',
    'JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id',
    'AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id',
    'AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1',
    "AND cy.status='NAO_INICIADO' AND cy.deleted_at IS NULL",
    'JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id',
    'AND b.ciclo_id=cy.id AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id',
    'WHERE m.empresa_id=? AND m.curso_id=?',
    'AND m.deleted_at IS NULL AND b.edicao_id=? LIMIT 1',
  ].join(' ')).bind(actorUserId, empresaId, cursoId, edicaoId).first<ProvisionRow>();
  if (!result || ![result.matricula_id,result.ciclo_id,result.edicao_id].every(
    value => Number.isSafeInteger(value) && value > 0
  ) || result.edicao_id !== edicaoId) {
    throw new NativeProvisionError('NATIVE_PROVISION_RECEIPT_UNAVAILABLE');
  }
  return { matriculaId: result.matricula_id, cicloId: result.ciclo_id, edicaoId };
}
