/**
 * Operational-domain access facade.
 *
 * The core guard remains unchanged for managers and every operational
 * resource. Qualification-type catalog administration is the sole
 * exception: this UI is admin-only and every handler remains tenant-scoped,
 * so a tenant ADMINISTRADOR may maintain its own qualification models
 * without also holding an operational manager assignment.
 */
import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { ApiError } from '../lib/errors/api-error';
import * as core from '../services/operational-domain-access-core';
import {
  assertOperationalAccess,
  type OperationalAction,
  type OperationalDomain,
  type OperationalResourceType,
} from '../services/operational-domain-access-core';

export * from '../services/operational-domain-access-core';

type RequireOperationalAccessOptions =
  | {
      domain: OperationalDomain;
      action: OperationalAction;
      resourceType?: OperationalResourceType;
      resolveResourceId?: (c: Context<{ Bindings: Env }>) => number | null | undefined;
    }
  | {
      /** Domain resolved dynamically per-request from the resource itself. */
      domain?: undefined;
      action: OperationalAction;
      resourceType: OperationalResourceType;
      /** Extracts the numeric resource id from route params; defaults to c.req.param('id'). */
      resolveResourceId?: (c: Context<{ Bindings: Env }>) => number | null | undefined;
    };

function requireOperationalAccessGuard(
  options: RequireOperationalAccessOptions,
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const empresaId = Number((c.get as (key: string) => unknown)('empresaId') || 0);
    const userId = Number((c.get as (key: string) => unknown)('userId') || 0);
    const userRole = (c.get as (key: string) => unknown)('userRole');

    let resourceId: number | null | undefined;
    if (options.resourceType) {
      resourceId = options.resolveResourceId
        ? options.resolveResourceId(c)
        : Number(c.req.param('id')) || null;
    }

    // ── Pedagogical Bypass for Instructors / Students ──
    // Se o usuário for o instrutor/examinador ou aluno vinculado ao recurso (ação pedagógica legítima),
    // ele ignora a guarda gerencial e prossegue.
    if (
      ['simulador_sessao', 'simulador_ficha', 'simulador_sessao_participante'].includes(
        options.resourceType || '',
      )
    ) {
      const funcRow = await c.env.DB.prepare(
        `SELECT f.id FROM usuarios u
         JOIN funcionarios f ON f.id = u.funcionario_id
         WHERE u.id = ? AND f.empresa_id = ? AND (u.deleted_at IS NULL OR u.deleted_at = 0) AND f.deleted_at IS NULL LIMIT 1`,
      )
        .bind(userId, empresaId)
        .first<{ id: number }>();

      const funcId = funcRow ? Number(funcRow.id) : 0;
      if (funcId > 0) {
        let isPedagogical = false;
        if (options.resourceType === 'simulador_sessao') {
          if (options.action === 'create') {
            const body = (await c.req.raw
              .clone()
              .json()
              .catch(() => ({}))) as Record<string, unknown>;
            isPedagogical =
              Number(body.instrutor_id) === funcId || Number(body.examinador_id) === funcId;
          } else if (resourceId) {
            const row = await c.env.DB.prepare(
              'SELECT instrutor_id, examinador_id FROM simulador_agendamentos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
            )
              .bind(resourceId, empresaId)
              .first<{ instrutor_id: number | null; examinador_id: number | null }>();
            if (row) isPedagogical = row.instrutor_id === funcId || row.examinador_id === funcId;
          }
        } else if (options.resourceType === 'simulador_ficha' && resourceId) {
          const row = await c.env.DB.prepare(
            `SELECT sa.instrutor_id, sa.examinador_id, fs.colaborador_id_aluno
             FROM fichas_sessao fs
             LEFT JOIN simulador_agendamentos sa ON sa.id = fs.agendamento_slot_id AND sa.empresa_id = fs.empresa_id
             WHERE fs.id = ? AND fs.empresa_id = ? AND fs.deleted_at IS NULL`,
          )
            .bind(resourceId, empresaId)
            .first<{
              instrutor_id: number | null;
              examinador_id: number | null;
              colaborador_id_aluno: number | null;
            }>();
          if (row)
            isPedagogical =
              row.instrutor_id === funcId ||
              row.examinador_id === funcId ||
              row.colaborador_id_aluno === funcId;
        } else if (options.resourceType === 'simulador_sessao_participante') {
          if (options.action === 'create') {
            const row = await c.env.DB.prepare(
              'SELECT instrutor_id, examinador_id FROM simulador_agendamentos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
            )
              .bind(Number(c.req.param('id') || 0), empresaId)
              .first<{ instrutor_id: number | null; examinador_id: number | null }>();
            if (row) isPedagogical = row.instrutor_id === funcId || row.examinador_id === funcId;
          } else if (resourceId) {
            const row = await c.env.DB.prepare(
              `SELECT sa.instrutor_id, sa.examinador_id
               FROM sessoes_participantes sp
               INNER JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id AND sa.empresa_id = ?
               WHERE sp.id = ? AND sp.deleted_at IS NULL`,
            )
              .bind(empresaId, resourceId)
              .first<{ instrutor_id: number | null; examinador_id: number | null }>();
            if (row) isPedagogical = row.instrutor_id === funcId || row.examinador_id === funcId;
          }
        }

        if (isPedagogical) {
          await next();
          return;
        }
      }
    }
    // ────────────────────────────────────────────────────────

    await assertOperationalAccess({
      db: c.env.DB,
      empresaId,
      userId,
      userRole,
      domain: options.domain,
      action: options.action,
      resourceType: options.resourceType,
      resourceId,
    });

    await next();
  };
}

function isTenantAdminRole(userRole: unknown): boolean {
  return ['admin', 'administrador'].includes(
    String(userRole || '')
      .trim()
      .toLowerCase(),
  );
}

function isTenantAdminQualificationHistoryUpdateRequest(
  options: RequireOperationalAccessOptions,
  userRole: unknown,
): boolean {
  return options.resourceType === 'qualificacao_historico' &&
    options.action === 'update' && isTenantAdminRole(userRole);
}

function isTenantAdminQualificationCatalogRequest(
  options: RequireOperationalAccessOptions,
  userRole: unknown,
): boolean {
  return options.resourceType === 'qualificacao_tipo' && isTenantAdminRole(userRole);
}

export function requireOperationalAccess(
  options: RequireOperationalAccessOptions,
): MiddlewareHandler<{ Bindings: Env }> {
  const guardedMiddleware = requireOperationalAccessGuard(options);

  if (options.resourceType !== 'qualificacao_tipo' &&
      !(options.resourceType === 'qualificacao_historico' && options.action === 'update')) {
    return guardedMiddleware;
  }

  return async (c, next) => {
    const userRole = (c.get as (key: string) => unknown)('userRole');
    const isCatalogAdmin = isTenantAdminQualificationCatalogRequest(options, userRole);
    const isHistoryAdmin = isTenantAdminQualificationHistoryUpdateRequest(options, userRole);
    if (!isCatalogAdmin && !isHistoryAdmin) {
      await guardedMiddleware(c, next);
      return;
    }

    const empresaId = Number((c.get as (key: string) => unknown)('empresaId') || 0);
    // Preserve tenant RBAC rollout integrity, including missing/invalid flags.
    await core.isTenantRbacEnabled(c.env.DB, empresaId);

    if (isHistoryAdmin) {
      // Updating legacy historical qualifications must not require the
      // administrator to invent an operational domain for mixed EAD
      // categories. This exception applies ONLY to a tenant administrator
      // with the route's existing "qualificacoes:editar" permission, and
      // ONLY to an existing history row owned by the authenticated tenant
      // and linked to an employee of the same tenant.
      // Managers, other actions and cross-tenant IDs keep the core guard.
      const id = options.resolveResourceId
        ? options.resolveResourceId(c)
        : Number(c.req.param('id')) || null;
      if (!id || !Number.isInteger(id) || id <= 0) {
        throw new ApiError('Registro de qualificação inválido', 400, 'INVALID_QUALIFICATION_ID');
      }
      const owned = await c.env.DB.prepare(
        `SELECT qh.id FROM qualificacoes_historico qh
         INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = qh.empresa_id
         WHERE qh.id = ? AND qh.empresa_id = ? AND qh.deleted_at IS NULL LIMIT 1`,
      ).bind(id, empresaId).first<{ id: number }>();
      if (!owned) {
        throw new ApiError('Registro não encontrado', 404, 'QUALIFICATION_HISTORY_NOT_FOUND');
      }
    }

    // Catalog writes are already tenant-scoped in their handlers.
    await next();
  };
}
