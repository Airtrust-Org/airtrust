import { Hono } from 'hono';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { processarNotificacoes } from '../cron/notificacoes';
import { createLogger, toError } from '../utils/logger';
import type { Env } from '../types';
import {
  listLocalWhatsAppTemplates,
  seedLocalWhatsAppTemplateCatalog,
} from '../utils/alert-whatsapp-templates-store';

const app = new Hono<{ Bindings: Env }>();

const GLOBAL_NOTIFICATION_TYPES = ['ALERTA_DADOS', 'ALERTA_SEMANAL_QUALIFICACOES'] as const;
const GLOBAL_NOTIFICATION_GROUPS = ['auditoria', 'qualificacoes'] as const;

function isGlobalNotificationAllowed(tipo?: string | null, grupo?: string | null): boolean {
  const normalizedTipo = String(tipo || '').trim().toUpperCase();
  const normalizedGrupo = String(grupo || '').trim().toLowerCase();

  return (
    GLOBAL_NOTIFICATION_TYPES.includes(normalizedTipo as (typeof GLOBAL_NOTIFICATION_TYPES)[number]) ||
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

function getNotificationUserId(c: {
  get: (key: string) => unknown;
}): { userId: string | null; lidaPor: string | number | null } {
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
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const logger = createLogger(c, 'NotificacoesRoutes');
    logger.error('Erro ao processar notificações manualmente', toError(error));
    return c.json(
      {
        success: false,
        error: 'Erro ao processar notificações',
        details: errorMessage,
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
app.get('/whatsapp/overview', auth(), async (c) => {
  try {
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

    const whatsappConfigs = await c.env.DB.prepare(
      `SELECT id, ativo, dias_antes, urgencia, destinatarios, template, updated_at
         FROM notificacoes_config
        WHERE tipo = 'WHATSAPP'
          AND deleted_at IS NULL
        ORDER BY dias_antes ASC`,
    ).all();

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
         LEFT JOIN funcionarios f ON f.cpf = nl.funcionario_cpf
         LEFT JOIN qualificacoes_historico qh ON qh.id = nl.qualificacao_historico_id
         LEFT JOIN qualificacoes_tipos qt ON qt.codigo = qh.qualificacao_codigo
        WHERE nl.tipo = 'WHATSAPP'
        ORDER BY COALESCE(nl.enviado_em, nl.created_at) DESC
        LIMIT 15`,
    ).all();

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
app.get('/log', auth(), async (c) => {
  try {
    const {
      limit = '50',
      offset = '0',
      status,
      funcionario_cpf,
      data_inicio,
      data_fim,
    } = c.req.query();

    let query = `
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
      LEFT JOIN funcionarios f ON nl.funcionario_cpf = f.cpf
      LEFT JOIN qualificacoes_historico qh ON nl.qualificacao_historico_id = qh.id
      LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo
      WHERE 1=1
    `;

    const params: (string | number)[] = [];

    if (status) {
      query += ` AND nl.status = ?`;
      params.push(status);
    }

    if (funcionario_cpf) {
      query += ` AND nl.funcionario_cpf = ?`;
      params.push(funcionario_cpf);
    }

    if (data_inicio) {
      query += ` AND DATE(nl.enviado_em) >= ?`;
      params.push(data_inicio);
    }

    if (data_fim) {
      query += ` AND DATE(nl.enviado_em) <= ?`;
      params.push(data_fim);
    }

    query += ` ORDER BY nl.created_at DESC`;
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const { results } = await c.env.DB.prepare(query)
      .bind(...params)
      .all();

    // Estatísticas
    const { results: stats } = await c.env.DB.prepare(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'enviada' THEN 1 ELSE 0 END) as enviadas,
        SUM(CASE WHEN status = 'erro' THEN 1 ELSE 0 END) as erros,
        SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes
      FROM notificacoes_log
    `,
    ).all();

    return c.json({
      success: true,
      data: results,
      meta: {
        count: results.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
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
// GET /api/notificacoes/config
// Listar configurações de notificações
// =============================================
app.get('/config', auth(), async (c) => {
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
// =============================================
app.put('/config/:id', auth(), requireRole('admin', 'manager'), async (c) => {
  try {
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
      WHERE id = ?
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
      SELECT * FROM notificacoes_config WHERE id = ?
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
    const { lidas = 'false', limit = '50', tipo = '' } = c.req.query();
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

    const whereClause = conditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);

    const query = `
      SELECT 
        n.*,
        f.nome as funcionario_nome,
        f.matricula as funcionario_matricula
      FROM notificacoes_sistema n
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
      .all();

    const countScope = buildSystemNotificationScope('', empresaId, userId);
    const countParams: unknown[] = [...countScope.params];
    const countWhere = `lida = 0 AND deleted_at IS NULL AND ${countScope.clause}`;
    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM notificacoes_sistema WHERE ${countWhere}`)
      .bind(...countParams)
      .first<{ total: number }>();

    const sanitizedResults = (results || []).filter((row) =>
      row.empresa_id === empresaId ||
      row.user_id === userId ||
      (row.empresa_id === null &&
        row.user_id === null &&
        isGlobalNotificationAllowed(row.tipo, row.grupo)),
    );

    return c.json({
      success: true,
      data: sanitizedResults,
      total_nao_lidas: countResult?.total || 0,
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
