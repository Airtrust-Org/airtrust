import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId, isPlatformAdminContext } from '../middleware/tenant';
import { processarNotificacoes } from '../cron/notificacoes';
import { createLogger, toError } from '../utils/logger';
import type { Env } from '../types';
import { getModuleAlertSettings, saveModuleAlertSettings } from '../services/module-alert-settings';
import { getTrainingAlertStage } from '../services/training-alert-policy';
import {
  appendEmployeeSectorFilter,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import {
  listLocalWhatsAppTemplates,
  seedLocalWhatsAppTemplateCatalog,
} from '../utils/alert-whatsapp-templates-store';

const app = new Hono<{ Bindings: Env }>();

const GLOBAL_NOTIFICATION_TYPES = ['ALERTA_DADOS', 'ALERTA_SEMANAL_QUALIFICACOES'] as const;
const GLOBAL_NOTIFICATION_GROUPS = ['auditoria', 'qualificacoes'] as const;
const NOTIFICATION_TYPE_PREFIX_PATTERN = /^[A-Za-z0-9_:-]{1,64}$/;

function isGlobalNotificationAllowed(tipo?: string | null, grupo?: string | null): boolean {
  const normalizedTipo = String(tipo || '')
    .trim()
    .toUpperCase();
  const normalizedGrupo = String(grupo || '')
    .trim()
    .toLowerCase();

  return (
    GLOBAL_NOTIFICATION_TYPES.includes(
      normalizedTipo as (typeof GLOBAL_NOTIFICATION_TYPES)[number],
    ) ||
    GLOBAL_NOTIFICATION_GROUPS.includes(
      normalizedGrupo as (typeof GLOBAL_NOTIFICATION_GROUPS)[number],
    )
  );
}

function buildAllowedGlobalNotificationSql(alias: string): string {
  const prefix = alias ? `${alias}.` : '';
  const tipos = GLOBAL_NOTIFICATION_TYPES.map(() => '?').join(', ');
  const grupos = GLOBAL_NOTIFICATION_GROUPS.map(() => '?').join(', ');

  return `(
    UPPER(COALESCE(${prefix}tipo, '')) IN (${tipos})
    OR LOWER(COALESCE(${prefix}grupo, '')) IN (${grupos})
  )`;
}

function buildSystemNotificationScope(alias: string, empresaId: number, userId: string | null) {
  const prefix = alias ? `${alias}.` : '';
  const clause = `(
    (${prefix}empresa_id = ? AND (${prefix}user_id = ? OR ${prefix}user_id IS NULL))
    OR
    (
      ${prefix}empresa_id IS NULL
      AND (
        ${prefix}user_id = ?
        OR (
          ${prefix}user_id IS NULL
          AND ${buildAllowedGlobalNotificationSql(alias)}
        )
      )
    )
  )`;

  return {
    clause,
    params: [
      empresaId,
      userId,
      userId,
      ...GLOBAL_NOTIFICATION_TYPES,
      ...GLOBAL_NOTIFICATION_GROUPS,
    ] as unknown[],
  };
}

function getNotificationUserId(c: { get: (key: string) => unknown }): {
  userId: string | null;
  lidaPor: string | number | null;
} {
  const rawUserId = c.get('userId');
  if (rawUserId === null || rawUserId === undefined || String(rawUserId).trim() === '') {
    return { userId: null, lidaPor: null };
  }

  const normalized = String(rawUserId);
  const numeric = Number(normalized);

  return {
    userId: normalized,
    lidaPor: Number.isFinite(numeric) ? numeric : normalized,
  };
}

function notificacoesErrorResponse(
  c: Record<string, any>,
  error: unknown,
  message: string,
  code: string,
  data?: Record<string, unknown>,
) {
  const logger = createLogger(c, 'NotificacoesRoutes');
  logger.error(message, toError(error), data);

  return c.json(
    {
      success: false,
      error: message,
      code,
    },
    500,
  );
}

// =============================================
// POST /api/notificacoes/processar
// Processar notificações manualmente (admin only)
// =============================================
app.post('/processar', auth(), requireRole('admin'), async (c) => {
  try {
    const logger = createLogger(c, 'NotificacoesRoutes');
    logger.info('Processamento manual iniciado pelo usuário');

    const resumo = await processarNotificacoes(c.env);

    return c.json({
      success: true,
      message: 'Notificações processadas com sucesso',
      timestamp: new Date().toISOString(),
      data: resumo,
    });
  } catch (error) {
    const logger = createLogger(c, 'NotificacoesRoutes');
    logger.error('Erro ao processar notificações manualmente', toError(error), {
      route: '/processar',
    });
    return c.json(
      {
        success: false,
        error: 'Erro ao processar notificações',
        code: 'NOTIFICACOES_PROCESS_ERROR',
      },
      500,
    );
  }
});

// =============================================
// GET /api/notificacoes/whatsapp/overview
// Resumo operacional do canal WhatsApp
// =============================================
app.get('/whatsapp/overview', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    await seedLocalWhatsAppTemplateCatalog(c.env.DB);

    const templates = await listLocalWhatsAppTemplates(c.env.DB);
    const stats = templates.reduce(
      (acc, template) => {
        const status = String(template.approval_status || '')
          .trim()
          .toLowerCase();

        acc.total += 1;

        if (status === 'approved') {
          acc.approved += 1;
        } else if (!status || status === 'received' || status === 'submitted') {
          acc.pending += 1;
        } else {
          acc.needsAttention += 1;
        }

        if (
          template.last_synced_at &&
          (!acc.lastSyncedAt || template.last_synced_at > acc.lastSyncedAt)
        ) {
          acc.lastSyncedAt = template.last_synced_at;
        }

        return acc;
      },
      {
        total: 0,
        approved: 0,
        pending: 0,
        needsAttention: 0,
        lastSyncedAt: null as string | null,
      },
    );

    // Esta visão usa apenas defaults globais. Desde o Schema V2 0516 a tabela
    // também contém overrides tenant-scoped; nunca misturá-los nesta rota agregada.
    const whatsappConfigs = await c.env.DB.prepare(
      `SELECT id, ativo, dias_antes, urgencia, destinatarios, template, updated_at
         FROM notificacoes_config
        WHERE tipo = 'WHATSAPP'
          AND empresa_id IS NULL
          AND deleted_at IS NULL
        ORDER BY dias_antes ASC`,
    ).all();

    // O log contém CPF, destinatário, assunto, corpo e erros do provedor. Além do
    // tenant, gestores só podem enxergar funcionários dos setores que gerenciam.
    const recentLogConditions: string[] = ["nl.tipo = 'WHATSAPP'", 'nl.empresa_id = ?'];
    const recentLogBindings: unknown[] = [empresaId];
    appendEmployeeSectorFilter(recentLogConditions, recentLogBindings, access, 'f');

    const recentLogs = await c.env.DB.prepare(
      `SELECT nl.id,
              nl.config_id,
              nl.funcionario_cpf,
              f.nome AS funcionario_nome,
              nl.destinatario,
              nl.status,
              nl.assunto,
              nl.corpo,
              nl.erro_mensagem,
              nl.enviado_em,
              nl.created_at,
              qt.nome AS qualificacao_nome
         FROM notificacoes_log nl
         LEFT JOIN funcionarios f
           ON f.cpf = nl.funcionario_cpf
          AND f.empresa_id = nl.empresa_id
          AND f.deleted_at IS NULL
         LEFT JOIN qualificacoes_historico qh
           ON qh.id = nl.qualificacao_historico_id
          AND qh.empresa_id = nl.empresa_id
          AND qh.deleted_at IS NULL
         LEFT JOIN qualificacoes_tipos qt
           ON qt.codigo = qh.qualificacao_codigo
          AND qt.empresa_id = nl.empresa_id
          AND qt.deleted_at IS NULL
        WHERE ${recentLogConditions.join(' AND ')}
        ORDER BY COALESCE(nl.enviado_em, nl.created_at) DESC
        LIMIT 15`,
    )
      .bind(...recentLogBindings)
      .all();

    return c.json({
      success: true,
      data: {
        stats,
        templates,
        configs: whatsappConfigs.results || [],
        recentLogs: recentLogs.results || [],
      },
    });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao carregar overview de WhatsApp',
      'NOTIFICACOES_WHATSAPP_OVERVIEW_ERROR',
      {
        route: '/whatsapp/overview',
      },
    );
  }
});

// =============================================
// GET /api/notificacoes/log
// Listar log de notificações
// =============================================
app.get('/log', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const {
      limit = '50',
      offset = '0',
      status,
      funcionario_cpf,
      data_inicio,
      data_fim,
    } = c.req.query();

    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

    const conditions: string[] = ['nl.empresa_id = ?'];
    const params: unknown[] = [empresaId];
    appendEmployeeSectorFilter(conditions, params, access, 'f');

    if (status) {
      conditions.push('nl.status = ?');
      params.push(status);
    }

    if (funcionario_cpf) {
      conditions.push('nl.funcionario_cpf = ?');
      params.push(funcionario_cpf);
    }

    if (data_inicio) {
      conditions.push('DATE(nl.enviado_em) >= ?');
      params.push(data_inicio);
    }

    if (data_fim) {
      conditions.push('DATE(nl.enviado_em) <= ?');
      params.push(data_fim);
    }

    const query = `
      SELECT
        nl.id,
        nl.config_id,
        nl.qualificacao_historico_id,
        nl.funcionario_cpf,
        f.nome as funcionario_nome,
        nl.tipo,
        nl.destinatario,
        nl.assunto,
        nl.corpo,
        nl.status,
        nl.erro_mensagem,
        nl.enviado_em,
        nl.created_at,
        qt.nome as qualificacao_nome,
        qt.categoria
      FROM notificacoes_log nl
      LEFT JOIN funcionarios f
        ON nl.funcionario_cpf = f.cpf
       AND f.empresa_id = nl.empresa_id
       AND f.deleted_at IS NULL
      LEFT JOIN qualificacoes_historico qh
        ON nl.qualificacao_historico_id = qh.id
       AND qh.empresa_id = nl.empresa_id
       AND qh.deleted_at IS NULL
      LEFT JOIN qualificacoes_tipos qt
        ON qh.qualificacao_codigo = qt.codigo
       AND qt.empresa_id = nl.empresa_id
       AND qt.deleted_at IS NULL
      WHERE ${conditions.join(' AND ')}
      ORDER BY nl.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const { results } = await c.env.DB.prepare(query)
      .bind(...params, limitNum, offsetNum)
      .all();

    // As estatísticas seguem o mesmo escopo de funcionário da listagem, sem aplicar
    // os filtros opcionais de status/data da página atual.
    const statsConditions: string[] = ['nl.empresa_id = ?'];
    const statsBindings: unknown[] = [empresaId];
    appendEmployeeSectorFilter(statsConditions, statsBindings, access, 'f');

    const { results: stats } = await c.env.DB.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN nl.status = 'enviada' THEN 1 ELSE 0 END) as enviadas,
         SUM(CASE WHEN nl.status = 'erro' THEN 1 ELSE 0 END) as erros,
         SUM(CASE WHEN nl.status = 'pendente' THEN 1 ELSE 0 END) as pendentes
       FROM notificacoes_log nl
       LEFT JOIN funcionarios f
         ON nl.funcionario_cpf = f.cpf
        AND f.empresa_id = nl.empresa_id
        AND f.deleted_at IS NULL
       WHERE ${statsConditions.join(' AND ')}`,
    )
      .bind(...statsBindings)
      .all();

    return c.json({
      success: true,
      data: results,
      meta: {
        count: results.length,
        limit: limitNum,
        offset: offsetNum,
        stats: stats[0],
      },
    });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao listar log de notificações',
      'NOTIFICACOES_LOG_LIST_ERROR',
      {
        route: '/log',
      },
    );
  }
});

// =============================================
// GET/PUT /api/notificacoes/configuracoes-modulos
// Política tenant-scoped para alertas de comunicação ainda sem config própria.
// Controles fail-closed de segurança não são expostos aqui.
// =============================================
app.get('/configuracoes-modulos', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const data = await getModuleAlertSettings(c.env.DB, empresaId);
    return c.json({ success: true, data });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao listar configurações de alertas dos módulos',
      'MODULE_ALERT_CONFIG_LIST_ERROR',
      { route: '/configuracoes-modulos' },
    );
  }
});

app.put('/configuracoes-modulos', auth(), requireRole('admin'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const payload = await c.req.json().catch(() => ({}));
    const data = await saveModuleAlertSettings(c.env.DB, empresaId, payload);
    return c.json({ success: true, data });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao salvar configurações de alertas dos módulos',
      'MODULE_ALERT_CONFIG_UPDATE_ERROR',
      { route: '/configuracoes-modulos' },
    );
  }
});

// =============================================
// GET/PUT /api/notificacoes/configuracoes-sgso-sla
// Reusa a tabela canônica sgso_sla_config; não cria regra paralela.
// =============================================
app.get('/configuracoes-sgso-sla', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const { results } = await c.env.DB.prepare(
      `SELECT fase, horas_prazo, horas_alerta_previa, ativo
           FROM sgso_sla_config
          WHERE empresa_id = ?
          ORDER BY CASE fase WHEN 'TRIAGEM' THEN 1 WHEN 'INVESTIGACAO' THEN 2 ELSE 3 END`,
    )
      .bind(empresaId)
      .all();
    return c.json({ success: true, data: results || [] });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao listar SLAs do SGSO',
      'SGSO_SLA_CONFIG_LIST_ERROR',
      { route: '/configuracoes-sgso-sla' },
    );
  }
});

app.put('/configuracoes-sgso-sla', auth(), requireRole('admin'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      rows?: Array<{
        fase?: unknown;
        horas_prazo?: unknown;
        horas_alerta_previa?: unknown;
        ativo?: unknown;
      }>;
    };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const allowed = new Set(['TRIAGEM', 'INVESTIGACAO', 'RESOLUCAO']);
    const normalized = rows.map((row) => {
      const fase = String(row.fase || '')
        .trim()
        .toUpperCase();
      const horasPrazo = Number(row.horas_prazo);
      const horasAlerta = Number(row.horas_alerta_previa);
      if (!allowed.has(fase)) throw new Error('SGSO_SLA_FASE_INVALIDA');
      if (!Number.isInteger(horasPrazo) || horasPrazo < 1 || horasPrazo > 8760) {
        throw new Error('SGSO_SLA_PRAZO_INVALIDO');
      }
      if (!Number.isInteger(horasAlerta) || horasAlerta < 0 || horasAlerta >= horasPrazo) {
        throw new Error('SGSO_SLA_ALERTA_INVALIDO');
      }
      return { fase, horasPrazo, horasAlerta, ativo: row.ativo === false ? 0 : 1 };
    });

    for (const row of normalized) {
      await c.env.DB.prepare(
        `INSERT INTO sgso_sla_config
             (empresa_id, fase, horas_prazo, horas_alerta_previa, ativo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(empresa_id, fase) DO UPDATE SET
             horas_prazo = excluded.horas_prazo,
             horas_alerta_previa = excluded.horas_alerta_previa,
             ativo = excluded.ativo,
             updated_at = datetime('now')`,
      )
        .bind(empresaId, row.fase, row.horasPrazo, row.horasAlerta, row.ativo)
        .run();
    }

    const { results } = await c.env.DB.prepare(
      `SELECT fase, horas_prazo, horas_alerta_previa, ativo
           FROM sgso_sla_config WHERE empresa_id = ? ORDER BY fase`,
    )
      .bind(empresaId)
      .all();
    return c.json({ success: true, data: results || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('SGSO_SLA_')) {
      return c.json(
        { success: false, error: 'Configuração de SLA SGSO inválida', code: message },
        400,
      );
    }
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao salvar SLAs do SGSO',
      'SGSO_SLA_CONFIG_UPDATE_ERROR',
      { route: '/configuracoes-sgso-sla' },
    );
  }
});

async function syncQualificationWhatsappStage(
  db: D1Database,
  params: {
    empresaId: number;
    codigo: string;
    ativo: number;
    diasAntes: number;
    frequencia: string;
    intervaloDias: number | null;
  },
): Promise<void> {
  const stage = getTrainingAlertStage(params.codigo);
  if (!stage?.employeeWhatsapp) return;

  const base = await db
    .prepare(
      `SELECT id, urgencia, destinatarios, template, assunto_template
         FROM notificacoes_config
        WHERE empresa_id IS NULL
          AND tipo = 'WHATSAPP'
          AND deleted_at IS NULL
          AND (
            UPPER(COALESCE(codigo, '')) = ?
            OR (codigo IS NULL AND (LOWER(COALESCE(urgencia, '')) = ? OR dias_antes = ?))
          )
        ORDER BY CASE WHEN UPPER(COALESCE(codigo, '')) = ? THEN 0 ELSE 1 END, id DESC
        LIMIT 1`,
    )
    .bind(params.codigo, stage.urgency, stage.defaultDays, params.codigo)
    .first<Record<string, unknown>>();
  if (!base) return;

  const existing = await db
    .prepare(
      `SELECT id
         FROM notificacoes_config
        WHERE empresa_id = ?
          AND tipo = 'WHATSAPP'
          AND deleted_at IS NULL
          AND (
            UPPER(COALESCE(codigo, '')) = ?
            OR (codigo IS NULL AND LOWER(COALESCE(urgencia, '')) = ?)
          )
        ORDER BY id DESC LIMIT 1`,
    )
    .bind(params.empresaId, params.codigo, stage.urgency)
    .first<{ id: number }>();

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE notificacoes_config
            SET ativo = ?, dias_antes = ?, urgencia = ?, destinatarios = ?, template = ?,
                codigo = ?, assunto_template = ?, frequencia = ?, intervalo_dias = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND empresa_id = ?`,
      )
      .bind(
        params.ativo,
        params.diasAntes,
        stage.urgency,
        base.destinatarios ?? null,
        base.template ?? '',
        params.codigo,
        base.assunto_template ?? null,
        params.frequencia,
        params.intervaloDias,
        existing.id,
        params.empresaId,
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO notificacoes_config
          (tipo, ativo, dias_antes, urgencia, destinatarios, template, empresa_id, codigo,
           assunto_template, frequencia, intervalo_dias, created_at, updated_at)
       VALUES ('WHATSAPP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      params.ativo,
      params.diasAntes,
      stage.urgency,
      base.destinatarios ?? null,
      base.template ?? '',
      params.empresaId,
      params.codigo,
      base.assunto_template ?? null,
      params.frequencia,
      params.intervaloDias,
    )
    .run();
}

// =============================================
// GET /api/notificacoes/configuracoes-qualificacoes
// Régua canônica por empresa. E-mail é a configuração visível; 30/15/7 sincronizam o mesmo estágio no WhatsApp.
// =============================================
app.get('/configuracoes-qualificacoes', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const { results } = await c.env.DB.prepare(
      `SELECT id, tipo, ativo, dias_antes, urgencia, destinatarios, template,
                empresa_id, codigo, assunto_template, frequencia, intervalo_dias,
                created_at, updated_at
           FROM notificacoes_config
          WHERE deleted_at IS NULL
            AND tipo = 'EMAIL'
            AND codigo LIKE 'QUALIFICACAO_%'
            AND (empresa_id IS NULL OR empresa_id = ?)
          ORDER BY CASE WHEN empresa_id IS NULL THEN 0 ELSE 1 END ASC, dias_antes DESC, id ASC`,
    )
      .bind(empresaId)
      .all<Record<string, unknown>>();

    const effective = new Map<string, Record<string, unknown>>();
    for (const row of results || []) {
      const codigo = String(row.codigo || '')
        .trim()
        .toUpperCase();
      if (!codigo) continue;
      effective.set(codigo, {
        ...row,
        origem: Number(row.empresa_id) === empresaId ? 'empresa' : 'padrao',
      });
    }

    return c.json({
      success: true,
      data: [...effective.values()].sort(
        (a, b) => Number(b.dias_antes || 0) - Number(a.dias_antes || 0),
      ),
    });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao listar configurações de alertas de qualificações',
      'QUALIFICATION_ALERT_CONFIG_LIST_ERROR',
      { route: '/configuracoes-qualificacoes' },
    );
  }
});

app.put('/configuracoes-qualificacoes/:codigo', auth(), requireRole('admin'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const codigo = String(c.req.param('codigo') || '')
      .trim()
      .toUpperCase();
    if (!/^QUALIFICACAO_[A-Z0-9_]{2,64}$/.test(codigo)) {
      return c.json({ success: false, error: 'Código de alerta inválido' }, 400);
    }

    const base = await c.env.DB.prepare(
      `SELECT id, tipo, ativo, dias_antes, urgencia, destinatarios, template,
                codigo, assunto_template, frequencia, intervalo_dias
           FROM notificacoes_config
          WHERE empresa_id IS NULL AND tipo = 'EMAIL' AND codigo = ? AND deleted_at IS NULL
          ORDER BY id DESC LIMIT 1`,
    )
      .bind(codigo)
      .first<Record<string, unknown>>();
    if (!base) return c.json({ success: false, error: 'Alerta padrão não encontrado' }, 404);

    const input = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const isExpired = codigo === 'QUALIFICACAO_VENCIDA';
    const ativo = input.ativo === undefined ? Number(base.ativo ?? 1) : input.ativo ? 1 : 0;
    const diasAntes = isExpired ? 0 : Number(input.dias_antes ?? base.dias_antes);
    if (!Number.isInteger(diasAntes) || diasAntes < 0 || diasAntes > 365) {
      return c.json({ success: false, error: 'dias_antes deve ser inteiro entre 0 e 365' }, 400);
    }

    const assuntoTemplate = String(input.assunto_template ?? base.assunto_template ?? '').trim();
    const template = String(input.template ?? base.template ?? '').trim();
    if (!assuntoTemplate || assuntoTemplate.length > 300) {
      return c.json({ success: false, error: 'Assunto deve ter entre 1 e 300 caracteres' }, 400);
    }
    if (!template || template.length > 5000) {
      return c.json({ success: false, error: 'Mensagem deve ter entre 1 e 5000 caracteres' }, 400);
    }

    const frequencia = String(input.frequencia ?? base.frequencia ?? 'ONCE')
      .trim()
      .toUpperCase();
    if (!['ONCE', 'DAILY', 'EVERY_N_DAYS'].includes(frequencia)) {
      return c.json({ success: false, error: 'Frequência inválida' }, 400);
    }
    const intervaloDias =
      frequencia === 'EVERY_N_DAYS'
        ? Math.max(1, Math.min(365, Number(input.intervalo_dias ?? base.intervalo_dias ?? 1)))
        : frequencia === 'DAILY'
          ? 1
          : null;

    const existing = await c.env.DB.prepare(
      `SELECT id FROM notificacoes_config
          WHERE empresa_id = ? AND tipo = 'EMAIL' AND codigo = ? AND deleted_at IS NULL
          LIMIT 1`,
    )
      .bind(empresaId, codigo)
      .first<{ id: number }>();

    if (existing?.id) {
      await c.env.DB.prepare(
        `UPDATE notificacoes_config
              SET ativo = ?, dias_antes = ?, urgencia = ?, destinatarios = ?, template = ?,
                  assunto_template = ?, frequencia = ?, intervalo_dias = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND empresa_id = ?`,
      )
        .bind(
          ativo,
          diasAntes,
          base.urgencia ?? null,
          base.destinatarios ?? null,
          template,
          assuntoTemplate,
          frequencia,
          intervaloDias,
          existing.id,
          empresaId,
        )
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO notificacoes_config
            (tipo, ativo, dias_antes, urgencia, destinatarios, template, empresa_id, codigo,
             assunto_template, frequencia, intervalo_dias, created_at, updated_at)
           VALUES ('EMAIL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
        .bind(
          ativo,
          diasAntes,
          base.urgencia ?? null,
          base.destinatarios ?? null,
          template,
          empresaId,
          codigo,
          assuntoTemplate,
          frequencia,
          intervaloDias,
        )
        .run();
    }

    await syncQualificationWhatsappStage(c.env.DB, {
      empresaId,
      codigo,
      ativo,
      diasAntes,
      frequencia,
      intervaloDias,
    });

    const updated = await c.env.DB.prepare(
      `SELECT id, tipo, ativo, dias_antes, urgencia, destinatarios, template,
                empresa_id, codigo, assunto_template, frequencia, intervalo_dias,
                created_at, updated_at
           FROM notificacoes_config
          WHERE empresa_id = ? AND tipo = 'EMAIL' AND codigo = ? AND deleted_at IS NULL
          LIMIT 1`,
    )
      .bind(empresaId, codigo)
      .first();

    return c.json({ success: true, data: { ...updated, origem: 'empresa' } });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao salvar configuração de alerta de qualificação',
      'QUALIFICATION_ALERT_CONFIG_UPDATE_ERROR',
      { route: '/configuracoes-qualificacoes/:codigo', configCode: c.req.param('codigo') },
    );
  }
});

app.delete('/configuracoes-qualificacoes/:codigo', auth(), requireRole('admin'), async (c) => {
  try {
    const empresaId = getEmpresaId(c);
    const codigo = String(c.req.param('codigo') || '')
      .trim()
      .toUpperCase();
    await c.env.DB.prepare(
      `UPDATE notificacoes_config
            SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE empresa_id = ? AND tipo = 'EMAIL' AND codigo = ? AND deleted_at IS NULL`,
    )
      .bind(empresaId, codigo)
      .run();
    const stage = getTrainingAlertStage(codigo);
    if (stage?.employeeWhatsapp) {
      await c.env.DB.prepare(
        `UPDATE notificacoes_config
            SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE empresa_id = ?
            AND tipo = 'WHATSAPP'
            AND deleted_at IS NULL
            AND (
              UPPER(COALESCE(codigo, '')) = ?
              OR (codigo IS NULL AND LOWER(COALESCE(urgencia, '')) = ?)
            )`,
      )
        .bind(empresaId, codigo, stage.urgency)
        .run();
    }
    return c.json({ success: true });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao restaurar configuração padrão de alerta',
      'QUALIFICATION_ALERT_CONFIG_RESET_ERROR',
      { route: '/configuracoes-qualificacoes/:codigo', configCode: c.req.param('codigo') },
    );
  }
});

// =============================================
// GET /api/notificacoes/config
// Listar configurações de notificações
// Lista apenas defaults globais. Overrides tenant-scoped são expostos somente
// pelas rotas específicas que resolvem a empresa autenticada.
// =============================================
app.get('/config', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `
      SELECT 
        id,
        tipo,
        ativo,
        dias_antes,
        urgencia,
        destinatarios,
        template,
        created_at,
        updated_at
      FROM notificacoes_config
      WHERE deleted_at IS NULL
        AND empresa_id IS NULL
      ORDER BY dias_antes DESC
    `,
    ).all();

    return c.json({
      success: true,
      data: results,
    });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao listar configurações',
      'NOTIFICACOES_CONFIG_LIST_ERROR',
      {
        route: '/config',
      },
    );
  }
});

// =============================================
// PUT /api/notificacoes/config/:id
// Atualizar configuração
//
// SECURITY: Schema V2 0516 adiciona empresa_id para overrides tenant-scoped das
// regras de QUALIFICAÇÕES. Esta rota legada continua destinada apenas às linhas
// globais da plataforma (empresa_id IS NULL) e permanece restrita a platform-admin.
// Overrides da empresa devem usar /configuracoes-qualificacoes/:codigo.
// =============================================
app.put('/config/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
    if (!isPlatformAdminContext(c as any)) {
      return c.json(
        {
          success: false,
          error:
            'Apenas administradores da plataforma podem alterar esta configuração global de notificações.',
          code: 'PLATFORM_ADMIN_REQUIRED',
        },
        403,
      );
    }

    const id = parseInt(c.req.param('id'));
    const input = await c.req.json();

    await c.env.DB.prepare(
      `
      UPDATE notificacoes_config
      SET 
        ativo = COALESCE(?, ativo),
        dias_antes = COALESCE(?, dias_antes),
        urgencia = COALESCE(?, urgencia),
        destinatarios = COALESCE(?, destinatarios),
        template = COALESCE(?, template),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND empresa_id IS NULL
    `,
    )
      .bind(
        input.ativo !== undefined ? input.ativo : null,
        input.dias_antes || null,
        input.urgencia || null,
        input.destinatarios || null,
        input.template || null,
        id,
      )
      .run();

    const updated = await c.env.DB.prepare(
      `
      SELECT * FROM notificacoes_config WHERE id = ? AND empresa_id IS NULL
    `,
    )
      .bind(id)
      .first();

    return c.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao atualizar configuração',
      'NOTIFICACOES_CONFIG_UPDATE_ERROR',
      {
        route: '/config/:id',
        configId: c.req.param('id'),
      },
    );
  }
});

// =============================================
// GET /api/notificacoes/sistema
// Lista notificações do sistema (alertas EdApp, etc)
// =============================================
app.get('/sistema', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const {
      lidas = 'false',
      limit = '50',
      tipo = '',
      tipo_prefix: tipoPrefixRaw = '',
      include_count: includeCountRaw = 'true',
    } = c.req.query();
    const tipoPrefix = tipoPrefixRaw.trim();
    if (tipoPrefix && !NOTIFICATION_TYPE_PREFIX_PATTERN.test(tipoPrefix)) {
      return c.json(
        {
          success: false,
          error: 'Prefixo de tipo de notificação inválido',
          code: 'INVALID_NOTIFICATION_TYPE_PREFIX',
        },
        400,
      );
    }
    const empresaId = getEmpresaId(c);
    const { userId } = getNotificationUserId(c as unknown as { get: (key: string) => unknown });
    const scope = buildSystemNotificationScope('n', empresaId, userId);

    const conditions: string[] = ['n.deleted_at IS NULL', scope.clause];
    const params: unknown[] = [empresaId, ...scope.params];

    if (lidas === 'false') {
      conditions.push('n.lida = 0');
    } else if (lidas === 'true') {
      conditions.push('n.lida = 1');
    }

    if (tipo) {
      conditions.push('n.tipo = ?');
      params.push(tipo);
    }
    if (tipoPrefix) {
      conditions.push('n.tipo GLOB ?');
      params.push(`${tipoPrefix}*`);
    }

    const whereClause = conditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    const notificationTable = tipoPrefix
      ? 'notificacoes_sistema n INDEXED BY idx_notificacoes_tipo'
      : 'notificacoes_sistema n';

    const query = `
      SELECT 
        n.*,
        f.nome as funcionario_nome,
        f.matricula as funcionario_matricula
      FROM ${notificationTable}
      LEFT JOIN funcionarios f
        ON f.id = n.funcionario_id
       AND f.empresa_id = ?
       AND f.deleted_at IS NULL
      WHERE ${whereClause}
      ORDER BY 
        CASE n.prioridade
          WHEN 'URGENTE' THEN 1
          WHEN 'ALTA' THEN 2
          WHEN 'MEDIA' THEN 3
          WHEN 'BAIXA' THEN 4
          ELSE 5
        END,
        n.created_at DESC
      LIMIT ?
    `;

    const { results } = await db
      .prepare(query)
      .bind(...params, limitNum)
      .all<{
        empresa_id: number | null;
        user_id: string | null;
        tipo: string | null;
        grupo: string | null;
        [key: string]: unknown;
      }>();

    let totalNaoLidas = 0;
    if (includeCountRaw !== 'false') {
      const countScope = buildSystemNotificationScope('', empresaId, userId);
      const countParams: unknown[] = [...countScope.params];
      const countWhere = `lida = 0 AND deleted_at IS NULL AND ${countScope.clause}`;
      const countResult = await db
        .prepare(`SELECT COUNT(*) as total FROM notificacoes_sistema WHERE ${countWhere}`)
        .bind(...countParams)
        .first<{ total: number }>();
      totalNaoLidas = countResult?.total || 0;
    }

    const sanitizedResults = (results || []).filter(
      (row) =>
        row.empresa_id === empresaId ||
        row.user_id === userId ||
        (row.empresa_id === null &&
          row.user_id === null &&
          isGlobalNotificationAllowed(row.tipo, row.grupo)),
    );

    return c.json({
      success: true,
      data: sanitizedResults,
      total_nao_lidas: totalNaoLidas,
    });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao listar notificações do sistema',
      'NOTIFICACOES_SISTEMA_LIST_ERROR',
      {
        route: '/sistema',
      },
    );
  }
});

// =============================================
// GET /api/notificacoes/sistema/contador
// Contador de notificações não lidas
// =============================================
app.get('/sistema/contador', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const { userId } = getNotificationUserId(c as unknown as { get: (key: string) => unknown });
    const scope = buildSystemNotificationScope('', empresaId, userId);

    const whereClause = `lida = 0 AND deleted_at IS NULL AND ${scope.clause}`;
    const params: unknown[] = [...scope.params];

    const result = await db
      .prepare(`SELECT COUNT(*) as total FROM notificacoes_sistema WHERE ${whereClause}`)
      .bind(...params)
      .first<{ total: number }>();

    return c.json({
      success: true,
      total_nao_lidas: result?.total || 0,
    });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao contar notificações do sistema',
      'NOTIFICACOES_SISTEMA_COUNT_ERROR',
      {
        route: '/sistema/contador',
      },
    );
  }
});

// =============================================
// PUT /api/notificacoes/sistema/:id/marcar-lida
// Marca notificação como lida
// =============================================
app.put('/sistema/:id/marcar-lida', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const id = parseInt(c.req.param('id'), 10);
    const empresaId = getEmpresaId(c);
    const { userId, lidaPor } = getNotificationUserId(
      c as unknown as { get: (key: string) => unknown },
    );
    const scope = buildSystemNotificationScope('', empresaId, userId);

    const result = await db
      .prepare(
        `UPDATE notificacoes_sistema 
         SET lida = 1, 
             lida_em = datetime('now'),
             lida_por = ?,
             updated_at = datetime('now')
         WHERE id = ?
           AND deleted_at IS NULL
           AND ${scope.clause}`,
      )
      .bind(lidaPor, id, ...scope.params)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Notificação não encontrada' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao marcar notificação como lida',
      'NOTIFICACOES_MARK_READ_ERROR',
      {
        route: '/sistema/:id/marcar-lida',
        notificationId: c.req.param('id'),
      },
    );
  }
});

// =============================================
// PUT /api/notificacoes/sistema/marcar-todas-lidas
// Marca todas como lidas
// =============================================
app.put('/sistema/marcar-todas-lidas', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const { userId, lidaPor } = getNotificationUserId(
      c as unknown as { get: (key: string) => unknown },
    );
    const scope = buildSystemNotificationScope('', empresaId, userId);

    const result = await db
      .prepare(
        `UPDATE notificacoes_sistema 
         SET lida = 1, 
             lida_em = datetime('now'),
             lida_por = ?,
             updated_at = datetime('now')
         WHERE lida = 0
           AND deleted_at IS NULL
           AND ${scope.clause}`,
      )
      .bind(lidaPor, ...scope.params)
      .run();

    return c.json({
      success: true,
      total_marcadas: result.meta.changes,
    });
  } catch (error) {
    return notificacoesErrorResponse(
      c,
      error,
      'Erro ao marcar todas notificações como lidas',
      'NOTIFICACOES_MARK_ALL_READ_ERROR',
      {
        route: '/sistema/marcar-todas-lidas',
      },
    );
  }
});

export default app;
