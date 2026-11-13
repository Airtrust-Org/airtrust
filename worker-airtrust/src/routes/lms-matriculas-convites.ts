import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { requirePermission } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from '../utils/tenant-resolution';
import { employeeSectorSql, getEmployeeSectorAccess } from '../middleware/employee-sector-access';
import { logAudit } from '../utils/db';
import { maskTrainingContact } from '../services/training-communication-history';
import { readSameDayTrainingAlerts, SameDayTrainingAlerts } from '../services/training-alert-same-day';
import {
  reserveTrainingAlert,
  commitTrainingAlertReservation,
} from '../services/training-alert-reservation';
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
type MatriculaAuditAction = 'LMS_MATRICULA_CONVITE_EMAIL' | 'LMS_MATRICULA_ALERTA' |
  'LMS_MATRICULA_CONVITE_EMAIL_PREPARADO' | 'LMS_MATRICULA_ALERTA_PREPARADO';

export type MatriculaDeliveryOutcome = {
  emailStatus: MatriculaDeliveryStatus | null;
  whatsappStatus: MatriculaDeliveryStatus | null;
  auditPrepared: boolean;
  auditFinal: boolean;
};

const ConviteMatriculaLoteSchema = z.object({
  matricula_ids: z.array(z.number().int().positive()).min(1).max(200),
  modo: z.enum(['convite', 'alerta']).optional().default('convite'),
  reenviar_hoje: z.boolean().optional().default(false),
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
  action: MatriculaAuditAction,
  values: Record<string, unknown>,
): Promise<boolean> {
  try {
    await logAudit(db, {
      userId: getCallerUserId(c),
      action,
      entityType: 'lms_matriculas',
      entityId: matriculaId,
      newValues: values,
      empresaId: getEmpresaIdSafe(c),
      ipAddress: c.req.header('cf-connecting-ip') ?? undefined,
      userAgent: c.req.header('user-agent') ?? undefined,
    });
    return true;
  } catch (error) {
    createLogger(c, 'LmsMatriculas.audit').error('lms_matricula_audit_failed', toError(error), {
      matriculaId,
      action,
    });
    return false;
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
    onDestination?: (masked: string) => void;
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

    params.onDestination?.(maskTrainingContact(funcionario.email) || '***');

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
    onDestination?: (masked: string) => void;
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

    params.onDestination?.(maskTrainingContact(funcionario.telefone) || '***');

    const cursoUrl =
      (await resolveTrainingAccessUrl(env, db, {
        empresaId: params.empresaId,
        funcionarioId: params.funcionarioId,
        cursoId: params.cursoId,
      })) ||
      `${String(env.FRONTEND_URL || 'https://airtrust.online').replace(/\/$/, '')}/lms/cursos/${params.cursoId}`;

    const templateKey = 'ead_enrollment_reminder' as const;
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

type AlertableEnrollment = {
  id: number;
  funcionario_id: number;
  curso_id: number;
  qualificacao_tipo_id: number | null;
  data_expiracao: string | null;
  status: string;
  curso_titulo: string;
  email: string | null;
  telefone: string | null;
};

async function loadAlertableEnrollments(
  db: D1Database,
  empresaId: number,
  ids: number[],
  access: Awaited<ReturnType<typeof getEmployeeSectorAccess>>,
  eadOnly = false,
) {
  const placeholders = ids.map(() => '?').join(',');
  const scope = employeeSectorSql(access, 'f');
  return db.prepare(
    `SELECT m.id,m.funcionario_id,m.curso_id,c.qualificacao_tipo_id,m.data_expiracao,m.status,
            c.titulo AS curso_titulo,f.email,f.telefone
       FROM lms_matriculas m
       JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id AND c.deleted_at IS NULL
       JOIN funcionarios f ON f.id=m.funcionario_id AND f.empresa_id=m.empresa_id
       LEFT JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id AND qt.deleted_at IS NULL
      WHERE m.empresa_id=? AND m.id IN (${placeholders}) AND m.deleted_at IS NULL
        AND UPPER(COALESCE(m.status,'')) IN ('NAO_INICIADO','EM_ANDAMENTO')
        AND f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
        AND ${eadOnly ? "UPPER(TRIM(COALESCE(c.categoria, qt.categoria, ''))) IN ('EAD','TREINAMENTO EAD')" : '1=1'}
        AND ${scope.clause}`,
  ).bind(empresaId, ...ids, ...scope.bindings).all<AlertableEnrollment>();
}

function alertIdentity(row: AlertableEnrollment) {
  return {
    funcionario_id: Number(row.funcionario_id),
    qualificacao_tipo_id: row.qualificacao_tipo_id,
    curso_id: Number(row.curso_id),
  };
}

app.post('/lote/preview', requirePermission('lms', 'criar', 'admin', 'manager'), async (c) => {
  const parsed = ConviteMatriculaLoteSchema.safeParse(await c.req.json<unknown>());
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
  if (parsed.data.modo !== 'alerta') throw new ApiError('Prévia disponível apenas para alertas', 400);
  const channels = {
    email: parsed.data.canais?.email ?? true,
    whatsapp: parsed.data.canais?.whatsapp ?? false,
  };
  if (!channels.email && !channels.whatsapp) throw new ApiError('Selecione e-mail e/ou WhatsApp', 400);
  const ids = [...new Set(parsed.data.matricula_ids)];
  const empresaId = getEmpresaIdSafe(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const [enrollments, history] = await Promise.all([
    loadAlertableEnrollments(c.env.DB, empresaId, ids, access, true),
    readSameDayTrainingAlerts(c.env.DB, empresaId, access),
  ]);
  const rows = enrollments.results || [];
  return c.json({
    success: true,
    data: {
      selecionados: ids.length,
      processados: rows.length,
      email_ja_alertado: channels.email
        ? rows.filter((row) => history.wasSent(alertIdentity(row), 'EMAIL')).length : 0,
      email_pendente_historico: channels.email
        ? rows.filter((row) => history.isPending(alertIdentity(row), 'EMAIL')).length : 0,
      whatsapp_ja_alertado: channels.whatsapp
        ? rows.filter((row) => history.wasSent(alertIdentity(row), 'WHATSAPP')).length : 0,
      whatsapp_pendente_historico: channels.whatsapp
        ? rows.filter((row) => history.isPending(alertIdentity(row), 'WHATSAPP')).length : 0,
    },
  });
});
/**
 * Registra a intenção duravelmente antes de qualquer envio externo. Se o D1
 * falhar nesse ponto, não há despacho. Se falhar após aceitação pelo provedor,
 * a intenção permanece consultável e o resultado não pode ser confirmado.
 * ENVIADO = aceitação do provedor, nunca leitura/entrega pelo funcionário.
 */
export async function sendMatriculaTracked(
  c: Context,
  env: Env,
  db: D1Database,
  matriculaId: number,
  params: {
    funcionarioId: number;
    empresaId: number;
    cursoId: number;
    cursoTitulo: string;
    dataExpiracao?: string | null;
    statusMatricula?: string | null;
    isNovoCiclo: boolean;
    modo?: MatriculaMessageMode;
    canais?: { email: boolean; whatsapp: boolean };
    reenvioConfirmadoHoje?: boolean;
  },
): Promise<MatriculaDeliveryOutcome> {
  const channels = params.canais ?? { email: true, whatsapp: false };
  const mode = params.modo || 'convite';
  const action: 'LMS_MATRICULA_ALERTA' | 'LMS_MATRICULA_CONVITE_EMAIL' =
    mode === 'alerta' ? 'LMS_MATRICULA_ALERTA' : 'LMS_MATRICULA_CONVITE_EMAIL';
  const tentativaId = crypto.randomUUID();
  const values = {
    tentativa_id: tentativaId,
    modo: mode,
    canais: channels,
    reenvio_confirmado_hoje: params.reenvioConfirmadoHoje === true,
    curso_id: params.cursoId,
    curso_titulo: params.cursoTitulo,
    funcionario_id: params.funcionarioId,
    status_matricula: params.statusMatricula ?? null,
  };
  const auditPrepared = await logInviteAudit(
    db, c, matriculaId, `${action}_PREPARADO`,
    { ...values, email_resultado: channels.email ? 'PENDENTE' : null,
      whatsapp_resultado: channels.whatsapp ? 'PENDENTE' : null },
  );
  if (!auditPrepared) {
    return { emailStatus: null, whatsappStatus: null, auditPrepared: false, auditFinal: false };
  }
  let emailDestination: string | null = null;
  let whatsappDestination: string | null = null;
  const emailStatus = channels.email
    ? await sendMatriculaEmail(c, env, db, {
      funcionarioId: params.funcionarioId,
      empresaId: params.empresaId,
      cursoId: params.cursoId,
      cursoTitulo: params.cursoTitulo,
      dataExpiracao: params.dataExpiracao,
      isNovoCiclo: params.isNovoCiclo,
      modo: mode,
      statusMatricula: params.statusMatricula,
      onDestination: (masked) => { emailDestination = masked; },
    })
    : null;
  const whatsappStatus = channels.whatsapp
    ? await sendMatriculaWhatsApp(c, env, db, {
      funcionarioId: params.funcionarioId,
      empresaId: params.empresaId,
      cursoId: params.cursoId,
      cursoTitulo: params.cursoTitulo,
      dataExpiracao: params.dataExpiracao,
      statusMatricula: params.statusMatricula,
      onDestination: (masked) => { whatsappDestination = masked; },
    })
    : null;
  const auditFinal = await logInviteAudit(db, c, matriculaId, action, {
    ...values, email_resultado: emailStatus, whatsapp_resultado: whatsappStatus,
    email_destinatario_mascarado: emailStatus === 'ENVIADO' || emailStatus === 'FALHA'
      ? emailDestination : null,
    whatsapp_destinatario_mascarado: whatsappStatus === 'ENVIADO' || whatsappStatus === 'FALHA'
      ? whatsappDestination : null,
  });
  return { emailStatus, whatsappStatus, auditPrepared: true, auditFinal };
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

  const access = await getEmployeeSectorAccess(c, empresaId);
  const { results } = await loadAlertableEnrollments(db, empresaId, ids, access, mode === 'alerta');

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
    email_ja_alertado: 0,
    whatsapp_ja_alertado: 0,
    email_pendente_historico: 0,
    whatsapp_pendente_historico: 0,
    auditoria_preparo_falhas: 0,
    auditoria_resultado_pendente: 0,
  };

  const rows = results || [];
  const history = mode === 'alerta'
    ? await readSameDayTrainingAlerts(db, empresaId, access)
    : null;
  const attempted = new SameDayTrainingAlerts([], '');
  for (let index = 0; index < rows.length; index += 5) {
    const batch = rows.slice(index, index + 5);
    // Reserve each logical channel before concurrent requests inside the batch.
    // Previously accepted notices are skipped unless explicitly overridden.
    const candidates = batch.map((row) => {
      const identity = alertIdentity(row);
      const emailPending = mode === 'alerta' && channels.email &&
        Boolean(history?.isPending(identity, 'EMAIL'));
      const whatsappPending = mode === 'alerta' && channels.whatsapp &&
        Boolean(history?.isPending(identity, 'WHATSAPP'));
      // Uma intenção PREPARADO sem resultado não pode ser forçada pelo checkbox.
      // A confirmação de reenvio aplica-se apenas a aceites registrados, não a indeterminações.
      const emailDuplicate = mode === 'alerta' && channels.email &&
        (emailPending || attempted.wasSent(identity, 'EMAIL') ||
          (!parsed.data.reenviar_hoje && Boolean(history?.wasSent(identity, 'EMAIL'))));
      const whatsappDuplicate = mode === 'alerta' && channels.whatsapp &&
        (whatsappPending || attempted.wasSent(identity, 'WHATSAPP') ||
          (!parsed.data.reenviar_hoje && Boolean(history?.wasSent(identity, 'WHATSAPP'))));
      if (emailDuplicate) summary.email_ja_alertado += 1;
      if (whatsappDuplicate) summary.whatsapp_ja_alertado += 1;
      if (emailPending) summary.email_pendente_historico += 1;
      if (whatsappPending) summary.whatsapp_pendente_historico += 1;
      if (channels.email && !emailDuplicate) attempted.markAccepted(identity, 'EMAIL');
      if (channels.whatsapp && !whatsappDuplicate) attempted.markAccepted(identity, 'WHATSAPP');
      return { row, emailDuplicate, whatsappDuplicate };
    });
    const outcomes = await Promise.all(
      candidates.map(async ({ row, emailDuplicate, whatsappDuplicate }) => {
        let emailEnabled = channels.email && !emailDuplicate;
        let whatsappEnabled = channels.whatsapp && !whatsappDuplicate;

        let emailReservationKey: string | null = null;
        let whatsappReservationKey: string | null = null;

        if (mode === 'alerta' && emailEnabled) {
          const res = await reserveTrainingAlert(db, {
            empresaId,
            target: alertIdentity(row),
            channel: 'EMAIL',
            reenviarHoje: parsed.data.reenviar_hoje,
            destinatarioMascarado: maskTrainingContact(row.email),
            origem: 'LMS_ALERTA',
          }).catch(() => null);

          if (res?.reserved) {
            emailReservationKey = res.key;
          } else if (res) {
            emailEnabled = false;
            if (res.reason === 'pending_indeterminate') {
              summary.email_pendente_historico += 1;
            } else {
              summary.email_ja_alertado += 1;
            }
          } else {
            // D1 pode ter gravado a reserva antes de falhar: NUNCA despachar sem confirmação.
            emailEnabled = false;
            summary.auditoria_preparo_falhas += 1;
          }
        }

        if (mode === 'alerta' && whatsappEnabled) {
          const res = await reserveTrainingAlert(db, {
            empresaId,
            target: alertIdentity(row),
            channel: 'WHATSAPP',
            reenviarHoje: parsed.data.reenviar_hoje,
            destinatarioMascarado: maskTrainingContact(row.telefone),
            origem: 'LMS_ALERTA',
          }).catch(() => null);

          if (res?.reserved) {
            whatsappReservationKey = res.key;
          } else if (res) {
            whatsappEnabled = false;
            if (res.reason === 'pending_indeterminate') {
              summary.whatsapp_pendente_historico += 1;
            } else {
              summary.whatsapp_ja_alertado += 1;
            }
          } else {
            whatsappEnabled = false;
            summary.auditoria_preparo_falhas += 1;
          }
        }

        // Nenhum novo despacho, logo não criar evento PREPARADO para os canais já aceitos.
        if (!emailEnabled && !whatsappEnabled) {
          return { emailStatus: null, whatsappStatus: null, auditPrepared: true, auditFinal: true };
        }
        const outcome = await sendMatriculaTracked(c, c.env, db, Number(row.id), {
          funcionarioId: Number(row.funcionario_id),
          empresaId,
          cursoId: Number(row.curso_id),
          cursoTitulo: row.curso_titulo,
          dataExpiracao: row.data_expiracao,
          statusMatricula: row.status,
          isNovoCiclo: false,
          modo: mode,
          canais: { email: emailEnabled, whatsapp: whatsappEnabled },
          reenvioConfirmadoHoje: mode === 'alerta' && parsed.data.reenviar_hoje,
        });

        let reservationFinalized = true;
        if (mode === 'alerta') {
          if (emailReservationKey) {
            const emailOutcome = outcome.emailStatus === 'ENVIADO'
              ? 'enviada'
              : outcome.emailStatus === 'SEM_EMAIL'
                ? 'sem_contato'
                : !outcome.auditPrepared
                  ? 'erro' // Preparation failed before any provider call: safe to retry.
                  : !outcome.auditFinal
                    ? 'resultado_indeterminado'
                    : 'erro';
            await commitTrainingAlertReservation(db, {
              empresaId,
              notificationKey: emailReservationKey,
              outcome: emailOutcome,
              destinatarioMascarado: maskTrainingContact(row.email),
            }).catch(() => { reservationFinalized = false; });
          }
          if (whatsappReservationKey) {
            const whatsappOutcome = outcome.whatsappStatus === 'ENVIADO'
              ? 'enviada'
              : outcome.whatsappStatus === 'SEM_WHATSAPP'
                ? 'sem_contato'
                : !outcome.auditPrepared
                  ? 'erro' // Preparation failed before any provider call: safe to retry.
                  : !outcome.auditFinal
                    ? 'resultado_indeterminado'
                    : 'erro';
            await commitTrainingAlertReservation(db, {
              empresaId,
              notificationKey: whatsappReservationKey,
              outcome: whatsappOutcome,
              destinatarioMascarado: maskTrainingContact(row.telefone),
            }).catch(() => { reservationFinalized = false; });
          }
        }

        // A mensagem pode ter sido aceita, mas a reserva segue pendente.
        // Nunca reportar sucesso irrestrito se a finalização da trilha falhou.
        return reservationFinalized ? outcome : { ...outcome, auditFinal: false };
      }),
    );

    for (const outcome of outcomes) {
      if (!outcome.auditPrepared) summary.auditoria_preparo_falhas += 1;
      else if (!outcome.auditFinal) summary.auditoria_resultado_pendente += 1;
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

  const auditIncomplete = summary.auditoria_preparo_falhas > 0 ||
    summary.auditoria_resultado_pendente > 0;
  return c.json({
    success: !auditIncomplete,
    data: summary,
    ...(auditIncomplete ? { error: 'Registro de avisos incompleto. Alguns envios podem ter sido aceitos; consulte o histórico antes de reenviar.' } : {}),
  });
});

export default app;
