/** Original SCORM 1.2 learner admission; isolated from the legacy god-file. */
import {Hono} from 'hono';
import type {Context} from 'hono';
import type {Env} from '../types';
import {hasRole} from '../middleware/rbac';
import {ApiError} from '../middleware/error-handler';
import {getEmpresaIdSafe} from './escalas-shared';
import {getCallerUserId} from './lms-matriculas-audit';
import {resolveScormPlayer3Admission} from '../services/lms-scorm-player3-admission';

const app=new Hono<{Bindings:Env}>();
async function scopedEmployee(c:Context,db:D1Database):Promise<number|null>{
  const claim=c.get('funcionarioId' as never) as unknown;
  const num=typeof claim==='string'?Number(claim):claim;
  if(typeof num==='number'&&Number.isSafeInteger(num)&&num>0)return num;
  const userId=getCallerUserId(c);
  if(!userId)return null;
  const row=await db.prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(userId).first<{funcionario_id:number|null}>();
  return row?.funcionario_id&&Number.isSafeInteger(row.funcionario_id)&&row.funcionario_id>0
    ?row.funcionario_id:null;
}

app.get('/:id/player3-scorm-admissao', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('id'));
  if (!Number.isSafeInteger(matriculaId) || matriculaId < 1)
    throw new ApiError('Matrícula inválida', 400);
  const enrollment = await db.prepare(
    'SELECT m.id, m.funcionario_id, m.status, c.id AS curso_id, ' +
    'c.tipo_conteudo, c.scorm_versao, c.scorm_package_r2_prefix, ' +
    'c.ativo, c.publicado ' +
    'FROM lms_matriculas m JOIN lms_cursos c ' +
    'ON c.id=m.curso_id AND c.empresa_id=m.empresa_id ' +
    'WHERE m.id=? AND m.empresa_id=? AND m.deleted_at IS NULL ' +
    'AND c.deleted_at IS NULL'
  ).bind(matriculaId, empresaId).first<{
    id: number; funcionario_id: number; status: string;
    curso_id: number; tipo_conteudo: string | null;
    scorm_versao: string | null; scorm_package_r2_prefix: string | null;
    ativo: number; publicado: number;
  }>();
  if (!enrollment) throw new ApiError('Matrícula não encontrada', 404);
  const canManage = hasRole(c, 'admin', 'manager');
  if (!canManage) {
    const callerId = await scopedEmployee(c, db);
    if (!callerId || enrollment.funcionario_id !== callerId)
      throw new ApiError('Acesso negado', 403);
    if (enrollment.ativo !== 1 || enrollment.publicado !== 1)
      throw new ApiError('Curso não disponível', 403);
  }
  if (enrollment.status === 'CANCELADO')
    throw new ApiError('Matrícula cancelada', 403);
  const decision = await resolveScormPlayer3Admission({
    env: c.env, db, bucket: c.env.BUCKET,
    tenant: empresaId, course: enrollment.curso_id,
    scormVersion: enrollment.scorm_versao,
    contentType: enrollment.tipo_conteudo,
    activePrefix: enrollment.scorm_package_r2_prefix,
    // Production review needs independently verified governance, not a
    // manifest field or a learner-supplied boolean.
    reviewedForProduction: false,
  });
  if (decision.kind === 'LEGACY')
    return c.json({success: false, code: 'SCORM_PLAYER3_NOT_APPLICABLE'}, 404);
  if (decision.kind === 'BLOCKED')
    return c.json({success: false, code: decision.reason}, 409);
  return c.json({
    success: true,
    data: {
      mode: 'SCORM_STUDY', matricula_id: matriculaId,
      curso_id: enrollment.curso_id,
      package_sha256: decision.packageSha256,
      package_version: decision.packageVersion,
      completion_authorized: false, exam_authorized: false,
      certificate_authorized: false,
    },
  });
});
export default app;
