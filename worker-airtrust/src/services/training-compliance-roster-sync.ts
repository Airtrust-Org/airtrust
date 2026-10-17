import { hasSchemaTable } from '../utils/db-schema';
import { buildTrainingComplianceRosterPlan, type RosterPlan, type RosterEnrollment, type RosterCourse } from './training-compliance-roster-plan';
import { canReuseMatriculaCycle, ensureMatriculaCycle, hasActiveMatriculaCycle, resetMatriculaForNewCycle } from './lms-matricula-cycle';
import { stampLmsEnrollmentEvidenceProfile } from './training-compliance-evidence-profile';
import { registrarAuditoria } from '../utils/auditoria';
import { canUseLegacyAutomatedLmsCourse, hasLiveNativeLmsActivationTable } from './training-compliance-native-lms-evidence';
import type { TrainingComplianceSnapshot } from '../routes/compliance-treinamentos';

export const ROSTER_RECONCILIATION_TENANT = 6;
export const ROSTER_RECONCILIATION_BATCH = 20;
export type BuildRosterSnapshot = (
  db: D1Database,
  empresaId: number,
  access: { mode: 'all'; setorIds: []; funcionarioId: null },
) => Promise<TrainingComplianceSnapshot>;

const ALL_ACCESS: { mode: 'all'; setorIds: []; funcionarioId: null } = { mode: 'all', setorIds: [], funcionarioId: null };

export async function readTrainingRosterPlan(
  db: D1Database, empresaId: number, buildSnapshot: BuildRosterSnapshot,
) {
  if (empresaId !== ROSTER_RECONCILIATION_TENANT) throw new Error('ROSTER_TENANT_NOT_AUTHORIZED');
  const activationTable = await hasLiveNativeLmsActivationTable(db);
  const nativeMarkerExclusion = activationTable
    ? 'AND NOT EXISTS (SELECT 1 FROM lms_native_catalog_activation a WHERE a.empresa_id=c.empresa_id AND a.curso_id=c.id)'
    : '';
  const [snapshot, courses, enrollments] = await Promise.all([
    buildSnapshot(db, empresaId, ALL_ACCESS),
    db.prepare(`SELECT c.id,c.qualificacao_tipo_id,c.ativo,c.publicado FROM lms_cursos c
      JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id
      WHERE c.empresa_id=? AND c.deleted_at IS NULL
        AND LOWER(TRIM(COALESCE(c.tipo_conteudo,''))) <> 'native'
        ${nativeMarkerExclusion}
        AND qt.ativo=1 AND qt.deleted_at IS NULL
        AND UPPER(TRIM(COALESCE(qt.categoria,''))) IN ('EAD','TREINAMENTO EAD')`)
      .bind(empresaId).all<RosterCourse>(),
    db.prepare(`SELECT m.id,m.funcionario_id,m.curso_id,m.status,m.deleted_at,
        m.progresso_pct,m.data_inicio,m.data_conclusao,m.qualificacao_historico_id,
        EXISTS(SELECT 1 FROM lms_progresso_scorm s WHERE s.matricula_id=m.id AND s.empresa_id=m.empresa_id) has_scorm,
        EXISTS(SELECT 1 FROM lms_xapi_statements x WHERE x.matricula_id=m.id AND x.empresa_id=m.empresa_id) has_xapi,
        EXISTS(SELECT 1 FROM qualificacoes_historico h WHERE h.lms_matricula_id=m.id AND h.empresa_id=m.empresa_id AND h.deleted_at IS NULL) has_history,
        EXISTS(SELECT 1 FROM lms_completion_diagnostics_snapshots d WHERE d.matricula_id=m.id AND d.empresa_id=m.empresa_id) has_diagnostics,
        EXISTS(SELECT 1 FROM lms_matricula_ciclos cy WHERE cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
          AND cy.deleted_at IS NULL AND (COALESCE(cy.progresso_pct,0)>0 OR cy.data_inicio IS NOT NULL
            OR cy.data_conclusao IS NOT NULL OR cy.qualificacao_historico_id IS NOT NULL
            OR cy.historico_importado_id IS NOT NULL OR UPPER(TRIM(COALESCE(cy.status,''))) NOT IN ('NAO_INICIADO','CANCELADO'))) has_cycle_evidence
       FROM lms_matriculas m WHERE m.empresa_id=?`)
      .bind(empresaId).all<RosterEnrollment>(),
  ]);
  let keep = new Set<number>();
  if (await hasSchemaTable(db, 'treinamento_matricula_reconciliacoes')) {
    const list = await db.prepare(`SELECT matricula_id FROM treinamento_matricula_reconciliacoes
      WHERE empresa_id=? AND ativo=1 AND deleted_at IS NULL AND decisao='MANTER_AVULSA'`)
      .bind(empresaId).all<{matricula_id:number}>();
    keep = new Set((list.results || []).map(row=>Number(row.matricula_id)));
  }
  const plan = buildTrainingComplianceRosterPlan(
    snapshot, courses.results || [], enrollments.results || [], keep,
  );
  const material = [
    ...plan.enroll.map(r=>`E:${r.funcionarioId}:${r.cursoId}:${r.existingId ?? 0}`),
    ...plan.remove.map(r=>`R:${r.matriculaId}:${r.motivo}`),
  ].sort().join('|');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  const hash = [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const countByCourse = new Map<number,{curso_id:number;matricular:number;retirar:number}>();
  for (const action of plan.enroll) {
    const r = countByCourse.get(action.cursoId) || {curso_id:action.cursoId,matricular:0,retirar:0};
    r.matricular++; countByCourse.set(action.cursoId,r);
  }
  for (const action of plan.remove) {
    const r = countByCourse.get(action.cursoId) || {curso_id:action.cursoId,matricular:0,retirar:0};
    r.retirar++; countByCourse.set(action.cursoId,r);
  }
  return {
    plan, hash,
    resumo: {
      funcionarios_avaliados: snapshot.people.length,
      para_matricular: plan.enroll.length,
      para_retirar: plan.remove.length,
      protegidas_por_evidencia_ou_decisao: plan.protectedCount,
      cursos_ambiguos_ou_indisponiveis: plan.skippedAmbiguousCourses,
      comprovacoes_em_revisao: plan.skippedPendingEvidence,
      modalidade_nao_ead: plan.skippedManualModality,
      por_curso: [...countByCourse.values()].sort((a,b)=>a.curso_id-b.curso_id),
    },
  };
}

async function retireUnusedEnrollment(db: D1Database, empresaId: number, id: number, reason: string) {
  // A zero-progress Native cycle is still Native and cannot be silently
  // cancelled as a stray SCORM row by this legacy roster reconciler.
  const target = await db.prepare('SELECT curso_id FROM lms_matriculas WHERE id=? AND empresa_id=?')
    .bind(id, empresaId).first<{curso_id:number}>();
  if (!target || !(await canUseLegacyAutomatedLmsCourse(db,empresaId,target.curso_id))) return false;
  // A single D1 batch binds the row-state preflight, soft removal and audit together.
  // Never remove any SCORM/xAPI, LMS progress, diagnostic or qualification evidence.
  const batch = await db.batch([
    db.prepare(`UPDATE lms_matriculas SET status='CANCELADO',
      deleted_at=datetime('now'),updated_at=datetime('now')
      WHERE id=? AND empresa_id=? AND deleted_at IS NULL
        AND UPPER(TRIM(COALESCE(status,'')))='NAO_INICIADO'
        AND COALESCE(progresso_pct,0)=0 AND data_inicio IS NULL
        AND data_conclusao IS NULL AND qualificacao_historico_id IS NULL
        AND NOT EXISTS(SELECT 1 FROM lms_progresso_scorm s WHERE s.empresa_id=? AND s.matricula_id=lms_matriculas.id)
        AND NOT EXISTS(SELECT 1 FROM lms_xapi_statements x WHERE x.empresa_id=? AND x.matricula_id=lms_matriculas.id)
        AND NOT EXISTS(SELECT 1 FROM lms_completion_diagnostics_snapshots d WHERE d.empresa_id=? AND d.matricula_id=lms_matriculas.id)
        AND NOT EXISTS(SELECT 1 FROM qualificacoes_historico h WHERE h.empresa_id=? AND h.lms_matricula_id=lms_matriculas.id AND h.deleted_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM lms_matricula_ciclos cy WHERE cy.empresa_id=? AND cy.matricula_id=lms_matriculas.id
          AND cy.deleted_at IS NULL AND (COALESCE(cy.progresso_pct,0)>0 OR cy.data_inicio IS NOT NULL
          OR cy.data_conclusao IS NOT NULL OR cy.qualificacao_historico_id IS NOT NULL OR cy.historico_importado_id IS NOT NULL
          OR UPPER(TRIM(COALESCE(cy.status,''))) NOT IN ('NAO_INICIADO','CANCELADO')))`)
      .bind(id,empresaId,empresaId,empresaId,empresaId,empresaId,empresaId),
    db.prepare(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
      SELECT NULL,'LMS_ROSTER_RECONCILIATION','lms_matriculas',?,
         '{"status":"NAO_INICIADO"}',?, ?,datetime('now') WHERE changes()=1`)
      .bind(id,JSON.stringify({status:'CANCELADO',deleted_at:true,reason}),empresaId),
    db.prepare(`UPDATE lms_matricula_ciclos SET status='CANCELADO',updated_at=datetime('now')
      WHERE empresa_id=? AND matricula_id=? AND ciclo_atual=1 AND deleted_at IS NULL
        AND EXISTS(SELECT 1 FROM lms_matriculas m WHERE m.id=? AND m.empresa_id=? AND m.deleted_at IS NOT NULL)`)
      .bind(empresaId,id,id,empresaId),
    db.prepare(`UPDATE notificacoes_inapp SET deleted_at=COALESCE(deleted_at,datetime('now'))
      WHERE empresa_id=? AND referencia_tipo='lms_matricula' AND referencia_id=?
        AND tipo IN ('lms_nova_matricula','lms_renovacao_automatica') AND deleted_at IS NULL`)
      .bind(empresaId,String(id)),
  ]);
  return Number(batch[0]?.meta?.changes || 0) === 1;
}

async function ensureRequiredEnrollment(
  db:D1Database, empresaId:number, action:RosterPlan['enroll'][number],
) {
  if (!(await canUseLegacyAutomatedLmsCourse(db,empresaId,action.cursoId))) return false;
  const existing = await db.prepare(`SELECT id,status,deleted_at FROM lms_matriculas
    WHERE empresa_id=? AND funcionario_id=? AND curso_id=?
    ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,id DESC LIMIT 1`)
    .bind(empresaId,action.funcionarioId,action.cursoId)
    .first<{id:number;status:string;deleted_at:string|null}>();
  if (hasActiveMatriculaCycle(existing)) return false;
  let id:number;
  if (existing) {
    if (!canReuseMatriculaCycle(existing)) throw new Error('ROSTER_UNSAFE_EXISTING_CYCLE');
    const cycle = await resetMatriculaForNewCycle(db, {
      empresaId,matriculaId:existing.id,origin:'AUTO_RENOVACAO',
      observacoes:'Matrícula necessária conforme cargo/matriz e evidência do Compliance (sem e-mail)',
    });
    if (!cycle) throw new Error('ROSTER_REACTIVATION_CYCLE_MISSING');
    id=existing.id;
  } else {
    const inserted = await db.prepare(`INSERT INTO lms_matriculas
      (empresa_id,funcionario_id,curso_id,observacoes)
      VALUES (?,?,?,'Matrícula necessária conforme cargo/matriz e evidência do Compliance (sem e-mail)')`)
      .bind(empresaId,action.funcionarioId,action.cursoId).run();
    id=Number(inserted.meta.last_row_id || 0);
    if (!id || !(await ensureMatriculaCycle(db,{empresaId,matriculaId:id,origin:'AUTO_RENOVACAO'}))) {
      throw new Error('ROSTER_ENROLLMENT_CYCLE_MISSING');
    }
  }
  await stampLmsEnrollmentEvidenceProfile(db,{
    empresaId,matriculaId:id,funcionarioId:action.funcionarioId,
    qualificacaoTipoId:action.tipoId,
  });
  await registrarAuditoria({
    db,tabela:'lms_matriculas',acao:existing?'UPDATE':'INSERT',registro_id:id,
    dados_novos:{empresa_id:empresaId,curso_id:action.cursoId,origem:'CARGO_COMPLIANCE',email_enviado:false},
  });
  return true;
}

export async function applyTrainingRosterPlan(
  db:D1Database,empresaId:number,plan:RosterPlan,limit:number=ROSTER_RECONCILIATION_BATCH,
) {
  if (empresaId !== ROSTER_RECONCILIATION_TENANT) throw new Error('ROSTER_TENANT_NOT_AUTHORIZED');
  if (!(await hasSchemaTable(db,'audit_logs'))) throw new Error('ROSTER_AUDIT_LOGS_MISSING');
  const budget=Math.min(ROSTER_RECONCILIATION_BATCH,Math.max(1,Math.trunc(limit)));
  let removed=0, enrolled=0, ignored=0;
  // Retire proved-zero-progress ghost rows first; never write outside this tenant.
  for (const action of plan.remove.slice(0,budget)) {
    if (await retireUnusedEnrollment(db,empresaId,action.matriculaId,action.motivo)) removed++;
    else ignored++;
  }
  for (const action of plan.enroll.slice(0,Math.max(0,budget-plan.remove.length))) {
    if (await ensureRequiredEnrollment(db,empresaId,action)) enrolled++;
    else ignored++;
  }
  return { removed,enrolled,ignored,remaining_estimate:Math.max(0,plan.remove.length+plan.enroll.length-removed-enrolled-ignored),email_enviado:false };
}
