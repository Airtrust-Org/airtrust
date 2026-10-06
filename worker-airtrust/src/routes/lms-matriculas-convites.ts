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
import { sendWhatsAppMessage } from '../utils/whatsapp-send';
import {
  buildTrainingTemplateVariablesForDelivery,
  getAlertWhatsAppTemplateDefinition,
  renderTemplateBody,
} from '../utils/whatsapp-templates';
import {
  getLocalWhatsAppTemplateRecord,
  isWhatsAppTemplateApproved,
} from '../utils/alert-whatsapp-templates-store';

const app = new Hono<{ Bindings: Env }>();

type MatriculaDeliveryStatus = 'ENVIADO' | 'SEM_EMAIL' | 'SEM_WHATSAPP' | 'FALHA';
type MatriculaMessageMode = 'convite' | 'alerta';

const ConviteMatriculaLoteSchema = z.object({
  matricula_ids: z.array(z.number().int().positive()).min(1).max(200),
  modo: z.enum(['convite', 'alerta']).optional().default('convite'),
  canais: z
    .object({
      email: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
    })
    .optional(),
});

function getCallerUserId(c: Context): number | undefined {
  const raw = c.get('userId' as never) as unknown;
  const parsed = typeof raw === 'string' ? Number(raw) : (raw as number | null | undefined);
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : undefined;
}

function statusLabel(status: string | null | undefined): string {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'NAO_INICIADO') return 'Treinamento matriculado e ainda não iniciado';
  if (normalized === 'EM_ANDAMENTO') return 'Treinamento em andamento';
  return 'Treinamento pendente';
}

function formatDeadline(value: string | null | undefined): string {
  if (!value) return 'Sem prazo definido';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

async function logInviteAudit(
  db: D1Database,
  c: Context,
  matriculaId: number,
  action: 'LMS_MATRICULA_CONVITE_EMAIL' | 'LMS_MATRICULA_ALERTA',
  values: Record<string, unknown>,
) {
  try {
    await logAudit(db, {
      userId: getCallerUserId(c),
      action,
      entityType: 'lms_matriculas',
      entityId: matriculaId,
      newValues: values,
      empresaId: getEmpresaIdSafe(c),
      ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? undefined,
      userAgent: c.req.header('user-agent') ?? undefined,
    });
  } catch (error) {
    createLogger(c, 'LmsMatriculas.audit').error('lms_matricula_audit_failed', toError(error), {
      matriculaId,
      action,
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
    modo?: MatriculaMessageMode;
    statusMatricula?: string | null;
  },
): Promise<MatriculaDeliveryStatus> {
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
    const isAlert = params.modo === 'alerta';
    const actionLabel = isAlert
      ? 'Lembrete de treinamento'
      : params.isNovoCiclo
        ? 'Novo ciclo de treinamento'
        : 'Novo treinamento';
    const statusLinha = isAlert
      ? `<p><strong>Status:</strong> ${statusLabel(params.statusMatricula)}</p>`
      : '';
    const validadeLinha = params.dataExpiracao
      ? `<p><strong>Prazo de conclusão:</strong> ${formatDeadline(params.dataExpiracao)}</p>`
      : '';
    const intro = isAlert
      ? 'Você possui um treinamento matriculado que requer sua atenção:'
      : 'Você foi matriculado no curso:';
    const closing = isAlert
      ? 'Por favor, acesse o treinamento e dê continuidade o quanto antes.'
      : 'Para acessar o curso, clique no botão abaixo:';
    const buttonLabel = isAlert ? 'Acessar treinamento' : 'Acessar curso';
    const footerText = isAlert
      ? 'Esta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.'
      : 'Este e-mail foi enviado automaticamente pela plataforma AirTrust.';
    const htmlContent = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1e40af;margin-bottom:16px">${actionLabel}</h2>
        <p>Olá <strong>${nomeAluno}</strong>,</p>
        <p>${intro}</p>
        <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:12px 16px;margin:12px 0;border-radius:4px">
          <p style="font-size:16px;font-weight:600;margin:0;color:#1e3a5f">${params.cursoTitulo}</p>
        </div>
        ${statusLinha}
        ${validadeLinha}
        <p>${closing}</p>
        <p style="margin:24px 0"><a href="${cursoUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${buttonLabel}</a></p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">${footerText}</p>
      </div>`;
    const textContent = [
      `${actionLabel}: ${params.cursoTitulo}`,
      '',
      `Olá ${nomeAluno},`,
      '',
      isAlert
        ? `Você possui um treinamento matriculado que requer sua atenção: ${params.cursoTitulo}`
        : `Você foi matriculado no curso: ${params.cursoTitulo}`,
      isAlert ? `Status: ${statusLabel(params.statusMatricula)}` : '',
      params.dataExpiracao ? `Prazo de conclusão: ${formatDeadline(params.dataExpiracao)}` : '',
      '',
      isAlert ? 'Por favor, acesse o treinamento e dê continuidade o quanto antes.' : '',
      `Acesse diretamente o treinamento: ${cursoUrl}`,
      '',
      isAlert
        ? 'Esta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.'
        : 'Este e-mail foi enviado automaticamente pela plataforma AirTrust.',
    ]
      .filter(Boolean)
      .join('\n');

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
        modo: params.modo || 'convite',
      });
      return 'ENVIADO';
    }
    return 'FALHA';
  } catch (error) {
    createLogger(c, 'LmsMatriculas.email').error('lms_matricula_email_failed', toError(error), {
      funcionarioId: params.funcionarioId,
      cursoId: params.cursoId,
      empresaId: params.empresaId,
      modo: params.modo || 'convite',
    });
    return 'FALHA';
  }
}

export async function sendMatriculaWhatsApp(
  c: Context,
  env: Env,
  db: D1Database,
  params: {
    funcionarioId: number;
    empresaId: number;
    cursoId: number;
    cursoTitulo: string;
    dataExpiracao?: string | null;
    statusMatricula?: string | null;
  },
): Promise<MatriculaDeliveryStatus> {
  try {
    const funcionario = await db
      .prepare(
        `SELECT nome, telefone FROM funcionarios
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(params.funcionarioId, params.empresaId)
      .first<{ nome: string; telefone: string | null }>();

    if (!funcionario?.telefone) {
      createLogger(c, 'LmsMatriculas.whatsapp').info('lms_matricula_whatsapp_missing', {
        funcionarioId: params.funcionarioId,
        cursoId: params.cursoId,
        empresaId: params.empresaId,
      });
      return 'SEM_WHATSAPP';
    }

    const cursoUrl =
      (await resolveTrainingAccessUrl(env, db, {
        empresaId: params.empresaId,
        funcionarioId: params.funcionarioId,
        cursoId: params.cursoId,
      })) ||
      `${String(env.FRONTEND_URL || 'https://airtrust.online').replace(/\/$/, '')}/lms/cursos/${params.cursoId}`;

    const templateKey = 'ead_required' as const;
    const template = getAlertWhatsAppTemplateDefinition(templateKey);
    let localTemplate = null;
    try {
      localTemplate = await getLocalWhatsAppTemplateRecord(db, templateKey);
    } catch {
      localTemplate = null;
    }
    const approved = localTemplate && isWhatsAppTemplateApproved(localTemplate.approval_status);
    const deliveryBodyText =
      approved && localTemplate?.twilio_content_sid ? localTemplate.body_text : template?.bodyText;
    const variables = buildTrainingTemplateVariablesForDelivery({
      templateKey,
      templateBodyText: deliveryBodyText,
      funcionarioNome: funcionario.nome || `Funcionário ${params.funcionarioId}`,
      qualificacaoNome: params.cursoTitulo,
      dataVencimento: formatDeadline(params.dataExpiracao),
      statusVencimento: statusLabel(params.statusMatricula),
      trainingUrl: cursoUrl,
    });
    const fallbackMessage = [
      '*GERÊNCIA DE TREINAMENTO | COSTA DO SOL*',
      '',
      `Olá, ${funcionario.nome || `Funcionário ${params.funcionarioId}`}!`,
      '',
      'Você possui um treinamento matriculado que requer sua atenção:',
      '',
      `*Treinamento:* ${params.cursoTitulo}`,
      `*Prazo:* ${formatDeadline(params.dataExpiracao)}`,
      `*Status:* ${statusLabel(params.statusMatricula)}`,
      '',
      'Por favor, acesse o treinamento e dê continuidade o quanto antes.',
      '',
      '*Acesse diretamente o treinamento:*',
      cursoUrl,
      '',
      '*Esta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.*',
    ].join('\n');
    const rendered = deliveryBodyText
      ? renderTemplateBody(deliveryBodyText, variables)
      : fallbackMessage;

    await sendWhatsAppMessage(
      env,
      funcionario.telefone,
      rendered,
      undefined,
      approved && localTemplate?.twilio_content_sid
        ? {
            contentSid: localTemplate.twilio_content_sid,
            contentVariables: variables,
            templateKey,
            templateName: localTemplate.template_name,
            approvalStatus: localTemplate.approval_status,
          }
        : undefined,
    );
    createLogger(c, 'LmsMatriculas.whatsapp').info('lms_matricula_whatsapp_sent', {
      funcionarioId: params.funcionarioId,
      cursoId: params.cursoId,
      empresaId: params.empresaId,
    });
    return 'ENVIADO';
  } catch (error) {
    createLogger(c, 'LmsMatriculas.whatsapp').error(
      'lms_matricula_whatsapp_failed',
      toError(error),
      {
        funcionarioId: params.funcionarioId,
        cursoId: params.cursoId,
        empresaId: params.empresaId,
      },
    );
    return 'FALHA';
  }
}

app.post('/lote', requirePermission('lms', 'criar', 'admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const parsed = ConviteMatriculaLoteSchema.safeParse(await c.req.json<unknown>());
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);

  const ids = [...new Set(parsed.data.matricula_ids)];
  const mode = parsed.data.modo;
  const channels = {
    email: parsed.data.canais?.email ?? true,
    whatsapp: parsed.data.canais?.whatsapp ?? false,
  };
  if (!channels.email && !channels.whatsapp) {
    throw new ApiError('Selecione e-mail e/ou WhatsApp', 400);
  }
  if (mode === 'convite' && channels.whatsapp) {
    throw new ApiError('WhatsApp está disponível apenas para alertas de matrículas existentes', 400);
  }

  const placeholders = ids.map(() => '?').join(',');
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = employeeSectorSql(access, 'f');
  const { results } = await db
    .prepare(
      `SELECT m.id,m.funcionario_id,m.curso_id,m.data_expiracao,m.status,c.titulo AS curso_titulo
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
    .all<{
      id: number;
      funcionario_id: number;
      curso_id: number;
      data_expiracao: string | null;
      status: string;
      curso_titulo: string;
    }>();

  const encontrados = new Set((results || []).map((row) => Number(row.id)));
  const summary = {
    selecionados: ids.length,
    processados: (results || []).length,
    enviados: 0,
    sem_email: 0,
    falhas: 0,
    email_enviados: 0,
    email_falhas: 0,
    whatsapp_enviados: 0,
    sem_whatsapp: 0,
    whatsapp_falhas: 0,
    nao_encontradas: ids.filter((id) => !encontrados.has(id)).length,
  };

  const rows = results || [];
  for (let index = 0; index < rows.length; index += 5) {
    const batch = rows.slice(index, index + 5);
    const outcomes = await Promise.all(
      batch.map(async (row) => {
        const emailStatus = channels.email
          ? await sendMatriculaEmail(c, c.env, db, {
              funcionarioId: Number(row.funcionario_id),
              empresaId,
              cursoId: Number(row.curso_id),
              cursoTitulo: row.curso_titulo,
              dataExpiracao: row.data_expiracao,
              isNovoCiclo: false,
              modo: mode,
              statusMatricula: row.status,
            })
          : null;
        const whatsappStatus = channels.whatsapp
          ? await sendMatriculaWhatsApp(c, c.env, db, {
              funcionarioId: Number(row.funcionario_id),
              empresaId,
              cursoId: Number(row.curso_id),
              cursoTitulo: row.curso_titulo,
              dataExpiracao: row.data_expiracao,
              statusMatricula: row.status,
            })
          : null;

        await logInviteAudit(
          db,
          c,
          Number(row.id),
          mode === 'alerta' ? 'LMS_MATRICULA_ALERTA' : 'LMS_MATRICULA_CONVITE_EMAIL',
          {
            modo: mode,
            canais: channels,
            email_resultado: emailStatus,
            whatsapp_resultado: whatsappStatus,
            curso_id: row.curso_id,
            funcionario_id: row.funcionario_id,
            status_matricula: row.status,
          },
        );
        return { emailStatus, whatsappStatus };
      }),
    );

    for (const outcome of outcomes) {
      if (outcome.emailStatus === 'ENVIADO') summary.email_enviados += 1;
      else if (outcome.emailStatus === 'SEM_EMAIL') summary.sem_email += 1;
      else if (outcome.emailStatus === 'FALHA') summary.email_falhas += 1;

      if (outcome.whatsappStatus === 'ENVIADO') summary.whatsapp_enviados += 1;
      else if (outcome.whatsappStatus === 'SEM_WHATSAPP') summary.sem_whatsapp += 1;
      else if (outcome.whatsappStatus === 'FALHA') summary.whatsapp_falhas += 1;
    }
  }

  // Compatibilidade com consumidores existentes do convite por e-mail.
  summary.enviados = summary.email_enviados;
  summary.falhas = summary.email_falhas;

  return c.json({ success: true, data: summary });
});

export default app;
