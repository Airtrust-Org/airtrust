import { calcularDiasAteVencimento, determinarUrgencia } from '../utils/qualificacoes-expiration';
import type { Env } from '../types';
import {
  getLocalWhatsAppTemplateRecord,
  isWhatsAppTemplateApproved,
  seedLocalWhatsAppTemplateCatalog,
} from '../utils/alert-whatsapp-templates-store';
import { normalizeWhatsAppPhone } from '../utils/whatsapp';
import { sendWhatsAppMessage } from '../utils/whatsapp-send';
import {
  buildQualificacaoTemplateVariables,
  getAlertWhatsAppTemplateDefinition,
  renderTemplateBody,
  resolveQualificacaoAlertTemplateKey,
} from '../utils/whatsapp-templates';
import { createStructuredConsole } from '../utils/logger';

interface NotificacaoConfig {
  id: number;
  tipo: string;
  ativo: number;
  dias_antes: number;
  urgencia: string | null;
  destinatarios: string | null;
  template: string;
}

interface QualificacaoParaNotificar {
  id: number;
  funcionario_id: number;
  funcionario_cpf: string;
  funcionario_nome: string;
  funcionario_email: string;
  funcionario_telefone: string;
  qualificacao_codigo: string;
  qualificacao_nome: string;
  categoria: string;
  data_vencimento: string;
}

type WhatsAppTemplateRecord = Awaited<ReturnType<typeof getLocalWhatsAppTemplateRecord>>;

export interface ProcessamentoNotificacoesResumo {
  configsProcessadas: number;
  enviadas: number;
  erros: number;
  porTipo: Record<string, { enviadas: number; erros: number }>;
}

function getNotificacoesConsole(env: Env) {
  return createStructuredConsole('CronNotificacoes', env.ENVIRONMENT || 'development');
}

/**
 * Cron job para enviar notificações de qualificações expirando
 * Executar diariamente às 8h
 */
export async function processarNotificacoes(env: Env): Promise<ProcessamentoNotificacoesResumo> {
  const log = getNotificacoesConsole(env);
  log.log('[NOTIFICACOES] Iniciando processamento...', { dataHora: new Date().toISOString() });

  try {
    // 1. Buscar configurações ativas (globais — notificacoes_config não tem empresa_id)
    const { results: configs } = await env.DB.prepare(
      `
      SELECT
        id,
        tipo,
        ativo,
        dias_antes,
        urgencia,
        destinatarios,
        template
      FROM notificacoes_config
      WHERE ativo = 1 AND deleted_at IS NULL
      ORDER BY dias_antes ASC
    `,
    ).all();

    log.log('[NOTIFICACOES] Configurações ativas encontradas', { total: configs.length });

    if (configs.length === 0) {
      log.warn('[NOTIFICACOES] Nenhuma configuração ativa. Abortando.');
      return {
        configsProcessadas: 0,
        enviadas: 0,
        erros: 0,
        porTipo: {},
      };
    }

    const temWhatsAppAtivo = (configs as unknown as NotificacaoConfig[]).some(
      (config) => normalizeTipoCanal(config.tipo) === 'WHATSAPP',
    );

    if (temWhatsAppAtivo) {
      await seedLocalWhatsAppTemplateCatalog(env.DB);
    }

    // 2. Listar empresas ativas para processamento tenant-aware
    const { results: empresas } = await env.DB.prepare(
      `SELECT id, codigo, nome FROM empresas WHERE ativo = 1 AND deleted_at IS NULL ORDER BY id`,
    ).all<{ id: number; codigo: string; nome: string }>();

    log.log('[NOTIFICACOES] Empresas ativas encontradas', { total: empresas.length });

    let totalEnviadas = 0;
    let totalErros = 0;
    const porTipo: ProcessamentoNotificacoesResumo['porTipo'] = {};

    // 3. Processar cada empresa independentemente
    for (const empresa of empresas) {
      try {
        log.log('[NOTIFICACOES] Processando empresa', {
          empresaId: empresa.id,
          empresaCodigo: empresa.codigo,
        });

        const qualificacoesBase = await carregarQualificacoesParaNotificar(env, empresa.id);
        log.log('[NOTIFICACOES] Qualificacoes base carregadas para empresa', {
          empresaId: empresa.id,
          total: qualificacoesBase.length,
        });

        // Processar cada configuração para esta empresa
        for (const config of configs as unknown as NotificacaoConfig[]) {
          const resultado = await processarConfiguracao(env, config, qualificacoesBase);
          totalEnviadas += resultado.enviadas;
          totalErros += resultado.erros;
          porTipo[normalizeTipoCanal(config.tipo)] = {
            enviadas: (porTipo[normalizeTipoCanal(config.tipo)]?.enviadas || 0) + resultado.enviadas,
            erros: (porTipo[normalizeTipoCanal(config.tipo)]?.erros || 0) + resultado.erros,
          };
        }
      } catch (empresaError) {
        log.error('[NOTIFICACOES] Erro ao processar empresa — continuando com proxima', empresaError, {
          empresaId: empresa.id,
          empresaCodigo: empresa.codigo,
        });
        // Não interrompe outras empresas — erro é registrado e o loop continua
      }
    }

    log.log('[NOTIFICACOES] Processamento concluido', {
      totalEnviadas,
      totalErros,
      configsProcessadas: configs.length,
      empresasProcessadas: empresas.length,
    });
    return {
      configsProcessadas: configs.length,
      enviadas: totalEnviadas,
      erros: totalErros,
      porTipo,
    };
  } catch (error) {
    log.error('[NOTIFICACOES] Erro fatal no processamento', error);
    throw error;
  }
}

async function carregarQualificacoesParaNotificar(env: Env, empresaId: number): Promise<QualificacaoParaNotificar[]> {
  const { results } = await env.DB.prepare(
    `
    SELECT
      qh.id,
      qh.funcionario_id,
      COALESCE(
        NULLIF(TRIM(qh.funcionario_cpf), ''),
        NULLIF(TRIM(f.cpf), '')
      ) as funcionario_cpf,
      f.nome as funcionario_nome,
      f.email as funcionario_email,
      f.telefone as funcionario_telefone,
      COALESCE(qh.qualificacao_codigo, qt.codigo) as qualificacao_codigo,
      qt.nome as qualificacao_nome,
      COALESCE(qh.categoria, qt.categoria) as categoria,
      qh.data_vencimento
    FROM qualificacoes_historico qh
    INNER JOIN funcionarios f
      ON (
        qh.funcionario_id = f.id
        OR (
          qh.funcionario_id IS NULL
          AND REPLACE(REPLACE(REPLACE(COALESCE(qh.funcionario_cpf, ''), '.', ''), '-', ''), '/', '') =
              REPLACE(REPLACE(REPLACE(COALESCE(f.cpf, ''), '.', ''), '-', ''), '/', '')
        )
      )
    INNER JOIN qualificacoes_tipos qt
      ON (
        qh.qualificacao_id = qt.id
        OR (
          qh.qualificacao_id IS NULL
          AND COALESCE(qh.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
        )
      )
    WHERE qh.deleted_at IS NULL
      AND f.deleted_at IS NULL
      AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      AND qt.deleted_at IS NULL
      AND qh.data_vencimento IS NOT NULL
      AND COALESCE(qh.status, 'CONCLUIDA') != 'CANCELADA'
      AND qh.empresa_id = ?
      AND f.empresa_id = ?
      AND qh.id IN (
        -- Apenas o registro mais recente de cada qualificação por funcionário
        SELECT MAX(id)
        FROM qualificacoes_historico
        WHERE deleted_at IS NULL
        GROUP BY funcionario_id, qualificacao_id, qualificacao_codigo
      )
  `,
  ).bind(empresaId, empresaId).all<QualificacaoParaNotificar>();

  return results ?? [];
}

async function processarConfiguracao(
  env: Env,
  config: NotificacaoConfig,
  qualificacoes: QualificacaoParaNotificar[],
): Promise<{ enviadas: number; erros: number }> {
  const log = getNotificacoesConsole(env);
  let enviadas = 0;
  let erros = 0;
  const whatsAppTemplateCache = new Map<string, WhatsAppTemplateRecord | null>();

  const { results: notificacoesRecentes } = await env.DB.prepare(
    `
      SELECT qualificacao_historico_id
      FROM notificacoes_log
      WHERE config_id = ?
        AND status = 'enviada'
        AND enviado_em >= datetime('now', '-1 day')
    `,
  )
    .bind(config.id)
    .all<{ qualificacao_historico_id: number }>();

  const qualificacoesJaNotificadas = new Set(
    (notificacoesRecentes || [])
      .map((item) => Number(item.qualificacao_historico_id || 0))
      .filter((value) => value > 0),
  );

  log.log('[NOTIFICACOES] Qualificacoes encontradas para analise', {
    total: qualificacoes.length,
    configId: config.id,
  });

  for (const qualificacao of qualificacoes) {
    const diasAteVencimento = calcularDiasAteVencimento(qualificacao.data_vencimento);
    const urgencia = determinarUrgencia(diasAteVencimento);

    // Verificar se deve notificar
    if (!deveNotificar(config, diasAteVencimento, urgencia)) {
      continue;
    }

    if (qualificacoesJaNotificadas.has(Number(qualificacao.id))) {
      log.log('[NOTIFICACOES] Qualificacao ja notificada nas ultimas 24h', {
        configId: config.id,
        qualificacaoHistoricoId: qualificacao.id,
        funcionario: qualificacao.funcionario_nome,
        qualificacao: qualificacao.qualificacao_nome,
      });
      continue;
    }

    // Enviar notificação
    const sucesso = await enviarNotificacao(env, config, qualificacao, diasAteVencimento, {
      whatsAppTemplateCache,
    });

    if (sucesso) {
      qualificacoesJaNotificadas.add(Number(qualificacao.id));
      enviadas++;
    } else {
      erros++;
    }
  }

  return { enviadas, erros };
}

function deveNotificar(
  config: NotificacaoConfig,
  diasAteVencimento: number | null,
  urgencia: string | null,
): boolean {
  // Se não tem vencimento (vitalício), não notifica
  if (diasAteVencimento === null) return false;

  // Se já venceu, não notifica (já passou)
  if (diasAteVencimento < 0) return false;

  // Se está muito longe do vencimento, não notifica
  if (diasAteVencimento > config.dias_antes) return false;

  // Se config tem filtro de urgência e não bate, não notifica
  if (config.urgencia && urgencia !== config.urgencia) return false;

  return true;
}

function normalizeTipoCanal(tipo: string | null | undefined): 'EMAIL' | 'DASHBOARD' | 'WHATSAPP' {
  const normalized = String(tipo || '')
    .trim()
    .toUpperCase();

  if (normalized === 'WHATSAPP') return 'WHATSAPP';
  if (normalized === 'DASHBOARD') return 'DASHBOARD';
  return 'EMAIL';
}

function parseDestinatarios(destinatariosRaw: string | null): string[] {
  if (!destinatariosRaw) return [];

  try {
    const parsed = JSON.parse(destinatariosRaw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    }
  } catch {
    return destinatariosRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [String(destinatariosRaw).trim()].filter(Boolean);
}

function buildStatusVencimento(diasAteVencimento: number): string {
  if (diasAteVencimento < 0) {
    return `Vencida ha ${Math.abs(diasAteVencimento)} dias`;
  }

  if (diasAteVencimento === 0) {
    return 'Vence hoje';
  }

  if (diasAteVencimento === 1) {
    return 'Vence em 1 dia';
  }

  return `Vence em ${diasAteVencimento} dias`;
}

function isCmaQualificacao(qualificacao: QualificacaoParaNotificar): boolean {
  const categoria = String(qualificacao.categoria || '').toUpperCase();
  const nome = String(qualificacao.qualificacao_nome || '').toUpperCase();

  return categoria.includes('CMA') || nome.includes('CMA');
}

async function enviarNotificacao(
  env: Env,
  config: NotificacaoConfig,
  qualificacao: QualificacaoParaNotificar,
  diasAteVencimento: number,
  options?: {
    whatsAppTemplateCache?: Map<string, WhatsAppTemplateRecord | null>;
  },
): Promise<boolean> {
  const log = getNotificacoesConsole(env);
  try {
    const tipoCanal = normalizeTipoCanal(config.tipo);
    let destinatarios = parseDestinatarios(config.destinatarios);

    // Interpolar template
    const corpo = interpolarTemplate(config.template, {
      qualificacao: qualificacao.qualificacao_nome,
      funcionario: qualificacao.funcionario_nome,
      dias: diasAteVencimento.toString(),
      categoria: qualificacao.categoria,
      data_vencimento: new Date(qualificacao.data_vencimento).toLocaleDateString('pt-BR'),
    });

    const urgenciaIcon = diasAteVencimento <= 7 ? '🚨' : diasAteVencimento <= 15 ? '⚠️' : '📅';
    const assunto = `${urgenciaIcon} Alerta: Qualificação ${qualificacao.qualificacao_nome} expirando em ${diasAteVencimento} dias`;
    let assuntoLog = assunto;
    let corpoLog = corpo;
    let destinatarioLog = '';

    // Enviar notificação
    if (tipoCanal === 'EMAIL') {
      if (destinatarios.length === 0 && qualificacao.funcionario_email) {
        destinatarios = [qualificacao.funcionario_email];
      }

      if (destinatarios.length === 0) {
        log.warn('[NOTIFICACOES] Sem destinatarios de email', {
          funcionario: qualificacao.funcionario_nome,
          qualificacaoHistoricoId: qualificacao.id,
        });
        return false;
      }

      await enviarEmail(env, destinatarios, assunto, corpo);
      destinatarioLog = destinatarios.join(', ');
    } else if (tipoCanal === 'WHATSAPP') {
      if (destinatarios.length === 0 && qualificacao.funcionario_telefone) {
        destinatarios = [qualificacao.funcionario_telefone];
      }

      if (destinatarios.length === 0) {
        log.warn('[NOTIFICACOES] Sem destinatarios de WhatsApp', {
          funcionario: qualificacao.funcionario_nome,
          qualificacaoHistoricoId: qualificacao.id,
        });
        return false;
      }

      const templateKey = resolveQualificacaoAlertTemplateKey({
        isCma: isCmaQualificacao(qualificacao),
        expired: diasAteVencimento < 0,
      });
      const cachedTemplate = options?.whatsAppTemplateCache?.get(templateKey);
      let localTemplate = cachedTemplate;
      if (localTemplate === undefined) {
        localTemplate = await getLocalWhatsAppTemplateRecord(env.DB, templateKey);
        options?.whatsAppTemplateCache?.set(templateKey, localTemplate ?? null);
      }
      const templateDefinition = getAlertWhatsAppTemplateDefinition(templateKey);

      if (!templateDefinition || !localTemplate?.twilio_content_sid) {
        throw new Error('WHATSAPP_TEMPLATE_NOT_SYNCED');
      }

      if (!isWhatsAppTemplateApproved(localTemplate.approval_status)) {
        throw new Error('WHATSAPP_TEMPLATE_NOT_APPROVED');
      }

      const templateVariables = buildQualificacaoTemplateVariables({
        funcionarioNome: qualificacao.funcionario_nome,
        qualificacaoNome: qualificacao.qualificacao_nome,
        dataVencimento: new Date(`${qualificacao.data_vencimento}T00:00:00`).toLocaleDateString(
          'pt-BR',
        ),
        statusVencimento: buildStatusVencimento(diasAteVencimento),
      });
      const mensagemTemplate = renderTemplateBody(templateDefinition.bodyText, templateVariables);
      const normalizedDestinations: string[] = [];

      for (const destinatario of destinatarios) {
        await sendWhatsAppMessage(env, destinatario, mensagemTemplate, undefined, {
          contentSid: localTemplate.twilio_content_sid,
          contentVariables: templateVariables,
          templateKey,
          templateName: localTemplate.template_name,
          approvalStatus: localTemplate.approval_status,
        });
        normalizedDestinations.push(normalizeWhatsAppPhone(destinatario).e164);
      }

      destinatarioLog = normalizedDestinations.join(', ');
      assuntoLog = `WhatsApp: ${assunto}`;
      corpoLog = mensagemTemplate;
    } else if (tipoCanal === 'DASHBOARD') {
      log.log('[NOTIFICACOES] Dashboard notification registrada', {
        qualificacaoHistoricoId: qualificacao.id,
        corpo,
      });
      destinatarioLog = 'dashboard';
    }

    // Registrar log de sucesso
    await env.DB.prepare(
      `
      INSERT INTO notificacoes_log (
        config_id,
        qualificacao_historico_id,
        funcionario_cpf,
        tipo,
        destinatario,
        assunto,
        corpo,
        status,
        enviado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'enviada', datetime('now'))
    `,
    )
      .bind(
        config.id,
        qualificacao.id,
        qualificacao.funcionario_cpf,
        tipoCanal,
        destinatarioLog,
        assuntoLog,
        corpoLog,
      )
      .run();

    log.log('[NOTIFICACOES] Notificacao enviada', {
      funcionario: qualificacao.funcionario_nome,
      qualificacao: qualificacao.qualificacao_nome,
      diasAteVencimento,
      tipoCanal,
    });
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    log.error('[NOTIFICACOES] Erro ao enviar notificacao', error, {
      configId: config.id,
      qualificacaoHistoricoId: qualificacao.id,
    });

    // Registrar erro no log
    await env.DB.prepare(
      `
      INSERT INTO notificacoes_log (
        config_id,
        qualificacao_historico_id,
        funcionario_cpf,
        tipo,
        status,
        erro_mensagem
      ) VALUES (?, ?, ?, ?, 'erro', ?)
    `,
    )
      .bind(
        config.id,
        qualificacao.id,
        qualificacao.funcionario_cpf,
        normalizeTipoCanal(config.tipo),
        errorMessage,
      )
      .run();

    return false;
  }
}

function interpolarTemplate(template: string, vars: Record<string, string>): string {
  let resultado = template;

  for (const [key, value] of Object.entries(vars)) {
    resultado = resultado.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return resultado;
}

async function enviarEmail(
  env: Env,
  destinatarios: string[],
  assunto: string,
  corpo: string,
): Promise<void> {
  const log = getNotificacoesConsole(env);
  log.log('[EMAIL] Preparando envio', {
    destinatarios,
    assunto,
    corpoPreview: corpo.substring(0, 100),
  });

  // Integração com Brevo (preferencial)
  if (env.BREVO_API_KEY) {
    try {
      const fromEmail = env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online';
      const fromName = env.BREVO_FROM_NAME || 'Treinamento';
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: destinatarios.map((email) => ({ email })),
          subject: assunto,
          textContent: corpo,
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1e40af;">Sistema de Qualificações AirTrust</h2>
              <p style="font-size: 16px; line-height: 1.6;">${corpo.replace(/\n/g, '<br>')}</p>
              <hr style="margin: 20px 0;">
              <p style="color: #666; font-size: 12px;">
                Esta é uma notificação automática. Por favor, não responda este email.
              </p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
      }

      log.log('[EMAIL] Email enviado via Brevo', { destinatarios });
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      log.error('[EMAIL] Erro Brevo', error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
  }

  throw new Error('EMAIL_NOT_CONFIGURED');
}

export async function enviarEmailAlert(
  env: Env,
  destinatarios: string[],
  assunto: string,
  corpo: string,
): Promise<void> {
  return enviarEmail(env, destinatarios, assunto, corpo);
}
