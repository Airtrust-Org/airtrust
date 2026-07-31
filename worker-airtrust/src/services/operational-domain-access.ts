/**
 * OPERATIONAL DOMAIN ACCESS — gestor operational autonomy RBAC.
 *
 * Central guard that scopes a GESTOR's operational access by canonical
 * domain (OPERACOES, MANUTENCAO, SGSO, FRMS, CORPORATIVO) and by the
 * setores they actively manage in setores_gestores. Built ON TOP OF
 * employee-sector-access.ts (setor resolution) and normalizeTenantRole
 * (role normalization) rather than reimplementing either.
 *
 * ADMINISTRADOR does not receive operational access from the role alone —
 * access here is derived purely from active setores_gestores membership,
 * so an admin who is also assigned as gestor of a setor gets exactly the
 * same operational access a regular gestor of that setor would get, no
 * more and no less.
 *
 * Rollout is per-tenant via empresas.operational_domain_rbac_enabled:
 *   - disabled (0, default): assertOperationalAccess/requireOperationalAccess
 *     are no-ops. Legacy behavior (requireRole('admin','manager') at the
 *     route level) is preserved unchanged — this module grants nothing
 *     extra and blocks nothing extra while disabled.
 *   - enabled (1): fail-closed. No setor => no access. No domain on the
 *     setor/resource => no access. Domain not in the active catalog => no
 *     access. See docs/rbac/gestor-operational-autonomy.md for the full
 *     rollout plan.
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { ApiError, forbidden } from '../middleware/error-handler';
import { normalizeTenantRole } from '../middleware/tenant';
import { resolveEmployeeSectorAccess } from './employee-sector-access';

export const OPERATIONAL_DOMAINS = [
  'OPERACOES',
  'MANUTENCAO',
  'SGSO',
  'FRMS',
  'CORPORATIVO',
] as const;

export type OperationalDomain = (typeof OPERATIONAL_DOMAINS)[number];

export const OPERATIONAL_ACTIONS = [
  'view',
  'create',
  'update',
  'delete',
  'restore',
  'complete',
  'reopen',
  'cancel',
  'publish',
  'unpublish',
  'issue',
  'reissue',
  'revoke',
  'import',
  'export',
] as const;

export type OperationalAction = (typeof OPERATIONAL_ACTIONS)[number];

/**
 * Resource types this guard knows how to resolve a domain/setor for.
 * Simuladores-family types are fixed-domain (OPERACOES) by business rule —
 * see docs/rbac/gestor-operational-autonomy.md §Resource matrix. MRO is
 * fixed-domain (MANUTENCAO) but has no backend rows yet (frontend
 * prototype only) — resolveResourceDomain never needs a resourceId for it.
 */
export type OperationalResourceType =
  | 'simulador_modelo_sessao'
  | 'simulador_tipo_sessao'
  | 'simulador_manobra'
  | 'simulador_sessao'
  | 'simulador_sessao_participante'
  | 'simulador_ficha'
  | 'simulador_guia_instrutor'
  | 'qualificacao_tipo'
  | 'qualificacao_historico'
  | 'qualificacao_certificado'
  | 'lms_curso'
  | 'funcionario'
  | 'mro_prototipo';

export function isFixedDomainResourceType(resourceType: OperationalResourceType): boolean {
  return FIXED_DOMAIN_RESOURCE_TYPES[resourceType] !== undefined;
}

// Bloqueador 3: only genuinely shared-by-domain catalog content belongs
// here — content with no individual owner, same for every setor in the
// domain (modelos/tipos de sessão, manobras, guias do instrutor). Sessions
// and fichas are individual, funcionário-linked records (they have a
// specific aluno/participante) and were REMOVED from this map — they still
// always resolve to OPERACOES, but via resolveResourceDomain's DB path
// below, which also resolves the owning setor so the setor check applies.
const FIXED_DOMAIN_RESOURCE_TYPES: Partial<Record<OperationalResourceType, OperationalDomain>> = {
  simulador_modelo_sessao: 'OPERACOES',
  simulador_tipo_sessao: 'OPERACOES',
  simulador_manobra: 'OPERACOES',
  simulador_guia_instrutor: 'OPERACOES',
  mro_prototipo: 'MANUTENCAO',
};

// Resource types authorized by setor, not merely by domain — two setores in
// the same domain are NOT interchangeable for these. Shared catalog
// content (qualificacao_tipo, lms_curso when independent, and everything
// in FIXED_DOMAIN_RESOURCE_TYPES) is intentionally excluded.
const SETOR_SCOPED_RESOURCE_TYPES = new Set<OperationalResourceType>([
  'funcionario',
  'qualificacao_historico',
  'qualificacao_certificado',
  'simulador_sessao',
  'simulador_sessao_participante',
  'simulador_ficha',
]);

function isSetorScopedResourceType(resourceType: OperationalResourceType): boolean {
  return SETOR_SCOPED_RESOURCE_TYPES.has(resourceType);
}

export interface OperationalAccessResolution {
  /** Whether the new RBAC is active for this tenant. */
  enabled: boolean;
  /** Domains the caller has an active operational grant in. Empty when disabled or ungranted. */
  domains: OperationalDomain[];
  /** Setores the caller actively manages (setores_gestores, ativo, not deleted). */
  setorIds: number[];
  /** Actions available per granted domain — always the full action list when a domain is granted. */
  actions: Partial<Record<OperationalDomain, OperationalAction[]>>;
}

interface ResolveOperationalAccessParams {
  db: D1Database;
  empresaId: number;
  userId: number;
  userRole: unknown;
}

interface AssertOperationalAccessParams extends ResolveOperationalAccessParams {
  /**
   * Explicit domain to check. Required for resource types whose domain is
   * fixed by business rule (simuladores, MRO) and for actions with no
   * existing resource yet (e.g. 'create', where the target domain must
   * come from the caller — usually the request payload's own
   * classification, not the URL). Omit it for actions on an EXISTING
   * resource whose domain varies per row (qualificações, LMS cursos,
   * funcionários) — pass resourceType + resourceId instead and the
   * resource's own dominio_codigo becomes the effective domain to check.
   * Providing both still cross-checks the resource against the explicit
   * domain (useful when the caller wants to additionally assert "this must
   * specifically be an OPERACOES resource").
   */
  domain?: string;
  action: string;
  resourceType?: OperationalResourceType;
  resourceId?: number | null;
}

/**
 * Resolves whether the RBAC is enabled for a tenant. Deliberately NOT
 * fail-open: a query failure, an unreadable table, or a garbage flag value
 * must never be silently treated as "legacy mode" — that would let a
 * transient infrastructure problem quietly disable the entire operational
 * guard. Only an explicit, successfully-read 0 means legacy; only an
 * explicit, successfully-read 1 means enforce. Anything else throws a
 * controlled error that the route's error handler turns into a 500/503,
 * blocking the request rather than authorizing it.
 */
async function isTenantRbacEnabled(db: D1Database, empresaId: number): Promise<boolean> {
  let row: { operational_domain_rbac_enabled: unknown } | null;
  try {
    row = await db
      .prepare('SELECT operational_domain_rbac_enabled FROM empresas WHERE id = ? LIMIT 1')
      .bind(empresaId)
      .first<{ operational_domain_rbac_enabled: unknown }>();
  } catch (error) {
    // A real query failure (D1 timeout, unreadable table, connection
    // error) must never be silently treated as "legacy tenant" — that
    // would let an infrastructure problem quietly disable the operational
    // guard. Block the request instead of authorizing it.
    throw new ApiError(
      'Não foi possível verificar o estado do RBAC operacional para este tenant',
      503,
      'OPERATIONAL_DOMAIN_RBAC_STATE_UNAVAILABLE',
    );
  }

  // Empresa ausente (no row for this empresaId) is a data-integrity
  // problem, not a legacy tenant — it must block, not silently authorize
  // as legacy. Only an explicit, successfully-read 0 means legacy; only an
  // explicit, successfully-read 1 means enforce. NULL, undefined (missing
  // column), or any other stored value are all inconsistent states that
  // must never fall back to legacy.
  if (!row) {
    throw new ApiError(
      'Empresa não encontrada ao verificar o estado do RBAC operacional',
      404,
      'OPERATIONAL_DOMAIN_RBAC_EMPRESA_NOT_FOUND',
    );
  }

  const raw = row.operational_domain_rbac_enabled;
  if (raw === 0 || raw === '0') return false;
  if (raw === 1 || raw === '1') return true;

  throw new ApiError(
    `Valor inválido para operational_domain_rbac_enabled: ${String(raw)}`,
    500,
    'OPERATIONAL_DOMAIN_RBAC_INVALID_FLAG',
  );
}

export async function activeDomainCodes(db: D1Database): Promise<Set<OperationalDomain>> {
  const rows = await db
    .prepare('SELECT codigo FROM dominios_operacionais WHERE ativo = 1')
    .all<{ codigo: string }>();

  return new Set(
    (rows.results || [])
      .map((row) => row.codigo)
      .filter((codigo): codigo is OperationalDomain =>
        (OPERATIONAL_DOMAINS as readonly string[]).includes(codigo),
      ),
  );
}

/**
 * Resolves the setores a given userId actively manages via setores_gestores,
 * regardless of that user's actual role. Reuses
 * resolveEmployeeSectorAccess by forcing the manager branch — this is the
 * *only* code path in the codebase that queries setores_gestores by
 * usuario_id, so we call into it rather than duplicating the query. This is
 * intentionally role-independent: an ADMINISTRADOR who also holds an active
 * setores_gestores row gets exactly the same result a GESTOR would.
 */
async function resolveManagedSetorIds(
  db: D1Database,
  empresaId: number,
  userId: number,
): Promise<number[]> {
  if (!Number.isInteger(userId) || userId <= 0) return [];
  const access = await resolveEmployeeSectorAccess(db, empresaId, userId, 'manager');
  return access.mode === 'restricted' ? access.setorIds : [];
}

/**
 * Roles allowed to carry operational access at all, once a tenant's RBAC is
 * enabled. 'manager' already covers GESTOR and (via normalizeTenantRole's
 * canonical mapping) COMPLIANCE — an existing, proven alias, not a new one
 * introduced here. 'admin' is included because an ADMINISTRADOR can still
 * receive operational access through an explicit setor attribution; the
 * setores_gestores membership check that follows is what actually scopes
 * it, this is just the role-level allowlist. Every other normalized role
 * (instructor, student, editor, viewer) is denied outright — a stray or
 * erroneous setores_gestores row must never turn an INSTRUTOR or ALUNO into
 * an operational gestor.
 */
const OPERATIONAL_ACCESS_ELIGIBLE_ROLES = new Set(['admin', 'manager']);

export async function resolveOperationalAccess(
  params: ResolveOperationalAccessParams,
): Promise<OperationalAccessResolution> {
  const { db, empresaId, userId, userRole } = params;

  const enabled = await isTenantRbacEnabled(db, empresaId);
  if (!enabled) {
    return { enabled: false, domains: [], setorIds: [], actions: {} };
  }

  const normalizedRole = normalizeTenantRole(userRole);
  if (!OPERATIONAL_ACCESS_ELIGIBLE_ROLES.has(normalizedRole)) {
    return { enabled: true, domains: [], setorIds: [], actions: {} };
  }

  const setorIds = await resolveManagedSetorIds(db, empresaId, userId);
  if (setorIds.length === 0) {
    return { enabled: true, domains: [], setorIds: [], actions: {} };
  }

  const activeCodes = await activeDomainCodes(db);
  if (activeCodes.size === 0) {
    return { enabled: true, domains: [], setorIds, actions: {} };
  }

  const placeholders = setorIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT DISTINCT dominio_codigo
         FROM setores
        WHERE empresa_id = ?
          AND id IN (${placeholders})
          AND ativo = 1
          AND deleted_at IS NULL
          AND dominio_codigo IS NOT NULL`,
    )
    .bind(empresaId, ...setorIds)
    .all<{ dominio_codigo: string }>();

  const domains = (rows.results || [])
    .map((row) => row.dominio_codigo)
    .filter((codigo): codigo is OperationalDomain => activeCodes.has(codigo as OperationalDomain));

  const actions: Partial<Record<OperationalDomain, OperationalAction[]>> = {};
  for (const domain of domains) {
    actions[domain] = [...OPERATIONAL_ACTIONS];
  }

  return { enabled: true, domains, setorIds, actions };
}

/**
 * Resolves a resource's domain (and, where applicable, its owning setor)
 * for the purpose of authorization. Returns null domain when the resource
 * is unclassified — callers must treat that as fail-closed, never as
 * "OPERACOES by default".
 */
export async function resolveResourceDomain(
  db: D1Database,
  empresaId: number,
  resourceType: OperationalResourceType,
  resourceId?: number | null,
): Promise<{ domain: OperationalDomain | null; setorId: number | null; setorIds?: number[] }> {
  const fixed = FIXED_DOMAIN_RESOURCE_TYPES[resourceType];
  if (fixed) {
    return { domain: fixed, setorId: null };
  }

  if (!resourceId || !Number.isInteger(resourceId) || resourceId <= 0) {
    return { domain: null, setorId: null };
  }

  switch (resourceType) {
    case 'qualificacao_tipo': {
      const row = await db
        .prepare(
          `SELECT qc.dominio_codigo AS dominio_codigo
             FROM qualificacoes_tipos qt
             LEFT JOIN qualificacoes_categorias qc ON qc.id = qt.categoria_id
            WHERE qt.id = ? AND qt.empresa_id = ? AND qt.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(resourceId, empresaId)
        .first<{ dominio_codigo: string | null }>();
      return { domain: (row?.dominio_codigo as OperationalDomain) ?? null, setorId: null };
    }
    case 'qualificacao_historico':
    case 'qualificacao_certificado': {
      // Bloqueador 3: qualificacao_historico/certificado are individual,
      // funcionario-linked records, not shared-by-domain content — two
      // funcionários in different setores of the SAME domain (e.g. two
      // OPERACOES setores) must not be interchangeable just because the
      // domain matches. Resolve the owning funcionário's setor here too,
      // so assertOperationalAccess's setorIds check (below) actually
      // narrows access to the gestor's own setor, not merely their domain.
      //
      // Classification-resolution fallback (certificate-generation
      // incident): qh.categoria_id is only a SNAPSHOT taken at write time
      // (migration 0412's one-time backfill, or whatever a given INSERT
      // path happened to populate) — it can be NULL on a historico row even
      // when the qualificação tipo it belongs to (qh.qualificacao_id ->
      // qualificacoes_tipos.categoria_id) IS currently classified. That is
      // a stale/missing-snapshot gap, not an authorization decision, so
      // resolution here prefers the historico's own snapshot when
      // classified and falls back to the tipo's LIVE classification
      // otherwise — mirroring the same "canonical source over a possibly
      // stale copy" pattern already used for setor domain resolution (see
      // resolveManagedSectorDomainFallback below). This does NOT widen any
      // privilege and does NOT invent a domain for a genuinely unclassified
      // category: if the tipo's own categoria also has no dominio_codigo
      // (e.g. a legacy category residue), COALESCE still yields NULL and
      // the caller fails closed exactly as before — classifying that
      // category is a separate, explicit data decision outside this guard.
      const row = await db
        .prepare(
          `SELECT COALESCE(qc_hist.dominio_codigo, qc_tipo.dominio_codigo) AS dominio_codigo,
                  f.setor_id AS setor_id
             FROM qualificacoes_historico qh
             LEFT JOIN qualificacoes_categorias qc_hist ON qc_hist.id = qh.categoria_id
             LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
             LEFT JOIN qualificacoes_categorias qc_tipo ON qc_tipo.id = qt.categoria_id
             LEFT JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = qh.empresa_id
            WHERE qh.id = ? AND qh.empresa_id = ? AND qh.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(resourceId, empresaId)
        .first<{ dominio_codigo: string | null; setor_id: number | null }>();
      return {
        domain: (row?.dominio_codigo as OperationalDomain) ?? null,
        setorId: row?.setor_id ?? null,
      };
    }
    case 'lms_curso': {
      // Explicit column only — NOT inherited from qualificacao_tipo_id.
      // Discovery confirmed lms_cursos rows can be fully independent
      // (both qualificacao_tipo_id and categoria nullable), so inheriting
      // would silently misclassify independent courses.
      const row = await db
        .prepare(
          `SELECT dominio_codigo FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
        )
        .bind(resourceId, empresaId)
        .first<{ dominio_codigo: string | null }>();
      return { domain: (row?.dominio_codigo as OperationalDomain) ?? null, setorId: null };
    }
    case 'funcionario': {
      const row = await db
        .prepare(
          `SELECT s.dominio_codigo AS dominio_codigo, f.setor_id AS setor_id
             FROM funcionarios f
             LEFT JOIN setores s ON s.id = f.setor_id AND s.empresa_id = f.empresa_id
            WHERE f.id = ? AND f.empresa_id = ? AND f.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(resourceId, empresaId)
        .first<{ dominio_codigo: string | null; setor_id: number | null }>();
      return {
        domain: (row?.dominio_codigo as OperationalDomain) ?? null,
        setorId: row?.setor_id ?? null,
      };
    }
    case 'simulador_sessao': {
      // Item 5 (whole-session operations): domain is fixed OPERACOES by
      // business rule, but authorization must cover EVERY funcionário
      // affected by the operation — the primary participant
      // (simulador_agendamentos.funcionario_id) AND every active row in
      // sessoes_participantes for this session. A gestor may only act on
      // the whole session when ALL of them are within their managed
      // setores; setorIds (plural) below carries the full set, and
      // assertOperationalAccess requires every one of them in scope,
      // failing closed if any setor can't be resolved.
      const primary = await db
        .prepare(
          `SELECT f.setor_id AS setor_id
             FROM simulador_agendamentos sa
             LEFT JOIN funcionarios f ON f.id = sa.funcionario_id AND f.empresa_id = sa.empresa_id
            WHERE sa.id = ? AND sa.empresa_id = ? AND sa.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(resourceId, empresaId)
        .first<{ setor_id: number | null }>();
      if (!primary) return { domain: null, setorId: null };

      const participantes = await db
        .prepare(
          `SELECT f.setor_id AS setor_id
             FROM sessoes_participantes sp
             INNER JOIN funcionarios f ON f.id = sp.funcionario_id AND f.empresa_id = ?
            WHERE sp.sessao_id = ? AND sp.deleted_at IS NULL`,
        )
        .bind(empresaId, resourceId)
        .all<{ setor_id: number | null }>();

      const allSetorIds = [
        primary.setor_id ?? null,
        ...(participantes.results || []).map((p) => p.setor_id ?? null),
      ];
      // Fail closed: any participant whose setor can't be resolved (null)
      // blocks the whole-session operation — represented as -1, a setor_id
      // that can never legitimately match anything in access.setorIds.
      const setorIds = [...new Set(allSetorIds.map((id) => id ?? -1))];

      return { domain: 'OPERACOES', setorId: primary.setor_id ?? null, setorIds };
    }
    case 'simulador_sessao_participante': {
      // Item 5 (per-participant operations): only THIS participant's own
      // setor is validated — creating/editing/removing one participant
      // must not require every other participant of the session to also
      // be in the gestor's scope.
      const row = await db
        .prepare(
          `SELECT f.setor_id AS setor_id
             FROM sessoes_participantes sp
             INNER JOIN funcionarios f ON f.id = sp.funcionario_id AND f.empresa_id = ?
            WHERE sp.id = ? AND sp.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(empresaId, resourceId)
        .first<{ setor_id: number | null }>();
      if (!row) return { domain: null, setorId: null };
      return { domain: 'OPERACOES', setorId: row.setor_id ?? null };
    }
    case 'simulador_ficha': {
      // Domain fixed OPERACOES; setor is the ficha's aluno
      // (fichas_sessao.colaborador_id_aluno) — the subject of the record.
      const row = await db
        .prepare(
          `SELECT f.setor_id AS setor_id
             FROM fichas_sessao fs
             LEFT JOIN funcionarios f ON f.id = fs.colaborador_id_aluno AND f.empresa_id = fs.empresa_id
            WHERE fs.id = ? AND fs.empresa_id = ? AND fs.deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(resourceId, empresaId)
        .first<{ setor_id: number | null }>();
      if (!row) return { domain: null, setorId: null };
      return { domain: 'OPERACOES', setorId: row.setor_id ?? null };
    }
    default:
      return { domain: null, setorId: null };
  }
}

export async function assertOperationalAccess(
  params: AssertOperationalAccessParams,
): Promise<OperationalAccessResolution> {
  const { db, empresaId, userId, userRole, domain, action, resourceType, resourceId } = params;

  if (!(OPERATIONAL_ACTIONS as readonly string[]).includes(action)) {
    throw new ApiError(`Ação operacional desconhecida: ${action}`, 422, 'UNKNOWN_OPERATIONAL_ACTION');
  }
  if (domain !== undefined && !(OPERATIONAL_DOMAINS as readonly string[]).includes(domain)) {
    throw new ApiError(`Domínio operacional desconhecido: ${domain}`, 422, 'UNKNOWN_OPERATIONAL_DOMAIN');
  }
  const resourceTypeIsFixedDomain = !!resourceType && isFixedDomainResourceType(resourceType);
  if (domain === undefined && !(resourceType && (resourceId || resourceTypeIsFixedDomain))) {
    // Programmer error, not a user-facing authorization outcome: a caller
    // must supply either an explicit domain or enough to resolve one from
    // an existing resource.
    throw new ApiError(
      'assertOperationalAccess requer domain explícito ou resourceType+resourceId para resolver o domínio do recurso',
      500,
      'OPERATIONAL_ACCESS_MISCONFIGURED',
    );
  }

  const access = await resolveOperationalAccess({ db, empresaId, userId, userRole });

  if (!access.enabled) {
    // Legacy mode: this guard does not restrict further. Route-level
    // requireRole('admin','manager') remains the sole gate.
    return access;
  }

  // Resolve the resource whenever there's an id to look up, OR the
  // resourceType is fixed-domain (which needs no id at all — a caller
  // passing resourceType: 'simulador_modelo_sessao' with no resourceId
  // must still be cross-checked against a mismatched explicit `domain`).
  // Variable-domain resource types (qualificação, LMS curso, funcionário)
  // with no resourceId are 'create'-style calls with nothing yet to
  // resolve — intentionally skipped, not fail-closed.
  let resource: {
    domain: OperationalDomain | null;
    setorId: number | null;
    setorIds?: number[];
  } | null = null;
  if (resourceType && (resourceId || resourceTypeIsFixedDomain)) {
    resource = await resolveResourceDomain(db, empresaId, resourceType, resourceId);
  }

  // Effective domain: the explicit one when given, otherwise the resolved
  // resource's own domain (dynamic — never assume OPERACOES by default).
  const effectiveDomain: OperationalDomain | null =
    (domain as OperationalDomain | undefined) ?? resource?.domain ?? null;

  if (!effectiveDomain) {
    forbidden(
      'Recurso sem domínio classificado — acesso negado (fail-closed)',
      'RESOURCE_DOMAIN_UNCLASSIFIED',
    );
  }

  if (!access.domains.includes(effectiveDomain)) {
    forbidden(
      `Acesso operacional negado ao domínio ${effectiveDomain}`,
      'OPERATIONAL_DOMAIN_ACCESS_DENIED',
    );
  }

  if (resource) {
    if (!resource.domain) {
      forbidden(
        'Recurso sem domínio classificado — acesso negado (fail-closed)',
        'RESOURCE_DOMAIN_UNCLASSIFIED',
      );
    }
    if (domain !== undefined && resource.domain !== effectiveDomain) {
      forbidden('Recurso pertence a um domínio diferente do solicitado', 'RESOURCE_DOMAIN_MISMATCH');
    }
    if (resourceType && isSetorScopedResourceType(resourceType)) {
      // Item 5: some resources (whole simulador_sessao operations) carry a
      // plural setorIds — EVERY affected funcionário's setor must be in
      // scope, not just one. Everything else keeps the single-setor check.
      if (resource.setorIds) {
        const allInScope =
          resource.setorIds.length > 0 &&
          resource.setorIds.every((setorId) => access.setorIds.includes(setorId));
        if (!allInScope) {
          forbidden(
            'Um ou mais participantes da sessão estão fora do seu escopo',
            'RESOURCE_SETOR_OUT_OF_SCOPE',
          );
        }
      } else if (!resource.setorId || !access.setorIds.includes(resource.setorId)) {
        // Bloqueador 3: individual, funcionário-linked resources (as
        // opposed to shared-by-domain content) are authorized by setor,
        // not merely by domain — two setores in the same domain must not
        // be interchangeable. A resolved resource with no setorId here
        // (e.g. funcionário without setor_id, or historico orphaned from
        // its funcionário) fails closed rather than skipping the check.
        forbidden('Recurso pertence a um setor fora do seu escopo', 'RESOURCE_SETOR_OUT_OF_SCOPE');
      }
    }
  }

  return access;
}

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

export function requireOperationalAccess(
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
    if (['simulador_sessao', 'simulador_ficha', 'simulador_sessao_participante'].includes(options.resourceType || '')) {
      const funcRow = await c.env.DB.prepare(
        `SELECT f.id FROM usuarios u 
         JOIN funcionarios f ON f.id = u.funcionario_id 
         WHERE u.id = ? AND f.empresa_id = ? AND (u.deleted_at IS NULL OR u.deleted_at = 0) AND f.deleted_at IS NULL LIMIT 1`
      ).bind(userId, empresaId).first<{id: number}>();
      
      const funcId = funcRow ? Number(funcRow.id) : 0;
      if (funcId > 0) {
        let isPedagogical = false;
        if (options.resourceType === 'simulador_sessao') {
          if (options.action === 'create') {
            const body = await c.req.raw.clone().json().catch(() => ({})) as Record<string, unknown>;
            isPedagogical = Number(body.instrutor_id) === funcId || Number(body.examinador_id) === funcId;
          } else if (resourceId) {
            const row = await c.env.DB.prepare(
              'SELECT instrutor_id, examinador_id FROM simulador_agendamentos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL'
            ).bind(resourceId, empresaId).first<{ instrutor_id: number | null, examinador_id: number | null }>();
            if (row) isPedagogical = row.instrutor_id === funcId || row.examinador_id === funcId;
          }
        } else if (options.resourceType === 'simulador_ficha' && resourceId) {
          const row = await c.env.DB.prepare(
            `SELECT sa.instrutor_id, sa.examinador_id, fs.colaborador_id_aluno
             FROM fichas_sessao fs
             LEFT JOIN simulador_agendamentos sa ON sa.id = fs.sessao_id AND sa.empresa_id = fs.empresa_id
             WHERE fs.id = ? AND fs.empresa_id = ? AND fs.deleted_at IS NULL`
          ).bind(resourceId, empresaId).first<{ instrutor_id: number | null, examinador_id: number | null, colaborador_id_aluno: number | null }>();
          if (row) isPedagogical = row.instrutor_id === funcId || row.examinador_id === funcId || row.colaborador_id_aluno === funcId;
        } else if (options.resourceType === 'simulador_sessao_participante') {
          if (options.action === 'create') {
            const row = await c.env.DB.prepare(
              'SELECT instrutor_id, examinador_id FROM simulador_agendamentos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL'
            ).bind(Number(c.req.param('id') || 0), empresaId).first<{ instrutor_id: number | null, examinador_id: number | null }>();
            if (row) isPedagogical = row.instrutor_id === funcId || row.examinador_id === funcId;
          } else if (resourceId) {
            const row = await c.env.DB.prepare(
              `SELECT sa.instrutor_id, sa.examinador_id
               FROM sessoes_participantes sp
               INNER JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id AND sa.empresa_id = ?
               WHERE sp.id = ? AND sp.deleted_at IS NULL`
            ).bind(empresaId, resourceId).first<{ instrutor_id: number | null, examinador_id: number | null }>();
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

export function isValidOperationalDomain(value: unknown): value is OperationalDomain {
  return typeof value === 'string' && (OPERATIONAL_DOMAINS as readonly string[]).includes(value);
}



/**
 * Item 5 / create-time equivalent: validates that every funcionário in
 * `funcionarioIds` belongs to a setor within the caller's operational
 * scope, for actions with no existing resourceId to resolve setores from
 * (creating a session with its initial participantes, adding one new
 * participante). No-op when the tenant's RBAC is disabled (legacy). Fails
 * closed (403) if the caller isn't admin/manager, or if ANY funcionário's
 * setor can't be resolved or isn't in scope — same "no participant left
 * unchecked" rule as the plural-setorIds path in assertOperationalAccess.
 */
export async function assertFuncionarioIdsWithinOperationalScope(params: {
  db: D1Database;
  empresaId: number;
  userId: number;
  userRole: unknown;
  funcionarioIds: number[];
}): Promise<void> {
  const { db, empresaId, userId, userRole, funcionarioIds } = params;
  if (funcionarioIds.length === 0) return;

  const access = await resolveOperationalAccess({ db, empresaId, userId, userRole });
  if (!access.enabled) return;

  if (!access.domains.includes('OPERACOES')) {
    forbidden('Acesso operacional negado ao domínio OPERACOES', 'OPERATIONAL_DOMAIN_ACCESS_DENIED');
  }

  const placeholders = funcionarioIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT id, setor_id FROM funcionarios
        WHERE id IN (${placeholders}) AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(...funcionarioIds, empresaId)
    .all<{ id: number; setor_id: number | null }>();

  const setorById = new Map((rows.results || []).map((row) => [row.id, row.setor_id]));
  const allInScope = funcionarioIds.every((id) => {
    const setorId = setorById.get(id);
    return setorId !== null && setorId !== undefined && access.setorIds.includes(setorId);
  });

  if (!allInScope) {
    forbidden(
      'Um ou mais participantes estão fora do seu escopo — acesso negado (fail-closed)',
      'RESOURCE_SETOR_OUT_OF_SCOPE',
    );
  }
}

/**
 * Item 3: validates a target setor for flows that have no existing resource
 * to resolve a domain from — funcionário creation, and the DESTINATION
 * setor of a funcionário setor transfer (the ORIGIN setor is already
 * covered by the route's normal 'funcionario' resourceType guard, resolved
 * from the existing record before the update). No-op when the tenant's
 * RBAC is disabled (legacy). Fails closed (403) if setorId is missing, the
 * setor's domain is unclassified, or the setor is outside the caller's
 * managed scope — never defaults to any domain, including OPERACOES.
 */
export async function assertSetorWithinOperationalScope(params: {
  db: D1Database;
  empresaId: number;
  userId: number;
  userRole: unknown;
  setorId: number | null;
}): Promise<void> {
  const { db, empresaId, userId, userRole, setorId } = params;

  const access = await resolveOperationalAccess({ db, empresaId, userId, userRole });
  if (!access.enabled) return;

  if (!setorId) {
    forbidden(
      'Setor obrigatório para validar domínio operacional — acesso negado (fail-closed)',
      'RESOURCE_SETOR_UNRESOLVED',
    );
  }

  const setor = await db
    .prepare(
      `SELECT dominio_codigo FROM setores
        WHERE id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(setorId, empresaId)
    .first<{ dominio_codigo: string | null }>();

  if (!setor || !setor.dominio_codigo) {
    forbidden('Setor sem domínio classificado — acesso negado (fail-closed)', 'RESOURCE_DOMAIN_UNCLASSIFIED');
  }

  if (!access.domains.includes(setor.dominio_codigo as OperationalDomain)) {
    forbidden(
      `Acesso operacional negado ao domínio ${setor.dominio_codigo}`,
      'OPERATIONAL_DOMAIN_ACCESS_DENIED',
    );
  }

  if (!access.setorIds.includes(setorId)) {
    forbidden('Setor fora do seu escopo', 'RESOURCE_SETOR_OUT_OF_SCOPE');
  }
}

export interface OperationalReadScope {
  /** true when this read must be narrowed to `domains`/`setorIds` below. */
  restricted: boolean;
  domains: OperationalDomain[];
  setorIds: number[];
}

const UNRESTRICTED_READ_SCOPE: OperationalReadScope = { restricted: false, domains: [], setorIds: [] };

export type ManagedSectorDomainReason =
  | 'MANAGED_SECTOR_DOMAIN'
  | 'QUALIFICATION_SECTOR_LINK'
  | 'AMBIGUOUS_UNCLASSIFIED';

export interface ManagedSectorDomainResolution {
  setorId: number;
  domain: OperationalDomain | null;
  reason: ManagedSectorDomainReason;
}

/**
 * Resolve o domínio operacional de um setor GERIDO (setores_gestores ativo)
 * quando setores.dominio_codigo está NULL — causa raiz confirmada da
 * investigação "ADMIN vê nove registros, GESTOR Operações vê só três": um
 * setor legitimamente gerido some do read scope só por falta de
 * classificação de domínio (ver resolveOperationalReadScope).
 *
 * Fallback canônico (nunca inventa/adivinha, nunca libera em ambiguidade):
 *   1. setores.dominio_codigo, se classificado — MANAGED_SECTOR_DOMAIN.
 *   2. domínio das qualificações vinculadas a este setor via
 *      qualificacoes_tipos_setores, SE E SOMENTE SE todas apontarem para o
 *      MESMO domínio único — QUALIFICATION_SECTOR_LINK. Duas qualificações
 *      do mesmo setor com domínios diferentes é uma inconsistência de dado,
 *      não motivo para adivinhar; fica bloqueado.
 *   3. Caso contrário — AMBIGUOUS_UNCLASSIFIED, sempre fail-closed (nenhum
 *      domínio resolvido, setor continua fora do read scope).
 *
 * Uma quarta via (transversalidade formal, setor marcado explicitamente como
 * "atende todos os domínios") ainda não tem coluna própria no schema
 * (setores não tem is_transversal) — não implementada aqui para não inventar
 * uma regra sem lastro de dado; ver observação no relatório de entrega.
 */
export async function resolveManagedSectorDomainFallback(
  db: D1Database,
  empresaId: number,
  setorId: number,
  activeCodes: Set<OperationalDomain>,
): Promise<ManagedSectorDomainResolution> {
  const setor = await db
    .prepare(
      `SELECT dominio_codigo FROM setores WHERE id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(setorId, empresaId)
    .first<{ dominio_codigo: string | null }>();

  if (setor?.dominio_codigo && activeCodes.has(setor.dominio_codigo as OperationalDomain)) {
    return { setorId, domain: setor.dominio_codigo as OperationalDomain, reason: 'MANAGED_SECTOR_DOMAIN' };
  }

  const rows = await db
    .prepare(
      `SELECT DISTINCT qc.dominio_codigo AS dominio_codigo
         FROM qualificacoes_tipos_setores qts
         JOIN qualificacoes_tipos qt ON qt.id = qts.tipo_id AND qt.deleted_at IS NULL
         LEFT JOIN qualificacoes_categorias qc ON qc.id = qt.categoria_id
        WHERE qts.setor_id = ? AND qts.empresa_id = ? AND qts.deleted_at IS NULL`,
    )
    .bind(setorId, empresaId)
    .all<{ dominio_codigo: string | null }>();

  const linkedDomains = new Set(
    (rows.results || [])
      .map((row) => row.dominio_codigo)
      .filter((d): d is string => Boolean(d) && activeCodes.has(d as OperationalDomain)),
  );

  if (linkedDomains.size === 1) {
    const [only] = linkedDomains;
    return { setorId, domain: only as OperationalDomain, reason: 'QUALIFICATION_SECTOR_LINK' };
  }

  return { setorId, domain: null, reason: 'AMBIGUOUS_UNCLASSIFIED' };
}

/**
 * Item 1: read-side counterpart to resolveOperationalAccess. ADMINISTRADOR
 * and every non-gestor role (instrutor, aluno, editor, viewer) already have
 * their own established read-access model (full tenant visibility for
 * admin; self/funcionario-scope for instrutor/aluno) — this helper only
 * narrows reads for the GESTOR role, and only once a tenant's RBAC is
 * active. Never widens what a caller could already see.
 */
export async function resolveOperationalReadScope(params: {
  db: D1Database;
  empresaId: number;
  userId: number;
  userRole: unknown;
}): Promise<OperationalReadScope> {
  const normalizedRole = normalizeTenantRole(params.userRole);
  if (normalizedRole !== 'manager') return UNRESTRICTED_READ_SCOPE;

  const access = await resolveOperationalAccess(params);
  if (!access.enabled) return UNRESTRICTED_READ_SCOPE;

  if (access.setorIds.length === 0) {
    return { restricted: true, domains: [], setorIds: [] };
  }

  // access.setorIds is the gestor's FULL managed-setor list, including any
  // setor that has no domain classified yet — resolveOperationalAccess
  // keeps that list intact because the mutation guard checks domain and
  // setor separately.
  const placeholders = access.setorIds.map(() => '?').join(', ');
  const classified = await params.db
    .prepare(
      `SELECT id FROM setores
        WHERE empresa_id = ? AND id IN (${placeholders}) AND ativo = 1 AND deleted_at IS NULL
          AND dominio_codigo IS NOT NULL`,
    )
    .bind(params.empresaId, ...access.setorIds)
    .all<{ id: number }>();

  const classifiedIds = new Set((classified.results || []).map((row) => row.id));
  const unclassifiedManagedIds = access.setorIds.filter((id) => !classifiedIds.has(id));

  const setorIds = [...classifiedIds];
  const domains = new Set(access.domains);

  // Setores geridos SEM domínio classificado: tenta a resolução canônica de
  // fallback antes de excluir. Ambiguidade permanece fail-closed (excluído).
  if (unclassifiedManagedIds.length > 0) {
    const activeCodes = await activeDomainCodes(params.db);
    for (const setorId of unclassifiedManagedIds) {
      const resolution = await resolveManagedSectorDomainFallback(
        params.db,
        params.empresaId,
        setorId,
        activeCodes,
      );
      if (resolution.domain && resolution.reason === 'QUALIFICATION_SECTOR_LINK') {
        // Só amplia o setorIds (visibilidade individual, setor-scoped) — NUNCA
        // o domains[] usado pelo filtro domainColumn (catálogo compartilhado,
        // visível tenant-wide para o domínio inteiro). O fallback infere o
        // domínio a partir de UM setor específico; ele não é uma prova de que
        // a gestora tem autoridade sobre TODO o catálogo daquele domínio —
        // apenas sobre os registros do próprio setor que ela já gerencia.
        setorIds.push(setorId);
      }
    }
  }

  return { restricted: true, domains: [...domains], setorIds };
}

/**
 * Appends a `dominio_codigo` (shared/catalog content) and/or setor_id
 * (individual content) filter to a hand-built WHERE clause, mirroring
 * employee-sector-access.ts's appendEmployeeSectorFilter. When the scope
 * isn't restricted, this is a no-op — legacy behavior is unchanged. When
 * restricted with an empty domains/setorIds list, appends `1 = 0` so the
 * query returns nothing rather than silently dropping the filter
 * (fail-closed, matches the mutation guard's behavior for an unclassified
 * or out-of-scope resource).
 */
export function appendOperationalReadFilter(
  conditions: string[],
  bindings: unknown[],
  scope: OperationalReadScope,
  columns: { domainColumn?: string; setorColumn?: string },
): void {
  if (!scope.restricted) return;

  if (columns.domainColumn) {
    if (scope.domains.length === 0) {
      conditions.push('1 = 0');
    } else {
      conditions.push(`${columns.domainColumn} IN (${scope.domains.map(() => '?').join(', ')})`);
      bindings.push(...scope.domains);
    }
  }

  if (columns.setorColumn) {
    if (scope.setorIds.length === 0) {
      conditions.push('1 = 0');
    } else {
      conditions.push(`${columns.setorColumn} IN (${scope.setorIds.map(() => '?').join(', ')})`);
      bindings.push(...scope.setorIds);
    }
  }
}

async function tableHasColumn(db: D1Database, table: string, column: string): Promise<boolean> {
  try {
    const info = await db.prepare(`PRAGMA table_info(${table})`).bind().all<{ name: string }>();
    return (info.results || []).some((row) => row?.name === column);
  } catch {
    return false;
  }
}

/**
 * Item 3: validates a qualificação atribuição/renovação for flows where the
 * historico row is identified only by BODY fields (qualificacao_tipo_id +
 * funcionario_id), not a URL :id — POST / (atribuir) and POST /renovar have
 * no existing historico row yet to resolve a domain from. Domain comes from
 * the qualificacao_tipo's categoria (never OPERACOES by default); setor
 * comes from the target funcionário. No-op when the tenant's RBAC is
 * disabled. Fails closed if the tipo's categoria has no domain, or the
 * funcionário's setor is unresolved/out of scope.
 */
export async function assertQualificacaoAtribuicaoWithinOperationalScope(params: {
  db: D1Database;
  empresaId: number;
  userId: number;
  userRole: unknown;
  qualificacaoTipoId: number | null;
  funcionarioId: number | null;
}): Promise<void> {
  const { db, empresaId, userId, userRole, qualificacaoTipoId, funcionarioId } = params;

  const access = await resolveOperationalAccess({ db, empresaId, userId, userRole });
  if (!access.enabled) return;

  if (!qualificacaoTipoId || !funcionarioId) {
    forbidden(
      'Qualificação e funcionário são obrigatórios para validar domínio operacional — acesso negado (fail-closed)',
      'RESOURCE_DOMAIN_UNCLASSIFIED',
    );
  }

  const hasCategoriaId = await tableHasColumn(db, 'qualificacoes_tipos', 'categoria_id');
  const hasCategoriaDominio = await tableHasColumn(db, 'qualificacoes_categorias', 'dominio_codigo');
  const dominioSelect = hasCategoriaId && hasCategoriaDominio ? 'qc.dominio_codigo' : 'NULL';
  const dominioJoin =
    hasCategoriaId && hasCategoriaDominio
      ? 'LEFT JOIN qualificacoes_categorias qc ON qc.id = qt.categoria_id'
      : '';

  const tipo = await db
    .prepare(
      `SELECT ${dominioSelect} AS dominio_codigo
         FROM qualificacoes_tipos qt
         ${dominioJoin}
        WHERE qt.id = ? AND qt.empresa_id = ? AND qt.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(qualificacaoTipoId, empresaId)
    .first<{ dominio_codigo: string | null }>();

  if (!tipo || !tipo.dominio_codigo) {
    forbidden('Qualificação sem domínio classificado — acesso negado (fail-closed)', 'RESOURCE_DOMAIN_UNCLASSIFIED');
  }

  if (!access.domains.includes(tipo.dominio_codigo as OperationalDomain)) {
    forbidden(
      `Acesso operacional negado ao domínio ${tipo.dominio_codigo}`,
      'OPERATIONAL_DOMAIN_ACCESS_DENIED',
    );
  }

  const funcionario = await db
    .prepare(
      `SELECT setor_id FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ setor_id: number | null }>();

  if (!funcionario || funcionario.setor_id == null || !access.setorIds.includes(funcionario.setor_id)) {
    forbidden('Funcionário fora do seu escopo de setor', 'RESOURCE_SETOR_OUT_OF_SCOPE');
  }
}

export { normalizeTenantRole };
