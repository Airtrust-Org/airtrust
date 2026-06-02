import { z } from 'zod';
import type { Env } from '../types';

const PASSWORD_MARKER = '__WORKER_ENCRYPTED__';
const PASSWORD_ENCRYPTED_PREFIX = 'enc:v1';
const REQUIRED_TEMPLATE_VARIABLES = ['{{NOME_TREINAMENTO}}', '{{DATA_INICIO}}'] as const;

export const EMAIL_CONVOCACAO_ASSUNTO_PADRAO =
  '[CONVOCAÇÃO] Treinamento: {{NOME_TREINAMENTO}} — {{DATA_INICIO}}';

export const EMAIL_CONVOCACAO_ASSINATURA_PADRAO = `
  <p>Atenciosamente,</p>
  <p><strong>AirTrust</strong><br/>Departamento de Treinamento</p>
`;

function buildAssinaturaPadrao(empresaNome?: string | null): string {
  const nome = String(empresaNome || '').trim() || 'AirTrust';
  return `
  <p>Atenciosamente,</p>
  <p><strong>${nome}</strong><br/>Departamento de Treinamento</p>
`;
}

async function resolveEmpresaNome(db: D1Database, empresaId: number): Promise<string | null> {
  const row = await db
    .prepare('SELECT nome FROM empresas WHERE id = ? AND deleted_at IS NULL')
    .bind(empresaId)
    .first<{ nome?: string | null }>();
  const nome = String(row?.nome || '').trim();
  return nome || null;
}

export const EMAIL_CONVOCACAO_TEMPLATE_PADRAO = `
  <p>Prezados(as),</p>
  <p>Segue convocação da turma abaixo. Solicitamos atenção aos dados operacionais e pontualidade.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
    <tbody>
      <tr><td style="padding:8px;border:1px solid #dbe4ee"><strong>Treinamento</strong></td><td style="padding:8px;border:1px solid #dbe4ee">{{NOME_TREINAMENTO}}</td></tr>
      <tr><td style="padding:8px;border:1px solid #dbe4ee"><strong>Modalidade</strong></td><td style="padding:8px;border:1px solid #dbe4ee">{{MODALIDADE}}</td></tr>
      <tr><td style="padding:8px;border:1px solid #dbe4ee"><strong>Data de início</strong></td><td style="padding:8px;border:1px solid #dbe4ee">{{DATA_INICIO}}</td></tr>
      <tr><td style="padding:8px;border:1px solid #dbe4ee"><strong>Data de fim</strong></td><td style="padding:8px;border:1px solid #dbe4ee">{{DATA_FIM}}</td></tr>
      <tr><td style="padding:8px;border:1px solid #dbe4ee"><strong>Horário</strong></td><td style="padding:8px;border:1px solid #dbe4ee">{{HORARIO}}</td></tr>
      <tr><td style="padding:8px;border:1px solid #dbe4ee"><strong>Local</strong></td><td style="padding:8px;border:1px solid #dbe4ee">{{LOCAL}}</td></tr>
      <tr><td style="padding:8px;border:1px solid #dbe4ee"><strong>Link de acesso</strong></td><td style="padding:8px;border:1px solid #dbe4ee">{{LINK_ACESSO}}</td></tr>
      <tr><td style="padding:8px;border:1px solid #dbe4ee"><strong>Instrutor</strong></td><td style="padding:8px;border:1px solid #dbe4ee">{{INSTRUTOR}}</td></tr>
    </tbody>
  </table>
  <p><strong>Participantes da turma</strong></p>
  {{LISTA_PARTICIPANTES_TURMA}}
  <p>Apresente-se com antecedência, portando os documentos operacionais necessários e observando a pontualidade prevista.</p>
  {{ASSINATURA_INSTITUCIONAL}}
`;

export const emailConvocacaoConfigSchema = z.object({
  smtp_host: z.string().trim().max(255).nullable().optional(),
  smtp_port: z.number().int().min(1).max(65535).nullable().optional(),
  smtp_security: z.enum(['TLS', 'SSL', 'NONE']).nullable().optional(),
  smtp_user: z.string().trim().email().nullable().optional(),
  smtp_password: z.string().max(500).nullable().optional(),
  sender_name: z.string().trim().max(120).nullable().optional(),
  reply_to: z.string().trim().email().nullable().optional(),
  assunto_padrao: z.string().trim().min(5).max(255).nullable().optional(),
  assinatura_html: z.string().trim().max(20000).nullable().optional(),
  template_html: z.string().trim().max(50000).nullable().optional(),
  batch_size: z.number().int().min(1).max(50).nullable().optional(),
  batch_interval_ms: z.number().int().min(0).max(60000).nullable().optional(),
});

export const gestorCopiaSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  cargo: z.string().trim().max(120).nullable().optional(),
  empresa: z.string().trim().max(120).nullable().optional(),
  ativo: z.boolean().default(true),
});

export type EmailConvocacaoConfigInput = z.infer<typeof emailConvocacaoConfigSchema>;
export type GestorCopiaInput = z.infer<typeof gestorCopiaSchema>;

export type EmailConvocacaoConfig = {
  empresa_id: number;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_security: 'TLS' | 'SSL' | 'NONE';
  smtp_user: string | null;
  smtp_password_configured: boolean;
  sender_name: string | null;
  reply_to: string | null;
  assunto_padrao: string;
  assinatura_html: string;
  template_html: string;
  batch_size: number;
  batch_interval_ms: number;
  updated_at: string | null;
};

export type GestorCopia = {
  id: number;
  nome: string;
  email: string;
  cargo: string | null;
  empresa: string | null;
  ativo: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type ConvocacaoEventRow = {
  id: number;
  treinamento_id: number;
  empresa_id: number;
  disparado_por: number | null;
  disparado_por_nome: string | null;
  assunto: string;
  destinatarios_total: number | string | null;
  enviados_sucesso: number | string | null;
  enviados_falha: number | string | null;
  cc_json: string | null;
  avisos_json: string | null;
  created_at: string;
};

export type ConvocacaoItemRow = {
  id: number;
  convocacao_id: number;
  funcionario_id: number;
  funcionario_nome: string | null;
  funcionario_matricula: string | null;
  email_destino: string | null;
  status: string;
  erro_mensagem: string | null;
  provider_message_id: string | null;
  created_at: string;
  updated_at: string;
};

type SendEmailArgs = {
  env: Env;
  to: string;
  cc: string[];
  subject: string;
  textContent: string;
  htmlContent: string;
  replyTo?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
};

function encodeBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function resolveEncryptionSecret(env?: Partial<Env> | null): string | null {
  if (!env) return null;
  const direct = (env as Record<string, unknown>).SMTP_CONFIG_ENCRYPTION_KEY;
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }
  if (typeof env.JWT_SECRET === 'string' && env.JWT_SECRET.trim().length > 0) {
    return env.JWT_SECRET.trim();
  }
  return null;
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptConfigPassword(plain: string, secret: string): Promise<string> {
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(plain);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  return `${PASSWORD_ENCRYPTED_PREFIX}:${encodeBase64(iv)}:${encodeBase64(new Uint8Array(encrypted))}`;
}

export async function decryptConfigPassword(
  encryptedValue: string | null | undefined,
  secret: string,
): Promise<string | null> {
  if (!encryptedValue || !encryptedValue.startsWith(`${PASSWORD_ENCRYPTED_PREFIX}:`)) {
    return null;
  }

  const parts = encryptedValue.split(':');
  if (parts.length !== 4) return null;

  const key = await importAesKey(secret);
  const iv = decodeBase64(parts[2]);
  const payload = decodeBase64(parts[3]);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);
  return new TextDecoder().decode(decrypted);
}

function isEmail(email?: string | null): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function trimOrNull(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function formatDateBr(value?: string | null): string {
  if (!value) return 'Não informado';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectModalidade(input: {
  local?: string | null;
  titulo?: string | null;
  qualificacao_nome?: string | null;
}): 'Presencial' | 'EAD' | 'Simulador' {
  const joined = [input.local, input.titulo, input.qualificacao_nome]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  if (
    /HTTPS?:\/\//.test(input.local || '') ||
    joined.includes('EAD') ||
    joined.includes('ONLINE')
  ) {
    return 'EAD';
  }
  if (joined.includes('SIMULADOR') || joined.includes('LOFT') || joined.includes('FFS')) {
    return 'Simulador';
  }
  return 'Presencial';
}

export function validateRequiredTemplateVariables(template: string): string[] {
  return REQUIRED_TEMPLATE_VARIABLES.filter((variable) => !template.includes(variable));
}

export async function getEmailConvocacaoConfig(
  db: D1Database,
  empresaId: number,
): Promise<EmailConvocacaoConfig> {
  const empresaNome = await resolveEmpresaNome(db, empresaId);
  const assinaturaPadraoEmpresa = buildAssinaturaPadrao(empresaNome);

  const row = await db
    .prepare('SELECT * FROM notificacoes_convocacao_email_config WHERE empresa_id = ?')
    .bind(empresaId)
    .first<Record<string, unknown>>();

  const assinaturaRaw = trimOrNull(row?.assinatura_html as string | null | undefined);
  const assinaturaLegacy = assinaturaRaw === EMAIL_CONVOCACAO_ASSINATURA_PADRAO;

  return {
    empresa_id: empresaId,
    smtp_host: trimOrNull(row?.smtp_host as string | null | undefined),
    smtp_port: row?.smtp_port == null ? null : Number(row.smtp_port),
    smtp_security:
      row?.smtp_security === 'SSL' || row?.smtp_security === 'NONE' ? row.smtp_security : 'TLS',
    smtp_user: trimOrNull(row?.smtp_user as string | null | undefined),
    smtp_password_configured: Boolean(
      trimOrNull(row?.smtp_password_encrypted as string | null | undefined) ||
      (trimOrNull(row?.smtp_password as string | null | undefined) &&
        row?.smtp_password !== PASSWORD_MARKER),
    ),
    sender_name: trimOrNull(row?.sender_name as string | null | undefined),
    reply_to: trimOrNull(row?.reply_to as string | null | undefined),
    assunto_padrao:
      trimOrNull(row?.assunto_padrao as string | null | undefined) ||
      EMAIL_CONVOCACAO_ASSUNTO_PADRAO,
    assinatura_html:
      (assinaturaLegacy ? assinaturaPadraoEmpresa : assinaturaRaw) || assinaturaPadraoEmpresa,
    template_html:
      trimOrNull(row?.template_html as string | null | undefined) ||
      EMAIL_CONVOCACAO_TEMPLATE_PADRAO,
    batch_size:
      row?.batch_size == null ? 50 : Math.min(50, Math.max(1, Number(row.batch_size) || 50)),
    batch_interval_ms:
      row?.batch_interval_ms == null
        ? 1000
        : Math.max(0, Math.min(60000, Number(row.batch_interval_ms) || 1000)),
    updated_at: (row?.updated_at as string | null | undefined) || null,
  };
}

export async function getEmailConvocacaoPassword(
  db: D1Database,
  empresaId: number,
  env: Env,
): Promise<string | null> {
  const row = await db
    .prepare(
      'SELECT smtp_password, smtp_password_encrypted FROM notificacoes_convocacao_email_config WHERE empresa_id = ?',
    )
    .bind(empresaId)
    .first<{ smtp_password: string | null; smtp_password_encrypted: string | null }>();

  const secret = resolveEncryptionSecret(env);
  if (row?.smtp_password_encrypted && secret) {
    const decrypted = await decryptConfigPassword(row.smtp_password_encrypted, secret).catch(
      () => null,
    );
    if (decrypted) return decrypted;
  }

  if (row?.smtp_password && row.smtp_password !== PASSWORD_MARKER) {
    return row.smtp_password;
  }

  return null;
}

export async function saveEmailConvocacaoConfig(
  db: D1Database,
  env: Env,
  empresaId: number,
  input: EmailConvocacaoConfigInput,
): Promise<EmailConvocacaoConfig> {
  const empresaNome = await resolveEmpresaNome(db, empresaId);
  const assinaturaPadraoEmpresa = buildAssinaturaPadrao(empresaNome);

  const current = await db
    .prepare(
      'SELECT smtp_password, smtp_password_encrypted FROM notificacoes_convocacao_email_config WHERE empresa_id = ?',
    )
    .bind(empresaId)
    .first<{ smtp_password: string | null; smtp_password_encrypted: string | null }>();

  const normalizedTemplate = trimOrNull(input.template_html) || EMAIL_CONVOCACAO_TEMPLATE_PADRAO;
  const missingVariables = validateRequiredTemplateVariables(normalizedTemplate);
  if (missingVariables.length > 0) {
    throw new Error(`TEMPLATE_VARIAVEIS_OBRIGATORIAS_AUSENTES:${missingVariables.join(',')}`);
  }

  let smtpPassword = current?.smtp_password || null;
  let smtpPasswordEncrypted = current?.smtp_password_encrypted || null;
  if (input.smtp_password !== undefined) {
    const normalized = trimOrNull(input.smtp_password);
    if (!normalized) {
      smtpPassword = null;
      smtpPasswordEncrypted = null;
    } else {
      const secret = resolveEncryptionSecret(env);
      if (!secret) {
        throw new Error('SMTP_ENCRYPTION_KEY_MISSING');
      }
      smtpPasswordEncrypted = await encryptConfigPassword(normalized, secret);
      smtpPassword = PASSWORD_MARKER;
    }
  }

  await db
    .prepare(
      `INSERT INTO notificacoes_convocacao_email_config (
        empresa_id, smtp_host, smtp_port, smtp_security, smtp_user, smtp_password,
        smtp_password_encrypted, sender_name, reply_to, assunto_padrao, assinatura_html,
        template_html, batch_size, batch_interval_ms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(empresa_id) DO UPDATE SET
        smtp_host = excluded.smtp_host,
        smtp_port = excluded.smtp_port,
        smtp_security = excluded.smtp_security,
        smtp_user = excluded.smtp_user,
        smtp_password = excluded.smtp_password,
        smtp_password_encrypted = excluded.smtp_password_encrypted,
        sender_name = excluded.sender_name,
        reply_to = excluded.reply_to,
        assunto_padrao = excluded.assunto_padrao,
        assinatura_html = excluded.assinatura_html,
        template_html = excluded.template_html,
        batch_size = excluded.batch_size,
        batch_interval_ms = excluded.batch_interval_ms,
        updated_at = datetime('now')`,
    )
    .bind(
      empresaId,
      trimOrNull(input.smtp_host),
      input.smtp_port ?? null,
      input.smtp_security || 'TLS',
      trimOrNull(input.smtp_user),
      smtpPassword,
      smtpPasswordEncrypted,
      trimOrNull(input.sender_name),
      trimOrNull(input.reply_to),
      trimOrNull(input.assunto_padrao) || EMAIL_CONVOCACAO_ASSUNTO_PADRAO,
      trimOrNull(input.assinatura_html) || assinaturaPadraoEmpresa,
      normalizedTemplate,
      Math.min(50, Math.max(1, input.batch_size ?? 50)),
      Math.max(0, Math.min(60000, input.batch_interval_ms ?? 1000)),
    )
    .run();

  return getEmailConvocacaoConfig(db, empresaId);
}

export async function listGestoresCopia(
  db: D1Database,
  empresaId: number,
  onlyActive = false,
): Promise<GestorCopia[]> {
  let sql = `SELECT id, nome, email, cargo, empresa, ativo, created_at, updated_at
               FROM notificacoes_convocacao_cc_gestores
              WHERE empresa_id = ?
                AND deleted_at IS NULL`;
  if (onlyActive) {
    sql += ' AND ativo = 1';
  }
  sql += ' ORDER BY ativo DESC, nome COLLATE NOCASE ASC, id DESC';

  const rows = await db.prepare(sql).bind(empresaId).all<Record<string, unknown>>();
  return (rows.results || []).map((row) => ({
    id: Number(row.id),
    nome: String(row.nome || ''),
    email: String(row.email || ''),
    cargo: trimOrNull(row.cargo as string | null | undefined),
    empresa: trimOrNull(row.empresa as string | null | undefined),
    ativo: Number(row.ativo || 0) === 1,
    created_at: (row.created_at as string | null | undefined) || null,
    updated_at: (row.updated_at as string | null | undefined) || null,
  }));
}

export async function createGestorCopia(
  db: D1Database,
  empresaId: number,
  input: GestorCopiaInput,
): Promise<GestorCopia> {
  const result = await db
    .prepare(
      `INSERT INTO notificacoes_convocacao_cc_gestores (
        empresa_id, nome, email, cargo, empresa, ativo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      empresaId,
      input.nome.trim(),
      input.email.trim().toLowerCase(),
      trimOrNull(input.cargo),
      trimOrNull(input.empresa),
      input.ativo ? 1 : 0,
    )
    .run();

  const id = Number(result.meta.last_row_id || 0);
  const items = await listGestoresCopia(db, empresaId, false);
  return items.find((item) => item.id === id) as GestorCopia;
}

export async function updateGestorCopia(
  db: D1Database,
  empresaId: number,
  id: number,
  input: GestorCopiaInput,
): Promise<GestorCopia | null> {
  await db
    .prepare(
      `UPDATE notificacoes_convocacao_cc_gestores
          SET nome = ?,
              email = ?,
              cargo = ?,
              empresa = ?,
              ativo = ?,
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(
      input.nome.trim(),
      input.email.trim().toLowerCase(),
      trimOrNull(input.cargo),
      trimOrNull(input.empresa),
      input.ativo ? 1 : 0,
      id,
      empresaId,
    )
    .run();

  const items = await listGestoresCopia(db, empresaId, false);
  return items.find((item) => item.id === id) || null;
}

export async function deleteGestorCopia(
  db: D1Database,
  empresaId: number,
  id: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE notificacoes_convocacao_cc_gestores
          SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, empresaId)
    .run();
}

export async function listConvocacaoHistory(
  db: D1Database,
  treinamentoId: number,
): Promise<
  Array<ConvocacaoEventRow & { itens: ConvocacaoItemRow[]; cc: string[]; avisos: string[] }>
> {
  const rows = await db
    .prepare(
      `SELECT id, treinamento_id, empresa_id, disparado_por, disparado_por_nome, assunto,
              destinatarios_total, enviados_sucesso, enviados_falha, cc_json, avisos_json, created_at
         FROM treinamentos_convocacoes_email
        WHERE treinamento_id = ?
        ORDER BY datetime(created_at) DESC, id DESC`,
    )
    .bind(treinamentoId)
    .all<ConvocacaoEventRow>();

  const convocacaoIds = (rows.results || []).map((row) => Number(row.id));
  const itemMap = new Map<number, ConvocacaoItemRow[]>();

  if (convocacaoIds.length > 0) {
    const placeholders = convocacaoIds.map(() => '?').join(', ');
    const items = await db
      .prepare(
        `SELECT i.id, i.convocacao_id, i.funcionario_id, f.nome AS funcionario_nome,
                f.matricula AS funcionario_matricula, i.email_destino, i.status,
                i.erro_mensagem, i.provider_message_id, i.created_at, i.updated_at
           FROM treinamentos_convocacoes_email_itens i
           LEFT JOIN funcionarios f ON f.id = i.funcionario_id AND f.deleted_at IS NULL
          WHERE i.convocacao_id IN (${placeholders})
          ORDER BY i.id DESC`,
      )
      .bind(...convocacaoIds)
      .all<ConvocacaoItemRow>();

    for (const row of items.results || []) {
      const current = itemMap.get(Number(row.convocacao_id)) || [];
      current.push(row);
      itemMap.set(Number(row.convocacao_id), current);
    }
  }

  return (rows.results || []).map((row) => ({
    ...row,
    itens: itemMap.get(Number(row.id)) || [],
    cc: safeParseJsonArray(row.cc_json),
    avisos: safeParseJsonArray(row.avisos_json),
  }));
}

function safeParseJsonArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export async function sendConvocacaoEmail(
  args: SendEmailArgs,
): Promise<{ messageId: string | null }> {
  if (!args.env.BREVO_API_KEY) {
    throw new Error('EMAIL_NOT_CONFIGURED');
  }

  const cc = args.cc.filter((email) => String(email || '').trim().length > 0);

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': args.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: args.senderEmail || args.env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online',
        name: args.senderName || args.env.BREVO_FROM_NAME || 'AirTrust',
      },
      to: [{ email: args.to }],
      cc: cc.length > 0 ? cc.map((email) => ({ email })) : undefined,
      replyTo: args.replyTo ? { email: args.replyTo } : undefined,
      subject: args.subject,
      textContent: args.textContent,
      htmlContent: args.htmlContent,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BREVO_ERROR:${response.status}:${errorText}`);
  }

  const payload = (await response.json().catch(() => null)) as { messageId?: string } | null;
  return { messageId: payload?.messageId || null };
}

export type ConvocacaoPreviewParticipant = {
  funcionario_id: number;
  nome: string;
  matricula: string | null;
  email: string | null;
  status: 'ready' | 'missing_email' | 'invalid_email';
  motivo: string | null;
};

export type ConvocacaoPreview = {
  treinamento_id: number;
  treinamento_nome: string;
  data_inicio: string;
  data_fim: string;
  horario: string;
  local: string;
  link_acesso: string | null;
  modalidade: 'Presencial' | 'EAD' | 'Simulador';
  instrutor: string;
  destinatarios_total: number;
  destinatarios_validos: number;
  gestores_cc: GestorCopia[];
  participantes: ConvocacaoPreviewParticipant[];
  ausentes_email: ConvocacaoPreviewParticipant[];
  invalidos_email: ConvocacaoPreviewParticipant[];
  ultima_convocacao_em: string | null;
  avisos: string[];
};

export type ConvocacaoRuntimeContext = {
  treinamento: {
    id: number;
    qualificacao_nome?: string | null;
    titulo?: string | null;
    data_prevista: string;
    hora_inicio?: string | null;
    hora_fim?: string | null;
    status: string;
    local?: string | null;
    instrutor_nome?: string | null;
    instrutor_guerra?: string | null;
    participantes: Array<{
      funcionario_id: number;
      funcionario_nome?: string | null;
      funcionario_guerra?: string | null;
      funcionario_matricula?: string | null;
      funcionario_email?: string | null;
    }>;
  };
  empresaNome: string;
  config: EmailConvocacaoConfig;
  gestoresCc: GestorCopia[];
  ultimaConvocacaoEm: string | null;
};

export function buildConvocacaoPreview(context: ConvocacaoRuntimeContext): ConvocacaoPreview {
  const treinamentoNome =
    trimOrNull(context.treinamento.titulo) ||
    trimOrNull(context.treinamento.qualificacao_nome) ||
    'Treinamento planejado';
  const modalidade = detectModalidade({
    local: context.treinamento.local,
    titulo: context.treinamento.titulo,
    qualificacao_nome: context.treinamento.qualificacao_nome,
  });
  const local = trimOrNull(context.treinamento.local) || 'Local a definir';
  const linkAcesso = /^https?:\/\//i.test(local) ? local : null;
  const participantes = context.treinamento.participantes.map((participante) => {
    const email = trimOrNull(participante.funcionario_email);
    let status: ConvocacaoPreviewParticipant['status'] = 'ready';
    let motivo: string | null = null;
    if (!email) {
      status = 'missing_email';
      motivo = 'Tripulante sem e-mail cadastrado';
    } else if (!isEmail(email)) {
      status = 'invalid_email';
      motivo = 'E-mail com formato inválido';
    }

    return {
      funcionario_id: participante.funcionario_id,
      nome:
        trimOrNull(participante.funcionario_nome) ||
        trimOrNull(participante.funcionario_guerra) ||
        `Funcionário ${participante.funcionario_id}`,
      matricula: trimOrNull(participante.funcionario_matricula),
      email,
      status,
      motivo,
    };
  });

  const ausentesEmail = participantes.filter((item) => item.status === 'missing_email');
  const invalidosEmail = participantes.filter((item) => item.status === 'invalid_email');
  const validos = participantes.filter((item) => item.status === 'ready');
  const avisos: string[] = [];

  if (context.gestoresCc.length > 10) {
    avisos.push('Mais de 10 gestores ativos em cópia. Isso pode impactar a entregabilidade.');
  }
  if (context.ultimaConvocacaoEm) {
    avisos.push(`Esta turma já recebeu convocação em ${context.ultimaConvocacaoEm}.`);
  }

  return {
    treinamento_id: context.treinamento.id,
    treinamento_nome: treinamentoNome,
    data_inicio: formatDateBr(context.treinamento.data_prevista),
    data_fim: formatDateBr(context.treinamento.data_prevista),
    horario:
      [trimOrNull(context.treinamento.hora_inicio), trimOrNull(context.treinamento.hora_fim)]
        .filter(Boolean)
        .join(' às ') || 'Não informado',
    local,
    link_acesso: linkAcesso,
    modalidade,
    instrutor:
      trimOrNull(context.treinamento.instrutor_nome) ||
      trimOrNull(context.treinamento.instrutor_guerra) ||
      'Não informado',
    destinatarios_total: participantes.length,
    destinatarios_validos: validos.length,
    gestores_cc: context.gestoresCc,
    participantes,
    ausentes_email: ausentesEmail,
    invalidos_email: invalidosEmail,
    ultima_convocacao_em: context.ultimaConvocacaoEm,
    avisos,
  };
}

export function buildTemplateVariables(input: {
  tripulanteNome: string;
  matricula: string | null;
  treinamentoNome: string;
  modalidade: string;
  dataInicio: string;
  dataFim: string;
  horario: string;
  local: string;
  linkAcesso: string | null;
  instrutor: string;
  empresa: string;
  dataEnvio: string;
  assinaturaHtml: string;
  listaParticipantesHtml: string;
}): Record<string, string> {
  return {
    '{{NOME_TRIPULANTE}}': escapeHtml(input.tripulanteNome),
    '{{MATRICULA}}': escapeHtml(input.matricula || 'Não informada'),
    '{{NOME_TREINAMENTO}}': escapeHtml(input.treinamentoNome),
    '{{MODALIDADE}}': escapeHtml(input.modalidade),
    '{{DATA_INICIO}}': escapeHtml(input.dataInicio),
    '{{DATA_FIM}}': escapeHtml(input.dataFim),
    '{{HORARIO}}': escapeHtml(input.horario),
    '{{LOCAL}}': escapeHtml(input.local),
    '{{LINK_ACESSO}}': input.linkAcesso
      ? `<a href="${escapeHtml(input.linkAcesso)}">${escapeHtml(input.linkAcesso)}</a>`
      : 'Não aplicável',
    '{{INSTRUTOR}}': escapeHtml(input.instrutor),
    '{{EMPRESA}}': escapeHtml(input.empresa),
    '{{DATA_ENVIO}}': escapeHtml(input.dataEnvio),
    '{{LISTA_PARTICIPANTES_TURMA}}': input.listaParticipantesHtml,
    '{{ASSINATURA_INSTITUCIONAL}}': input.assinaturaHtml,
  };
}

export function applyTemplate(template: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce(
    (html, [key, value]) => html.split(key).join(value),
    template,
  );
}

export async function persistConvocacaoResumo(
  db: D1Database,
  input: {
    empresaId: number;
    treinamentoId: number;
    disparadoPor: number | null;
    disparadoPorNome: string | null;
    assunto: string;
    templateHtmlSnapshot: string;
    replyTo: string | null;
    cc: string[];
    avisos: string[];
    destinatariosTotal: number;
    enviadosSucesso: number;
    enviadosFalha: number;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO treinamentos_convocacoes_email (
        empresa_id, treinamento_id, disparado_por, disparado_por_nome, assunto,
        template_html_snapshot, reply_to, cc_json, avisos_json,
        destinatarios_total, enviados_sucesso, enviados_falha, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      input.empresaId,
      input.treinamentoId,
      input.disparadoPor,
      input.disparadoPorNome,
      input.assunto,
      input.templateHtmlSnapshot,
      input.replyTo,
      JSON.stringify(input.cc),
      JSON.stringify(input.avisos),
      input.destinatariosTotal,
      input.enviadosSucesso,
      input.enviadosFalha,
    )
    .run();

  return Number(result.meta.last_row_id || 0);
}

export async function persistConvocacaoItem(
  db: D1Database,
  input: {
    convocacaoId: number;
    treinamentoId: number;
    funcionarioId: number;
    emailDestino: string | null;
    status: 'sucesso' | 'falha' | 'ignorado';
    erroMensagem?: string | null;
    providerMessageId?: string | null;
    payloadJson?: Record<string, unknown> | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO treinamentos_convocacoes_email_itens (
        convocacao_id, treinamento_id, funcionario_id, email_destino, status,
        erro_mensagem, provider_message_id, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      input.convocacaoId,
      input.treinamentoId,
      input.funcionarioId,
      input.emailDestino,
      input.status,
      input.erroMensagem || null,
      input.providerMessageId || null,
      input.payloadJson ? JSON.stringify(input.payloadJson) : null,
    )
    .run();
}

export async function sendConvocacaoInBatches(input: {
  env: Env;
  db: D1Database;
  empresaId: number;
  treinamentoId: number;
  disparadoPor: number | null;
  disparadoPorNome: string | null;
  subjectTemplate: string;
  templateHtml: string;
  assinaturaHtml: string;
  replyTo: string | null;
  senderName: string | null;
  senderEmail: string | null;
  cc: string[];
  preview: ConvocacaoPreview;
  participantes: ConvocacaoPreviewParticipant[];
  batchSize: number;
  batchIntervalMs: number;
  empresaNome: string;
}): Promise<{
  convocacaoId: number;
  enviados_sucesso: number;
  enviados_falha: number;
  itens: Array<{
    funcionario_id: number;
    nome: string;
    email: string | null;
    status: 'sucesso' | 'falha' | 'ignorado';
    erro_mensagem: string | null;
  }>;
}> {
  const normalizedCc = [
    ...new Set(
      input.cc.filter((email) => isEmail(email)).map((email) => email.trim().toLowerCase()),
    ),
  ];
  const convocacaoId = await persistConvocacaoResumo(input.db, {
    empresaId: input.empresaId,
    treinamentoId: input.treinamentoId,
    disparadoPor: input.disparadoPor,
    disparadoPorNome: input.disparadoPorNome,
    assunto: input.subjectTemplate,
    templateHtmlSnapshot: input.templateHtml,
    replyTo: input.replyTo,
    cc: normalizedCc,
    avisos: input.preview.avisos,
    destinatariosTotal: input.participantes.length,
    enviadosSucesso: 0,
    enviadosFalha: 0,
  });

  const itens: Array<{
    funcionario_id: number;
    nome: string;
    email: string | null;
    status: 'sucesso' | 'falha' | 'ignorado';
    erro_mensagem: string | null;
  }> = [];
  let enviadosSucesso = 0;
  let enviadosFalha = 0;
  const listaParticipantesHtml =
    input.preview.participantes.length > 0
      ? `<ul>${input.preview.participantes
          .map((participante) => {
            const nome = escapeHtml(participante.nome || 'Tripulante');
            const matricula = escapeHtml(participante.matricula || 'Sem matrícula');
            return `<li>${nome} (${matricula})</li>`;
          })
          .join('')}</ul>`
      : '<p>Sem participantes vinculados.</p>';

  for (let index = 0; index < input.participantes.length; index += input.batchSize) {
    const batch = input.participantes.slice(index, index + input.batchSize);

    for (const participante of batch) {
      if (participante.status !== 'ready' || !participante.email) {
        const erroMensagem = participante.motivo || 'Destinatário ignorado';
        itens.push({
          funcionario_id: participante.funcionario_id,
          nome: participante.nome,
          email: participante.email,
          status: 'ignorado',
          erro_mensagem: erroMensagem,
        });
        await persistConvocacaoItem(input.db, {
          convocacaoId,
          treinamentoId: input.treinamentoId,
          funcionarioId: participante.funcionario_id,
          emailDestino: participante.email,
          status: 'ignorado',
          erroMensagem,
        });
        continue;
      }

      try {
        const variables = buildTemplateVariables({
          tripulanteNome: participante.nome,
          matricula: participante.matricula,
          treinamentoNome: input.preview.treinamento_nome,
          modalidade: input.preview.modalidade,
          dataInicio: input.preview.data_inicio,
          dataFim: input.preview.data_fim,
          horario: input.preview.horario,
          local: input.preview.local,
          linkAcesso: input.preview.link_acesso,
          instrutor: input.preview.instrutor,
          empresa: input.empresaNome,
          dataEnvio: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          assinaturaHtml: input.assinaturaHtml,
          listaParticipantesHtml,
        });
        const subject = applyTemplate(input.subjectTemplate, variables)
          .replace(/<[^>]+>/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        const htmlContent = applyTemplate(input.templateHtml, variables);
        const textContent = htmlToText(htmlContent);
        const sendResult = await sendConvocacaoEmail({
          env: input.env,
          to: participante.email,
          cc: normalizedCc,
          subject,
          textContent,
          htmlContent,
          replyTo: input.replyTo,
          senderName: input.senderName,
          senderEmail: input.senderEmail,
        });

        enviadosSucesso += 1;
        itens.push({
          funcionario_id: participante.funcionario_id,
          nome: participante.nome,
          email: participante.email,
          status: 'sucesso',
          erro_mensagem: null,
        });
        await persistConvocacaoItem(input.db, {
          convocacaoId,
          treinamentoId: input.treinamentoId,
          funcionarioId: participante.funcionario_id,
          emailDestino: participante.email,
          status: 'sucesso',
          providerMessageId: sendResult.messageId,
          payloadJson: { cc: normalizedCc },
        });
      } catch (error) {
        enviadosFalha += 1;
        const erroMensagem = error instanceof Error ? error.message : 'Falha desconhecida';
        itens.push({
          funcionario_id: participante.funcionario_id,
          nome: participante.nome,
          email: participante.email,
          status: 'falha',
          erro_mensagem: erroMensagem,
        });
        await persistConvocacaoItem(input.db, {
          convocacaoId,
          treinamentoId: input.treinamentoId,
          funcionarioId: participante.funcionario_id,
          emailDestino: participante.email,
          status: 'falha',
          erroMensagem,
        });
      }
    }

    if (index + input.batchSize < input.participantes.length) {
      await wait(input.batchIntervalMs);
    }
  }

  await input.db
    .prepare(
      `UPDATE treinamentos_convocacoes_email
          SET enviados_sucesso = ?, enviados_falha = ?
        WHERE id = ?`,
    )
    .bind(enviadosSucesso, enviadosFalha, convocacaoId)
    .run();

  return {
    convocacaoId,
    enviados_sucesso: enviadosSucesso,
    enviados_falha: enviadosFalha,
    itens,
  };
}
