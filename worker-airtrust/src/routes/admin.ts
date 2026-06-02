/**
 * ADMIN ROUTES - Endpoints administrativos destrutivos
 *
 * ⚠️ DANGER ZONE ⚠️
 * Estes endpoints executam operações destrutivas irreversíveis.
 * Apenas usuários com role ADMIN podem acessar.
 *
 * Rotas disponíveis:
 * - DELETE /admin/reset/funcionarios
 * - DELETE /admin/reset/qualificacoes-tipos
 * - DELETE /admin/reset/qualificacoes-historico
 * - GET /admin/actions (auditoria)
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { buildAuditMetadata } from '../lib/audit/context';
import { sanitizeAuditPayload } from '../lib/audit/sanitize';
import adminDomainEventsRoutes from './admin-domain-events';
import adminManualMigrationsRoutes from './admin-manual-migrations';
import { backfillSessionChecks } from '../services/backfill-session-checks';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ===== MIDDLEWARE: ADMIN ONLY =====

/**
 * Middleware que verifica se usuário é ADMIN
 * Bloqueia acesso se não for
 */
const adminOnly = () => {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: () => Promise<void>) => {
    const userId = c.get('userId') || null;
    const userEmail = c.get('userEmail') || null;
    const userRole = c.get('userRole') || null;

    console.log('[ADMIN] Verificando permissões:', {
      userId,
      userEmail,
      userRole,
      path: c.req.path,
    });

    if (!userId) {
      return c.json(
        {
          success: false,
          error: 'Usuário não autenticado',
        },
        401,
      );
    }

    // Verificar role ADMIN
    if (userRole !== 'ADMIN' && userRole !== 'admin') {
      console.warn('[ADMIN] Tentativa de acesso não autorizado:', {
        userId,
        email: userEmail,
        role: userRole,
        path: c.req.path,
      });

      return c.json(
        {
          success: false,
          error: 'Acesso negado. Apenas administradores podem executar esta ação.',
        },
        403,
      );
    }

    await next();
  };
};

// ===== HELPER: AUDIT LOG =====

async function registrarAcaoAdmin(
  db: D1Database,
  params: {
    userId?: number;
    userEmail?: string;
    action: string;
    module: string;
    deletedCount: number;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  },
) {
  try {
    await db
      .prepare(
        `
        INSERT INTO admin_actions (
          user_id, user_email, action, module, 
          deleted_count, success, error_message, 
          metadata_json, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(
        params.userId || null,
        params.userEmail || null,
        params.action,
        params.module,
        params.deletedCount,
        params.success ? 1 : 0,
        typeof sanitizeAuditPayload(params.errorMessage || null) === 'string'
          ? (sanitizeAuditPayload(params.errorMessage || null) as string)
          : null,
        params.metadata ? JSON.stringify(sanitizeAuditPayload(params.metadata)) : null,
        params.ipAddress || null,
        params.userAgent || null,
      )
      .run();
  } catch (error) {
    console.error('[ADMIN] Erro ao registrar auditoria:', error);
    // Não falhar a operação se auditoria falhar, apenas logar
  }
}

function resolveTenantScope(
  c: Context<{ Bindings: Env; Variables: Variables }>,
): { empresaId: number; empresaCodigo: string | null } | null {
  let empresaId = Number(c.get('empresaId') || 0);
  let empresaCodigo: string | null = null;

  try {
    const tenantContext = getTenantContext(c);
    if (tenantContext?.empresaId) {
      empresaId = Number(tenantContext.empresaId);
      empresaCodigo = tenantContext.empresaCodigo || null;
    }
  } catch {
    // Contexto de tenant pode não estar disponível em cenários legados/testes.
  }

  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    return null;
  }

  return { empresaId, empresaCodigo };
}

async function tableHasColumn(db: D1Database, tableName: string, columnName: string): Promise<boolean> {
  const cols = await db.prepare(`PRAGMA table_info(${tableName})`).all<{ name: string }>();
  const names = (cols.results || []).map((c) => String(c.name || '').trim().toLowerCase());
  return names.includes(columnName.toLowerCase());
}

async function validateTenantScopeSupport(
  db: D1Database,
  params: { requireQualificacoesTiposEmpresaId?: boolean },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const hasFuncionariosEmpresaId = await tableHasColumn(db, 'funcionarios', 'empresa_id');
  if (!hasFuncionariosEmpresaId) {
    return {
      ok: false,
      reason: 'Tabela funcionarios sem coluna empresa_id: escopo tenant não pode ser garantido.',
    };
  }

  if (params.requireQualificacoesTiposEmpresaId) {
    const hasTiposEmpresaId = await tableHasColumn(db, 'qualificacoes_tipos', 'empresa_id');
    if (!hasTiposEmpresaId) {
      return {
        ok: false,
        reason:
          'Tabela qualificacoes_tipos sem coluna empresa_id: reset multi-tenant não pode ser executado com segurança.',
      };
    }
  }

  return { ok: true };
}

// ===== ROTAS DE RESET =====

/**
 * DELETE /admin/reset/funcionarios
 *
 * ⚠️ APAGA TODOS OS FUNCIONÁRIOS DO SISTEMA
 *
 * Ordem de deleção (respeita FKs):
 * 1. qualificacoes_historico (FK: funcionario_id)
 * 2. funcionarios_habilitacoes (FK: funcionario_id)
 * 3. funcionarios (tabela principal)
 *
 * Retorna: { success, deletedCount, details }
 */
app.delete('/reset/funcionarios', auth(), adminOnly(), async (c) => {
  const startTime = Date.now();
  const userId = (c.get('userId') as number) || 0;
  const userEmail = (c.get('userEmail') as string) || 'unknown';
  const tenantScope = resolveTenantScope(c);

  try {
    if (!tenantScope) {
      await registrarAcaoAdmin(c.env.DB, {
        userId,
        userEmail,
        action: 'RESET_FUNCIONARIOS',
        module: 'funcionarios',
        deletedCount: 0,
        success: false,
        errorMessage: 'tenant_scope_required',
      });
      return c.json(
        {
          success: false,
          error: 'tenant_scope_required',
          message: 'Contexto de tenant inválido. Operação bloqueada.',
        },
        403,
      );
    }

    const support = await validateTenantScopeSupport(c.env.DB, {});
    if (!support.ok) {
      await registrarAcaoAdmin(c.env.DB, {
        userId,
        userEmail,
        action: 'RESET_FUNCIONARIOS',
        module: 'funcionarios',
        deletedCount: 0,
        success: false,
        errorMessage: support.reason,
        metadata: buildAuditMetadata(c, { empresa_id: tenantScope.empresaId }),
      });
      return c.json(
        {
          success: false,
          error: 'tenant_scope_not_supported',
          message: support.reason,
        },
        409,
      );
    }

    console.log('[ADMIN] Iniciando reset de funcionários. User:', userEmail);

    let totalDeleted = 0;
    const details: Record<string, number> = {};

    // IMPORTANTE: Usar soft delete devido aos triggers de proteção

    // 1. Soft delete histórico de qualificações
    const histResult = await c.env.DB
      .prepare(
        "UPDATE qualificacoes_historico SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL) AND deleted_at IS NULL",
      )
      .bind(tenantScope.empresaId)
      .run();
    details.qualificacoes_historico = histResult.meta.changes || 0;
    totalDeleted += details.qualificacoes_historico;

    // 2. Soft delete aeronaves associadas (se existir)
    try {
      const aeroResult = await c.env.DB.prepare(
        "UPDATE funcionarios_aeronaves SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL) AND deleted_at IS NULL",
      )
        .bind(tenantScope.empresaId)
        .run();
      details.funcionarios_aeronaves = aeroResult.meta.changes || 0;
      totalDeleted += details.funcionarios_aeronaves;
    } catch (e) {
      details.funcionarios_aeronaves = 0;
    }

    // 3. Soft delete documentos (se existir)
    try {
      const docResult = await c.env.DB.prepare(
        "UPDATE funcionario_documentos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL) AND deleted_at IS NULL",
      )
        .bind(tenantScope.empresaId)
        .run();
      details.funcionario_documentos = docResult.meta.changes || 0;
      totalDeleted += details.funcionario_documentos;
    } catch (e) {
      details.funcionario_documentos = 0;
    }

    // 4. Finalmente, soft delete funcionários
    const funcResult = await c.env.DB
      .prepare(
        "UPDATE funcionarios SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE empresa_id = ? AND deleted_at IS NULL",
      )
      .bind(tenantScope.empresaId)
      .run();
    details.funcionarios = funcResult.meta.changes || 0;
    totalDeleted += details.funcionarios;

    const duration = Date.now() - startTime;

    // Registrar auditoria
    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_FUNCIONARIOS',
      module: 'funcionarios',
      deletedCount: totalDeleted,
      success: true,
      metadata: buildAuditMetadata(c, {
        details,
        duration,
        empresa_id: tenantScope.empresaId,
        empresa_codigo: tenantScope.empresaCodigo,
      }),
      ipAddress: c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    });

    console.log('[ADMIN] Reset de funcionários concluído:', { totalDeleted, details, duration });

    return c.json({
      success: true,
      deletedCount: totalDeleted,
      details,
      duration,
      message: `${totalDeleted} registros apagados com sucesso`,
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao resetar funcionários:', error);

    // Registrar erro na auditoria
    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_FUNCIONARIOS',
      module: 'funcionarios',
      deletedCount: 0,
      success: false,
      errorMessage: (error as Error).message,
    });

    const isDev = c.env.ENVIRONMENT !== 'production';
    return c.json(
      {
        success: false,
        error: 'Erro ao apagar funcionários',
        details: (error as Error).message,
        ...(isDev && { stack: (error as Error).stack }),
      },
      500,
    );
  }
});

/**
 * DELETE /admin/reset/qualificacoes-tipos
 *
 * ⚠️ APAGA TODOS OS TIPOS DE QUALIFICAÇÃO
 *
 * Ordem de deleção:
 * 1. qualificacoes_historico (FK: qualificacao_tipo_id)
 * 2. qualificacoes_tipos (tabela principal)
 */
app.delete('/reset/qualificacoes-tipos', auth(), adminOnly(), async (c) => {
  const startTime = Date.now();
  const userId = (c.get('userId') as number) || 0;
  const userEmail = (c.get('userEmail') as string) || 'unknown';
  const tenantScope = resolveTenantScope(c);

  try {
    if (!tenantScope) {
      await registrarAcaoAdmin(c.env.DB, {
        userId,
        userEmail,
        action: 'RESET_QUALIFICACOES_TIPOS',
        module: 'qualificacoes_tipos',
        deletedCount: 0,
        success: false,
        errorMessage: 'tenant_scope_required',
      });
      return c.json(
        {
          success: false,
          error: 'tenant_scope_required',
          message: 'Contexto de tenant inválido. Operação bloqueada.',
        },
        403,
      );
    }

    const support = await validateTenantScopeSupport(c.env.DB, {
      requireQualificacoesTiposEmpresaId: true,
    });
    if (!support.ok) {
      await registrarAcaoAdmin(c.env.DB, {
        userId,
        userEmail,
        action: 'RESET_QUALIFICACOES_TIPOS',
        module: 'qualificacoes_tipos',
        deletedCount: 0,
        success: false,
        errorMessage: support.reason,
        metadata: buildAuditMetadata(c, { empresa_id: tenantScope.empresaId }),
      });
      return c.json(
        {
          success: false,
          error: 'tenant_scope_not_supported',
          message: support.reason,
        },
        409,
      );
    }

    console.log('[ADMIN] Iniciando reset de tipos de qualificação. User:', userEmail);

    let totalDeleted = 0;
    const details: Record<string, number> = {};

    // Desabilitar triggers temporariamente para evitar conflitos de auditoria
    await c.env.DB.prepare('PRAGMA recursive_triggers = OFF').run();

    // 1. Soft delete histórico que referencia tipos
    const histResult = await c.env.DB
      .prepare(
        "UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE deleted_at IS NULL AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL) AND qualificacao_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id = ? AND deleted_at IS NULL)",
      )
      .bind(tenantScope.empresaId, tenantScope.empresaId)
      .run();
    details.qualificacoes_historico = histResult.meta.changes || 0;
    totalDeleted += details.qualificacoes_historico;

    // 2. Soft delete tipos
    const tiposResult = await c.env.DB
      .prepare(
        "UPDATE qualificacoes_tipos SET deleted_at = datetime('now') WHERE empresa_id = ? AND deleted_at IS NULL",
      )
      .bind(tenantScope.empresaId)
      .run();
    details.qualificacoes_tipos = tiposResult.meta.changes || 0;
    totalDeleted += details.qualificacoes_tipos;

    // Reabilitar triggers
    await c.env.DB.prepare('PRAGMA recursive_triggers = ON').run();

    const duration = Date.now() - startTime;

    // Auditoria
    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_QUALIFICACOES_TIPOS',
      module: 'qualificacoes_tipos',
      deletedCount: totalDeleted,
      success: true,
      metadata: buildAuditMetadata(c, {
        details,
        duration,
        empresa_id: tenantScope.empresaId,
        empresa_codigo: tenantScope.empresaCodigo,
      }),
      ipAddress: c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    });

    console.log('[ADMIN] Reset de tipos concluído:', { totalDeleted, details, duration });

    return c.json({
      success: true,
      deletedCount: totalDeleted,
      details,
      duration,
      message: `${totalDeleted} registros apagados com sucesso`,
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao resetar tipos:', error);

    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_QUALIFICACOES_TIPOS',
      module: 'qualificacoes_tipos',
      deletedCount: 0,
      success: false,
      errorMessage: (error as Error).message,
    });

    const isDev = c.env.ENVIRONMENT !== 'production';
    return c.json(
      {
        success: false,
        error: 'Erro ao apagar tipos de qualificação',
        details: (error as Error).message,
        ...(isDev && { stack: (error as Error).stack }),
      },
      500,
    );
  }
});

/**
 * DELETE /admin/reset/qualificacoes-historico
 *
 * ⚠️ APAGA TODO O HISTÓRICO DE QUALIFICAÇÕES
 *
 * Mais seguro que os outros pois não tem dependentes.
 */
app.delete('/reset/qualificacoes-historico', auth(), adminOnly(), async (c) => {
  const startTime = Date.now();
  const userId = (c.get('userId') as number) || 0;
  const userEmail = (c.get('userEmail') as string) || 'unknown';
  const tenantScope = resolveTenantScope(c);

  try {
    if (!tenantScope) {
      await registrarAcaoAdmin(c.env.DB, {
        userId,
        userEmail,
        action: 'RESET_QUALIFICACOES_HISTORICO',
        module: 'qualificacoes_historico',
        deletedCount: 0,
        success: false,
        errorMessage: 'tenant_scope_required',
      });
      return c.json(
        {
          success: false,
          error: 'tenant_scope_required',
          message: 'Contexto de tenant inválido. Operação bloqueada.',
        },
        403,
      );
    }

    const support = await validateTenantScopeSupport(c.env.DB, {});
    if (!support.ok) {
      await registrarAcaoAdmin(c.env.DB, {
        userId,
        userEmail,
        action: 'RESET_QUALIFICACOES_HISTORICO',
        module: 'qualificacoes_historico',
        deletedCount: 0,
        success: false,
        errorMessage: support.reason,
        metadata: buildAuditMetadata(c, { empresa_id: tenantScope.empresaId }),
      });
      return c.json(
        {
          success: false,
          error: 'tenant_scope_not_supported',
          message: support.reason,
        },
        409,
      );
    }

    console.log('[ADMIN] Iniciando reset de histórico de qualificações. User:', userEmail);

    // Desabilitar triggers temporariamente
    await c.env.DB.prepare('PRAGMA recursive_triggers = OFF').run();

    const result = await c.env.DB
      .prepare(
        "UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE deleted_at IS NULL AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL)",
      )
      .bind(tenantScope.empresaId)
      .run();
    const deletedCount = result.meta.changes || 0;

    // Reabilitar triggers
    await c.env.DB.prepare('PRAGMA recursive_triggers = ON').run();

    const duration = Date.now() - startTime;

    // Auditoria
    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_QUALIFICACOES_HISTORICO',
      module: 'qualificacoes_historico',
      deletedCount,
      success: true,
      metadata: buildAuditMetadata(c, {
        duration,
        empresa_id: tenantScope.empresaId,
        empresa_codigo: tenantScope.empresaCodigo,
      }),
      ipAddress: c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    });

    console.log('[ADMIN] Reset de histórico concluído:', { deletedCount, duration });

    return c.json({
      success: true,
      deletedCount,
      duration,
      message: `${deletedCount} registros apagados com sucesso`,
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao resetar histórico:', error);

    await registrarAcaoAdmin(c.env.DB, {
      userId,
      userEmail,
      action: 'RESET_QUALIFICACOES_HISTORICO',
      module: 'qualificacoes_historico',
      deletedCount: 0,
      success: false,
      errorMessage: (error as Error).message,
    });

    const isDev = c.env.ENVIRONMENT !== 'production';
    return c.json(
      {
        success: false,
        error: 'Erro ao apagar histórico de qualificações',
        details: (error as Error).message,
        ...(isDev && { stack: (error as Error).stack }),
      },
      500,
    );
  }
});

/**
 * GET /admin/actions
 *
 * Lista histórico de ações administrativas
 * Query params:
 * - limit: número de registros (default: 50)
 * - offset: paginação (default: 0)
 */
app.get('/actions', auth(), adminOnly(), async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const actions = await c.env.DB.prepare(
      `
      SELECT * FROM v_admin_actions_audit
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
      .bind(limit, offset)
      .all();

    return c.json({
      success: true,
      data: actions.results,
      meta: {
        limit,
        offset,
        count: actions.results?.length || 0,
      },
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao listar ações:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao listar ações administrativas',
      },
      500,
    );
  }
});

app.route('/', adminDomainEventsRoutes);
app.route('/', adminManualMigrationsRoutes);

/**
 * POST /api/admin/backfill-session-checks
 *
 * Backfill de manutenção para fichas de sessão com problemas de dados:
 * 1. Popula modelos_sessao_checks a partir de sessoes_checks existentes
 * 2. Linka simulador_agendamentos sem template_id ao modelo pelo tipo_sessao
 * 3. Cria sessoes_checks_resultados aprovados para fichas APROVADAS sem resultado
 */
app.post('/backfill-session-checks', auth(), adminOnly(), async (c) => {
  const tenantScope = resolveTenantScope(c);

  if (!tenantScope) {
    return c.json(
      {
        success: false,
        error: 'tenant_scope_required',
        message: 'Contexto de tenant inválido. Operação bloqueada.',
      },
      403,
    );
  }

  try {
    const resultado = await backfillSessionChecks(c.env.DB, tenantScope.empresaId);
    return c.json({ success: true, data: resultado });
  } catch (error) {
    console.error('[ADMIN] Erro no backfill:', error);
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

export default app;
