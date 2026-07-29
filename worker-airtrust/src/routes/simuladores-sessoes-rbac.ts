/**
 * SIMULADORES SESSÕES — operational-domain RBAC helpers.
 *
 * Extracted out of simuladores-sessoes.ts (which grew past the
 * architecture guardrail's line cap). Sessões de simulador são
 * fixed-domain OPERACOES — see docs/rbac/gestor-operational-autonomy.md.
 */
import {
  requireOperationalAccess,
  resolveOperationalReadScope,
  normalizeTenantRole,
} from '../services/operational-domain-access';

export const requireOperacoesSessao = (action: 'create' | 'update' | 'delete') =>
  requireOperationalAccess({ domain: 'OPERACOES', action, resourceType: 'simulador_sessao' });

/**
 * Item 1 (read-side filtering): GET /sessoes treats GESTOR/MANAGER as
 * "full access" (isFullAccessRole) for the pre-existing instructor/student
 * self-scoping filter — a gestor sees every session in the tenant today,
 * regardless of setor. Once RBAC is active, this narrows a gestor's list
 * to sessions with at least one participant (including the primary
 * instrutor) inside their managed, domain-classified setores. Returns a
 * SQL fragment + bindings to append, or `blocked: true` when the gestor
 * has no OPERACOES access at all (caller should return an empty list).
 */
export async function buildOperationalSessaoReadFilter(params: {
  db: D1Database;
  empresaId: number;
  userId: number;
  role: string;
}): Promise<{ blocked: boolean; clause: string; bindings: number[] }> {
  if (normalizeTenantRole(params.role) !== 'manager') {
    return { blocked: false, clause: '', bindings: [] };
  }
  const readScope = await resolveOperationalReadScope({
    db: params.db,
    empresaId: params.empresaId,
    userId: params.userId,
    userRole: params.role,
  });
  if (!readScope.restricted) return { blocked: false, clause: '', bindings: [] };
  if (!readScope.domains.includes('OPERACOES') || readScope.setorIds.length === 0) {
    return { blocked: true, clause: '', bindings: [] };
  }
  const placeholders = readScope.setorIds.map(() => '?').join(', ');
  return {
    blocked: false,
    clause: ` AND (
      EXISTS (
        SELECT 1 FROM funcionarios f_readscope
        WHERE f_readscope.id = sa.instrutor_id
          AND f_readscope.empresa_id = sa.empresa_id
          AND f_readscope.setor_id IN (${placeholders})
      )
      OR EXISTS (
        SELECT 1 FROM sessoes_participantes sp_readscope
        INNER JOIN funcionarios f_readscope2
          ON f_readscope2.id = sp_readscope.funcionario_id
         AND f_readscope2.empresa_id = sa.empresa_id
        WHERE sp_readscope.sessao_id = sa.id
          AND sp_readscope.deleted_at IS NULL
          AND f_readscope2.setor_id IN (${placeholders})
      )
    )`,
    bindings: [...readScope.setorIds, ...readScope.setorIds],
  };
}

/**
 * Item 1: narrows a legacy `access.setorIds` scope (from
 * getEmployeeSectorAccess) down to setores with a classified domain, once
 * the tenant's RBAC is active and the caller is a gestor — so a gestor
 * doesn't see sessions of an unclassified managed setor just because the
 * setor is theirs. No-op (returns legacySetorIds unchanged) for
 * admin/instrutor/aluno, or while RBAC is disabled.
 */
export async function narrowSetorIdsForOperationalDomain(params: {
  db: D1Database;
  empresaId: number;
  userId: number;
  role: string;
  legacySetorIds: number[];
}): Promise<number[]> {
  if (normalizeTenantRole(params.role) !== 'manager') return params.legacySetorIds;
  const readScope = await resolveOperationalReadScope({
    db: params.db,
    empresaId: params.empresaId,
    userId: params.userId,
    userRole: params.role,
  });
  return readScope.restricted ? readScope.setorIds : params.legacySetorIds;
}
