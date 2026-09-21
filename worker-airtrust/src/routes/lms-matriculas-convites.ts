import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { requirePermission } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from './escalas-shared';
import { employeeSectorSql, getEmployeeSectorAccess } from '../services/employee-sector-access';
import { logAudit } from '../utils/db';
import { sendEmail } from '../lib/email';
import type { Env } from '../types';
import { createLogger, toError } from '../utils/logger';
import { resolveTrainingAccessUrl } from '../utils/lms-training-link';

const app = new Hono<{ Bindings: Env }>();

const ConviteMatriculaLoteSchema = z.object({
  matricula_ids: z.array(z.number().int().positive()).min(1).max(200),
});

function getCallerUserId(c: Context): number | undefined {
  const raw = c.get('userId' as never) as unknown;
  const parsed = typeof raw === 'string' ? Number(raw) : (raw as number | null | undefined);
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : undefined;
}

async function logInviteAudit(
  db: D1Database,
  c: Context,
  matriculaId: number,
  values: Record<string, unknown>,
) {
  try {
    await logAudit(db, {
      userId: getCallerUserId(c),
      action: 'LMS_MATRICULA_CONVITE_EMAIL',
      entityType: 'lms_matriculas',
      entityId: matriculaId,
      newValues: values,
      ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? undefined,
      userAgent: c.req.header('user-agent') ?? undefined,
    });
  } catch (error) {
    createLogger(c, 'LmsMatriculas.audit').error('lms_matricula_audit_failed', toError(error), {
      matriculaId,
      action: 'LMS_MATRICULA_CONVITE_EMAIL',
    });
  }
}

export async function sendMatriculaEmail(
  c: Context,
  env: Env,
  db: D1Database,
  params: {
    funcionarioId: number;
    empresaId: number;
    cursoId: number;
    cursoTitulo: string;
    dataExpiracao?: string | null;
    isNovoCiclo: boolean;
  },
): Promise<'ENVIADO' | 'SEM_EMAIL' | 'FALHA'> {
  try {
    const funcionario = await db
      .prepare(
        `SELECT nome, email FROM funcionarios
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(params.funcionarioId, params.empresaId)
      .first<{ nome: string; email: string | null }>();

    if (!funcionario?.email) {
      createLogger(c, 'LmsMatriculas.email').info('lms_matricula_email_missing', {
        funcionarioId: params.funcionarioId,
        cursoId: params.cursoId,
        empresaId: params.empresaId,
      });
      return 'SEM_EMAIL';
    }

    const cursoUrl =
      (await resolveTrainingAccessUrl(env, db, {
        empresaId: params.empresaId,
        funcionarioId: params.funcionarioId,
        cursoId: params.cursoId,
      })) ||
      `${String(env.FRONTEND_URL || 'https://airtrust.online').replace(/\/$/, '')}/lms/cursos/${params.cursoId}`;
    const nomeAluno = funcionario.nome || `Funcionário ${params.funcionarioId}`;
    const actionLabel = params.isNovoCiclo ? 'Novo ciclo de treinamento' : 'Novo treinamento';
    const validadeLinha = params.dataExpiracao
      ? `<p><strong>Prazo de conclusão:</strong> ${params.dataExpiracao.split('-').reverse().join('/')}</p>`
      : '';
    const htmlContent = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1e40af;margin-bottom:16px">${actionLabel}</h2>
        <p>Olá <strong>${nomeAluno}</strong>,</p>
        <p>Você foi matriculado no curso:</p>
        <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:12px 16px;margin:12px 0;border-radius:4px">
          <p style="font-size:16px;font-weight:600;margin:0;color:#1e3a5f">${params.cursoTitulo}</p>
        </div>
        ${validadeLinha}
        <p>Para acessar o curso, clique no botão abaixo:</p>
        <p style="margin:24px 0"><a href="${cursoUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Acessar curso</a></p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">Este e-mail foi enviado automaticamente pela plataforma AirTrust.</p>
      </div>`;
    const textContent = [
      `${actionLabel}: ${params.cursoTitulo}`,
      '',
      `Olá ${nomeAluno},`,
      '',
      `Você foi matriculado no curso: ${params.cursoTitulo}`,
      params.dataExpiracao ? `Prazo de conclusão: ${params.dataExpiracao.split('-').reverse().join('/')}` : '',
      '',
      `Acesse o curso em: ${cursoUrl}`,
      '',
      'Este e-mail foi enviado automaticamente pela plataforma AirTrust.',
    ].filter(Boolean).join('\n');

    const sent = await sendEmail(env, {
      to: [{ email: funcionario.email, name: nomeAluno }],
      subject: `${actionLabel}: ${params.cursoTitulo}`,
      textContent,
      htmlContent,
    });
    if (sent) {
      createLogger(c, 'LmsMatriculas.email').info('lms_matricula_email_sent', {
        funcionarioId: params.funcionarioId,
        cursoId: params.cursoId,
        empresaId: params.empresaId,
      });
      return 'ENVIADO';
    }
    return 'FALHA';
  } catch (error) {
    createLogger(c, 'LmsMatriculas.email').error('lms_matricula_email_failed', toError(error), {
      funcionarioId: params.funcionarioId,
      cursoId: params.cursoId,
      empresaId: params.empresaId,
    });
    return 'FALHA';
  }
}

app.post('/lote', requirePermission('lms', 'criar', 'admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const parsed = ConviteMatriculaLoteSchema.safeParse(await c.req.json<unknown>());
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);

  const ids = [...new Set(parsed.data.matricula_ids)];
  const placeholders = ids.map(() => '?').join(',');
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = employeeSectorSql(access, 'f');
  const { results } = await db
    .prepare(
      `SELECT m.id,m.funcionario_id,m.curso_id,m.data_expiracao,c.titulo AS curso_titulo
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id AND c.deleted_at IS NULL
         JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
        WHERE m.empresa_id=? AND m.id IN (${placeholders}) AND m.deleted_at IS NULL
          AND UPPER(COALESCE(m.status,'')) IN ('NAO_INICIADO','EM_ANDAMENTO')
          AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
          AND ${scope.clause}`,
    )
    .bind(empresaId, ...ids, ...scope.bindings)
    .all<{ id: number; funcionario_id: number; curso_id: number; data_expiracao: string | null; curso_titulo: string }>();

  const encontrados = new Set((results || []).map((row) => Number(row.id)));
  const summary = {
    enviados: 0,
    sem_email: 0,
    falhas: 0,
    nao_encontradas: ids.filter((id) => !encontrados.has(id)).length,
  };
  for (const row of results || []) {
    const status = await sendMatriculaEmail(c, c.env, db, {
      funcionarioId: Number(row.funcionario_id),
      empresaId,
      cursoId: Number(row.curso_id),
      cursoTitulo: row.curso_titulo,
      dataExpiracao: row.data_expiracao,
      isNovoCiclo: false,
    });
    if (status === 'ENVIADO') summary.enviados += 1;
    else if (status === 'SEM_EMAIL') summary.sem_email += 1;
    else summary.falhas += 1;
    await logInviteAudit(db, c, Number(row.id), {
      resultado: status,
      curso_id: row.curso_id,
      funcionario_id: row.funcionario_id,
    });
  }
  return c.json({ success: true, data: summary });
});

export default app;
