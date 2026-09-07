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
import {
  buildAuditMetadata,
  buildLegacyAuditoriaActor,
  buildLegacyAuditPayload,
} from '../lib/audit/context';
import { recordLegacyAndCanonicalAudit } from '../lib/audit/record-legacy-and-canonical-audit';

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
  const tenantScope = resolveTenantScope(c);
  if (!tenantScope) {
    return c.json(
      {
        success: false,
        error: 'tenant_scope_required',
        message: 'Contexto de tenant inválido. Consulta bloqueada.',
      },
      403,
    );
  }

  try {
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));

    // The legacy v_admin_actions_audit view has no empresa_id and is therefore
    // structurally incapable of tenant isolation. Read the canonical audit
    // trail instead and scope every row to the authenticated tenant.
    const actions = await c.env.DB.prepare(
      `
      SELECT
        id,
        event_action AS action,
        entity_type AS module,
        success,
        failure_reason_code AS error_message,
        created_at,
        actor_user_id AS user_id,
        actor_role,
        risk_level,
        metadata_sanitized_json,
        'Ação Admin' AS action_type
      FROM audit_events_v2
      WHERE event_category = 'ADMIN_OPERATION'
        AND (
          empresa_id = ?
          OR target_empresa_id = ?
          OR actor_empresa_id = ?
        )
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
      .bind(
        tenantScope.empresaId,
        tenantScope.empresaId,
        tenantScope.empresaId,
        limit,
        offset,
      )
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
    const actorUserId = Number(c.get('userId') || 0) || null;
    const actorEmpresaId = Number(c.get('empresaId') || 0) || tenantScope.empresaId;
    const actorRole = typeof c.get('userRole') === 'string' ? String(c.get('userRole')) : null;
    const counts = {
      modelos_checks_inseridos: resultado.modelos_checks_inseridos,
      agendamentos_associados: resultado.agendamentos_linkados,
      checks_criados: resultado.checks_criados,
      resultados_criados: resultado.resultados_criados,
      error_count: resultado.erros.length,
    };
    const auditMetadata = buildAuditMetadata(c, {
      operation: 'BACKFILL_SESSION_CHECKS',
      scope: 'tenant',
      count:
        resultado.modelos_checks_inseridos +
        resultado.agendamentos_linkados +
        resultado.checks_criados +
        resultado.resultados_criados,
      ...counts,
    });

    await recordLegacyAndCanonicalAudit({
      db: c.env.DB,
      legacyAuditoria: {
        tabela: 'admin_backfill_session_checks',
        acao: 'BULK_UPDATE',
        registro_id: tenantScope.empresaId,
        dados_novos: buildLegacyAuditPayload(c, counts, auditMetadata),
        ...buildLegacyAuditoriaActor(c),
      },
      canonicalEvent: {
        empresaId: tenantScope.empresaId,
        targetEmpresaId: tenantScope.empresaId,
        actorUserId,
        actorEmpresaId,
        actorRole,
        eventCategory: 'ADMIN_OPERATION',
        eventAction: 'BACKFILL_SESSION_CHECKS',
        entityType: 'admin_backfill_session_checks',
        entityId: tenantScope.empresaId,
        riskLevel: 'high',
        metadata: auditMetadata,
        retentionClass: 'SECURITY_LONG',
      },
    });

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