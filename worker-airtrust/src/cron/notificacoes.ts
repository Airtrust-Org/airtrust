import { calcularDiasAteVencimento } from '../utils/qualificacoes-expiration';
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
  buildTrainingTemplateStatusVariable,
  getAlertWhatsAppTemplateDefinition,
  renderTemplateBody,
  resolveQualificacaoAlertTemplateKey,
} from '../utils/whatsapp-templates';
import { createStructuredConsole } from '../utils/logger';
import { resolveTrainingAccessUrl } from '../utils/lms-training-link';
import { getSetorGestoresBySetor } from '../services/setores-gestores';
import { trainingComplianceEffectiveRequirementPredicateSql } from '../services/training-compliance-rule-engine';
import {
  inferTrainingAlertStageCode,
  trainingAlertAudience,
  TRAINING_ALERT_DAILY_CRON,
} from '../services/training-alert-policy';
import {
  CANCELLED_STATUS_VALUES,
  QUALIFICACAO_STATUS,
  sqlStatusNotEqualsAny,
} from '../lib/status/status-codes';

interface NotificacaoConfig {
  id: number;
  tipo: string;
  ativo: number;
  dias_antes: number;
  urgencia: string | null;
  destinatarios: string | null;
  template: string;
  empresa_id: number | null;
  codigo: string | null;
  assunto_template: string | null;
  frequencia: string | null;
  intervalo_dias: number | null;
}

interface QualificacaoParaNotificar {
  id: number;
  funcionario_id: number;
  funcionario_cpf: string;
  funcionario_nome: string;
  funcionario_email: string;
  funcionario_telefone: string;
  funcionario_setor_id: number | null;
  qualificacao_codigo: string;
  qualificacao_nome: string;
  qualificacao_tipo: string | null;
  categoria: string;
  is_check: number | null;
  data_vencimento: string;
}

type WhatsAppTemplateRecord = Awaited<ReturnType<typeof getLocalWhatsAppTemplateRecord>>;

export { TRAINING_ALERT_DAILY_CRON };

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
 * Autoridade única para alertas automáticos de vencimento de treinamentos/qualificações.
 * O scheduler chama este processador somente em TRAINING_ALERT_DAILY_CRON (08:00 UTC / 05:00 BRT).
 * Jobs de matrícula/renovação EAD não devem emitir alertas paralelos.
 */
export async function processarNotificacoes(env: Env): Promise<ProcessamentoNotificacoesResumo> {
  const log = getNotificacoesConsole(env);
  log.log('[NOTIFICACOES] Iniciando processamento...', { dataHora: new Date().toISOString() });

  try {
    const { results: empresas } = await env.DB.prepare(
      `SELECT id, codigo, nome FROM empresas WHERE ativo = 1 AND deleted_at IS NULL ORDER BY id`,
    ).all<{ id: number; codigo: string; nome: string }>();

    log.log('[NOTIFICACOES] Empresas ativas encontradas', { total: empresas.length });

    let totalEnviadas = 0;
    let totalErros = 0;
    let configsProcessadas = 0;
    let whatsappCatalogSeeded = false;
    const porTipo: ProcessamentoNotificacoesResumo['porTipo'] = {};

    for (const empresa of empresas) {
      try {
        log.log('[NOTIFICACOES] Processando empresa', {
          empresaId: empresa.id,
          empresaCodigo: empresa.codigo,
        });

        const configs = await carregarConfiguracoesParaEmpresa(env.DB, empresa.id);
        configsProcessadas += configs.length;
        if (configs.length === 0) {
          log.warn('[NOTIFICACOES] Empresa sem configurações ativas', { empresaId: empresa.id });
          continue;
        }

        if (
          !whatsappCatalogSeeded &&
          configs.some((config) => normalizeTipoCanal(config.tipo) === 'WHATSAPP')
        ) {
          await seedLocalWhatsAppTemplateCatalog(env.DB);
          whatsappCatalogSeeded = true;
        }

        const qualificacoesBase = await carregarQualificacoesParaNotificar(env, empresa.id);
        log.log('[NOTIFICACOES] Qualificacoes base carregadas para empresa', {
          empresaId: empresa.id,
          total: qualificacoesBase.length,
          configs: configs.length,
        });

        for (const config of configs) {
          const lowerThreshold = getLowerThreshold(config, configs);
          const resultado = await processarConfiguracao(
            env,
            empresa.id,
            config,
            qualificacoesBase,
            lowerThreshold,
          );
          totalEnviadas += resultado.enviadas;
          totalErros += resultado.erros;
          const canal = normalizeTipoCanal(config.tipo);
          porTipo[canal] = {
            enviadas: (porTipo[canal]?.enviadas || 0) + resultado.enviadas,
            erros: (porTipo[canal]?.erros || 0) + resultado.erros,
          };
        }
      } catch (empresaError) {
        log.error(
          '[NOTIFICACOES] Erro ao processar empresa — continuando com proxima',
          empresaError,
          { empresaId: empresa.id, empresaCodigo: empresa.codigo },
        );
      }
    }

    log.log('[NOTIFICACOES] Processamento concluido', {
      totalEnviadas,
      totalErros,
      configsProcessadas,
      empresasProcessadas: empresas.length,
    });
    return {
      configsProcessadas,
      enviadas: totalEnviadas,
      erros: totalErros,
      porTipo,
    };
  } catch (error) {
    log.error('[NOTIFICACOES] Erro fatal no processamento', error);
    throw error;
  }
}

function configEffectiveKey(config: NotificacaoConfig): string {
  const stageCode = inferTrainingAlertStageCode(config);
  if (stageCode) return `${normalizeTipoCanal(config.tipo)}:${stageCode}`;
  const codigo = String(config.codigo || '')
    .trim()
    .toUpperCase();
  if (codigo) return `${normalizeTipoCanal(config.tipo)}:${codigo}`;
  return `${normalizeTipoCanal(config.tipo)}:${String(config.urgencia || '')}:${config.dias_antes}`;
}

export async function carregarConfiguracoesParaEmpresa(
  db: D1Database,
  empresaId: number,
): Promise<NotificacaoConfig[]> {
  const { results } = await db
    .prepare(
      `SELECT id, tipo, ativo, dias_antes, urgencia, destinatarios, template,
              empresa_id, codigo, assunto_template, frequencia, intervalo_dias
         FROM notificacoes_config
        WHERE deleted_at IS NULL
          AND (empresa_id IS NULL OR empresa_id = ?)
        ORDER BY CASE WHEN empresa_id IS NULL THEN 0 ELSE 1 END ASC, id ASC`,
    )
    .bind(empresaId)
    .all<NotificacaoConfig>();

  const effective = new Map<string, NotificacaoConfig>();
  for (const config of results || []) effective.set(configEffectiveKey(config), config);
  return [...effective.values()]
    .filter((config) => Number(config.ativo) === 1)
    .sort((a, b) => b.dias_antes - a.dias_antes || a.id - b.id);
}

function getLowerThreshold(config: NotificacaoConfig, configs: NotificacaoConfig[]): number | null {
  if (isExpiredConfig(config)) return null;
  const sameChannel = configs
    .filter(
      (candidate) =>
        candidate.id !== config.id &&
        normalizeTipoCanal(candidate.tipo) === normalizeTipoCanal(config.tipo) &&
        !isExpiredConfig(candidate) &&
        candidate.dias_antes < config.dias_antes,
    )
    .map((candidate) => candidate.dias_antes);
  return sameChannel.length > 0 ? Math.max(...sameChannel) : -1;
}

export function buildQualificacoesParaNotificarQuery(): string {
  const qualificationStatusExpr = `UPPER(COALESCE(qh.status, '${QUALIFICACAO_STATUS.CONCLUIDA}'))`;

  return `
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
      f.setor_id as funcionario_setor_id,
      COALESCE(qh.qualificacao_codigo, qt.codigo) as qualificacao_codigo,
      qt.nome as qualificacao_nome,
      qt.tipo as qualificacao_tipo,
      COALESCE(qh.categoria, qt.categoria) as categoria,
      COALESCE(qt.is_check, 0) as is_check,
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
      ON qt.empresa_id = qh.empresa_id
     AND qt.deleted_at IS NULL
     AND (
        qh.qualificacao_id = qt.id
        OR (
          qh.qualificacao_id IS NULL
          AND COALESCE(qh.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
        )
      )
    WHERE qh.deleted_at IS NULL
      AND f.deleted_at IS NULL
      AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      AND qh.data_vencimento IS NOT NULL
      AND ${sqlStatusNotEqualsAny(qualificationStatusExpr, CANCELLED_STATUS_VALUES)}
      AND qh.empresa_id = ?
      AND f.empresa_id = ?
      AND ${trainingComplianceEffectiveRequirementPredicateSql({ qualificationExpr: 'qt.id', empresaExpr: 'qh.empresa_id' })}
      AND qh.id IN (
        -- Apenas o registro mais recente de cada qualificação por funcionário
        SELECT MAX(id)
        FROM qualificacoes_historico
        WHERE deleted_at IS NULL
          AND empresa_id = ?
        GROUP BY funcionario_id, qualificacao_id, qualificacao_codigo
      )
  `;
}

async function carregarQualificacoesParaNotificar(
  env: Env,
  empresaId: number,
): Promise<QualificacaoParaNotificar[]> {
  const { results } = await env.DB.prepare(buildQualificacoesParaNotificarQuery())
    .bind(empresaId, empresaId, empresaId)
    .all<QualificacaoParaNotificar>();

  return results ?? [];
}

async function processarConfiguracao(
  env: Env,
  empresaId: number,
  config: NotificacaoConfig,
  qualificacoes: QualificacaoParaNotificar[],
  lowerThreshold: number | null,
): Promise<{ enviadas: number; erros: number }> {
  const log = getNotificacoesConsole(env);
  let enviadas = 0;
  let erros = 0;
  const whatsAppTemplateCache = new Map<string, WhatsAppTemplateRecord | null>();

  const tipoCanal = normalizeTipoCanal(config.tipo);
  const dedupWindowSql = getDedupWindowSql(config);
  const { results: notificacoesAnteriores } = await env.DB.prepare(
    `
      SELECT qualificacao_historico_id, destinatario
      FROM notificacoes_log
      WHERE empresa_id = ?
        AND config_id = ?
        AND status = 'enviada'
        ${dedupWindowSql}
    `,
  )
    .bind(empresaId, config.id)
    .all<{ qualificacao_historico_id: number; destinatario: string | null }>();

  const notificacoesPorQualificacao = new Map<number, string[]>();
  for (const item of notificacoesAnteriores || []) {
    const qualificacaoId = Number(item.qualificacao_historico_id || 0);
    if (qualificacaoId <= 0) continue;
    const atuais = notificacoesPorQualificacao.get(qualificacaoId) || [];
    atuais.push(String(item.destinatario || ''));
    notificacoesPorQualificacao.set(qualificacaoId, atuais);
  }

  log.log('[NOTIFICACOES] Qualificacoes encontradas para analise', {
    total: qualificacoes.length,
    configId: config.id,
  });

  for (const qualificacao of qualificacoes) {
    const diasAteVencimento = calcularDiasAteVencimento(qualificacao.data_vencimento);

    if (!deveNotificar(config, diasAteVencimento, lowerThreshold)) {
      continue;
    }

    const entregasAnteriores = notificacoesPorQualificacao.get(Number(qualificacao.id)) || [];
    let emailRecipientsOverride: string[] | undefined;

    if (tipoCanal === 'EMAIL') {
      const destinatariosPretendidos = await resolveQualificationEmailRecipients(
        env,
        empresaId,
        config,
        qualificacao,
      );

      // Uma etapa sem público previsto por esta política (ex.: 45d de uma
      // qualificação que não é CHECK) não deve cair em destinatários fixos legados.
      if (destinatariosPretendidos.length === 0) {
        log.log('[NOTIFICACOES] Etapa sem destinatarios pela politica de qualificacoes', {
          configId: config.id,
          qualificacaoHistoricoId: qualificacao.id,
          codigo: config.codigo,
          isCheck: isCheckQualificacao(qualificacao),
        });
        continue;
      }

      const entregues = new Set(
        entregasAnteriores.flatMap((destinatario) => normalizeLoggedEmailRecipients(destinatario)),
      );
      emailRecipientsOverride = destinatariosPretendidos.filter(
        (destinatario) => !entregues.has(destinatario),
      );

      if (emailRecipientsOverride.length === 0) {
        log.log('[NOTIFICACOES] Etapa de alerta ja entregue a todos os destinatarios previstos', {
          configId: config.id,
          qualificacaoHistoricoId: qualificacao.id,
          funcionario: qualificacao.funcionario_nome,
          qualificacao: qualificacao.qualificacao_nome,
          tipoCanal,
        });
        continue;
      }
    } else if (entregasAnteriores.length > 0) {
      log.log('[NOTIFICACOES] Etapa de alerta ja entregue', {
        configId: config.id,
        qualificacaoHistoricoId: qualificacao.id,
        funcionario: qualificacao.funcionario_nome,
        qualificacao: qualificacao.qualificacao_nome,
        tipoCanal,
      });
      continue;
    }

    // Enviar notificação
    const sucesso = await enviarNotificacao(
      env,
      empresaId,
      config,
      qualificacao,
      diasAteVencimento,
      {
        whatsAppTemplateCache,
        emailRecipientsOverride,
      },
    );

    if (sucesso) {
      enviadas++;
    } else {
      erros++;
    }
  }

  return { enviadas, erros };
}

function normalizeFrequency(value: string | null | undefined): 'ONCE' | 'DAILY' | 'EVERY_N_DAYS' {
  const normalized = String(value || 'ONCE')
    .trim()
    .toUpperCase();
  if (normalized === 'DAILY') return 'DAILY';
  if (normalized === 'EVERY_N_DAYS') return 'EVERY_N_DAYS';
  return 'ONCE';
}

function getDedupWindowSql(config: NotificacaoConfig): string {
  const frequency = normalizeFrequency(config.frequencia);
  if (frequency === 'DAILY') return "AND date(enviado_em) = date('now')";
  if (frequency === 'EVERY_N_DAYS') {
    const interval = Math.max(1, Math.min(365, Number(config.intervalo_dias) || 1));
    return `AND enviado_em >= datetime('now', '-${interval} day')`;
  }
  return '';
}

function isExpiredConfig(config: NotificacaoConfig): boolean {
  return (
    String(config.codigo || '')
      .trim()
      .toUpperCase() === 'QUALIFICACAO_VENCIDA' ||
    String(config.urgencia || '')
      .trim()
      .toLowerCase() === 'expired'
  );
}

function deveNotificar(
  config: NotificacaoConfig,
  diasAteVencimento: number | null,
  lowerThreshold: number | null,
): boolean {
  if (diasAteVencimento === null) return false;
  if (isExpiredConfig(config)) return diasAteVencimento < 0;
  if (diasAteVencimento < 0) return false;
  if (diasAteVencimento > config.dias_antes) return false;
  if (lowerThreshold !== null && diasAteVencimento <= lowerThreshold) return false;
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

export function normalizeEmailRecipients(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) =>
          String(value || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
}

function normalizeLoggedEmailRecipients(value: string): string[] {
  return normalizeEmailRecipients(String(value || '').split(','));
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

function isCheckQualificacao(qualificacao: QualificacaoParaNotificar): boolean {
  if (Number(qualificacao.is_check || 0) === 1) return true;

  const tipo = String(qualificacao.qualificacao_tipo || '')
    .trim()
    .toUpperCase();
  const categoria = String(qualificacao.categoria || '')
    .trim()
    .toUpperCase();
  return tipo === 'CHECK' || categoria === 'CHECK';
}

function getEmailAudiencePolicy(
  config: NotificacaoConfig,
  qualificacao: QualificacaoParaNotificar,
): { funcionario: boolean; gestores: boolean } {
  return trainingAlertAudience(
    inferTrainingAlertStageCode(config),
    isCheckQualificacao(qualificacao),
  );
}

async function resolveQualificationEmailRecipients(
  env: Env,
  empresaId: number,
  config: NotificacaoConfig,
  qualificacao: QualificacaoParaNotificar,
): Promise<string[]> {
  const log = getNotificacoesConsole(env);
  const policy = getEmailAudiencePolicy(config, qualificacao);
  const recipients: string[] = [];

  if (policy.funcionario && qualificacao.funcionario_email) {
    recipients.push(qualificacao.funcionario_email);
  }

  if (policy.gestores && qualificacao.funcionario_setor_id) {
    try {
      const gestores = await getSetorGestoresBySetor(
        env.DB,
        empresaId,
        qualificacao.funcionario_setor_id,
        true,
      );
      recipients.push(...gestores.map((gestor) => gestor.gestor_email).filter(Boolean));
    } catch (gestorError) {
      log.warn('[NOTIFICACOES] Falha ao resolver gestores do setor', {
        qualificacaoHistoricoId: qualificacao.id,
        setorId: qualificacao.funcionario_setor_id,
        erro: gestorError instanceof Error ? gestorError.message : String(gestorError),
      });
    }
  }

  return normalizeEmailRecipients(recipients);
}

function isCmaQualificacao(qualificacao: QualificacaoParaNotificar): boolean {
  const categoria = String(qualificacao.categoria || '').toUpperCase();
  const nome = String(qualificacao.qualificacao_nome || '').toUpperCase();

  return categoria.includes('CMA') || nome.includes('CMA');
}

async function enviarNotificacao(
  env: Env,
  empresaId: number,
  config: NotificacaoConfig,
  qualificacao: QualificacaoParaNotificar,
  diasAteVencimento: number,
  options?: {
    whatsAppTemplateCache?: Map<string, WhatsAppTemplateRecord | null>;
    emailRecipientsOverride?: string[];
  },
): Promise<boolean> {
  const log = getNotificacoesConsole(env);
  try {
    const tipoCanal = normalizeTipoCanal(config.tipo);
    let destinatarios = parseDestinatarios(config.destinatarios);

    const trainingUrl = !isCmaQualificacao(qualificacao)
      ? await resolveTrainingAccessUrl(env, env.DB, {
          empresaId,
          funcionarioId: qualificacao.funcionario_id,
          qualificacaoHistoricoId: qualificacao.id,
        })
      : null;

    // Interpolar template
    const diasVencida = Math.abs(Math.min(diasAteVencimento, 0));
    const templateVars = {
      qualificacao: qualificacao.qualificacao_nome,
      funcionario: qualificacao.funcionario_nome,
      dias: diasAteVencimento.toString(),
      dias_vencida: diasVencida.toString(),
      unidade_dias_vencida: diasVencida === 1 ? 'dia' : 'dias',
      categoria: qualificacao.categoria,
      data_vencimento: new Date(`${qualificacao.data_vencimento}T00:00:00`).toLocaleDateString(
        'pt-BR',
      ),
    };
    const corpoBase = interpolarTemplate(config.template, templateVars);
    const corpo = trainingUrl ? `${corpoBase}\n\nAcesse o treinamento: ${trainingUrl}` : corpoBase;

    const urgenciaIcon = diasAteVencimento <= 7 ? '🚨' : diasAteVencimento <= 15 ? '⚠️' : '📅';
    const assuntoPadrao =
      diasAteVencimento < 0
        ? `🚨 Qualificação vencida: ${qualificacao.qualificacao_nome} — há ${Math.abs(diasAteVencimento)} ${Math.abs(diasAteVencimento) === 1 ? 'dia' : 'dias'}`
        : `${urgenciaIcon} Alerta: Qualificação ${qualificacao.qualificacao_nome} expirando em ${diasAteVencimento} dias`;
    const assunto = config.assunto_template
      ? interpolarTemplate(config.assunto_template, templateVars)
      : assuntoPadrao;
    let assuntoLog = assunto;
    let corpoLog = corpo;
    let destinatarioLog = '';

    // Enviar notificação
    if (tipoCanal === 'EMAIL') {
      // Os destinatários de qualificação são resolvidos previamente pela política
      // de público (funcionário x gestor/CHECK). Não usar destinatário fixo legado
      // como atalho, pois isso pode vazar alertas fora do setor ou do papel previsto.
      destinatarios = normalizeEmailRecipients(options?.emailRecipientsOverride || []);

      if (destinatarios.length === 0) {
        log.warn('[NOTIFICACOES] Sem destinatarios de email', {
          funcionario: qualificacao.funcionario_nome,
          qualificacaoHistoricoId: qualificacao.id,
          setorId: qualificacao.funcionario_setor_id,
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
        statusVencimento: isCmaQualificacao(qualificacao)
          ? buildStatusVencimento(diasAteVencimento)
          : buildTrainingTemplateStatusVariable(diasAteVencimento, trainingUrl),
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
        empresa_id,
        config_id,
        qualificacao_historico_id,
        funcionario_cpf,
        tipo,
        destinatario,
        assunto,
        corpo,
        status,
        enviado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'enviada', datetime('now'))
    `,
    )
      .bind(
        empresaId,
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
        empresa_id,
        config_id,
        qualificacao_historico_id,
        funcionario_cpf,
        tipo,
        status,
        erro_mensagem
      ) VALUES (?, ?, ?, ?, ?, 'erro', ?)
    `,
    )
      .bind(
        empresaId,
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
