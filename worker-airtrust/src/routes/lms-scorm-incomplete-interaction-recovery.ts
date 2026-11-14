import type { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { hasRole } from '../middleware/rbac';
import { resolveLmsFuncionarioId } from '../services/lms-learner-identity';
import { getEmpresaIdSafe } from '../utils/tenant-resolution';
import { getCallerUserId } from './lms-matriculas-audit';
import type { Env } from '../types';
import {
  isTenantScopedScormPrefix, readActiveCompletionManifest,
} from '../services/lms-completion-manifest-evidence';
import {
  parseImmutableCourseModel, planIncompleteInteractionRecovery,
} from '../services/lms-scorm-incomplete-interaction-recovery';

type RecoveryRow = {
  id: number;
  curso_id: number;
  funcionario_id: number;
  status: string;
  scorm_assessment_policy: string;
  scorm_package_r2_prefix: string;
  cmi_json: string | null;
  suspend_data: string | null;
  lesson_status: string | null;
};

async function sha256(source: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export function registerLmsIncompleteInteractionRecoveryRoute(app: Hono<{Bindings:Env}>): void {
  // Reopens only proven missing authored decisions; no grades, completed units,
  // qualification, certificate or status are ever added. Tenant-scoped and
  // learner-owned, with server-derived manifest and active package identity.
  app.post('/:id/scorm-missing-interactions-recover', async (c) => {
    if (c.env.LMS_SCORM_EDITION_HANDOFF_ENABLED !== 'true') {
      throw new ApiError('Recuperação SCORM não habilitada', 404);
    }
    const empresaId = getEmpresaIdSafe(c);
    const matriculaId = Number(c.req.param('id'));
    if (!Number.isSafeInteger(matriculaId) || matriculaId <= 0) {
      throw new ApiError('Matrícula inválida', 400);
    }
    const actorId = getCallerUserId(c);
    if (!actorId) throw new ApiError('Executor não identificado', 401);
    const db = c.env.DB;
    const row = await db.prepare(`
      SELECT m.id,m.curso_id,m.funcionario_id,m.status,
        c.scorm_assessment_policy,c.scorm_package_r2_prefix,
        ps.cmi_json,ps.suspend_data,ps.lesson_status
      FROM lms_matriculas m
      JOIN lms_matricula_ciclos cy ON cy.empresa_id=m.empresa_id
        AND cy.matricula_id=m.id AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
      JOIN lms_cursos c ON c.empresa_id=m.empresa_id AND c.id=m.curso_id
        AND c.deleted_at IS NULL AND c.tipo_conteudo='scorm'
      JOIN lms_scorm_package_versions v ON v.empresa_id=c.empresa_id
        AND v.curso_id=c.id AND v.r2_prefix=c.scorm_package_r2_prefix AND v.status='ACTIVE'
      JOIN lms_progresso_scorm ps ON ps.empresa_id=m.empresa_id AND ps.matricula_id=m.id
      WHERE m.empresa_id=? AND m.id=? AND m.deleted_at IS NULL
        AND m.status='EM_ANDAMENTO' AND m.qualificacao_historico_id IS NULL
      LIMIT 1`)
      .bind(empresaId,matriculaId).first<RecoveryRow>();
    if (!row || row.scorm_assessment_policy !== 'FORMATIVE') {
      throw new ApiError('Matrícula ou política não elegível à recuperação', 409);
    }
    if (!hasRole(c, 'admin')) {
      const ownId = await resolveLmsFuncionarioId(db, c.get('userId' as never), empresaId);
      if (!ownId || Number(ownId) !== Number(row.funcionario_id)) {
        throw new ApiError('Acesso negado', 403);
      }
    }
    const prefix = row.scorm_package_r2_prefix;
    if (!c.env.BUCKET || !isTenantScopedScormPrefix(prefix,empresaId,Number(row.curso_id))) {
      throw new ApiError('Pacote ativo indisponível', 409);
    }
    const manifest = await readActiveCompletionManifest({
      bucket:c.env.BUCKET,empresaId,cursoId:Number(row.curso_id),activePrefix:prefix,
    });
    if (!manifest) throw new ApiError('Manifesto do pacote não verificável', 409);
    const modelObject = await c.env.BUCKET.get(`${prefix.endsWith('/') ? prefix : prefix+'/'}course-model.js`);
    if (!modelObject || modelObject.size > 750_000) {
      throw new ApiError('Modelo do pacote não verificável', 409);
    }
    const model = parseImmutableCourseModel(await modelObject.text());
    const plan = planIncompleteInteractionRecovery({
      manifest,model,cmiJson:row.cmi_json,suspendData:row.suspend_data,
      enrollmentStatus:row.status,lessonStatus:row.lesson_status,
    });
    if (!plan || !row.cmi_json || !row.suspend_data) {
      throw new ApiError('Não há interações incompletas recuperáveis nesta edição', 409);
    }
    const oldHash = await sha256(row.cmi_json);
    const newHash = await sha256(plan.cmiJson);
    const oldAudit = JSON.stringify({source:'SCORM_V4_AUTHORED_STATE',
      hash:oldHash,done_units:plan.previousDoneCount});
    const newAudit = JSON.stringify({source:'SCORM_V4_AUTHORED_STATE',hash:newHash,
      done_units:plan.remainingDoneCount,resume_position:plan.resumePosition,
      missing_slide_ids:plan.missingSlideIds,
      conclusion_granted:false,score_changed:false,certificate_generated:false});

    // SQLite/D1 batch is atomic. The original CMI is an optimistic lock, and
    // the current package must remain ACTIVE. Every later update depends on
    // the newly written state. A concurrent learner commit cannot be replaced.
    const responses = await db.batch([
      db.prepare(`
        UPDATE lms_progresso_scorm
          SET cmi_json=?,suspend_data=?,updated_at=datetime('now')
        WHERE empresa_id=? AND matricula_id=? AND lesson_status='incomplete'
          AND cmi_json=? AND suspend_data=?
          AND EXISTS (
            SELECT 1 FROM lms_matriculas m
            JOIN lms_cursos c ON c.empresa_id=m.empresa_id AND c.id=m.curso_id
            JOIN lms_scorm_package_versions v ON v.empresa_id=c.empresa_id AND v.curso_id=c.id
              AND v.r2_prefix=c.scorm_package_r2_prefix AND v.status='ACTIVE'
            WHERE m.empresa_id=? AND m.id=? AND m.status='EM_ANDAMENTO'
              AND m.qualificacao_historico_id IS NULL AND c.scorm_package_r2_prefix=?
          )`)
        .bind(plan.cmiJson,plan.suspendData,empresaId,matriculaId,row.cmi_json,row.suspend_data,
          empresaId,matriculaId,prefix),
      db.prepare(`
        UPDATE lms_matriculas SET ultimo_slide=?,ultima_pagina=?,updated_at=datetime('now')
        WHERE empresa_id=? AND id=? AND status='EM_ANDAMENTO'
          AND qualificacao_historico_id IS NULL
          AND EXISTS(SELECT 1 FROM lms_progresso_scorm ps
            WHERE ps.empresa_id=? AND ps.matricula_id=? AND ps.cmi_json=?)`)
        .bind(plan.resumePosition,plan.resumePosition,empresaId,matriculaId,
          empresaId,matriculaId,plan.cmiJson),
      db.prepare(`
        INSERT INTO audit_logs
          (user_id,action,entity_type,entity_id,old_values,new_values,empresa_id,created_at)
        SELECT ?,'SCORM_MISSING_DECISION_RECOVERY','lms_matriculas',?,?,?, ?,datetime('now')
        WHERE EXISTS(SELECT 1 FROM lms_progresso_scorm ps
          WHERE ps.empresa_id=? AND ps.matricula_id=? AND ps.cmi_json=?)
          AND EXISTS(SELECT 1 FROM lms_matriculas m WHERE m.empresa_id=? AND m.id=?
            AND m.ultimo_slide=? AND m.status='EM_ANDAMENTO')`)
        .bind(actorId,matriculaId,oldAudit,newAudit,empresaId,
          empresaId,matriculaId,plan.cmiJson,empresaId,matriculaId,plan.resumePosition),
    ]);
    if (responses.length !== 3 || responses.some(r => !r.success)) {
      throw new ApiError('Não foi possível verificar a gravação SCORM', 409);
    }
    // D1 batch metadata may report cumulative or driver-dependent changes.
    // A previous deployment returned 409 AFTER committing all three writes
    // to the actual database. Instead, verify the exact resulting enrollment,
    // SCORM CMI and durable audit receipt. This also fails closed if an
    // optimistic CAS lost the race, with no false positive completion.
    const verified = await db.prepare(`
      SELECT 1 AS acknowledged
      FROM lms_matriculas m
      JOIN lms_progresso_scorm ps
        ON ps.empresa_id=m.empresa_id AND ps.matricula_id=m.id
      JOIN audit_logs a ON a.empresa_id=m.empresa_id
        AND a.entity_type='lms_matriculas'
        AND a.entity_id=CAST(m.id AS TEXT)
        AND a.action='SCORM_MISSING_DECISION_RECOVERY'
        AND a.user_id=?
        AND a.old_values=?
        AND a.new_values=?
      WHERE m.empresa_id=? AND m.id=? AND m.status='EM_ANDAMENTO'
        AND m.qualificacao_historico_id IS NULL
        AND m.ultimo_slide=? AND m.ultima_pagina=?
        AND ps.lesson_status='incomplete'
        AND ps.cmi_json=? AND ps.suspend_data=?
      LIMIT 1`)
      .bind(actorId,oldAudit,newAudit,empresaId,matriculaId,
        plan.resumePosition,plan.resumePosition,plan.cmiJson,plan.suspendData)
      .first<{acknowledged:number}>();
    if (verified?.acknowledged !== 1) {
      throw new ApiError('Estado SCORM mudou durante a recuperação; reabra a matrícula', 409);
    }
    return c.json({success:true,data:{
      matricula_id:matriculaId,resume_position:plan.resumePosition,
      missing_scenarios:plan.missingSlideIds.length,
      status:'EM_ANDAMENTO',qualification_granted:false,
    }});
  });
}
