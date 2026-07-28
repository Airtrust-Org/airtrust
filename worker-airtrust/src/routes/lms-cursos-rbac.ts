/**
 * LMS CURSOS — operational-domain RBAC helpers.
 *
 * Extracted out of lms-cursos.ts (which grew past the architecture
 * guardrail's line cap) — pure logic, no route registration here. See
 * docs/rbac/gestor-operational-autonomy.md.
 *
 * lms_cursos.dominio_codigo can be OPERACOES, MANUTENCAO, etc. per row — no
 * fixed domain. Actions on an EXISTING curso (:id present) resolve their
 * domain dynamically from that row.
 */
import type { Context } from 'hono';
import type { Env } from '../types';
import { ApiError } from '../middleware/error-handler';
import {
  requireOperationalAccess,
  resolveOperationalAccess,
  isValidOperationalDomain,
  resolveOperationalReadScope,
  appendOperationalReadFilter,
  assertOperationalAccess,
  normalizeTenantRole,
  type OperationalReadScope,
} from '../services/operational-domain-access';

export const requireOperacoesCurso = (
  action: 'update' | 'delete' | 'create' | 'import' | 'publish' | 'unpublish',
) => requireOperationalAccess({ action, resourceType: 'lms_curso' });

function getContextValue(c: Context<{ Bindings: Env }>, key: string): unknown {
  return (c.get as (k: string) => unknown)(key);
}

/**
 * Item 1 (read-side filtering): cursos são conteúdo compartilhado por
 * domínio — uma vez com RBAC ativo, um gestor só deve listar cursos
 * classificados em um dos seus domínios. No-op em modo legado / para
 * admin/instrutor/aluno.
 */
export async function applyLmsCursosDomainReadFilter(params: {
  db: D1Database;
  empresaId: number;
  c: Context<{ Bindings: Env }>;
  hasLmsCursosDominioCodigo: boolean;
}): Promise<{ clause: string; bindings: unknown[] }> {
  if (!params.hasLmsCursosDominioCodigo) return { clause: '', bindings: [] };

  const readScope: OperationalReadScope = await resolveOperationalReadScope({
    db: params.db,
    empresaId: params.empresaId,
    userId: Number(getContextValue(params.c, 'userId') || 0),
    userRole: getContextValue(params.c, 'userRole'),
  });
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  appendOperationalReadFilter(conditions, bindings, readScope, { domainColumn: 'c.dominio_codigo' });
  return conditions.length > 0 ? { clause: ` AND ${conditions.join(' AND ')}`, bindings } : { clause: '', bindings: [] };
}

/**
 * Item 1: direct-ID access must also respect the curso's own domain
 * classification once RBAC is active. Scoped to 'manager' only —
 * admin/instrutor/aluno keep their existing access model unchanged.
 */
export async function assertLmsCursoDetailDomainAccess(params: {
  db: D1Database;
  empresaId: number;
  c: Context<{ Bindings: Env }>;
  cursoId: number;
}): Promise<void> {
  const userRole = getContextValue(params.c, 'userRole');
  if (normalizeTenantRole(userRole) !== 'manager') return;
  await assertOperationalAccess({
    db: params.db,
    empresaId: params.empresaId,
    userId: Number(getContextValue(params.c, 'userId') || 0),
    userRole,
    action: 'view',
    resourceType: 'lms_curso',
    resourceId: params.cursoId,
  });
}

/**
 * Bloqueador 4 / Item 3: resolve the domain explicitly (payload's own
 * dominio_codigo, falling back to the linked qualificação's categoria)
 * instead of leaving the create path unguarded — a gestor de Manutenção
 * creating a Manutenção-domain course must not be blocked, and a course
 * with no resolvable domain fails closed once the tenant's RBAC is active.
 * Throws ApiError (422/403) on invalid/out-of-scope domain.
 */
export async function resolveAndValidateCursoDominioCodigo(params: {
  db: D1Database;
  empresaId: number;
  c: Context<{ Bindings: Env }>;
  explicitDominioCodigo: string | null | undefined;
  resolvedQualificacaoTipoId: number | null;
}): Promise<string | null> {
  const { db, empresaId, c, resolvedQualificacaoTipoId } = params;

  let cursoDominioCodigo: string | null = params.explicitDominioCodigo?.trim() || null;
  if (!cursoDominioCodigo && resolvedQualificacaoTipoId) {
    const tipoCategoria = await db
      .prepare(
        `SELECT qc.dominio_codigo AS dominio_codigo
           FROM qualificacoes_tipos qt
           LEFT JOIN qualificacoes_categorias qc ON qc.id = qt.categoria_id
          WHERE qt.id = ? AND qt.empresa_id = ? AND qt.deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(resolvedQualificacaoTipoId, empresaId)
      .first<{ dominio_codigo: string | null }>();
    cursoDominioCodigo = tipoCategoria?.dominio_codigo ?? null;
  }

  const operationalAccess = await resolveOperationalAccess({
    db,
    empresaId,
    userId: Number(getContextValue(c, 'userId') || 0),
    userRole: getContextValue(c, 'userRole'),
  });
  if (operationalAccess.enabled) {
    if (cursoDominioCodigo !== null && !isValidOperationalDomain(cursoDominioCodigo)) {
      throw new ApiError('Domínio informado é inválido', 422);
    }
    if (!cursoDominioCodigo || !operationalAccess.domains.includes(cursoDominioCodigo)) {
      throw new ApiError('Curso sem domínio classificado ou fora do seu escopo — acesso negado', 403);
    }
  }

  return cursoDominioCodigo;
}
