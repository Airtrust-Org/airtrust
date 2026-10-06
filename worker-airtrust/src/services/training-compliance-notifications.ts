import type { Env } from '../types';
import { sendEmailDetailed, type EmailSendResult } from '../lib/email';
import { sendWhatsAppMessage } from '../utils/whatsapp-send';
import {
  buildTrainingTemplateVariablesForDelivery,
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
import { renderAlertTemplate } from './module-alert-settings';

export type ComplianceNotificationPolicy = {
  enabled: boolean;
  email: boolean;
  whatsapp: boolean;
  due_day_thresholds: number[];
  never_done_every_days: number;
  notify_manager_on_overdue: boolean;
  manager_overdue_thresholds: number[];
  email_subject_template: string;
  email_message_template: string;
  manager_subject_template: string;
  manager_message_template: string;
};

export const DEFAULT_COMPLIANCE_NOTIFICATION_POLICY: ComplianceNotificationPolicy = {
  enabled: false,
  email: true,
  whatsapp: true,
  due_day_thresholds: [30, 15, 7, 0, -7, -15, -30],
  never_done_every_days: 7,
  notify_manager_on_overdue: true,
  manager_overdue_thresholds: [0, -7, -15, -30],
  email_subject_template: 'Treinamento obrigatório: {{treinamento}} — {{status}}',
  email_message_template:
    'GERÊNCIA DE TREINAMENTO | COSTA DO SOL\n\nOlá, {{funcionario}}!\n\nVocê possui um treinamento obrigatório que requer sua atenção:\n\nTreinamento: {{treinamento}}\nVencimento: {{data_vencimento}}\nStatus: {{status}}\n\nEste treinamento faz parte dos requisitos obrigatórios de treinamento e conformidade da operação e é acompanhado pela Gerência de Treinamento, inclusive para fins de auditoria.\n\nPor favor, realize-o o quanto antes para manter sua situação regularizada.{{link_bloco}}\n\nEsta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.',
  manager_subject_template: 'Pendência de treinamento — {{funcionario}} — {{treinamento}}',
  manager_message_template:
    'Gerência de Treinamento | Costa do Sol\n\nFuncionário: {{funcionario}}\nSetor: {{setor}}\nTreinamento: {{treinamento}}\nSituação: {{status}}\n\nSolicitamos apoio do gestor para regularização desta pendência obrigatória.',
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

export function normalizeNotificationMessageTemplate(
  value: unknown,
  fallback: string,
  maxLength = 5000,
): string {
  const candidate = String(value || '').trim().slice(0, maxLength);
  if (!candidate) return fallback;

  const compact = (text: string) => text.replace(/\s+/g, ' ').trim();
  return compact(candidate) === compact(fallback) ? fallback : candidate;
}

function normalizePolicy(value: unknown): ComplianceNotificationPolicy {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const normalizeThresholds = (raw: unknown, fallback: number[]) => {
    if (!Array.isArray(raw)) return fallback;
    const values = [
      ...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= -365 && n <= 365)),
    ];
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
      Math.max(
        1,
        Number(input.never_done_every_days) ||
          DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.never_done_every_days,
      ),
    ),
    notify_manager_on_overdue: input.notify_manager_on_overdue !== false,
    manager_overdue_thresholds: normalizeThresholds(
      input.manager_overdue_thresholds,
      DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.manager_overdue_thresholds,
    ).filter((n) => n <= 0),
    email_subject_template:
      String(input.email_subject_template || '')
        .trim()
        .slice(0, 300) || DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_subject_template,
    email_message_template: normalizeNotificationMessageTemplate(
      input.email_message_template,
      DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.email_message_template,
    ),
    manager_subject_template:
      String(input.manager_subject_template || '')
        .trim()
        .slice(0, 300) || DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.manager_subject_template,
    manager_message_template: normalizeNotificationMessageTemplate(
      input.manager_message_template,
      DEFAULT_COMPLIANCE_NOTIFICATION_POLICY.manager_message_template,
    ),
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
  if (target.status_compliance === 'NAO_REALIZADO')
    return 'Treinamento obrigatório ainda não realizado';
  const days = target.dias_para_vencer;
  if (days == null)
    return target.status_compliance === 'VENCIDO' ? 'Treinamento vencido' : 'Requer atenção';
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

function complianceTemplateVariables(
  target: ComplianceNotificationTarget,
  trainingUrl: string | null = null,
): Record<string, string> {
  return {
    funcionario: target.funcionario_nome,
    treinamento: target.qualificacao_nome,
    data_vencimento: formatDateBr(target.data_validade),
    status: statusText(target),
    setor: target.setor_nome || 'Não informado',
    link: trainingUrl || '',
    link_bloco: trainingUrl ? `\n\nAcesse diretamente o treinamento: ${trainingUrl}` : '',
  };
}

function plainMessage(target: ComplianceNotificationTarget, trainingUrl: string | null): string {
  const lines = [
    'GERÊNCIA DE TREINAMENTO | COSTA DO SOL',
    '',
    `Olá, ${target.funcionario_nome}!`,
    '',
    'Você possui um treinamento obrigatório que requer sua atenção:',
    '',
    `Treinamento: ${target.qualificacao_nome}`,
    `Vencimento: ${formatDateBr(target.data_validade)}`,
    `Status: ${statusText(target)}`,
    '',
    'Este treinamento faz parte dos requisitos obrigatórios de treinamento e conformidade da operação e é acompanhado pela Gerência de Treinamento, inclusive para fins de auditoria.',
    '',
    'Por favor, realize-o o quanto antes para manter sua situação regularizada.',
  ];
  if (trainingUrl) lines.push('', `Acesse diretamente o treinamento: ${trainingUrl}`);
  lines.push('', 'Esta é uma mensagem automática da Gerência de Treinamento da Costa do Sol.');
  return lines.join('\n');
}

export function renderComplianceEmailHtml(message: string): string {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const linkify = (value: string) =>
    escapeHtml(value).replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color:#1d4ed8;text-decoration:underline;word-break:break-word">$1</a>',
    );

  const lines = message.replace(/\r\n?/g, '\n').split('\n');
  const body = lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return '<div style="height:12px;line-height:12px">&nbsp;</div>';
      }

      if (index === 0) {
        return `<div style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 4px">${linkify(line)}</div>`;
      }

      const field = line.match(/^(Treinamento|Vencimento|Status):\s*(.*)$/);
      if (field) {
        return `<div style="margin:3px 0"><strong>${escapeHtml(field[1])}:</strong> ${linkify(field[2])}</div>`;
      }

      const access = line.match(/^Acesse diretamente o treinamento:\s*(.*)$/);
      if (access) {
        const url = access[1].trim();
        return url
          ? `<div style="margin:4px 0"><strong>Acesse diretamente o treinamento:</strong><br>${linkify(url)}</div>`
          : '<div style="margin:4px 0"><strong>Acesse diretamente o treinamento:</strong></div>';
      }

      return `<div style="margin:2px 0">${linkify(line)}</div>`;
    })
    .join('');

  return `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55;max-width:640px;margin:auto">${body}</div>`;
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
  const policy = await getComplianceNotificationPolicy(db, target.empresa_id);
  const vars = complianceTemplateVariables(target, trainingUrl);
  const subject = renderAlertTemplate(policy.email_subject_template, vars);
  const message = renderAlertTemplate(policy.email_message_template, vars);
  let result: EmailSendResult;
  try {
    result = await sendEmailDetailed(env, {
      to: [{ email: target.email, name: target.funcionario_nome }],
      subject,
      textContent: message,
      htmlContent: renderComplianceEmailHtml(message),
    });
  } catch (error) {
    result = {
      ok: false,
      providerResponse: error instanceof Error ? error.message : String(error),
    };
  }
  await insertLog(db, target, {
    tipo: 'EMAIL_COMPLIANCE',
    destinatario: target.email,
    triggerKey,
    ok: result.ok,
    error: result.ok ? null : result.providerResponse || 'EMAIL_SEND_FAILED',
    message,
  });
  return {
    attempted: true,
    ok: result.ok,
    error: result.ok ? null : result.providerResponse || 'EMAIL_SEND_FAILED',
  };
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
    funcionarioNome: target.funcionario_nome,
    qualificacaoNome: target.qualificacao_nome,
    dataVencimento: formatDateBr(target.data_validade),
    statusVencimento: statusText(target),
    trainingUrl,
  });
  const rendered = deliveryBodyText
    ? renderTemplateBody(deliveryBodyText, variables)
    : plainMessage(target, trainingUrl);
  try {
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
    .bind(
      target.empresa_id,
      target.funcionario_cpf,
      `[COMPLIANCE_TREINAMENTO:${target.qualificacao_tipo_id}:NEVER_%`,
    )
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
  const emails = [
    ...new Set(
      managers
        .map((m) =>
          String(m.gestor_email || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
  if (!emails.length) return 0;
  const policy = await getComplianceNotificationPolicy(db, target.empresa_id);
  const vars = complianceTemplateVariables(target);
  const subject = renderAlertTemplate(policy.manager_subject_template, vars);
  const text = renderAlertTemplate(policy.manager_message_template, vars);
  const result = await sendEmailDetailed(env, {
    to: emails.map((email) => ({ email })),
    subject,
    textContent: text,
    htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;white-space:pre-wrap">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`,
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
