import type { Env } from '../types';
import { sendEmail } from '../lib/email';

export type SimulatorSessionNotificationReason = 'created' | 'updated';

interface SimulatorSessionRow {
  id: number;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  tipo_sessao: string | null;
  tema_sessao: string | null;
  status: string | null;
  observacoes: string | null;
  empresa_id: number | null;
  tipo_dispositivo: string | null;
  simulador_nome: string | null;
  simulador_modelo: string | null;
  simulador_tipo: string | null;
  instrutor_id: number | null;
  instrutor_nome: string | null;
  instrutor_email: string | null;
  examinador_id: number | null;
  examinador_nome: string | null;
  examinador_email: string | null;
}

interface SimulatorParticipantRow {
  funcionario_id: number;
  funcao: string | null;
  funcionario_nome: string | null;
  funcionario_email: string | null;
}

interface SimulatorSessionRecipient {
  funcionarioId: number;
  nome: string;
  email: string | null;
  roles: string[];
}

export interface SimulatorSessionNotificationResult {
  funcionarioId: number;
  nome: string;
  email: string | null;
  roles: string[];
  status: 'sent' | 'skipped' | 'failed';
  reason?: 'EMAIL_MISSING' | 'EMAIL_PROVIDER_NOT_CONFIGURED' | 'EMAIL_SEND_FAILED';
}

export interface SendSimulatorSessionNotificationOptions {
  empresaId?: number | null;
  reason: SimulatorSessionNotificationReason;
}

function normalizeForCompare(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeTime(value: string | null | undefined): string {
  return String(value || '').slice(0, 5);
}

function formatDateBr(value: string | null | undefined): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return 'N/A';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtmlEmail(text: string): string {
  return `<html><body style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.55;max-width:640px;margin:0 auto;padding:20px">${escapeHtml(
    text,
  ).replace(/\n/g, '<br/>')}</body></html>`;
}

function simulatorAppLink(env: Env): string | null {
  const baseUrl = String(env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/simuladores`;
}

function getSessionTitle(session: SimulatorSessionRow): string {
  return (
    String(session.tema_sessao || '').trim() ||
    String(session.tipo_sessao || '').trim() ||
    'Sessão de simulador'
  );
}

function getEquipmentLabel(session: SimulatorSessionRow): string {
  return (
    String(session.simulador_nome || '').trim() ||
    String(session.simulador_modelo || '').trim() ||
    String(session.simulador_tipo || '').trim() ||
    'Equipamento não informado'
  );
}

function getRoleLabel(role: string): string {
  const normalized = role.toUpperCase();
  if (normalized === 'INSTRUTOR') return 'Instrutor';
  if (normalized === 'EXAMINADOR') return 'Examinador';
  if (normalized.startsWith('PARTICIPANTE_')) {
    return `Tripulante ${normalized.replace('PARTICIPANTE_', '')}`;
  }
  return 'Tripulante';
}

function addRecipient(
  recipients: Map<number, SimulatorSessionRecipient>,
  input: { funcionarioId: number | null | undefined; nome: string | null | undefined; email: string | null | undefined; role: string },
) {
  const funcionarioId = Number(input.funcionarioId || 0);
  if (!funcionarioId) return;

  const current =
    recipients.get(funcionarioId) ||
    ({
      funcionarioId,
      nome: String(input.nome || 'Destinatário').trim() || 'Destinatário',
      email: String(input.email || '').trim() || null,
      roles: [],
    } satisfies SimulatorSessionRecipient);

  if (!current.email && input.email) current.email = String(input.email).trim();
  if (!current.roles.includes(input.role)) current.roles.push(input.role);
  recipients.set(funcionarioId, current);
}

function buildRecipients(
  session: SimulatorSessionRow,
  participants: SimulatorParticipantRow[],
): SimulatorSessionRecipient[] {
  const recipients = new Map<number, SimulatorSessionRecipient>();

  addRecipient(recipients, {
    funcionarioId: session.instrutor_id,
    nome: session.instrutor_nome,
    email: session.instrutor_email,
    role: 'INSTRUTOR',
  });

  addRecipient(recipients, {
    funcionarioId: session.examinador_id,
    nome: session.examinador_nome,
    email: session.examinador_email,
    role: 'EXAMINADOR',
  });

  for (const participant of participants) {
    addRecipient(recipients, {
      funcionarioId: participant.funcionario_id,
      nome: participant.funcionario_nome,
      email: participant.funcionario_email,
      role: `PARTICIPANTE_${String(participant.funcao || 'TRIPULANTE').toUpperCase()}`,
    });
  }

  return [...recipients.values()];
}

function buildEmailText(
  env: Env,
  session: SimulatorSessionRow,
  recipient: SimulatorSessionRecipient,
  recipients: SimulatorSessionRecipient[],
  reason: SimulatorSessionNotificationReason,
): string {
  const dateLabel = formatDateBr(session.data);
  const timeLabel = `${normalizeTime(session.hora_inicio) || 'N/A'}${session.hora_fim ? ` às ${normalizeTime(session.hora_fim)}` : ''}`;
  const roleLabel = recipient.roles.map(getRoleLabel).join(' / ');
  const teamLabel = recipients
    .map((item) => `${item.nome} (${item.roles.map(getRoleLabel).join(' / ')})`)
    .join(', ');
  const link = simulatorAppLink(env);

  return [
    reason === 'created' ? 'Nova designação de sessão de simulador' : 'Atualização de sessão de simulador',
    '',
    `Olá, ${recipient.nome}.`,
    '',
    'Você está designado(a) para a sessão abaixo:',
    `Data: ${dateLabel}`,
    `Horário: ${timeLabel}`,
    `Simulador/equipamento: ${getEquipmentLabel(session)}`,
    `Sessão/tema: ${getSessionTitle(session)}`,
    `Sua função: ${roleLabel}`,
    `Equipe: ${teamLabel || 'Equipe não informada'}`,
    `Status: ${session.status || 'N/A'}`,
    session.observacoes ? `Observações: ${session.observacoes}` : '',
    link ? `Acesso seguro: ${link}` : '',
    '',
    'Este e-mail contém somente dados operacionais da sessão.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

async function getSimulatorSessionNotificationData(
  db: D1Database,
  sessaoId: number,
  empresaId?: number | null,
): Promise<{ session: SimulatorSessionRow; participants: SimulatorParticipantRow[] } | null> {
  const scopedEmpresaId = Number(empresaId || 0);
  const session = await db
    .prepare(
      `SELECT
         sa.id,
         sa.data,
         sa.hora_inicio,
         sa.hora_fim,
         sa.tipo_sessao,
         sa.nome AS tema_sessao,
         sa.status,
         sa.observacoes,
         sa.empresa_id,
         sa.tipo_dispositivo,
         s.nome AS simulador_nome,
         s.modelo AS simulador_modelo,
         s.tipo AS simulador_tipo,
         fi.id AS instrutor_id,
         fi.nome AS instrutor_nome,
         fi.email AS instrutor_email,
         fe.id AS examinador_id,
         fe.nome AS examinador_nome,
         fe.email AS examinador_email
       FROM simulador_agendamentos sa
       LEFT JOIN simuladores s ON s.id = sa.simulador_id
       LEFT JOIN funcionarios fi ON fi.id = sa.instrutor_id AND fi.deleted_at IS NULL
       LEFT JOIN funcionarios fe ON fe.id = sa.examinador_id AND fe.deleted_at IS NULL
       WHERE sa.id = ?
         AND sa.deleted_at IS NULL
         AND (? = 0 OR sa.empresa_id = ?)`,
    )
    .bind(sessaoId, scopedEmpresaId, scopedEmpresaId)
    .first<SimulatorSessionRow>();

  if (!session) return null;

  const participants = await db
    .prepare(
      `SELECT
         sp.funcionario_id,
         sp.funcao,
         f.nome AS funcionario_nome,
         f.email AS funcionario_email
       FROM sessoes_participantes sp
       INNER JOIN funcionarios f ON f.id = sp.funcionario_id AND f.deleted_at IS NULL
       WHERE sp.sessao_id = ?
         AND sp.deleted_at IS NULL
       ORDER BY CASE UPPER(COALESCE(sp.funcao, ''))
         WHEN 'PIC' THEN 1
         WHEN 'SIC' THEN 2
         ELSE 3
       END, f.nome`,
    )
    .bind(sessaoId)
    .all<SimulatorParticipantRow>();

  return { session, participants: participants.results || [] };
}

export function shouldNotifySimulatorSessionUpdate(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  participantsChanged: boolean,
): boolean {
  if (participantsChanged) return true;

  const relevantFields = [
    'data',
    'hora_inicio',
    'hora_fim',
    'simulador_id',
    'aeronave_id',
    'tipo_dispositivo',
    'instrutor_id',
    'examinador_id',
    'tipo_sessao',
    'template_id',
    'status',
    'observacoes',
    'nome',
  ];

  return relevantFields.some(
    (field) => normalizeForCompare(before[field]) !== normalizeForCompare(after[field]),
  );
}

export async function sendSimulatorSessionEmailNotifications(
  env: Env,
  db: D1Database,
  sessaoId: number,
  options: SendSimulatorSessionNotificationOptions,
): Promise<SimulatorSessionNotificationResult[]> {
  const data = await getSimulatorSessionNotificationData(db, sessaoId, options.empresaId);
  if (!data) return [];

  const recipients = buildRecipients(data.session, data.participants);
  const providerConfigured = Boolean(env.BREVO_API_KEY && env.BREVO_FROM_EMAIL);

  const results: SimulatorSessionNotificationResult[] = [];

  for (const recipient of recipients) {
    if (!recipient.email) {
      results.push({
        funcionarioId: recipient.funcionarioId,
        nome: recipient.nome,
        email: null,
        roles: recipient.roles,
        status: 'skipped',
        reason: 'EMAIL_MISSING',
      });
      continue;
    }

    if (!providerConfigured) {
      results.push({
        funcionarioId: recipient.funcionarioId,
        nome: recipient.nome,
        email: recipient.email,
        roles: recipient.roles,
        status: 'skipped',
        reason: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      });
      continue;
    }

    const textContent = buildEmailText(env, data.session, recipient, recipients, options.reason);
    const sent = await sendEmail(env, {
      to: [{ email: recipient.email, name: recipient.nome }],
      subject: `Sessão de simulador - ${formatDateBr(data.session.data)} - ${getSessionTitle(data.session)}`,
      textContent,
      htmlContent: buildHtmlEmail(textContent),
    });

    results.push({
      funcionarioId: recipient.funcionarioId,
      nome: recipient.nome,
      email: recipient.email,
      roles: recipient.roles,
      status: sent ? 'sent' : 'failed',
      reason: sent ? undefined : 'EMAIL_SEND_FAILED',
    });
  }

  return results;
}
