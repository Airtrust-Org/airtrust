/**
 * AIRTRUST QA-only governed LMS replay. Exclusively for the canonical,
 * synthetic tenant-6 learner. Reuses the audited, atomic cycle renewal
 * service; preserves prior LMS, CMI, xAPI and qualification evidence.
 */
import type { Hono } from 'hono';
import type { Env } from '../types';
import { requireRole } from '../middleware/rbac';
import { getEmpresaIdSafe } from '../utils/tenant-resolution';
import { resetMatriculaForNewCycle } from '../services/lms-matricula-cycle';

const COMPANY_ID = 6;
const QA_MATRICULA = 'QA-LMS-202611';
const QA_EMAIL = 'qa.lms.202611@airtrust.online';
const QA_NAME = 'AIRTRUST_QA_LMS_E2E_202611';
export const QA_CONFIRMATION = 'AIRTRUST_QA_LMS_NEW_CYCLE';

export function canResetCanonicalQaCycle(candidate: {
  companyId: number; name: string; matricula: string; email: string;
  courseId: number; expectedCourseId: number; status: string; currentCycleId: number;
}): boolean {
  return candidate.companyId === COMPANY_ID &&
    candidate.name === QA_NAME &&
    candidate.matricula === QA_MATRICULA &&
    candidate.email.toLowerCase() === QA_EMAIL &&
    Number.isSafeInteger(candidate.courseId) && candidate.courseId > 0 &&
    candidate.courseId === candidate.expectedCourseId &&
    Number.isSafeInteger(candidate.currentCycleId) && candidate.currentCycleId > 0 &&
    ['CONCLUIDO','REPROVADO'].includes(candidate.status.toUpperCase());
}

export function registerLmsQaCycleRoute(app: Hono<{ Bindings: Env }>): void {
  app.post('/:id/qa-novo-ciclo', requireRole('admin'), async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    if (empresaId !== COMPANY_ID) {
      return c.json({ success:false,code:'QA_COMPANY_NOT_ALLOWLISTED' },403);
    }
    const matriculaId = Number(c.req.param('id'));
    if (!Number.isSafeInteger(matriculaId) || matriculaId <= 0) {
      return c.json({success:false,code:'QA_ENROLLMENT_ID_INVALID'},400);
    }
    let body: Record<string, unknown>;
    try {
      const candidate = await c.req.json();
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return c.json({success:false,code:'QA_RESET_BODY_INVALID'},400);
      }
      body = candidate as Record<string,unknown>;
    } catch {
      return c.json({success:false,code:'QA_RESET_BODY_INVALID'},400);
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const expectedCourseId = Number(body.expected_course_id);
    if (body.confirmation !== QA_CONFIRMATION || reason.length < 24 || reason.length > 500 ||
      !Number.isSafeInteger(expectedCourseId) || expectedCourseId <= 0) {
      return c.json({success:false,code:'QA_RESET_CONFIRMATION_REQUIRED'},400);
    }
    const row = await c.env.DB.prepare(
      `SELECT m.id,m.curso_id,m.status,m.funcionario_id,
              f.nome,f.matricula,f.email,
              cy.id AS current_cycle_id
         FROM lms_matriculas m
         JOIN funcionarios f ON f.id=m.funcionario_id
           AND f.empresa_id=m.empresa_id AND f.deleted_at IS NULL
         JOIN usuarios u ON u.funcionario_id=f.id
           AND u.email=? AND u.deleted_at IS NULL AND u.active=1
         LEFT JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id
           AND cy.empresa_id=m.empresa_id AND cy.ciclo_atual=1
           AND cy.deleted_at IS NULL
        WHERE m.id=? AND m.empresa_id=? AND m.deleted_at IS NULL
        LIMIT 1`,
    ).bind(QA_EMAIL,matriculaId,COMPANY_ID).first<{
      id:number;curso_id:number;status:string;funcionario_id:number;
      nome:string;matricula:string;email:string;current_cycle_id:number|null;
    }>();
    if (!row || !canResetCanonicalQaCycle({
      companyId:empresaId,name:row.nome,matricula:row.matricula,
      email:row.email,courseId:Number(row.curso_id),expectedCourseId,
      status:String(row.status),currentCycleId:Number(row.current_cycle_id),
    })) {
      return c.json({success:false,code:'QA_CYCLE_SCOPE_OR_STATUS_DENIED'},409);
    }

    let newCycleId: number | null = null;
    try {
      newCycleId = await resetMatriculaForNewCycle(c.env.DB,{
        empresaId:COMPANY_ID,matriculaId,origin:'MANUAL',observacoes:reason,
        matriculadoPor:Number(c.get('userId' as never)||0)||null,
      });
    } catch {
      return c.json({success:false,code:'QA_CYCLE_ATOMIC_RENEWAL_REJECTED'},409);
    }

    const readback = await c.env.DB.prepare(
      `SELECT m.status,m.qualificacao_historico_id,cy.id AS cycle_id
         FROM lms_matriculas m JOIN lms_matricula_ciclos cy
           ON cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
           AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
        WHERE m.id=? AND m.empresa_id=? AND m.funcionario_id=?
          AND m.deleted_at IS NULL LIMIT 1`,
    ).bind(matriculaId,COMPANY_ID,row.funcionario_id).first<{
      status:string;qualificacao_historico_id:number|null;cycle_id:number;
    }>();
    if (!readback || readback.status !== 'NAO_INICIADO' ||
        readback.qualificacao_historico_id !== null ||
        Number(readback.cycle_id) !== Number(newCycleId) ||
        Number(newCycleId) === Number(row.current_cycle_id)) {
      return c.json({success:false,code:'QA_CYCLE_POSTCONDITION_FAILED'},503);
    }
    return c.json({success:true,data:{
      matricula_id:matriculaId,curso_id:expectedCourseId,
      funcionario_id:row.funcionario_id,new_cycle_id:newCycleId,
      status:'NAO_INICIADO',previous_cycle_archived:true,
    }});
  });
}
