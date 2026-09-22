import type { Env } from '../types';
import { sendEmailDetailed, type EmailSendResult } from '../lib/email';
import { sendWhatsAppMessage } from '../utils/whatsapp-send';
import {
  buildQualificacaoTemplateVariables,
  getAlertWhatsAppTemplateDefinition,
  renderTemplateBody,
  type AlertWhatsAppTemplateKey,
} from '../utils/whatsapp-templates';
import {
  getLocalWhatsAppTemplateRecord,
  isWhatsAppTemplateApproved,
} from '../utils/alert-whatsapp-templates-store';
import { resolveTrainingAccessUrl } from '../utils/lms-training-link';
import { getSetorGestoresBySetor } from './setores-gestores';

export type ComplianceNotificationPolicy = {
  enabled: boolean;
  email: boolean;
  whatsapp: boolean;
  due_day_thresholds: number[];
  never_done_every_days: number;
  notify_manager_on_overdue: boolean;
  manager_overdue_thresholds: number[];
};

export const DEFAULT_COMPLIANCE_NOTIFICATION_POLICY: ComplianceNotificationPolicy = {
  enabled: false,
  email: true,
  whatsapp: true,
  due_day_thresholds: [30, 15, 7, 0, -7, -15, -30],
  never_done_every_days: 7,
  notify_manager_on_overdue: true,
  manager_overdue_thresholds: [0, -7, -15, -30],
};

export type ComplianceNotificationTarget = {
  empresa_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_cpf: string | null;
  email: string | null;
  telefone: string | null;
  setor_id: number | null;
  setor_nome: string | null;
  qualificacao_tipo_id: number;
  qualificacao_nome: string;
  status_compliance: 'VENCENDO' | 'VENCIDO' | 'NAO_REALIZADO' | 'EM_ANDAMENTO' | 'CONFORME';
  data_validade: string | null;
  dias_para_vencer: number | null;
  evidencia_origem?: string | null;
  evidencia_id?: number | null;
};

export type ComplianceNotificationChannels = {
  email: boolean;
  whatsapp: boolean;
};

export type ComplianceNotificationResult = {
  funcionario_id: number;
  qualificacao_tipo_id: number;
  email: { attempted: boolean; ok: boolean; error?: string | null };
  whatsapp: { attempted: boolean; ok: boolean; error?: string | null };
};

function normalizePolicy(value: unknown): ComplianceNotificationPolicy {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const normalizeThresholds = (raw: unknown, fallback: number[]) => {
    if (!Array.isArray(raw)) return fallback;
    const values = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= -365 && n <= 365))];
    return values.length ? values.sort((a, b) => b - a) : fallback;
  };
  return {
    enabled: input.enabled === true,
    email: input.email !== false,
    whatsapp: input.whatsapp !== false,
    due_day_thresholds: normalizeThresholds(
      input.due_day_thresholds,
      DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.due_day_thresholds,
    ),
    never_done_every_days: Math.min(
      90,
      Math.max(1, Number(input.never_done_every_days) || DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.never_done_every_days),
    ),
    notify_manager_on_overdue: input.notify_manager_on_overdue !== false,
    manager_overdue_thresholds: normalizeThresholds(
      input.manager_overdue_thresholds,
      DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.manager_overdue_thresholds,
    ).filter((n) => n <= 0),
  };
}

async function readCoresTema(db: D1Database, empresaId: number): Promise<Record<string, unknown>> {
  const row = await db
    .prepare('SELECT cores_tema FROM empresas_config WHERE empresa_id = ? LIMIT 1')
    .bind(empresaId)
    .first<{ cores_tema: string | null }>();
  if (!row?.cores_tema) return {};
  try {
    const parsed = JSON.parse(row.cores_tema);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function getComplianceNotificationPolicy(
  db: D1Database,
  empresaId: number,
): Promise<ComplianceNotificationPolicy> {
  const cores = await readCoresTema(db, empresaId);
  const systemSettings =
    cores.system_settings && typeof cores.system_settings === 'object'
      ? (cores.system_settings as Record<string, unknown>)
      : {};
  return normalizePolicy(systemSettings.trainingComplianceNotifications);
}

export async function saveComplianceNotificationPolicy(
  db: D1Database,
  empresaId: number,
  policy: unknown,
): Promise<ComplianceNotificationPolicy> {
  const normalized = normalizePolicy(policy);
  const cores = await readCoresTema(db, empresaId);
  const currentSystem =
    cores.system_settings && typeof cores.system_settings === 'object'
      ? (cores.system_settings as Record<string, unknown>)
      : {};
  const next = {
    ...cores,
    system_settings: {
      ...currentSystem,
      trainingComplianceNotifications: normalized,
    },
  };
  await db
    .prepare(
      `INSERT INTO empresas_config (empresa_id, cores_tema, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(empresa_id) DO UPDATE SET
         cores_tema = excluded.cores_tema,
         updated_at = datetime('now')`,
    )
    .bind(empresaId, JSON.stringify(next))
    .run();
  return normalized;
}

function formatDateBr(value: string | null): string {
  if (!value) return 'Não realizado';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function statusText(target: ComplianceNotificationTarget): string {
  if (target.status_compliance === 'NAO_REALIZADO') return 'Treinamento obrigatório ainda não realizado';
  const days = target.dias_para_vencer;
  if (days == null) return target.status_compliance === 'VENCIDO' ? 'Treinamento vencido' : 'Requer atenção';
  if (days < 0) {
    const n = Math.abs(days);
    return `Vencido há ${n} ${n === 1 ? 'dia' : 'dias'}`;
  }
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence em 1 dia';
  return `Vence em ${days} dias`;
}

function marker(target: ComplianceNotificationTarget, triggerKey: string, manager = false): string {
  return `[${manager ? 'COMPLIANCE_GESTOR' : 'COMPLIANCE_TREINAMENTO'}:${target.qualificacao_tipo_id}:${triggerKey}]`;
}

async function resolveCourseLink(
  env: Env,
  db: D1Database,
  target: ComplianceNotificationTarget,
): Promise<string | null> {
  try {
    const row = await db
      .prepare(
        `SELECT id FROM lms_cursos
          WHERE empresa_id = ?
            AND qualificacao_tipo_id = ?
            AND deleted_at IS NULL
          ORDER BY COALESCE(ativo, 1) DESC, id DESC
          LIMIT 1`,
      )
      .bind(target.empresa_id, target.qualificacao_tipo_id)
      .first<{ id: number }>();
    if (!row?.id) return null;
    return await resolveTrainingAccessUrl(env, db, {
      empresaId: target.empresa_id,
      funcionarioId: target.funcionario_id,
      cursoId: Number(row.id),
    });
  } catch {
    return null;
  }
}

function plainMessage(target: ComplianceNotificationTarget, trainingUrl: string | null): string {
  const lines = [
    'GERÊNCIA DE TREINAMENTO | COSTA DO SOL',
    '',
    `Olá, ${target.funcionario_nome}!`,
    '',
    'Você possui um treinamento obrigatório que requer sua atenção:',
    `Treinamento: ${target.qualificacao_nome}`,
    `Vencimento: ${formatDateBr(target.data_validade)}`,
    `Status: ${statusText(target)}`,
    '',
    'Este treinamento faz parte dos requisitos obrigatórios de treinamento e conformidade da operação e é acompanhado pela Gerência de Treinamento, inclusive para fins de auditoria.',
    '',
    'Por favor, realize-o o quanto antes para manter sua situação regularizada.',
  ];
  if (trainingUrl) lines.push('', `Acesse diretamente o treinamento: ${trainingUrl}`);
  lines.push('', 'Mensagem automática da Gerência de Treinamento da Costa do Sol.');
  return lines.join('\n');
}

function htmlMessage(target: ComplianceNotificationTarget, trainingUrl: string | null): string {
  const button = trainingUrl
    ? `<p style="margin:22px 0"><a href="${trainingUrl}" style="background:#1d4ed8;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600">Acessar treinamento</a></p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55;max-width:640px;margin:auto">
    <h2 style="margin-bottom:6px">Gerência de Treinamento | Costa do Sol</h2>
    <p>Olá, <strong>${target.funcionario_nome}</strong>.</p>
    <p>Você possui um treinamento obrigatório que requer sua atenção.</p>
    <div style="background:#f8fafc;border-left:4px solid #d97706;padding:12px 16px;margin:16px 0">
      <div><strong>Treinamento:</strong> ${target.qualificacao_nome}</div>
      <div><strong>Vencimento:</strong> ${formatDateBr(target.data_validade)}</div>
      <div><strong>Status:</strong> ${statusText(target)}</div>
    </div>
    <p>Este treinamento integra os requisitos obrigatórios de treinamento e conformidade da operação e é acompanhado pela Gerência de Treinamento, inclusive para fins de auditoria.</p>
    <p>Realize-o o quanto antes para manter sua situação regularizada.</p>
    ${button}
    <p style="font-size:12px;color:#64748b;margin-top:24px">Mensagem automática da Gerência de Treinamento da Costa do Sol.</p>
  </div>`;
}

async function insertLog(
  db: D1Database,
  target: ComplianceNotificationTarget,
  params: {
    tipo: string;
    destinatario: string | null;
    triggerKey: string;
    ok: boolean;
    error?: string | null;
    manager?: boolean;
    message: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notificacoes_log (
        empresa_id, config_id, qualificacao_historico_id, funcionario_cpf,
        tipo, destinatario, assunto, corpo, status, erro_mensagem, enviado_em
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END)`,
    )
    .bind(
      target.empresa_id,
      target.evidencia_origem === 'QUALIFICACAO' ? target.evidencia_id || null : null,
      target.funcionario_cpf,
      params.tipo,
      params.destinatario,
      marker(target, params.triggerKey, params.manager),
      JSON.stringify({
        funcionario_id: target.funcionario_id,
        funcionario_nome: target.funcionario_nome,
        setor_id: target.setor_id,
        setor_nome: target.setor_nome,
        qualificacao_tipo_id: target.qualificacao_tipo_id,
        qualificacao_nome: target.qualificacao_nome,
        status_compliance: target.status_compliance,
        data_validade: target.data_validade,
        dias_para_vencer: target.dias_para_vencer,
        mensagem: params.message,
      }),
      params.ok ? 'enviada' : 'erro',
      params.error || null,
      params.ok ? 1 : 0,
    )
    .run();
}

async function sendEmailChannel(
  env: Env,
  db: D1Database,
  target: ComplianceNotificationTarget,
  triggerKey: string,
  trainingUrl: string | null,
): Promise<{ attempted: boolean; ok: boolean; error?: string | null }> {
  if (!target.email) return { attempted: false, ok: false, error: 'SEM_EMAIL' };
  const subject = `Treinamento obrigatório: ${target.qualificacao_nome} — ${statusText(target)}`;
  const message = plainMessage(target, trainingUrl);
  let result: EmailSendResult;
  try {
    result = await sendEmailDetailed(env, {
      to: [{ email: target.email, name: target.funcionario_nome }],
      subject,
      textContent: message,
      htmlContent: htmlMessage(target, trainingUrl),
    });
  } catch (error) {
    result = { ok: false, providerResponse: error instanceof Error ? error.message : String(error) };
  }
  await insertLog(db, target, {
    tipo: 'EMAIL_COMPLIANCE',
    destinatario: target.email,
    triggerKey,
    ok: result.ok,
    error: result.ok ? null : result.providerResponse || 'EMAIL_SEND_FAILED',
    message,
  });
  return { attempted: true, ok: result.ok, error: result.ok ? null : result.providerResponse || 'EMAIL_SEND_FAILED' };
}

async function sendWhatsappChannel(
  env: Env,
  db: D1Database,
  target: ComplianceNotificationTarget,
  triggerKey: string,
  trainingUrl: string | null,
): Promise<{ attempted: boolean; ok: boolean; error?: string | null }> {
  if (!target.telefone) return { attempted: false, ok: false, error: 'SEM_TELEFONE' };
  const templateKey: AlertWhatsAppTemplateKey =
    target.status_compliance === 'NAO_REALIZADO'
      ? 'ead_required'
      : target.status_compliance === 'VENCIDO'
        ? 'ead_expired'
        : 'ead_expiring';
  const template = getAlertWhatsAppTemplateDefinition(templateKey);
  const statusVariable = trainingUrl
    ? `${statusText(target)}\n\n*Acesse diretamente o treinamento:*\n${trainingUrl}`
    : statusText(target);
  const variables =
    target.status_compliance === 'NAO_REALIZADO'
      ? { '1': target.funcionario_nome, '2': target.qualificacao_nome, '3': statusVariable }
      : buildQualificacaoTemplateVariables({
          funcionarioNome: target.funcionario_nome,
          qualificacaoNome: target.qualificacao_nome,
          dataVencimento: formatDateBr(target.data_validade),
          statusVencimento: statusVariable,
        });
  const rendered = template ? renderTemplateBody(template.bodyText, variables) : plainMessage(target, trainingUrl);
  try {
    let localTemplate = null;
    try {
      localTemplate = await getLocalWhatsAppTemplateRecord(db, templateKey);
    } catch {
      localTemplate = null;
    }
    const approved = localTemplate && isWhatsAppTemplateApproved(localTemplate.approval_status);
    await sendWhatsAppMessage(
      env,
      target.telefone,
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
    await insertLog(db, target, {
      tipo: 'WHATSAPP_COMPLIANCE',
      destinatario: target.telefone,
      triggerKey,
      ok: true,
      message: rendered,
    });
    return { attempted: true, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await insertLog(db, target, {
      tipo: 'WHATSAPP_COMPLIANCE',
      destinatario: target.telefone,
      triggerKey,
      ok: false,
      error: message,
      message: rendered,
    });
    return { attempted: true, ok: false, error: message };
  }
}

export async function sendComplianceNotification(
  env: Env,
  db: D1Database,
  target: ComplianceNotificationTarget,
  channels: ComplianceNotificationChannels,
  triggerKey: string,
): Promise<ComplianceNotificationResult> {
  const trainingUrl = await resolveCourseLink(env, db, target);
  const email = channels.email
    ? await sendEmailChannel(env, db, target, triggerKey, trainingUrl)
    : { attempted: false, ok: false };
  const whatsapp = channels.whatsapp
    ? await sendWhatsappChannel(env, db, target, triggerKey, trainingUrl)
    : { attempted: false, ok: false };
  return {
    funcionario_id: target.funcionario_id,
    qualificacao_tipo_id: target.qualificacao_tipo_id,
    email,
    whatsapp,
  };
}

export async function hasSuccessfulComplianceLog(
  db: D1Database,
  target: ComplianceNotificationTarget,
  triggerKey: string,
  manager = false,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM notificacoes_log
        WHERE empresa_id = ? AND funcionario_cpf = ? AND assunto = ? AND status = 'enviada'
        LIMIT 1`,
    )
    .bind(target.empresa_id, target.funcionario_cpf, marker(target, triggerKey, manager))
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

export async function latestNeverDoneNotificationAt(
  db: D1Database,
  target: ComplianceNotificationTarget,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT COALESCE(enviado_em, created_at) AS sent_at FROM notificacoes_log
        WHERE empresa_id = ? AND funcionario_cpf = ?
          AND assunto LIKE ? AND status = 'enviada'
        ORDER BY COALESCE(enviado_em, created_at) DESC LIMIT 1`,
    )
    .bind(target.empresa_id, target.funcionario_cpf, `[COMPLIANCE_TREINAMENTO:${target.qualificacao_tipo_id}:NEVER_%`)
    .first<{ sent_at: string | null }>();
  return row?.sent_at || null;
}

export async function notifySectorManagersForOverdue(
  env: Env,
  db: D1Database,
  target: ComplianceNotificationTarget,
  triggerKey: string,
): Promise<number> {
  if (!target.setor_id) return 0;
  const managers = await getSetorGestoresBySetor(db, target.empresa_id, target.setor_id, true);
  const emails = [...new Set(managers.map((m) => String(m.gestor_email || '').trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return 0;
  const subject = `Pendência de treinamento — ${target.funcionario_nome} — ${target.qualificacao_nome}`;
  const text = [
    'Gerência de Treinamento | Costa do Sol',
    '',
    `Funcionário: ${target.funcionario_nome}`,
    `Setor: ${target.setor_nome || 'Não informado'}`,
    `Treinamento: ${target.qualificacao_nome}`,
    `Situação: ${statusText(target)}`,
    '',
    'Solicitamos apoio do gestor para regularização desta pendência obrigatória.',
  ].join('\n');
  const result = await sendEmailDetailed(env, {
    to: emails.map((email) => ({ email })),
    subject,
    textContent: text,
    htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937"><h2>Gerência de Treinamento | Costa do Sol</h2><p>Solicitamos apoio do gestor para regularização da pendência abaixo.</p><ul><li><strong>Funcionário:</strong> ${target.funcionario_nome}</li><li><strong>Setor:</strong> ${target.setor_nome || 'Não informado'}</li><li><strong>Treinamento:</strong> ${target.qualificacao_nome}</li><li><strong>Situação:</strong> ${statusText(target)}</li></ul></div>`,
  });
  for (const email of emails) {
    await insertLog(db, target, {
      tipo: 'EMAIL_GESTOR_COMPLIANCE',
      destinatario: email,
      triggerKey,
      manager: true,
      ok: result.ok,
      error: result.ok ? null : result.providerResponse || 'EMAIL_SEND_FAILED',
      message: text,
    });
  }
  return result.ok ? emails.length : 0;
}

export function selectDueThreshold(days: number, thresholds: number[]): number | null {
  const eligible = thresholds.filter((threshold) => threshold >= days);
  if (!eligible.length) return null;
  return Math.min(...eligible);
}
