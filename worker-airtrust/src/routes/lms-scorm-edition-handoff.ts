import type { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { hasRole } from '../middleware/rbac';
import { resolveLmsFuncionarioId } from '../services/lms-learner-identity';
import type { Env } from '../types';
import { getCallerUserId } from './lms-matriculas-audit';
import { getEmpresaIdSafe } from '../utils/tenant-resolution';
import { detectLmsEditionMismatch } from '../services/lms-edition-mismatch';
import { readScormActiveResumeProposal } from '../services/lms-scorm-active-resume-readonly';
import { writeScormEditionHandoff } from '../services/lms-scorm-edition-handoff-writer';
import { readActiveCompletionManifest } from '../services/lms-completion-manifest-evidence';
import { buildScormAdministrativeCredit } from '../services/lms-scorm-administrative-credit';
import { restorePriorEditionAdministrativeCredit } from '../services/lms-scorm-edition-credit-recovery';

export function registerLmsScormEditionHandoffRoute(app: Hono<{Bindings:Env}>): void {
  // Same-cycle transition. The client can request the operation but cannot
  // supply a target package, resume plan, or operation scope.
  // The learner who owns the enrollment may request the transition for their
  // own enrollment (everything else is derived and verified server-side).
  // Only admins may do it for someone else's enrollment: managers are bound to
  // sector scope elsewhere, so they follow the ownership rule like any learner.
  app.post('/:id/scorm-edition-handoff', async (c) => {
    if (c.env.LMS_SCORM_EDITION_HANDOFF_ENABLED !== 'true') {
      throw new ApiError('Continuidade entre edições SCORM ainda não está habilitada', 404);
    }
    const db = c.env.DB;
    const empresaId = getEmpresaIdSafe(c);
    const matriculaId = Number(c.req.param('id'));
    if (!Number.isSafeInteger(matriculaId) || matriculaId <= 0) {
      throw new ApiError('ID de matrícula inválido', 400);
    }
    const canManage = hasRole(c, 'admin');
    const row = await db.prepare(`
      SELECT m.id,m.funcionario_id,m.curso_id,m.status,m.progresso_pct,m.data_inicio,m.qualificacao_historico_id,
        cy.id AS ciclo_id,cy.data_inicio AS cycle_started_at,
        c.tipo_conteudo,c.scorm_package_r2_prefix,p.package_sha256,
        ps.cmi_json,ps.suspend_data
      FROM lms_matriculas m
      JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
        AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
      JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
        AND c.deleted_at IS NULL
      JOIN lms_scorm_package_versions p ON p.empresa_id=m.empresa_id
        AND p.curso_id=m.curso_id AND p.r2_prefix=c.scorm_package_r2_prefix
        AND p.status='ACTIVE'
      LEFT JOIN lms_progresso_scorm ps ON ps.matricula_id=m.id AND ps.empresa_id=m.empresa_id
      WHERE m.id=? AND m.empresa_id=? AND m.deleted_at IS NULL
        AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
        AND m.qualificacao_historico_id IS NULL AND c.tipo_conteudo='scorm'
      ORDER BY p.id DESC LIMIT 1`)
      .bind(matriculaId,empresaId)
      .first<{id:number;funcionario_id:number;curso_id:number;status:string;progresso_pct:number;data_inicio:string|null;
        qualificacao_historico_id:number|null;ciclo_id:number;cycle_started_at:string|null;
        tipo_conteudo:string;scorm_package_r2_prefix:string;package_sha256:string;
        cmi_json:string|null;suspend_data:string|null}>();
    if (!row) throw new ApiError('Matrícula, ciclo ou pacote ativo não elegível', 409);
    if (!canManage) {
      const callerFuncionarioId = await resolveLmsFuncionarioId(db, c.get('userId' as never), empresaId);
      if (!callerFuncionarioId || callerFuncionarioId !== Number(row.funcionario_id)) {
        throw new ApiError('Acesso negado', 403);
      }
    }
    const mismatch = await detectLmsEditionMismatch({
      bucket:c.env.BUCKET,contentType:row.tipo_conteudo,
      activePrefix:row.scorm_package_r2_prefix,empresaId,cursoId:Number(row.curso_id),matriculaId,
      cmiJson:row.cmi_json,suspendData:row.suspend_data,db,enrollmentStartedAt:row.data_inicio,
    });
    if (!mismatch) throw new ApiError('A matrícula não exige reconciliação de edição', 409);
    const proposal = await readScormActiveResumeProposal({
      db,bucket:c.env.BUCKET,empresaId,cursoId:Number(row.curso_id),
      matriculaId:Number(row.id),cycleId:Number(row.ciclo_id),
      activePrefix:row.scorm_package_r2_prefix,
      cycleStartedAt:row.cycle_started_at,cmiJson:row.cmi_json,suspendData:row.suspend_data,
      handoffHistoryEnabled:true,
    });
    const validResumeStatuses = ['MATCHED_ANCHOR','SUGGESTED_ANCHOR','START_ACTIVE'];
    if (!proposal || !validResumeStatuses.includes(proposal.status) ||
        proposal.cycleId !== Number(row.ciclo_id) || proposal.reviewRequired !== true ||
        !Number.isSafeInteger(proposal.activeTotal) || proposal.activeTotal < 1 ||
        !Number.isSafeInteger(proposal.targetPosition) || proposal.targetPosition < 1 ||
        proposal.targetPosition > proposal.activeTotal ||
        proposal.activePackageSha256 !== row.package_sha256 ||
        proposal.canMarkComplete !== false || proposal.canTransferScore !== false) {
      throw new ApiError('Plano de retomada ou hash do pacote ativo não pôde ser verificado', 409);
    }
    const actorId = getCallerUserId(c);
    if (!actorId) throw new ApiError('Usuário executor não identificado', 401);
    // Global owner policy: recognize prior-edition units as completed in the
    // active package. The waived units carry explicit administrative provenance;
    // quizzes, score, pass, certificate and qualification are never granted.
    const priorPct = Number(row.progresso_pct ?? 0);
    if (!Number.isSafeInteger(priorPct) || priorPct < 0 || priorPct > 100) {
      throw new ApiError('Progresso histórico inconsistente', 409);
    }
    let administrativeCredit: Parameters<typeof writeScormEditionHandoff>[1]['administrativeCredit'] = null;
    if (priorPct > 0) {
      const manifest = await readActiveCompletionManifest({
        bucket:c.env.BUCKET,empresaId,cursoId:Number(row.curso_id),
        activePrefix:row.scorm_package_r2_prefix,
      });
      if (!manifest || !manifest.packageVersion ||
          manifest.requiredSlideIds.length !== proposal.activeTotal ||
          proposal.activeTotal < 2) {
        throw new ApiError('Pacote ativo não permite creditar unidades com segurança', 409);
      }
      const credit = buildScormAdministrativeCredit({
        manifest,packageSha256:row.package_sha256,
        previousProgressPct:Math.min(99,priorPct),
        targetPosition:Math.max(2,proposal.targetPosition),
      });
      administrativeCredit={
        progressPct:credit.progressPct,position:Number(credit.location.split('/')[0]),
        total:manifest.requiredSlideIds.length,creditedUnits:credit.creditedUnits,
        suspendData:credit.suspendData,cmiJson:credit.cmiJson,
      };
    }
    const operationId = `scorm-handoff:${empresaId}:${matriculaId}:${row.ciclo_id}:${row.package_sha256}`;
    const receipt = await writeScormEditionHandoff(db, {
      empresaId,matriculaId,actorId,operationId,targetSha256:row.package_sha256,
      resumePlanJson:JSON.stringify(proposal),administrativeCredit,
    });
    return c.json({success:true,data:receipt});
  });

  // Existing 0566 handoffs (already reset to 0% before this policy) are
  // reconciled idempotently when the learner reopens the course. No client
  // input may set a percentage, cursor, grade or target edition.
  app.post('/:id/scorm-edition-admin-credit', async (c) => {
    if (c.env.LMS_SCORM_EDITION_HANDOFF_ENABLED !== 'true') {
      throw new ApiError('Reconciliação de edição SCORM desabilitada', 404);
    }
    const empresaId=getEmpresaIdSafe(c),matriculaId=Number(c.req.param('id'));
    const actorId=getCallerUserId(c);
    if(!Number.isSafeInteger(matriculaId)||matriculaId<=0||
       !actorId)throw new ApiError('Escopo de matrícula inválido',400);
    const isAdmin=hasRole(c,'admin');
    const callerFuncionarioId=isAdmin?null:await resolveLmsFuncionarioId(
      c.env.DB,c.get('userId' as never),empresaId);
    try {
      const receipt=await restorePriorEditionAdministrativeCredit({
        db:c.env.DB,bucket:c.env.BUCKET,empresaId,matriculaId,actorId,
        callerFuncionarioId,isAdmin,
      });
      return c.json({success:true,data:receipt});
    }catch(error){
      const reason=error instanceof Error?error.message:'SCORM_ADMIN_CREDIT_FAILED';
      if(reason==='SCORM_ADMIN_CREDIT_FORBIDDEN')throw new ApiError('Acesso negado',403);
      throw new ApiError('Não foi possível reconhecer as unidades anteriores: '+reason,409);
    }
  });
}
