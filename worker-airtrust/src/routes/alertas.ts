// ============================================================
// AIRTRUST - FASE 4: ALERTAS DE VENCIMENTO
// ============================================================
// Endpoint único para listar alertas de vencimento:
//  - Qualificações que vencem em <= X dias (padrão 60)
//  - Licenças que vencem em <= X dias (padrão 60)
// ============================================================

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { createLogger, toError } from '../utils/logger';
import {
  getQualificacoesAlertaDias,
  getTodayIsoSaoPaulo,
  getQualificacoesVencimentoExpr,
  normalizeQualificacoesAlertaDias,
} from '../utils/qualificacoes-alerta-config';
import { getEmpresaId } from '../middleware/tenant';
import { normalizeWhatsAppPhone } from '../utils/whatsapp';
import {
  getTwilioWhatsAppDiagnosis,
  mapTwilioMessageStatus,
  verifyTwilioWebhookSignature,
} from '../utils/twilio';
import {
  getLocalWhatsAppTemplateRecord,
  listLocalWhatsAppTemplates,
  seedLocalWhatsAppTemplateCatalog,
  syncWhatsAppTemplatesToTwilio,
} from '../utils/alert-whatsapp-templates-store';
import {
  buildQualificacaoTemplateVariables,
  getAlertWhatsAppTemplateCatalog,
  getAlertWhatsAppTemplateDefinition,
  renderTemplateBody,
  resolveQualificacaoAlertTemplateKey,
  type AlertWhatsAppTemplateKey,
} from '../utils/whatsapp-templates';
import { sendWhatsAppMessage } from '../utils/whatsapp-send';

const app = new Hono<{ Bindings: Env }>();
const TWILIO_STATUS_CALLBACK_PATH = '/api/alertas/whatsapp/status-callback';

export function buildAlertasVencimentosQualificacoesQuery(vencimentoExpr: string) {
  return `SELECT
          qh.id,
          qh.funcionario_id,
          qh.data_conclusao,
          ${vencimentoExpr} as data_vencimento,
          COALESCE(qt.nome, qh.qualificacao_codigo, 'Qualificação') AS nome_qualificacao,
          COALESCE(qh.qualificacao_codigo, qt.codigo) AS codigo_qualificacao,
          COALESCE(qh.categoria, qt.categoria, qt.nome, 'Sem categoria') AS categoria,
          p.nome,
          p.matricula,
          p.funcao,
          NULL as base
       FROM qualificacoes_historico qh
       JOIN funcionarios p ON qh.funcionario_id = p.id
       LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
      WHERE qh.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND p.empresa_id = ?
        AND UPPER(COALESCE(NULLIF(TRIM(p.status), ''), 'ATIVO')) = 'ATIVO'
        AND COALESCE(qh.renovada, 0) = 0
        AND UPPER(COALESCE(qh.status, 'CONCLUIDA')) NOT IN ('CANCELADA', 'RENOVADA')
        AND NOT EXISTS (
          SELECT 1
            FROM qualificacoes_historico qh_new
            LEFT JOIN qualificacoes_tipos qt_new
              ON qt_new.id = qh_new.qualificacao_id
             AND qt_new.deleted_at IS NULL
           WHERE qh_new.deleted_at IS NULL
             AND qh_new.funcionario_id = qh.funcionario_id
             AND qh_new.id <> qh.id
             AND COALESCE(qh_new.renovada, 0) = 0
             AND UPPER(COALESCE(qh_new.status, 'CONCLUIDA')) NOT IN ('CANCELADA', 'RENOVADA', 'PLANEJADA')
             AND UPPER(TRIM(COALESCE(qh_new.qualificacao_codigo, qt_new.codigo, ''))) =
                 UPPER(TRIM(COALESCE(qh.qualificacao_codigo, qt.codigo, '')))
             AND date(COALESCE(
               qh_new.data_vencimento,
               CASE
                 WHEN qh_new.data_conclusao IS NOT NULL
                   THEN date(qh_new.data_conclusao, '+' || COALESCE(qh_new.validade_meses, qt_new.validade, 12) || ' months')
                 ELSE NULL
               END
             )) > date(${vencimentoExpr})
        )
        AND ${vencimentoExpr} IS NOT NULL
        AND date(${vencimentoExpr}) <= date(?, '+' || ? || ' days')
      ORDER BY data_vencimento ASC`;
}

function buildWhatsAppManualLink(telefone: string, mensagem?: string): string {
  const normalized = normalizeWhatsAppPhone(telefone);
  const baseUrl = `https://wa.me/${normalized.e164.replace(/\D/g, '')}`;

  if (!mensagem?.trim()) {
    return baseUrl;
  }

  return `${baseUrl}?text=${encodeURIComponent(mensagem)}`;
}

function alertasErrorResponse(
  c: Context<{ Bindings: Env }>,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
  error: string,
  code: string,
  extra?: Record<string, unknown>,
) {
  return c.json({ success: false, error, code, ...extra }, status);
}

// Auth específico por rota (rotas montadas em /api não podem ter use('*') global)
app.use('/alertas/vencimentos', auth());
app.use('/alertas/ead-vencido/:id', auth());
app.use('/alertas/whatsapp/delivery/:sid', auth());
app.use('/alertas/whatsapp/templates', auth());
app.use('/alertas/whatsapp/templates/*', auth());

function formatDatePtBr(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

async function upsertWhatsAppDeliveryLog(
  db: D1Database,
  payload: {
    empresaId?: number | null;
    qualificacaoHistoricoId?: number | null;
    funcionarioId?: number | null;
    provider: string;
    providerMessageId: string;
    telefoneDestino?: string | null;
    telefoneOrigem?: string | null;
    status: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    rawPayload?: Record<string, unknown> | null;
  },
): Promise<void> {
  const status =
    String(payload.status || '')
      .trim()
      .toLowerCase() || 'unknown';
  const acceptedAt = ['accepted', 'queued', 'sent'].includes(status) ? "datetime('now')" : 'NULL';
  const deliveredAt = ['delivered', 'read'].includes(status) ? "datetime('now')" : 'NULL';
  const failedAt = ['failed', 'undelivered'].includes(status) ? "datetime('now')" : 'NULL';

  await db
    .prepare(
      `INSERT INTO alertas_whatsapp_delivery (
        empresa_id,
        qualificacao_historico_id,
        funcionario_id,
        provider,
        provider_message_id,
        telefone_destino,
        telefone_origem,
        status,
        error_code,
        error_message,
        payload_json,
        accepted_at,
        delivered_at,
        failed_at,
        last_event_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${acceptedAt}, ${deliveredAt}, ${failedAt}, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(provider_message_id) DO UPDATE SET
        empresa_id = COALESCE(excluded.empresa_id, alertas_whatsapp_delivery.empresa_id),
        qualificacao_historico_id = COALESCE(excluded.qualificacao_historico_id, alertas_whatsapp_delivery.qualificacao_historico_id),
        funcionario_id = COALESCE(excluded.funcionario_id, alertas_whatsapp_delivery.funcionario_id),
        provider = excluded.provider,
        telefone_destino = COALESCE(excluded.telefone_destino, alertas_whatsapp_delivery.telefone_destino),
        telefone_origem = COALESCE(excluded.telefone_origem, alertas_whatsapp_delivery.telefone_origem),
        status = excluded.status,
        error_code = COALESCE(excluded.error_code, alertas_whatsapp_delivery.error_code),
        error_message = COALESCE(excluded.error_message, alertas_whatsapp_delivery.error_message),
        payload_json = COALESCE(excluded.payload_json, alertas_whatsapp_delivery.payload_json),
        accepted_at = COALESCE(alertas_whatsapp_delivery.accepted_at, excluded.accepted_at),
        delivered_at = COALESCE(alertas_whatsapp_delivery.delivered_at, excluded.delivered_at),
        failed_at = COALESCE(alertas_whatsapp_delivery.failed_at, excluded.failed_at),
        last_event_at = datetime('now'),
        updated_at = datetime('now')`,
    )
    .bind(
      payload.empresaId ?? null,
      payload.qualificacaoHistoricoId ?? null,
      payload.funcionarioId ?? null,
      payload.provider,
      payload.providerMessageId,
      payload.telefoneDestino ?? null,
      payload.telefoneOrigem ?? null,
      status,
      payload.errorCode ?? null,
      payload.errorMessage ?? null,
      payload.rawPayload ? JSON.stringify(payload.rawPayload) : null,
    )
    .run();
}

async function fetchTwilioMessageStatus(env: Env, sid: string) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error('WHATSAPP_NOT_CONFIGURED');
  }

  const authHeader = `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages/${sid}.json`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TWILIO_STATUS_ERROR: ${response.status} - ${errorText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return mapTwilioMessageStatus(payload);
}

async function enviarEmail(
  env: Env,
  destinatarios: string[],
  assunto: string,
  corpoTexto: string,
  corpoHtml: string,
): Promise<{ messageId: string | null; provider: 'brevo' }> {
  if (!env.BREVO_API_KEY) {
    throw new Error('EMAIL_NOT_CONFIGURED');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online',
        name: env.BREVO_FROM_NAME || 'Treinamento',
      },
      to: destinatarios.map((email) => ({ email })),
      subject: assunto,
      textContent: corpoTexto,
      htmlContent: corpoHtml,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BREVO_ERROR: ${response.status} - ${errorText}`);
  }

  const payload = (await response.json().catch(() => null)) as { messageId?: string } | null;
  return { messageId: payload?.messageId || null, provider: 'brevo' };
}

app.get(
  '/alertas/whatsapp/templates',
  requireRole('admin'),
  async (c: Context<{ Bindings: Env }>) => {
    try {
      const catalog = getAlertWhatsAppTemplateCatalog();
      await seedLocalWhatsAppTemplateCatalog(c.env.DB);
      const localRows = await listLocalWhatsAppTemplates(c.env.DB);
      const localByKey = new Map(localRows.map((row) => [row.template_key, row]));

      return c.json({
        success: true,
        data: catalog.map((template) => ({
          ...template,
          local: localByKey.get(template.key) || null,
        })),
      });
    } catch (error) {
      return alertasErrorResponse(
        c,
        500,
        'Erro ao listar templates de WhatsApp',
        'WHATSAPP_TEMPLATES_LIST_ERROR',
        {
          details: 'Detalhes internos omitidos',
        },
      );
    }
  },
);

app.post(
  '/alertas/whatsapp/templates/sync',
  requireRole('admin'),
  async (c: Context<{ Bindings: Env }>) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        templateKeys?: AlertWhatsAppTemplateKey[];
      };
      const validKeys = new Set(getAlertWhatsAppTemplateCatalog().map((template) => template.key));
      const templateKeys = (body.templateKeys || []).filter((key) => validKeys.has(key));
      const syncedTemplates = await syncWhatsAppTemplatesToTwilio(
        c.env,
        c.env.DB,
        templateKeys.length > 0 ? templateKeys : undefined,
      );

      return c.json({
        success: true,
        data: {
          synced: syncedTemplates,
          total: syncedTemplates.length,
        },
      });
    } catch (error) {
      return alertasErrorResponse(
        c,
        500,
        'Erro ao sincronizar templates de WhatsApp',
        'WHATSAPP_TEMPLATES_SYNC_ERROR',
        {
          details: 'Detalhes internos omitidos',
        },
      );
    }
  },
);

app.post('/alertas/whatsapp/status-callback', async (c: Context<{ Bindings: Env }>) => {
  try {
    const form = await c.req.formData();
    const payload = Object.fromEntries(
      Array.from(form.entries()).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : '',
      ]),
    ) as Record<string, string>;
    const signature = c.req.header('X-Twilio-Signature');

    const signatureValid = await verifyTwilioWebhookSignature(
      c.env.TWILIO_AUTH_TOKEN || '',
      c.req.url,
      payload,
      signature,
    );

    if (!signatureValid) {
      return alertasErrorResponse(
        c,
        401,
        'Assinatura do callback Twilio invalida',
        'TWILIO_WEBHOOK_UNAUTHORIZED',
      );
    }

    const mappedStatus = mapTwilioMessageStatus(payload);
    if (!mappedStatus.sid) {
      return alertasErrorResponse(
        c,
        400,
        'Callback Twilio sem MessageSid',
        'TWILIO_WEBHOOK_INVALID_PAYLOAD',
      );
    }

    await upsertWhatsAppDeliveryLog(c.env.DB, {
      provider: 'twilio',
      providerMessageId: mappedStatus.sid,
      telefoneDestino: mappedStatus.to,
      telefoneOrigem: mappedStatus.from,
      status: mappedStatus.status || 'unknown',
      errorCode: mappedStatus.errorCode,
      errorMessage: mappedStatus.errorMessage,
      rawPayload: payload,
    });

    return c.json({
      success: true,
      data: {
        sid: mappedStatus.sid,
        status: mappedStatus.status,
      },
    });
  } catch (error) {
    return alertasErrorResponse(
      c,
      500,
      'Erro ao processar callback do Twilio',
      'TWILIO_WEBHOOK_ERROR',
      {
        details: 'Detalhes internos omitidos',
      },
    );
  }
});

app.get('/alertas/whatsapp/delivery/:sid', async (c: Context<{ Bindings: Env }>) => {
  const logger = createLogger(c, 'Alertas.whatsAppDelivery');
  try {
    const sid = String(c.req.param('sid') || '').trim();
    const empresaId = getEmpresaId(c as any);

    if (!sid) {
      return alertasErrorResponse(c, 400, 'SID invalido', 'TWILIO_STATUS_INVALID_SID');
    }

    const localLog = await c.env.DB.prepare(
      `SELECT *
           FROM alertas_whatsapp_delivery
          WHERE provider_message_id = ?
            AND empresa_id = ?
          LIMIT 1`,
    )
      .bind(sid, empresaId)
      .first<Record<string, unknown>>();

    if (!localLog) {
      return alertasErrorResponse(
        c,
        404,
        'SID nao encontrado para sua empresa',
        'TWILIO_STATUS_NOT_FOUND',
      );
    }

    const twilioStatus = await fetchTwilioMessageStatus(c.env, sid);
    await upsertWhatsAppDeliveryLog(c.env.DB, {
      empresaId,
      qualificacaoHistoricoId: Number(localLog.qualificacao_historico_id || 0) || null,
      funcionarioId: Number(localLog.funcionario_id || 0) || null,
      provider: 'twilio',
      providerMessageId: sid,
      telefoneDestino: twilioStatus.to,
      telefoneOrigem: twilioStatus.from,
      status: twilioStatus.status || 'unknown',
      errorCode: twilioStatus.errorCode,
      errorMessage: twilioStatus.errorMessage,
      rawPayload: twilioStatus.raw,
    });

    return c.json({
      success: true,
      data: {
        sid,
        status: twilioStatus.status,
        errorCode: twilioStatus.errorCode,
        errorMessage: twilioStatus.errorMessage,
        to: twilioStatus.to,
        from: twilioStatus.from,
        diagnosis: getTwilioWhatsAppDiagnosis(
          twilioStatus.status,
          twilioStatus.errorCode,
          twilioStatus.errorMessage,
        ),
      },
    });
  } catch (error) {
    logger.error('Erro ao consultar status do WhatsApp', toError(error), {
      sid: c.req.param('sid'),
    });
    return alertasErrorResponse(
      c,
      500,
      'Erro ao consultar status do WhatsApp',
      'TWILIO_STATUS_ERROR',
      {
        details: 'Detalhes internos omitidos',
      },
    );
  }
});

// ============================================================
// GET /api/alertas/vencimentos?dias=60
// ============================================================

app.get('/alertas/vencimentos', async (c: Context<{ Bindings: Env }>) => {
  const logger = createLogger(c, 'Alertas.vencimentos');
  try {
    const empresaId = getEmpresaId(c as any);
    const diasConfigurados = await getQualificacoesAlertaDias(c.env.DB, empresaId);
    const diasStr = c.req.query('dias');
    const dias = diasStr ? normalizeQualificacoesAlertaDias(diasStr) : diasConfigurados;
    const hojeSp = getTodayIsoSaoPaulo();
    const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');

    console.log(`[Alertas] Buscando vencimentos para próximos ${dias} dias`);

    // 1. Qualificações a vencer
    const qualStmt = await c.env.DB.prepare(
      buildAlertasVencimentosQualificacoesQuery(vencimentoExpr),
    )
      .bind(empresaId, hojeSp, dias)
      .all();

    if (!qualStmt.success) {
      logger.error('[Alertas] Erro ao buscar qualificações', toError(qualStmt.error), { dias });
    }

    // 2. Licenças a vencer
    const licStmt = await c.env.DB.prepare(
      `SELECT
          l.id,
          l.funcionario_id,
          l.tipo,
          l.numero,
          l.data_emissao,
          l.data_vencimento,
          l.observacoes,
          p.nome,
          p.matricula,
          p.funcao,
          NULL as base
       FROM licencas l
       JOIN funcionarios p ON l.funcionario_id = p.id
      WHERE l.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND p.empresa_id = ?
        AND UPPER(COALESCE(NULLIF(TRIM(p.status), ''), 'ATIVO')) = 'ATIVO'
          AND date(l.data_vencimento) <= date(?, '+' || ? || ' days')
      ORDER BY l.data_vencimento ASC`,
    )
      .bind(empresaId, hojeSp, dias)
      .all();

    if (!licStmt.success) {
      logger.error('[Alertas] Erro ao buscar licenças', toError(licStmt.error), { dias });
    }

    console.log(
      `[Alertas] Encontradas ${qualStmt.results?.length || 0} qualificações e ${
        licStmt.results?.length || 0
      } licenças a vencer`,
    );

    return c.json({
      success: true,
      data: {
        dias,
        qualificacoes: qualStmt.results || [],
        licencas: licStmt.results || [],
      },
    });
  } catch (error) {
    logger.error('Erro ao buscar alertas de vencimento', toError(error));
    return alertasErrorResponse(
      c,
      500,
      'Erro ao buscar alertas de vencimento',
      'ALERTAS_VENCIMENTOS_ERROR',
      {
        details: 'Detalhes internos omitidos',
      },
    );
  }
});

// ============================================================
// POST /api/alertas/ead-vencido/:id
// Envia alertas por email/WhatsApp para qualificação EAD vencida
// ============================================================

app.post('/alertas/ead-vencido/:id', async (c: Context<{ Bindings: Env }>) => {
  const logger = createLogger(c, 'Alertas.eadVencido');
  try {
    const id = parseInt(c.req.param('id') ?? '', 10);
    const empresaId = getEmpresaId(c as any);

    console.log('[ALERTAS] Recebido ID:', id);

    if (isNaN(id)) {
      return alertasErrorResponse(c, 400, 'ID inválido', 'ALERTA_INVALID_ID');
    }

    // Ler body para pegar mensagem e opções de envio
    const body = await c.req.json().catch(() => ({}));
    const mensagemCustom = body.mensagem;
    const enviarEmailCanal = body.enviarEmail !== false; // default true
    const enviarWhatsApp = body.enviarWhatsApp !== false; // default true

    console.log('[ALERTAS] Opções:', { enviarEmailCanal, enviarWhatsApp });

    const db = c.env.DB;

    // Buscar qualificação com dados do funcionário (qualificacoes_historico)
    const query = `
      SELECT 
        qh.id,
        qh.funcionario_id,
        qh.qualificacao_id,
        qh.data_vencimento,
        qh.codigo as tipo_codigo,
        COALESCE(qh.categoria, qt.categoria) as categoria,
        qt.nome as tipo_nome,
        f.nome as funcionario_nome,
        f.email as funcionario_email,
        f.telefone as funcionario_telefone
      FROM qualificacoes_historico qh
      LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
      WHERE qh.id = ?
        AND qh.deleted_at IS NULL
        AND f.empresa_id = ?
    `;

    const result = await db.prepare(query).bind(id, empresaId).first();

    console.log('[ALERTAS] Resultado query:', result ? 'encontrado' : 'não encontrado');
    console.log('[ALERTAS] Dados completos:', JSON.stringify(result, null, 2));

    if (!result) {
      return alertasErrorResponse(
        c,
        404,
        'Qualificação não encontrada no histórico',
        'ALERTA_QUALIFICACAO_NOT_FOUND',
      );
    }

    // Type-safe result
    const r = result as Record<string, string | null | number>;

    // Validações detalhadas
    const erros: string[] = [];

    if (!r.funcionario_nome) {
      erros.push('Funcionário não possui nome cadastrado');
    }

    if (!r.tipo_nome && !r.tipo_codigo) {
      erros.push('Qualificação não possui nome ou código cadastrado');
    }

    if (!r.data_vencimento) {
      erros.push('Qualificação não possui data de vencimento');
    }

    if (!r.categoria) {
      erros.push('Qualificação não possui categoria definida');
    }

    // Verificar canais de comunicação
    const temEmail = r.funcionario_email && (r.funcionario_email as string).trim() !== '';
    const temTelefone = r.funcionario_telefone && (r.funcionario_telefone as string).trim() !== '';

    if (enviarEmailCanal && !temEmail) {
      erros.push('Funcionário não possui e-mail cadastrado');
    }

    if (enviarWhatsApp && !temTelefone) {
      erros.push('Funcionário não possui telefone cadastrado');
    }

    if (!temEmail && !temTelefone) {
      erros.push('Funcionário não possui e-mail nem telefone cadastrado para envio');
    }

    if (erros.length > 0) {
      console.log('[ALERTAS] Erros de validação:', erros);
      return alertasErrorResponse(
        c,
        400,
        'Dados insuficientes para enviar alerta',
        'ALERTA_INVALID_CONTACT_DATA',
        {
          detalhes: erros,
        },
      );
    }

    // Verificar se é EAD ou CMA
    const categoria = (r.categoria as string)?.toUpperCase();
    const isEAD = categoria === 'EAD' || categoria === 'TREINAMENTO EAD';
    const isCMA = categoria === 'CMA' || categoria === 'EXAME';

    if (!isEAD && !isCMA) {
      return alertasErrorResponse(
        c,
        400,
        'Esta qualificação não é um treinamento EAD ou CMA',
        'ALERTA_INVALID_CATEGORY',
        {
          detalhes: [`Categoria atual: ${categoria}`],
        },
      );
    }

    // Verificar se está vencida ou vencendo
    const dataVencimento = new Date(r.data_vencimento as string);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    dataVencimento.setHours(0, 0, 0, 0);

    const diasDiferenca = Math.floor(
      (dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
    );

    let statusVencimento = '';
    if (diasDiferenca < 0) {
      statusVencimento = `Vencida há ${Math.abs(diasDiferenca)} dias`;
    } else if (diasDiferenca <= 30) {
      statusVencimento = `Vence em ${diasDiferenca} dias`;
    } else {
      return alertasErrorResponse(
        c,
        400,
        'Esta qualificação ainda não está próxima do vencimento',
        'ALERTA_TOO_EARLY',
        {
          detalhes: [
            `Vence em ${diasDiferenca} dias. Alertas são enviados apenas 30 dias antes do vencimento.`,
          ],
        },
      );
    }

    // Usar mensagem customizada ou padrão
    const tipoAlerta = isCMA ? 'CMA' : 'EAD';
    const mensagem =
      mensagemCustom ||
      `
🔔 *ALERTA - Treinamento ${tipoAlerta} ${diasDiferenca < 0 ? 'Vencido' : 'a Vencer'}*

Funcionário: ${r.funcionario_nome}
Qualificação: ${r.tipo_nome || r.tipo_codigo}
Vencimento: ${dataVencimento.toLocaleDateString('pt-BR')}
${statusVencimento}

Por favor, providencie a renovação o quanto antes.
    `.trim();

    const alertas: Array<{
      tipo: 'email' | 'whatsapp';
      destino: string;
      status: 'enviado' | 'erro';
      mensagem?: string;
      erro?: string;
      provider?: string;
      providerStatus?: string;
      providerMessageId?: string;
      deliveryStatusPath?: string;
      manualFallbackUrl?: string;
      templateKey?: string;
      templateName?: string;
      templateApprovalStatus?: string | null;
      messageMode?: 'free-form' | 'template';
    }> = [];

    // Enviar email (se tiver e se opção marcada)
    if (enviarEmailCanal && temEmail) {
      try {
        const assunto = `🔔 ALERTA - ${tipoAlerta} ${diasDiferenca < 0 ? 'Vencido' : 'a Vencer'}`;
        const corpoHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
            <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <h2 style="color: #f59e0b; margin-top: 0;">🔔 ALERTA - ${tipoAlerta} ${diasDiferenca < 0 ? 'Vencido' : 'a Vencer'}</h2>
              <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Funcionário:</strong> ${r.funcionario_nome}</p>
                <p style="margin: 5px 0;"><strong>Qualificação:</strong> ${r.tipo_nome || r.tipo_codigo}</p>
                <p style="margin: 5px 0;"><strong>Vencimento:</strong> ${dataVencimento.toLocaleDateString('pt-BR')}</p>
                <p style="margin: 5px 0;"><strong>Status:</strong> ${statusVencimento}</p>
              </div>
              <p style="color: #dc2626; font-weight: bold;">Por favor, providencie a renovação o quanto antes.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                Esta é uma notificação automática. Por favor, não responda este email.
              </p>
            </div>
          </div>
        `;

        const emailResult = await enviarEmail(
          c.env,
          [r.funcionario_email as string],
          assunto,
          mensagem,
          corpoHtml,
        );

        alertas.push({
          tipo: 'email',
          destino: r.funcionario_email as string,
          status: 'enviado',
          mensagem: `Email enviado para ${r.funcionario_nome}`,
          provider: emailResult.provider,
          providerStatus: 'accepted',
          providerMessageId: emailResult.messageId || undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alertas.push({
          tipo: 'email',
          destino: r.funcionario_email as string,
          status: 'erro',
          erro:
            msg === 'EMAIL_NOT_CONFIGURED'
              ? 'Envio de email não configurado (BREVO_API_KEY ausente)'
              : msg,
        });
      }
    }

    // Enviar WhatsApp (se tiver telefone e se opção marcada)
    if (enviarWhatsApp && temTelefone) {
      try {
        const statusCallbackUrl = new URL(TWILIO_STATUS_CALLBACK_PATH, c.req.url).toString();
        const templateKey = resolveQualificacaoAlertTemplateKey({
          isCma: isCMA,
          expired: diasDiferenca < 0,
        });
        const localTemplate = await getLocalWhatsAppTemplateRecord(db, templateKey);
        const templateDefinition = getAlertWhatsAppTemplateDefinition(templateKey);
        const templateVariables = buildQualificacaoTemplateVariables({
          funcionarioNome: String(r.funcionario_nome || '').trim(),
          qualificacaoNome: String(r.tipo_nome || r.tipo_codigo || '').trim(),
          dataVencimento: formatDatePtBr(String(r.data_vencimento || '')),
          statusVencimento,
        });
        const templateMessage =
          templateDefinition && localTemplate?.twilio_content_sid
            ? renderTemplateBody(templateDefinition.bodyText, templateVariables)
            : null;
        const whatsappResult = await sendWhatsAppMessage(
          c.env,
          r.funcionario_telefone as string,
          mensagem,
          statusCallbackUrl,
          localTemplate?.twilio_content_sid && templateDefinition
            ? {
                contentSid: localTemplate.twilio_content_sid,
                contentVariables: templateVariables,
                templateKey,
                templateName: localTemplate.template_name,
                approvalStatus: localTemplate.approval_status,
              }
            : undefined,
        );

        if (whatsappResult.provider === 'twilio' && whatsappResult.providerMessageId) {
          await upsertWhatsAppDeliveryLog(db, {
            empresaId,
            qualificacaoHistoricoId: Number(r.id),
            funcionarioId: Number(r.funcionario_id),
            provider: whatsappResult.provider,
            providerMessageId: whatsappResult.providerMessageId,
            telefoneDestino: whatsappResult.destination,
            telefoneOrigem: whatsappResult.source,
            status: whatsappResult.providerStatus || 'accepted',
            rawPayload: {
              callbackUrl: statusCallbackUrl,
              qualificacaoHistoricoId: r.id,
              templateKey: whatsappResult.templateKey || null,
              templateName: whatsappResult.templateName || null,
            },
          });
        }

        alertas.push({
          tipo: 'whatsapp',
          destino: whatsappResult.destination,
          status: 'enviado',
          mensagem:
            whatsappResult.provider === 'twilio' && whatsappResult.messageMode === 'template'
              ? `WhatsApp via template aprovado aceito pelo Twilio para ${r.funcionario_nome} (status: ${whatsappResult.providerStatus || 'accepted'})`
              : whatsappResult.provider === 'twilio'
                ? `WhatsApp aceito pelo Twilio para ${r.funcionario_nome} (status: ${whatsappResult.providerStatus || 'accepted'})`
                : `WhatsApp aceito pelo provedor para ${r.funcionario_nome}`,
          provider: whatsappResult.provider,
          providerStatus: whatsappResult.providerStatus,
          providerMessageId: whatsappResult.providerMessageId,
          deliveryStatusPath: whatsappResult.providerMessageId
            ? `/alertas/whatsapp/delivery/${whatsappResult.providerMessageId}`
            : undefined,
          manualFallbackUrl: buildWhatsAppManualLink(
            r.funcionario_telefone as string,
            templateMessage || mensagem,
          ),
          templateKey: whatsappResult.templateKey,
          templateName: whatsappResult.templateName,
          templateApprovalStatus: whatsappResult.templateApprovalStatus,
          messageMode: whatsappResult.messageMode,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alertas.push({
          tipo: 'whatsapp',
          destino: r.funcionario_telefone as string,
          status: 'erro',
          erro:
            msg === 'WHATSAPP_NOT_CONFIGURED'
              ? 'Envio de WhatsApp não configurado (WHATSAPP_API_URL/WHATSAPP_API_TOKEN ausentes)'
              : msg,
        });
      }
    }

    const hasSuccess = alertas.some((a) => a.status === 'enviado');

    if (!hasSuccess) {
      const errosEnvio = alertas
        .filter((a) => a.status === 'erro')
        .map((a) => `${a.tipo.toUpperCase()}: ${a.erro || 'Erro desconhecido'}`);
      return alertasErrorResponse(
        c,
        400,
        'Nenhum canal de envio foi realizado',
        'ALERTA_NO_CHANNEL_SENT',
        {
          detalhes: [
            !enviarEmailCanal ? 'E-mail não selecionado' : !temEmail ? 'E-mail não cadastrado' : '',
            !enviarWhatsApp
              ? 'WhatsApp não selecionado'
              : !temTelefone
                ? 'Telefone não cadastrado'
                : '',
            ...errosEnvio,
          ].filter(Boolean),
        },
      );
    }

    console.log('[ALERTAS] Alerta enviado com sucesso:', alertas.length, 'canais');

    return c.json({
      success: true,
      data: {
        mensagem,
        alertas,
        funcionario: r.funcionario_nome,
        qualificacao: r.tipo_nome || r.tipo_codigo,
        statusVencimento,
      },
    });
  } catch (error) {
    logger.error('[ALERTAS] Erro ao enviar alerta EAD', toError(error));
    const errorMessage = error instanceof Error ? error.message : String(error);
    return alertasErrorResponse(c, 500, 'Erro ao processar alerta', 'ALERTA_PROCESS_ERROR', {
      detalhes: [errorMessage],
    });
  }
});

export default app;
