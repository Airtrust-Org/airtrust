/**
 * ADMIN ROUTES - consultas de auditoria e manutenções controladas.
 *
 * Endpoints destrutivos de reset e migrations manuais não fazem parte do runtime.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import adminDomainEventsRoutes from './admin-domain-events';
import { backfillSessionChecks } from '../services/backfill-session-checks';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const adminOnly = () => {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: () => Promise<void>) => {
    const userId = c.get('userId') || null;
    const userRole = c.get('userRole') || null;

    if (!userId) {
      return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
    }

    if (userRole !== 'ADMIN' && userRole !== 'admin') {
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

app.get('/actions', auth(), adminOnly(), async (c) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));

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
        error: 'ADMIN_ACTIONS_LIST_FAILED',
        message: 'Erro interno ao listar ações administrativas',
      },
      500,
    );
  }
});

app.route('/', adminDomainEventsRoutes);

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
    return c.json(
      {
        success: false,
        error: 'BACKFILL_SESSION_CHECKS_FAILED',
        message: 'Erro interno ao executar manutenção',
      },
      500,
    );
  }
});

export default app;
