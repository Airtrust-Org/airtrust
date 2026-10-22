import type { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { getCallerUserId } from './lms-matriculas-audit';
import { getEmpresaIdSafe } from './escalas-shared';
import { detectLmsEditionMismatch } from '../services/lms-edition-mismatch';
import { readScormActiveResumeProposal } from '../services/lms-scorm-active-resume-readonly';
import { writeScormEditionHandoff } from '../services/lms-scorm-edition-handoff-writer';

export function registerLmsScormEditionHandoffRoute(app: Hono<{Bindings:Env}>): void {
  // Same-cycle transition. The client can request the operation but cannot
  // supply a target package, resume plan, or operation scope.
  app.post('/:id/scorm-edition-handoff', requireRole('admin'), async (c) => {
    if (c.env.LMS_SCORM_EDITION_HANDOFF_ENABLED !== 'true') {
      throw new ApiError('Continuidade entre edições SCORM ainda não está habilitada', 404);
    }
    const db = c.env.DB;
    const empresaId = getEmpresaIdSafe(c);
    const matriculaId = Number(c.req.param('id'));
    if (!Number.isSafeInteger(matriculaId) || matriculaId <= 0) {
      throw new ApiError('ID de matrícula inválido', 400);
    }
    const row = await db.prepare(`
      SELECT m.id,m.curso_id,m.status,m.data_inicio,m.qualificacao_historico_id,
        cy.id AS ciclo_id,cy.data_inicio AS cycle_started_at,
        c.tipo_conteudo,c.scorm_package_r2_prefix,p.package_sha256,
        ps.cmi_json
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
      .first<{id:number;curso_id:number;status:string;data_inicio:string|null;
        qualificacao_historico_id:number|null;ciclo_id:number;cycle_started_at:string|null;
        tipo_conteudo:string;scorm_package_r2_prefix:string;package_sha256:string;
        cmi_json:string|null}>();
    if (!row) throw new ApiError('Matrícula, ciclo ou pacote ativo não elegível', 409);
    const mismatch = await detectLmsEditionMismatch({
      bucket:c.env.BUCKET,contentType:row.tipo_conteudo,
      activePrefix:row.scorm_package_r2_prefix,empresaId,cursoId:Number(row.curso_id),
      cmiJson:row.cmi_json,db,enrollmentStartedAt:row.data_inicio,
    });
    if (!mismatch) throw new ApiError('A matrícula não exige reconciliação de edição', 409);
    const proposal = await readScormActiveResumeProposal({
      db,bucket:c.env.BUCKET,empresaId,cursoId:Number(row.curso_id),
      cycleId:Number(row.ciclo_id),activePrefix:row.scorm_package_r2_prefix,
      cycleStartedAt:row.cycle_started_at,cmiJson:row.cmi_json,
    });
    if (!proposal || proposal.status === 'INVALID_ACTIVE_PACKAGE' ||
        proposal.activePackageSha256 !== row.package_sha256 ||
        proposal.canMarkComplete !== false || proposal.canTransferScore !== false) {
      throw new ApiError('Plano de retomada ou hash do pacote ativo não pôde ser verificado', 409);
    }
    const actorId = getCallerUserId(c);
    if (!actorId) throw new ApiError('Usuário executor não identificado', 401);
    const operationId = `scorm-handoff:${empresaId}:${matriculaId}:${row.ciclo_id}:${row.package_sha256}`;
    const receipt = await writeScormEditionHandoff(db, {
      empresaId,matriculaId,actorId,operationId,targetSha256:row.package_sha256,
      resumePlanJson:JSON.stringify(proposal),
    });
    return c.json({success:true,data:receipt});
  });
}
