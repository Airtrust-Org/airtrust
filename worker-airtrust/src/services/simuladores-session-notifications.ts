import { sendEmailDetailed } from '../lib/email';
import type { Env } from '../types';

export type SimulatorSessionNotificationReason = 'created' | 'updated' | 'canceled';

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

export interface SimulatorSessionNotificationData {
  session: SimulatorSessionRow;
  participants: SimulatorParticipantRow[];
}

interface SimulatorSessionRecipient {
  funcionarioId: number;
  nome: string;
  email: string | null;
  roles: string[];
}

interface NotificationLogRow {
  id: number;
  status: string | null;
  tentativas_envio: number | null;
}

interface NotificationLogCapabilities {
  available: boolean;
  hasUpdatedAt: boolean;
}

interface NotificationLogClaimResult {
  acquired: boolean;
  logRow: NotificationLogRow | null;
}

interface PreparedNotificationSend {
  recipient: SimulatorSessionRecipient;
  subject: string;
  textContent: string;
  logRow: NotificationLogRow | null;
}

export interface SimulatorSessionNotificationResult {
  funcionarioId: number;
  nome: string;
  email: string | null;
  roles: string[];
  status: 'sent' | 'skipped' | 'failed';
  reason?:
    | 'DUPLICATE'
    | 'EMAIL_MISSING'
    | 'EMAIL_PROVIDER_NOT_CONFIGURED'
    | 'EMAIL_SEND_FAILED';
}

export interface SendSimulatorSessionNotificationOptions {
  empresaId?: number | null;
  reason: SimulatorSessionNotificationReason;
  preloadedData?: SimulatorSessionNotificationData | null;
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

function getEmailHeadline(reason: SimulatorSessionNotificationReason): string {
  if (reason === 'created') return 'Nova designação de sessão de simulador';
  if (reason === 'canceled') return 'Cancelamento de sessão de simulador';
  return 'Atualização de sessão de simulador';
}

function getEmailIntro(reason: SimulatorSessionNotificationReason): string {
  if (reason === 'canceled') return 'A sessão abaixo foi cancelada:';
  return 'Você está designado(a) para a sessão abaixo:';
}

function getEmailSubjectPrefix(reason: SimulatorSessionNotificationReason): string {
  if (reason === 'created') return 'Sessão de simulador agendada';
  if (reason === 'canceled') return 'Sessão de simulador cancelada';
  return 'Sessão de simulador atualizada';
}

function addRecipient(
  recipients: Map<number, SimulatorSessionRecipient>,
  input: {
    funcionarioId: number | null | undefined;
    nome: string | null | undefined;
    email: string | null | undefined;
    role: string;
  },
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
    getEmailHeadline(reason),
    '',
    `Olá, ${recipient.nome}.`,
    '',
    getEmailIntro(reason),
    `Data: ${dateLabel}`,
    `Horário: ${timeLabel}`,
    `Simulador/equipamento: ${getEquipmentLabel(session)}`,
    `Sessão/tema: ${getSessionTitle(session)}`,
    `Sua função: ${roleLabel}`,
    `Equipe: ${teamLabel || 'Equipe não informada'}`,
    `Status: ${session.status || 'N/A'}`,
    session.observacoes ? `Observações: ${session.observacoes}` : '',
    reason === 'canceled'
      ? 'Esta mensagem comunica somente o cancelamento operacional da sessão.'
      : '',
    link && reason !== 'canceled' ? `Acesso seguro: ${link}` : '',
    '',
    'Este e-mail contém somente dados operacionais da sessão.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function buildEmailSubject(
  session: SimulatorSessionRow,
  reason: SimulatorSessionNotificationReason,
): string {
  return `${getEmailSubjectPrefix(reason)} - ${formatDateBr(session.data)} - ${getSessionTitle(session)}`;
}

function buildNotificationKey(
  session: SimulatorSessionRow,
  recipient: SimulatorSessionRecipient,
  recipients: SimulatorSessionRecipient[],
  reason: SimulatorSessionNotificationReason,
): string {
  const teamKey = recipients
    .map((item) => `${item.funcionarioId}:${[...item.roles].sort().join('+')}`)
    .sort()
    .join('|');
  const recipientRoles = [...recipient.roles].sort().join('+');

  return [
    'SIMULADOR_SESSAO',
    `sessao:${session.id}`,
    `funcionario:${recipient.funcionarioId}`,
    `reason:${reason}`,
    `data:${normalizeForCompare(session.data)}`,
    `inicio:${normalizeTime(session.hora_inicio)}`,
    `fim:${normalizeTime(session.hora_fim)}`,
    `equip:${normalizeForCompare(getEquipmentLabel(session))}`,
    `tema:${normalizeForCompare(getSessionTitle(session))}`,
    `status:${normalizeForCompare(session.status)}`,
    `obs:${normalizeForCompare(session.observacoes)}`,
    `roles:${recipientRoles}`,
    `equipe:${teamKey}`,
  ].join('|');
}

function sanitizeText(value: string | null | undefined, maxLength = 160): string | null {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  const redacted = normalized
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(?:api[-_ ]?key|token|secret|password)\b\s*[:=]?\s*[^,\s]+/gi, '[redacted-secret]')
    .replace(/[A-Za-z0-9_=-]{24,}/g, '[redacted-token]');

  return redacted.slice(0, maxLength);
}

function sanitizeProviderResult(
  status: number | null | undefined,
  providerResponse: string | null | undefined,
): string | null {
  const base: Record<string, string | number> = {};
  if (typeof status === 'number') base.status = status;

  const raw = String(providerResponse || '').trim();
  if (!raw) return Object.keys(base).length > 0 ? JSON.stringify(base) : null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const safe: Record<string, string | number> = { ...base };

    const messageId = sanitizeText(typeof parsed.messageId === 'string' ? parsed.messageId : null, 80);
    const code = sanitizeText(typeof parsed.code === 'string' ? parsed.code : null, 80);
    const message = sanitizeText(
      typeof parsed.message === 'string'
        ? parsed.message
        : typeof parsed.error === 'string'
          ? parsed.error
          : null,
      120,
    );

    if (messageId) safe.messageId = messageId;
    if (code) safe.code = code;
    if (message) safe.message = message;

    return JSON.stringify(safe);
  } catch {
    const safe = sanitizeText(raw, 120);
    if (!safe && Object.keys(base).length === 0) return null;
    return JSON.stringify(safe ? { ...base, message: safe } : base);
  }
}

function buildLogBodyPreview(text: string): string {
  const [headline, greeting, intro] = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    sanitizeText([headline, greeting, intro].filter(Boolean).join(' | '), 160) ||
    'SIMULADOR_SESSAO'
  );
}

function buildProcessingMarker(sessionId: number, recipientId: number): string {
  return `PROCESSING:${sessionId}:${recipientId}:${Date.now()}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  const text = String(error instanceof Error ? error.message : error || '');
  return /unique|constraint/i.test(text);
}

async function loadNotificationLogCapabilities(
  db: D1Database,
): Promise<NotificationLogCapabilities> {
  try {
    const pragma = await db.prepare("PRAGMA table_info('notificacoes_log')").all<{ name: string }>();
    const names = new Set((pragma.results || []).map((row) => String(row.name || '').trim()));

    const required = [
      'empresa_id',
      'funcionario_id',
      'sessao_id',
      'notification_key',
      'tentativas_envio',
      'provedor_mensagem_id',
      'provedor_resultado',
    ];

    return {
      available: required.every((column) => names.has(column)),
      hasUpdatedAt: names.has('updated_at'),
    };
  } catch {
    return {
      available: false,
      hasUpdatedAt: false,
    };
  }
}

export async function loadSimulatorSessionNotificationData(
  db: D1Database,
  sessaoId: number,
  empresaId?: number | null,
): Promise<SimulatorSessionNotificationData | null> {
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

async function findNotificationLog(
  db: D1Database,
  caps: NotificationLogCapabilities,
  empresaId: number,
  notificationKey: string,
): Promise<NotificationLogRow | null> {
  if (!caps.available) return null;

  return db
    .prepare(
      `SELECT id, status, tentativas_envio
       FROM notificacoes_log
       WHERE empresa_id = ?
         AND notification_key = ?
       LIMIT 1`,
    )
    .bind(empresaId, notificationKey)
    .first<NotificationLogRow>();
}

async function insertPendingNotificationLog(
  db: D1Database,
  caps: NotificationLogCapabilities,
  empresaId: number,
  session: SimulatorSessionRow,
  recipient: SimulatorSessionRecipient,
  notificationKey: string,
  subject: string,
  bodyPreview: string,
): Promise<'inserted' | 'duplicate' | 'unavailable'> {
  if (!caps.available) return 'unavailable';

  try {
    await db
      .prepare(
        `INSERT INTO notificacoes_log (
           empresa_id,
           funcionario_id,
           sessao_id,
           notification_key,
           tipo,
           destinatario,
           assunto,
           corpo,
           status,
           tentativas_envio
         ) VALUES (?, ?, ?, ?, 'SIMULADOR_SESSAO', ?, ?, ?, 'pendente', 0)`,
      )
      .bind(
        empresaId,
        recipient.funcionarioId,
        session.id,
        notificationKey,
        recipient.email,
        subject,
        bodyPreview,
      )
      .run();

    return 'inserted';
  } catch (error) {
    if (isUniqueConstraintError(error)) return 'duplicate';
    throw error;
  }
}

async function updateNotificationLogForAttempt(
  db: D1Database,
  caps: NotificationLogCapabilities,
  logId: number,
  payload: {
    status: 'pendente' | 'enviada' | 'erro';
    errorMessage?: string | null;
    providerMessageId?: string | null;
    providerResult?: string | null;
    incrementAttempts?: boolean;
  },
) {
  if (!caps.available) return;

  const setClauses = [
    'status = ?',
    'erro_mensagem = ?',
    'provedor_mensagem_id = ?',
    'provedor_resultado = ?',
  ];

  if (payload.incrementAttempts) {
    setClauses.push('tentativas_envio = COALESCE(tentativas_envio, 0) + 1');
  }

  if (payload.status === 'enviada') {
    setClauses.push("enviado_em = datetime('now')");
  }

  if (caps.hasUpdatedAt) {
    setClauses.push("updated_at = datetime('now')");
  }

  await db
    .prepare(
      `UPDATE notificacoes_log
       SET ${setClauses.join(', ')}
       WHERE id = ?`,
    )
    .bind(
      payload.status,
      payload.errorMessage ?? null,
      payload.providerMessageId ?? null,
      payload.providerResult ?? null,
      logId,
    )
    .run();
}

async function claimNotificationLogForSend(
  db: D1Database,
  caps: NotificationLogCapabilities,
  empresaId: number,
  session: SimulatorSessionRow,
  recipient: SimulatorSessionRecipient,
  notificationKey: string,
  subject: string,
  bodyPreview: string,
): Promise<NotificationLogClaimResult> {
  if (!caps.available || empresaId <= 0) {
    return { acquired: true, logRow: null };
  }

  let logRow = await findNotificationLog(db, caps, empresaId, notificationKey);
  if (!logRow) {
    const inserted = await insertPendingNotificationLog(
      db,
      caps,
      empresaId,
      session,
      recipient,
      notificationKey,
      subject,
      bodyPreview,
    );

    if (inserted === 'unavailable') {
      return { acquired: true, logRow: null };
    }

    logRow = await findNotificationLog(db, caps, empresaId, notificationKey);
  }

  if (!logRow) {
    return { acquired: false, logRow: null };
  }

  if (logRow.status === 'enviada') {
    return { acquired: false, logRow };
  }

  const claimResult = await db
    .prepare(
      `UPDATE notificacoes_log
       SET status = 'pendente',
           erro_mensagem = NULL,
           provedor_mensagem_id = ?,
           provedor_resultado = NULL,
           tentativas_envio = COALESCE(tentativas_envio, 0) + 1${caps.hasUpdatedAt ? ", updated_at = datetime('now')" : ''}
       WHERE id = ?
         AND COALESCE(status, 'pendente') <> 'enviada'
         AND (
           provedor_mensagem_id IS NULL
           OR provedor_mensagem_id = ''
           OR provedor_mensagem_id NOT LIKE 'PROCESSING:%'
         )`,
    )
    .bind(buildProcessingMarker(session.id, recipient.funcionarioId), logRow.id)
    .run();

  if (Number(claimResult.meta?.changes || 0) !== 1) {
    return {
      acquired: false,
      logRow: await findNotificationLog(db, caps, empresaId, notificationKey),
    };
  }

  return {
    acquired: true,
    logRow: {
      ...logRow,
      tentativas_envio: Number(logRow.tentativas_envio || 0) + 1,
    },
  };
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
  const data =
    options.preloadedData ||
    (await loadSimulatorSessionNotificationData(db, sessaoId, options.empresaId));
  if (!data) return [];

  const empresaId = Number(options.empresaId || data.session.empresa_id || 0);
  const recipients = buildRecipients(data.session, data.participants);
  const providerConfigured = Boolean(env.BREVO_API_KEY && env.BREVO_FROM_EMAIL);
  const results: SimulatorSessionNotificationResult[] = [];
  const caps = await loadNotificationLogCapabilities(db);
  const pendingSends: PreparedNotificationSend[] = [];

  for (const recipient of recipients) {
    const textContent = buildEmailText(env, data.session, recipient, recipients, options.reason);
    const subject = buildEmailSubject(data.session, options.reason);
    const notificationKey = buildNotificationKey(data.session, recipient, recipients, options.reason);
    const bodyPreview = buildLogBodyPreview(textContent);
    let logRow =
      empresaId > 0 ? await findNotificationLog(db, caps, empresaId, notificationKey) : null;

    if (logRow?.status === 'enviada') {
      results.push({
        funcionarioId: recipient.funcionarioId,
        nome: recipient.nome,
        email: recipient.email,
        roles: recipient.roles,
        status: 'skipped',
        reason: 'DUPLICATE',
      });
      continue;
    }

    if (!recipient.email) {
      if (!logRow && empresaId > 0) {
        const inserted = await insertPendingNotificationLog(
          db,
          caps,
          empresaId,
          data.session,
          recipient,
          notificationKey,
          subject,
          bodyPreview,
        );
        if (inserted !== 'unavailable') {
          logRow = await findNotificationLog(db, caps, empresaId, notificationKey);
        }
      }

      if (logRow?.id) {
        await updateNotificationLogForAttempt(db, caps, logRow.id, {
          status: 'erro',
          errorMessage: 'EMAIL_MISSING',
          providerResult: 'EMAIL_MISSING',
        });
      }

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
      if (!logRow && empresaId > 0) {
        const inserted = await insertPendingNotificationLog(
          db,
          caps,
          empresaId,
          data.session,
          recipient,
          notificationKey,
          subject,
          bodyPreview,
        );

        if (inserted !== 'unavailable') {
          logRow = await findNotificationLog(db, caps, empresaId, notificationKey);
        }
      }

      if (logRow?.id) {
        await updateNotificationLogForAttempt(db, caps, logRow.id, {
          status: 'pendente',
          errorMessage: 'EMAIL_PROVIDER_NOT_CONFIGURED',
          providerResult: 'EMAIL_PROVIDER_NOT_CONFIGURED',
        });
      }

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

    const claim = await claimNotificationLogForSend(
      db,
      caps,
      empresaId,
      data.session,
      recipient,
      notificationKey,
      subject,
      bodyPreview,
    );

    logRow = claim.logRow;

    if (!claim.acquired) {
      results.push({
        funcionarioId: recipient.funcionarioId,
        nome: recipient.nome,
        email: recipient.email,
        roles: recipient.roles,
        status: 'skipped',
        reason: 'DUPLICATE',
      });
      continue;
    }
    pendingSends.push({
      recipient,
      subject,
      textContent,
      logRow,
    });
  }

  for (const pending of pendingSends) {
    const emailResult = await sendEmailDetailed(env, {
      to: [{ email: pending.recipient.email!, name: pending.recipient.nome }],
      subject: pending.subject,
      textContent: pending.textContent,
      htmlContent: buildHtmlEmail(pending.textContent),
    });

    if (pending.logRow?.id) {
      await updateNotificationLogForAttempt(db, caps, pending.logRow.id, {
        status: emailResult.ok ? 'enviada' : 'erro',
        errorMessage: emailResult.ok ? null : 'EMAIL_SEND_FAILED',
        providerMessageId: sanitizeText(emailResult.providerMessageId, 80),
        providerResult: sanitizeProviderResult(
          emailResult.providerStatus ?? null,
          emailResult.providerResponse ?? null,
        ),
      });
    }

    results.push({
      funcionarioId: pending.recipient.funcionarioId,
      nome: pending.recipient.nome,
      email: pending.recipient.email,
      roles: pending.recipient.roles,
      status: emailResult.ok ? 'sent' : 'failed',
      reason: emailResult.ok ? undefined : 'EMAIL_SEND_FAILED',
    });
  }

  return results;
}
