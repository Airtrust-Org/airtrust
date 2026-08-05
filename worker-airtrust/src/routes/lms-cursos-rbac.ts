/**
 * LMS CURSOS — operational-domain RBAC helpers.
 *
 * Extracted out of lms-cursos.ts (which grew past the architecture
 * guardrail's line cap) — pure logic, no route registration here. See
 * docs/rbac/gestor-operational-autonomy.md.
 *
 * lms_cursos.dominio_codigo can be OPERACOES, MANUTENCAO, etc. per row — no
 * fixed domain. Actions on an EXISTING curso (:id present) resolve their
 * domain dynamically from that row. A row with dominio_codigo NULL is
 * explicitly domain-agnostic, while tenant, role and setor guards remain.
 */
import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { ApiError } from '../middleware/error-handler';
import {
  requireOperationalAccess,
  resolveOperationalAccess,
  isValidOperationalDomain,
  resolveOperationalReadScope,
  assertOperationalAccess,
  normalizeTenantRole,
  type OperationalReadScope,
} from '../services/operational-domain-access';

function getContextValue(c: Context<{ Bindings: Env }>, key: string): unknown {
  return (c.get as (k: string) => unknown)(key);
}

async function isDomainAgnosticLmsCurso(params: {
  db: D1Database;
  empresaId: number;
  c: Context<{ Bindings: Env }>;
  cursoId: number;
}): Promise<boolean> {
  const userRole = getContextValue(params.c, 'userRole');
  const normalizedRole = normalizeTenantRole(userRole);
  if (normalizedRole !== 'admin' && normalizedRole !== 'manager') return false;

  const curso = await params.db
    .prepare(
      'SELECT dominio_codigo FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(params.cursoId, params.empresaId)
    .first<{ dominio_codigo: string | null }>();

  if (!curso || curso.dominio_codigo !== null) return false;

  // Preserve fail-closed handling of a missing/invalid tenant flag and the
  // requirement for an active operational setor assignment. The exemption
  // removes only the domain check; it does not create operational access.
  const access = await resolveOperationalAccess({
    db: params.db,
    empresaId: params.empresaId,
    userId: Number(getContextValue(params.c, 'userId') || 0),
    userRole,
  });
  return !access.enabled || access.setorIds.length > 0;
}

export const requireOperacoesCurso = (
  action: 'update' | 'delete' | 'create' | 'import' | 'publish' | 'unpublish',
): MiddlewareHandler<{ Bindings: Env }> => {
  const operationalGuard = requireOperationalAccess({ action, resourceType: 'lms_curso' });

  return async (c, next) => {
    const cursoId = Number(c.req.param('id')) || 0;
    const empresaId = Number(getContextValue(c, 'empresaId') || 0);

    if (cursoId > 0 && (await isDomainAgnosticLmsCurso({ db: c.env.DB, empresaId, c, cursoId }))) {
      await next();
      return;
    }

    await operationalGuard(c, next);
  };
};

/**
 * Item 1 (read-side filtering): cursos classificados são conteúdo
 * compartilhado por domínio. Cursos com dominio_codigo NULL são
 * domínio-agnósticos e permanecem visíveis; o filtro setorial aplicado pela
 * rota continua restringindo quais cursos o gestor pode acessar.
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

  if (!readScope.restricted) return { clause: '', bindings: [] };
  if (readScope.domains.length === 0) {
    return { clause: ' AND c.dominio_codigo IS NULL', bindings: [] };
  }

  return {
    clause: ` AND (c.dominio_codigo IS NULL OR c.dominio_codigo IN (${readScope.domains
      .map(() => '?')
      .join(', ')}))`,
    bindings: [...readScope.domains],
  };
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
  if (await isDomainAgnosticLmsCurso(params)) return;

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
 * instead of leaving the create path unguarded. A curso with no resolvable
 * domain is intentionally domain-agnostic; classified cursos still require
 * a domain within the caller's operational scope.
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
    if (cursoDominioCodigo && !operationalAccess.domains.includes(cursoDominioCodigo)) {
      throw new ApiError('Curso fora do seu escopo operacional — acesso negado', 403);
    }
  }

  return cursoDominioCodigo;
}
