/**
 * QUALIFICACOES - MÓDULO HISTÓRICO
 * Gestão de histórico de qualificações com filtros, stats e paginação
 *
 * Endpoints:
 * - GET /historico - Lista histórico com filters, stats, paginação
 * - GET /historico/stats - Estatísticas globais
 * - GET /historico/stats-extended - Stats com filtros e cache
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { auth } from '../../middleware/auth';
import { getTenantContext } from '../../middleware/tenant';
import { registrarAuditoria, extrairUsuarioAuditoria } from '../../utils/auditoria';
import {
  filterRequestedSetorIdsByAccess,
  getEmployeeSectorAccess,
} from '../../services/employee-sector-access';
import { forbidden } from '../../middleware/error-handler';
import {
  safe,
  buildOrderByClause,
  generateETag,
  getCacheTtlMs,
  histCache,
  type StatsCacheData,
  ensureHistoricoSchema,
  ensureModelosAeronaveModeloColumn,
  SORTABLE_COLUMNS,
  MODELO_AERONAVE_EXPR,
  calcularDataVencimento,
} from './historico-helpers';
import {
  CANCELLED_STATUS_VALUES,
  isPlannedQualificationStatus,
  normalizeQualificationStatusForCompatibility,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  QUALIFICACAO_STATUS,
  sqlStatusEqualsAny,
} from '../../lib/status/status-codes';
import { getCertificadosStorageColumns } from '../qualificacoes-certificados-helpers';
import {
  resolveOperationalReadScope,
  appendOperationalReadFilter,
  assertOperationalAccess,
  normalizeTenantRole,
} from '../../services/operational-domain-access';
import writeRouter from './historico-write';

const router = new Hono<{ Bindings: Env }>();

const QUALIFICATION_STATUS_EXPR = "UPPER(COALESCE(qh.status, ''))";
const cancelledQualificationPredicate = sqlStatusEqualsAny(
  QUALIFICATION_STATUS_EXPR,
  CANCELLED_STATUS_VALUES,
);
let historicoRenovacaoDeColumnPromise: Promise<boolean> | null = null;

export function buildRenewalSqlPredicates(hasRenovacaoDe: boolean) {
  const qualificationIdentityExpr = (qhAlias: string, qtAlias: string) =>
    `UPPER(TRIM(COALESCE(
      NULLIF(CAST(${qhAlias}.qualificacao_id AS TEXT), ''),
      NULLIF(${qhAlias}.qualificacao_codigo, ''),
      NULLIF(${qtAlias}.codigo, ''),
      NULLIF(${qhAlias}.tipo, ''),
      NULLIF(${qtAlias}.nome, '')
    )))`;
  const newerOperationalQualificationExistsPredicate = `EXISTS (
    SELECT 1
    FROM qualificacoes_historico qh_newer
    LEFT JOIN qualificacoes_tipos qt_newer ON qt_newer.id = qh_newer.qualificacao_id
    WHERE qh_newer.funcionario_id = qh.funcionario_id
      AND qh_newer.deleted_at IS NULL
      AND NOT (${sqlStatusEqualsAny("UPPER(COALESCE(qh_newer.status, ''))", CANCELLED_STATUS_VALUES)})
      AND COALESCE(qh_newer.data_vencimento, qh_newer.data_conclusao) IS NOT NULL
      AND ${qualificationIdentityExpr('qh', 'qt')} <> ''
      AND ${qualificationIdentityExpr('qh_newer', 'qt_newer')} = ${qualificationIdentityExpr('qh', 'qt')}
      AND (
        datetime(COALESCE(qh_newer.data_vencimento, qh_newer.data_conclusao, qh_newer.updated_at, qh_newer.created_at)) >
          datetime(COALESCE(qh.data_vencimento, qh.data_conclusao, qh.updated_at, qh.created_at))
        OR (
          datetime(COALESCE(qh_newer.data_vencimento, qh_newer.data_conclusao, qh_newer.updated_at, qh_newer.created_at)) =
            datetime(COALESCE(qh.data_vencimento, qh.data_conclusao, qh.updated_at, qh.created_at))
          AND qh_newer.id > qh.id
        )
      )
  )`;
  // RENOVADA: somente se existe sucessora real via link explícito renovacao_de.
  // renovada=1 e status='RENOVADA' são legado informativo, nunca critério final.
  const renewedQualificationPredicate = hasRenovacaoDe
    ? `EXISTS (
      SELECT 1
      FROM qualificacoes_historico qh_renovadora
      WHERE qh_renovadora.deleted_at IS NULL
        AND NOT (${sqlStatusEqualsAny("UPPER(COALESCE(qh_renovadora.status, ''))", CANCELLED_STATUS_VALUES)})
        AND qh_renovadora.renovacao_de = qh.id
    )`
    : '0 = 1';
  const operationalCurrentQualificationPredicate = `(qh.deleted_at IS NULL AND NOT (${cancelledQualificationPredicate}) AND COALESCE(qh.data_vencimento, qh.data_conclusao) IS NOT NULL AND NOT (${newerOperationalQualificationExistsPredicate}))`;
  const activeRenewedQualificationPredicate = `(qh.deleted_at IS NULL AND NOT (${cancelledQualificationPredicate}) AND ${renewedQualificationPredicate} AND NOT (${operationalCurrentQualificationPredicate}))`;
  const activePlannedQualificationPredicate = `(qh.deleted_at IS NULL AND NOT (${cancelledQualificationPredicate}) AND NOT (${renewedQualificationPredicate}) AND (qh.data_conclusao IS NULL OR ${sqlStatusEqualsAny(
    QUALIFICATION_STATUS_EXPR,
    PLANNED_QUALIFICATION_STATUS_VALUES,
  )}))`;

  return {
    operationalCurrentQualificationPredicate,
    renewedQualificationPredicate,
    activeRenewedQualificationPredicate,
    activePlannedQualificationPredicate,
  };
}

export async function hasHistoricoRenovacaoDeColumn(db: D1Database): Promise<boolean> {
  if (!historicoRenovacaoDeColumnPromise) {
    historicoRenovacaoDeColumnPromise = db
      .prepare('PRAGMA table_info(qualificacoes_historico)')
      .all()
      .then(({ results }) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (results || []).some((column: any) => column?.name === 'renovacao_de'),
      )
      .catch(() => false);
  }

  return historicoRenovacaoDeColumnPromise;
}

function parseRequestedSetorIds(rawSetorId?: string, rawSetorIds?: string): number[] {
  const values: string[] = [];
  if (rawSetorId) values.push(rawSetorId);
  if (rawSetorIds) {
    values.push(
      ...rawSetorIds
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  return Array.from(
    new Set(
      values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

function validateRequestedSetorScope(
  requestedSetorIds: number[],
  access: Awaited<ReturnType<typeof getEmployeeSectorAccess>>,
): number[] {
  if (requestedSetorIds.length === 0 || access.mode === 'all') {
    return requestedSetorIds;
  }

  const allowed = filterRequestedSetorIdsByAccess(requestedSetorIds, access);
  if (allowed.length !== requestedSetorIds.length) {
    forbidden('Filtro de setor fora do escopo permitido', 'SETOR_FORA_DO_ESCOPO');
  }

  return allowed;
}

function normalizeCacheIdentifier(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeCacheRole(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized || 'unknown';
}

function normalizeCacheSetorIds(values: readonly number[]): number[] {
  return Array.from(
    new Set(
      values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).sort((left, right) => left - right);
}

function hashStatsExtendedScopeKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `scope-${(hash >>> 0).toString(36)}`;
}

function buildStatsExtendedCacheScope(params: {
  empresaId: number;
  userId: unknown;
  userRole: unknown;
  contextFuncionarioId: unknown;
  access: Awaited<ReturnType<typeof getEmployeeSectorAccess>>;
  employeeScope: { hasSetorId: boolean };
  funcionarioId?: string;
  qualificacaoId?: string;
}): { cacheKey: string; scopeToken: string } {
  const userId = normalizeCacheIdentifier(params.userId);
  const userRole = normalizeCacheRole(params.userRole);
  const contextFuncionarioId = normalizeCacheIdentifier(params.contextFuncionarioId);
  const scopedSetorIds =
    params.access.mode === 'all' ? [] : normalizeCacheSetorIds(params.access.setorIds);
  const parts = [
    `empresa:${params.empresaId}`,
    `user:${userId}`,
    `perfil:${userRole}`,
    `ctx-func:${contextFuncionarioId}`,
    `scope:${params.access.mode}`,
    `scope-setor-col:${params.employeeScope.hasSetorId ? 1 : 0}`,
    params.access.mode === 'self' ? `scope-func:${params.access.funcionarioId}` : '',
    params.access.mode === 'all'
      ? ''
      : `scope-setores:${scopedSetorIds.length > 0 ? scopedSetorIds.join(',') : 'none'}`,
    `filtro-func:${String(params.funcionarioId || '').trim() || 'all'}`,
    `filtro-qual:${String(params.qualificacaoId || '').trim() || 'all'}`,
  ].filter(Boolean);
  const cacheKey = parts.join('|');

  return {
    cacheKey,
    scopeToken: hashStatsExtendedScopeKey(cacheKey),
  };
}

async function hasTableColumn(
  db: D1Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  try {
    const columns = await db.prepare(`PRAGMA table_info('${tableName}')`).all<{ name: string }>();
    if (!columns.results || columns.results.length === 0) {
      return true;
    }
    return (columns.results || []).some((column) => column.name === columnName);
  } catch {
    return true;
  }
}

async function buildHistoricoEmployeeScopeCompat(
  db: D1Database,
  access: Awaited<ReturnType<typeof getEmployeeSectorAccess>>,
  funcionarioAlias = 'f',
): Promise<{ clause: string; bindings: number[]; hasSetorId: boolean }> {
  const hasSetorId = await hasTableColumn(db, 'funcionarios', 'setor_id');

  if (access.mode === 'all') {
    return { clause: '1 = 1', bindings: [], hasSetorId };
  }

  if (access.mode === 'self') {
    return { clause: `${funcionarioAlias}.id = ?`, bindings: [access.funcionarioId], hasSetorId };
  }

  if (!hasSetorId || access.setorIds.length === 0) {
    return { clause: '1 = 0', bindings: [], hasSetorId };
  }

  return {
    clause: `${funcionarioAlias}.setor_id IN (${access.setorIds.map(() => '?').join(', ')})`,
    bindings: access.setorIds,
    hasSetorId,
  };
}

// ===== ENDPOINTS =====

/**
 * GET /historico
 * Lista histórico de qualificações com filtros, stats e paginação
 */
router.get(
  '/',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, tenantCtx.empresaId);

    await ensureModelosAeronaveModeloColumn(db);
    await ensureHistoricoSchema(db);
    const hasRenovacaoDe = await hasHistoricoRenovacaoDeColumn(db);
    const employeeScope = await buildHistoricoEmployeeScopeCompat(db, access, 'f');
    const hasCategoriaEmpresaId = await hasTableColumn(
      db,
      'qualificacoes_categorias',
      'empresa_id',
    );

    const hasCategoriaIdColumn = await hasTableColumn(db, 'qualificacoes_tipos', 'categoria_id');
    const categoriaJoinClause = hasCategoriaIdColumn
      ? `LEFT JOIN qualificacoes_categorias qc
           ON (qc.id = COALESCE(qh.categoria_id, qt.categoria_id) 
               OR (COALESCE(qh.categoria_id, qt.categoria_id) IS NULL AND UPPER(TRIM(qc.nome)) = UPPER(TRIM(COALESCE(qt.categoria, qh.categoria)))))
          AND qc.deleted_at IS NULL
          AND qc.ativo = 1
          ${hasCategoriaEmpresaId ? 'AND qc.empresa_id = f.empresa_id' : ''}`
      : `LEFT JOIN qualificacoes_categorias qc
           ON UPPER(TRIM(qc.nome)) = UPPER(TRIM(COALESCE(qt.categoria, qh.categoria)))
          AND qc.deleted_at IS NULL
          AND qc.ativo = 1
          ${hasCategoriaEmpresaId ? 'AND qc.empresa_id = f.empresa_id' : ''}`;

    const baseFromAndJoins = `FROM qualificacoes_historico qh
      LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
      LEFT JOIN modelos_aeronave ma ON CAST(ma.id AS TEXT) = f.modelo_aeronave_id AND ma.deleted_at IS NULL
      ${categoriaJoinClause}`;

    const {
      operationalCurrentQualificationPredicate,
      renewedQualificationPredicate,
      activeRenewedQualificationPredicate,
      activePlannedQualificationPredicate,
    } = buildRenewalSqlPredicates(hasRenovacaoDe);

    const {
      id = '',
      page = '1',
      limit = '20',
      stats = 'true',
      search = '',
      status = '',
      statuses = '',
      funcionario_id = '',
      tipo_id = '',
      aeronave_id = '',
      categoria = '',
      categoria_id = '',
      formato_id = '',
      setor_id = '',
      setor_ids = '',
      orderBy = 'data_vencimento',
      order = 'ASC',
    } = c.req.query();

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 500);
    const offset = (pageNum - 1) * limitNum;
    const includeStats = String(stats).toLowerCase() !== 'false';
    const selectedStatuses = Array.from(
      new Set(
        String(statuses || status)
          .split(',')
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
      ),
    );
    const requestedSetorIds = validateRequestedSetorScope(
      parseRequestedSetorIds(setor_id, setor_ids),
      access,
    );
    const storageColumns = await getCertificadosStorageColumns(db);

    const conditions: string[] = [
      'f.id IS NOT NULL',
      'f.deleted_at IS NULL',
      "UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'",
      'f.empresa_id = ?',
    ];
    console.log('[HISTORICO] Conditions setup. Deleted_at IS NULL enforced.');
    const params: unknown[] = [tenantCtx.empresaId];
    conditions.push(employeeScope.clause);
    params.push(...employeeScope.bindings);

    // Item 1 (read-side filtering): histórico is individual data (tied to
    // a funcionário's own setor via `f`, and to a categoria's domain via
    // `qc`) — once RBAC is active, a gestor must be additionally narrowed
    // to domain+setor, not just the legacy setor scope above. No-op in
    // legacy mode / for admin/instrutor/aluno.
    {
      const readScope = await resolveOperationalReadScope({
        db,
        empresaId: tenantCtx.empresaId,
        userId: Number((c.get as (k: string) => unknown)('userId') || 0),
        userRole: (c.get as (k: string) => unknown)('userRole'),
      });
      appendOperationalReadFilter(conditions, params, readScope, {
        domainColumn: 'qc.dominio_codigo',
        setorColumn: employeeScope.hasSetorId ? 'f.setor_id' : undefined,
      });
    }

    if (requestedSetorIds.length > 0) {
      if (employeeScope.hasSetorId) {
        conditions.push(`f.setor_id IN (${requestedSetorIds.map(() => '?').join(', ')})`);
        params.push(...requestedSetorIds);
      } else {
        conditions.push('1 = 0');
      }
    }

    if (search) {
      conditions.push(
        `(f.nome LIKE ? OR f.matricula LIKE ? OR qt.nome LIKE ? OR qt.codigo LIKE ? OR ${MODELO_AERONAVE_EXPR} LIKE ?)`,
      );
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    if (funcionario_id) {
      conditions.push('qh.funcionario_id = ?');
      params.push(funcionario_id);
    }
    if (id) {
      conditions.push('qh.id = ?');
      params.push(id);
    }
    if (tipo_id) {
      conditions.push('qh.qualificacao_id = ?');
      params.push(tipo_id);
    }
    if (aeronave_id) {
      conditions.push(`(
        INSTR(
          ',' || REPLACE(COALESCE(f.modelo_aeronave_id, ''), ' ', '') || ',',
          ',' || REPLACE(CAST(? AS TEXT), ' ', '') || ','
        ) > 0
        OR EXISTS (
          SELECT 1 FROM funcionarios_aeronaves fa
          JOIN aeronaves a ON a.id = fa.aeronave_id AND COALESCE(a.deleted_at, '') = ''
          WHERE fa.funcionario_id = f.id
            AND COALESCE(fa.deleted_at, '') = ''
            AND UPPER(TRIM(a.modelo)) = UPPER(TRIM(
              COALESCE(
                (SELECT modelo FROM modelos_aeronave WHERE id = CAST(? AS INTEGER) LIMIT 1), ''
              )
            ))
        )
      )`);
      params.push(aeronave_id, aeronave_id);
    }

    if (categoria) {
      conditions.push('qt.categoria = ?');
      params.push(categoria);
    }
    const categoriaIdNum = parseInt(categoria_id, 10);
    if (Number.isFinite(categoriaIdNum) && categoriaIdNum > 0) {
      conditions.push('(qt.categoria_id = ? OR qc.id = ?)');
      params.push(categoriaIdNum, categoriaIdNum);
    }
    const formatoIdNum = parseInt(formato_id, 10);
    if (Number.isFinite(formatoIdNum) && formatoIdNum > 0) {
      conditions.push('(qh.formato_id = ? OR qt.formato_id = ?)');
      params.push(formatoIdNum, formatoIdNum);
    }

    // Save base conditions (without status filter) for global counts
    const nonStatusConditions = [...conditions];
    const nonStatusParams = [...params];
    // Add qh.deleted_at IS NULL to base conditions (always applied for non-status scope)
    nonStatusConditions.push('qh.deleted_at IS NULL');

    // Sem o fallback de 12: quando validade_meses e qt.validade são NULL, a expressão
    // retorna NULL (sem vencimento). Registros com NULL validade não aparecem como VENCIDA.
    const vencimentoExpr =
      "COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade) || ' months'))";

    if (selectedStatuses.length === 0) {
      conditions.push('qh.deleted_at IS NULL');
    } else {
      const statusConditions: string[] = [];

      for (const selectedStatus of selectedStatuses) {
        switch (selectedStatus) {
          case 'VALIDA':
            statusConditions.push(
              `(${operationalCurrentQualificationPredicate} AND (${vencimentoExpr} IS NULL OR ${vencimentoExpr} > date('now','+30 days')))`,
            );
            break;
          case 'VENCIDA':
            statusConditions.push(
              `(${operationalCurrentQualificationPredicate} AND ${vencimentoExpr} < date('now'))`,
            );
            break;
          case 'VENCENDO_30':
            statusConditions.push(
              `(${operationalCurrentQualificationPredicate} AND ${vencimentoExpr} >= date('now') AND ${vencimentoExpr} <= date('now','+30 days'))`,
            );
            break;
          case 'RENOVADA':
            statusConditions.push(activeRenewedQualificationPredicate);
            break;
          case 'PLANEJADA':
            statusConditions.push(activePlannedQualificationPredicate);
            break;
          case 'CANCELADA':
            statusConditions.push(
              `(qh.deleted_at IS NOT NULL OR ${sqlStatusEqualsAny("UPPER(COALESCE(qh.status, ''))", CANCELLED_STATUS_VALUES)})`,
            );
            break;
        }
      }

      if (statusConditions.length > 0) {
        conditions.push(`(${statusConditions.join(' OR ')})`);
      }
    }

    const whereClause = conditions.join(' AND ');

    let statsPayload = {
      total: 0,
      validas: 0,
      vencendo: 0,
      vencidas: 0,
      renovadas: 0,
      planejadas: 0,
    };

    if (includeStats) {
      const statsQuery = `SELECT
        COUNT(*) as total,
        SUM(CASE
          WHEN ${operationalCurrentQualificationPredicate}
           AND COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade) || ' months')) IS NULL THEN 1
          WHEN julianday(COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade) || ' months'))) >= julianday('now')
           AND julianday(COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade) || ' months'))) - julianday('now') > 30
           AND ${operationalCurrentQualificationPredicate} THEN 1
          ELSE 0
        END) as validas,
        SUM(CASE
          WHEN julianday(COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade) || ' months'))) - julianday('now') <= 30
           AND julianday(COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade) || ' months'))) >= julianday('now')
           AND ${operationalCurrentQualificationPredicate} THEN 1
          ELSE 0
        END) as vencendo,
        SUM(CASE
          WHEN julianday(COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade) || ' months'))) < julianday('now')
           AND ${operationalCurrentQualificationPredicate} THEN 1
          ELSE 0
        END) as vencidas,
        SUM(CASE WHEN ${activeRenewedQualificationPredicate} THEN 1 ELSE 0 END) as renovadas,
        SUM(CASE WHEN ${activePlannedQualificationPredicate} THEN 1 ELSE 0 END) as planejadas
      ${baseFromAndJoins}
      WHERE ${whereClause}`;

      const statsResult = await db
        .prepare(statsQuery)
        .bind(...params)
        .first();

      // Global counts (independent of status filter) for badge chips
      const nonStatusWhere = nonStatusConditions.join(' AND ');
      const globalCountsQuery = `SELECT
        SUM(CASE WHEN ${activeRenewedQualificationPredicate} THEN 1 ELSE 0 END) as renovadas,
        SUM(CASE WHEN ${activePlannedQualificationPredicate} THEN 1 ELSE 0 END) as planejadas
      ${baseFromAndJoins}
      WHERE ${nonStatusWhere}`;

      const globalCountsResult = await db
        .prepare(globalCountsQuery)
        .bind(...nonStatusParams)
        .first();

      statsPayload = {
        total: Number((statsResult as any)?.total || 0),
        validas: Number((statsResult as any)?.validas || 0),
        vencendo: Number((statsResult as any)?.vencendo || 0),
        vencidas: Number((statsResult as any)?.vencidas || 0),
        renovadas: Number((globalCountsResult as any)?.renovadas || 0),
        planejadas: Number((globalCountsResult as any)?.planejadas || 0),
      };
    } else {
      const totalOnlyQuery = `SELECT COUNT(*) as total
      ${baseFromAndJoins}
      WHERE ${whereClause}`;

      const totalOnlyResult = await db
        .prepare(totalOnlyQuery)
        .bind(...params)
        .first();
      statsPayload.total = Number((totalOnlyResult as any)?.total || 0);
    }

    // DADOS PAGINADOS
    const fallbackCertificadoDocIdExpr = storageColumns.pastaVirtualHasCertificacaoId
      ? `(SELECT pv_doc.id
            FROM pasta_virtual pv_cert
            INNER JOIN documentos pv_doc
              ON pv_doc.r2_key = pv_cert.caminho_arquivo
             AND pv_doc.funcionario_id = qh.funcionario_id
             AND pv_doc.deleted_at IS NULL
           WHERE pv_cert.certificacao_id = qh.id
             AND pv_cert.funcionario_id = qh.funcionario_id
             ${storageColumns.pastaVirtualHasEmpresaId ? 'AND pv_cert.empresa_id = f.empresa_id' : ''}
             AND pv_cert.deleted_at IS NULL
           ORDER BY COALESCE(pv_doc.created_at, pv_cert.created_at) DESC, pv_doc.id DESC
           LIMIT 1)`
      : 'NULL';
    const fallbackCertificadoExistsExpr = storageColumns.pastaVirtualHasCertificacaoId
      ? `${fallbackCertificadoDocIdExpr} IS NOT NULL`
      : '0 = 1';

    const dataQuery = `SELECT 
      qh.id,
      qh.funcionario_id,
      f.nome as funcionario_nome,
      f.matricula as funcionario_matricula,
      f.funcao AS funcionario_funcao,
      f.cpf AS funcionario_cpf,
      f.codigo_anac AS funcionario_codigo_anac,
      f.nascimento AS funcionario_data_nascimento,
      f.modelo_aeronave_id,
      ${MODELO_AERONAVE_EXPR} AS modelo_aeronave,
      qh.qualificacao_id AS tipo_id,
      qt.nome AS tipo_nome,
      COALESCE(qh.tipo, qt.nome) AS tipo,
      COALESCE(qh.qualificacao_codigo, qt.codigo) AS tipo_codigo,
      COALESCE(qh.categoria, qt.categoria) AS tipo_categoria,
      qh.validade_meses AS historico_validade_meses,
      qt.validade AS tipo_validade_atual,
      COALESCE(qh.validade_meses, qt.validade) AS qualificacao_validade,
      COALESCE(qh.validade_meses, qt.validade) AS validade_meses,
      qt.vencimento_fim_mes AS vencimento_fim_mes,
      qh.data_conclusao AS data_realizacao,
      qh.data_vencimento AS data_vencimento,
      qh.instrutor AS instrutor,
      qh.renovada,
      CASE WHEN ${activeRenewedQualificationPredicate} THEN 1 ELSE 0 END AS tem_renovacao_posterior,
      ${hasRenovacaoDe ? 'qh.renovacao_de' : 'NULL'} AS renovacao_de,
      CASE WHEN ${operationalCurrentQualificationPredicate} THEN 1 ELSE 0 END AS vigente_operacional,
      qh.numero_certificado,
      qh.observacoes AS observacao,
      qh.created_at,
      qh.updated_at,
      qh.certificado_arquivo_id,
      CASE
        WHEN cert_doc.id IS NOT NULL THEN 1
        WHEN ${fallbackCertificadoExistsExpr} THEN 1
        ELSE 0
      END AS tem_certificado,
      CASE
        WHEN cert_doc.id IS NOT NULL THEN COALESCE(qh.arquivo_url, '/api/pasta-virtual/stream/' || cert_doc.id)
        WHEN ${fallbackCertificadoExistsExpr} THEN '/api/pasta-virtual/stream/' || ${fallbackCertificadoDocIdExpr}
        ELSE NULL
      END AS certificado_url,
      qc.cor AS categoria_cor,
      qc.id AS categoria_id,
      qc.nome AS categoria_nome,
      CASE
        WHEN qc.id IS NULL THEN 'UNRESOLVED'
        WHEN qh.categoria_id IS NOT NULL THEN 'HISTORICO_CATEGORIA_ID'
        WHEN qt.categoria_id IS NOT NULL THEN 'TIPO_CATEGORIA_ID'
        ELSE 'NAME_MATCH'
      END AS categoria_resolution_state,
      qh.status AS qualificacao_status,
      qh.tipo_treinamento,
      qh.carga_horaria
    ${baseFromAndJoins}
    LEFT JOIN documentos cert_doc ON cert_doc.id = qh.certificado_arquivo_id AND cert_doc.deleted_at IS NULL
    WHERE ${whereClause}
    ORDER BY ${buildOrderByClause(orderBy, order)}
    LIMIT ? OFFSET ?`;

    const dataParams = [...params, limitNum, offset];
    const { results } = await db
      .prepare(dataQuery)
      .bind(...dataParams)
      .all();

    // H-4: comparação por string ISO evita off-by-one de timezone com Date.getTime()
    const today = new Date().toISOString().split('T')[0];
    const d30 = new Date();
    d30.setDate(d30.getDate() + 30);
    const today30 = d30.toISOString().split('T')[0];
    const enriched = (results || []).map((r: any) => {
      // Usar ?? (nullish) para distinguir null (sem vencimento) de 0 (inválido).
      // || trataria 0 como falsy e cairia no fallback — incorreto.
      const historicoValidadeMeses: number | null =
        r.historico_validade_meses != null ? Number(r.historico_validade_meses) : null;
      const tipoValidadeAtual: number | null =
        r.tipo_validade_atual != null ? Number(r.tipo_validade_atual) : null;
      const hasTipoVinculado = Number(r.tipo_id || 0) > 0;
      // Quando vinculado ao tipo, o tipo atual prevalece. Sem vínculo, usa o snapshot histórico.
      let validadeMesesEfetiva: number | null = hasTipoVinculado
        ? (tipoValidadeAtual ?? historicoValidadeMeses ?? null)
        : (historicoValidadeMeses ?? tipoValidadeAtual ?? null);
      const codigoQualificacao = String(r.tipo_codigo || r.qualificacao_codigo || '').toUpperCase();
      if (codigoQualificacao === 'CMA' && r.funcionario_data_nascimento && r.data_realizacao) {
        const birthDate = new Date(String(r.funcionario_data_nascimento) + 'T00:00:00Z');
        const refDate = new Date(String(r.data_realizacao) + 'T00:00:00Z');
        const sixtiethBirthday = new Date(birthDate);
        sixtiethBirthday.setFullYear(sixtiethBirthday.getFullYear() + 60);
        if (sixtiethBirthday <= refDate) {
          validadeMesesEfetiva = 6;
        }
      }

      const vencimentoFimMes = Number(r.vencimento_fim_mes || 0) === 1 ? 1 : 0;
      let dataVencimentoCalculada = r.data_vencimento;
      if (codigoQualificacao === 'G1-SEM') {
        dataVencimentoCalculada = r.data_vencimento;
      } else if (r.data_realizacao && validadeMesesEfetiva != null && validadeMesesEfetiva > 0) {
        try {
          dataVencimentoCalculada = calcularDataVencimento({
            dataConclusao: String(r.data_realizacao),
            validadeMeses: validadeMesesEfetiva,
            vencimentoFimMes,
          });
        } catch {
          // Fallback seguro para não quebrar o endpoint inteiro por uma data legada inválida
          dataVencimentoCalculada = r.data_vencimento;
        }
      }

      let derivedStatus: string;
      const dbStatus = normalizeQualificationStatusForCompatibility(r.qualificacao_status);
      const hasRenewalSuccessor =
        r.tem_renovacao_posterior === true || Number(r.tem_renovacao_posterior || 0) === 1;
      const isOperationalCurrent =
        r.vigente_operacional === true || Number(r.vigente_operacional || 0) === 1;

      // RENOVADA: somente se existe sucessora real via link explícito renovacao_de.
      // renovada=1 e status='RENOVADA' são legado informativo, nunca critério final.
      const isRenewedQualification = hasRenewalSuccessor;
      // Se o status salvo é PLANEJADA (data futura ou sem data), respeitar
      if (isRenewedQualification) {
        derivedStatus = 'RENOVADA';
      } else if (
        isPlannedQualificationStatus(dbStatus) ||
        (!r.data_realizacao && !dataVencimentoCalculada)
      ) {
        derivedStatus = QUALIFICACAO_STATUS.PLANEJADA;
      } else if (!dataVencimentoCalculada) {
        const dbStatusUpper = String(dbStatus || '').toUpperCase();
        const isCompletionStatus = dbStatusUpper === 'CONCLUIDA' || dbStatusUpper === 'CONCLUIDO';
        derivedStatus =
          r.data_realizacao && (isCompletionStatus || dbStatusUpper.length === 0)
            ? QUALIFICACAO_STATUS.CONCLUIDA
            : 'INDEFINIDA';
      } else if (dataVencimentoCalculada < today) {
        derivedStatus = 'VENCIDA';
      } else if (dataVencimentoCalculada <= today30) {
        derivedStatus = 'VENCENDO_30';
      } else {
        derivedStatus = 'VALIDA';
      }
      return {
        ...r,
        validade_meses: validadeMesesEfetiva,
        qualificacao_validade: validadeMesesEfetiva,
        data_vencimento: dataVencimentoCalculada,
        status: derivedStatus,
        data_conclusao: r.data_realizacao, // manter ambos para compatibilidade
        qualificacao_nome: r.tipo_nome,
        qualificacao_codigo: r.tipo_codigo,
        qualificacao_categoria: r.tipo_categoria,
        tem_renovacao_posterior: hasRenewalSuccessor ? 1 : 0,
        vigente_operacional: isOperationalCurrent ? 1 : 0,
        categoria_cor: r.categoria_cor || null,
        categoria_id: r.categoria_id || null,
        qualificacao_id: r.tipo_id, // manter ambos para compatibilidade
      };
    });

    const etag = generateETag([
      'historico',
      statsPayload.total,
      pageNum,
      limitNum,
      id,
      selectedStatuses.join(','),
      funcionario_id,
      tipo_id,
      search,
    ]);

    return c.json({
      success: true,
      data: enriched,
      meta: {
        count: enriched.length,
        limit: limitNum,
        offset,
        page: pageNum,
        total: statsPayload.total,
        etag,
      },
      ...(includeStats ? { stats: statsPayload } : {}),
      pagination: {
        page: pageNum,
        limit: limitNum,
        offset,
        total: statsPayload.total,
        pages: Math.ceil(statsPayload.total / limitNum),
      },
    });
  }),
);

/**
 * GET /historico/stats
 * Estatísticas globais de qualificações
 */
router.get(
  '/stats',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, tenantCtx.empresaId);
    const employeeScope = await buildHistoricoEmployeeScopeCompat(db, access, 'f');
    const hasRenovacaoDe = await hasHistoricoRenovacaoDeColumn(db);
    const { renewedQualificationPredicate, activeRenewedQualificationPredicate } =
      buildRenewalSqlPredicates(hasRenovacaoDe);

    const hasCategoriaEmpresaId = await hasTableColumn(
      db,
      'qualificacoes_categorias',
      'empresa_id',
    );
    const hasCategoriaIdColumn = await hasTableColumn(db, 'qualificacoes_tipos', 'categoria_id');
    const categoriaJoinClause = hasCategoriaIdColumn
      ? `LEFT JOIN qualificacoes_categorias qc
           ON (qc.id = COALESCE(qh.categoria_id, qt.categoria_id) 
               OR (COALESCE(qh.categoria_id, qt.categoria_id) IS NULL AND UPPER(TRIM(qc.nome)) = UPPER(TRIM(COALESCE(qt.categoria, qh.categoria)))))
          AND qc.deleted_at IS NULL
          AND qc.ativo = 1
          ${hasCategoriaEmpresaId ? 'AND qc.empresa_id = f.empresa_id' : ''}`
      : `LEFT JOIN qualificacoes_categorias qc
           ON UPPER(TRIM(qc.nome)) = UPPER(TRIM(COALESCE(qt.categoria, qh.categoria)))
          AND qc.deleted_at IS NULL
          AND qc.ativo = 1
          ${hasCategoriaEmpresaId ? 'AND qc.empresa_id = f.empresa_id' : ''}`;

    const baseFromAndJoins = `FROM qualificacoes_historico qh
      LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
        AND f.deleted_at IS NULL
        AND UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO'
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
      ${categoriaJoinClause}`;

    // Item 1 (read-side filtering — contagem): once RBAC is active, a
    // gestor's stats must also be narrowed to setores with a classified
    // domain, not just the legacy setor scope. No-op in legacy mode / for
    // admin/instrutor/aluno.
    const readScope = await resolveOperationalReadScope({
      db,
      empresaId: tenantCtx.empresaId,
      userId: Number((c.get as (k: string) => unknown)('userId') || 0),
      userRole: (c.get as (k: string) => unknown)('userRole'),
    });
    const statsConditions: string[] = [];
    const statsReadBindings: unknown[] = [];
    appendOperationalReadFilter(statsConditions, statsReadBindings, readScope, {
      setorColumn: 'f.setor_id',
    });
    const statsExtraClause =
      statsConditions.length > 0 ? ` AND ${statsConditions.join(' AND ')}` : '';

    const statsResult = await db
      .prepare(
        `SELECT
        COUNT(*) as total,
        SUM(CASE
          WHEN ${renewedQualificationPredicate} THEN 0
          WHEN julianday(qh.data_vencimento) >= julianday('now') AND julianday(qh.data_vencimento) - julianday('now') > 30 THEN 1
          ELSE 0
        END) as validas,
        SUM(CASE
          WHEN ${renewedQualificationPredicate} THEN 0
          WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 AND julianday(qh.data_vencimento) >= julianday('now') THEN 1
          ELSE 0
        END) as vencendo,
        SUM(CASE
          WHEN ${renewedQualificationPredicate} THEN 0
          WHEN julianday(qh.data_vencimento) < julianday('now') THEN 1
          ELSE 0
        END) as vencidas,
        SUM(CASE WHEN ${activeRenewedQualificationPredicate} THEN 1 ELSE 0 END) as renovadas
      ${baseFromAndJoins}
      WHERE qh.deleted_at IS NULL
        AND f.empresa_id = ?
        AND ${employeeScope.clause}${statsExtraClause}`,
      )
      .bind(tenantCtx.empresaId, ...employeeScope.bindings, ...statsReadBindings)
      .first();

    const stats = {
      total: Number((statsResult as any)?.total || 0),
      validas: Number((statsResult as any)?.validas || 0),
      vencendo: Number((statsResult as any)?.vencendo || 0),
      vencidas: Number((statsResult as any)?.vencidas || 0),
      renovadas: Number((statsResult as any)?.renovadas || 0),
    };

    return c.json({ success: true, data: stats });
  }),
);

/**
 * GET /historico/stats-extended
 * Estatísticas com filtros e cache
 */
router.get(
  '/stats-extended',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const tenantCtx = getTenantContext(c);
    const getContextValue = c.get as (key: string) => unknown;
    const access = await getEmployeeSectorAccess(c, tenantCtx.empresaId);
    const employeeScope = await buildHistoricoEmployeeScopeCompat(db, access, 'f');
    const funcionarioId = c.req.query('funcionario_id');
    const qualificacaoId = c.req.query('qualificacao_id');
    const extended = (c.req.query('extended') || 'false') === 'true';
    const materialized = (c.req.query('materialized') || 'false') === 'true';
    const hasRenovacaoDe = await hasHistoricoRenovacaoDeColumn(db);
    const {
      renewedQualificationPredicate,
      activeRenewedQualificationPredicate,
      activePlannedQualificationPredicate,
    } = buildRenewalSqlPredicates(hasRenovacaoDe);

    const hasCategoriaEmpresaId = await hasTableColumn(
      db,
      'qualificacoes_categorias',
      'empresa_id',
    );
    const hasCategoriaIdColumn = await hasTableColumn(db, 'qualificacoes_tipos', 'categoria_id');
    const categoriaJoinClause = hasCategoriaIdColumn
      ? `LEFT JOIN qualificacoes_categorias qc
           ON (qc.id = COALESCE(qh.categoria_id, qt.categoria_id) 
               OR (COALESCE(qh.categoria_id, qt.categoria_id) IS NULL AND UPPER(TRIM(qc.nome)) = UPPER(TRIM(COALESCE(qt.categoria, qh.categoria)))))
          AND qc.deleted_at IS NULL
          AND qc.ativo = 1
          ${hasCategoriaEmpresaId ? 'AND qc.empresa_id = f.empresa_id' : ''}`
      : `LEFT JOIN qualificacoes_categorias qc
           ON UPPER(TRIM(qc.nome)) = UPPER(TRIM(COALESCE(qt.categoria, qh.categoria)))
          AND qc.deleted_at IS NULL
          AND qc.ativo = 1
          ${hasCategoriaEmpresaId ? 'AND qc.empresa_id = f.empresa_id' : ''}`;

    const baseFromAndJoins = `FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
      ${categoriaJoinClause}`;

    const whereClauses: string[] = [
      'qh.deleted_at IS NULL',
      'f.deleted_at IS NULL',
      "UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'",
      'f.empresa_id = ?',
    ];
    const bindings: unknown[] = [tenantCtx.empresaId];
    whereClauses.push(employeeScope.clause);
    bindings.push(...employeeScope.bindings);

    // Item 1 (read-side filtering — contagem/estatísticas estendidas).
    {
      const readScope = await resolveOperationalReadScope({
        db,
        empresaId: tenantCtx.empresaId,
        userId: Number((getContextValue as (k: string) => unknown)('userId') || 0),
        userRole: getContextValue('userRole'),
      });
      appendOperationalReadFilter(whereClauses, bindings, readScope, { setorColumn: 'f.setor_id' });
    }

    if (funcionarioId) {
      whereClauses.push('qh.funcionario_id = ?');
      bindings.push(funcionarioId);
    }
    if (qualificacaoId) {
      whereClauses.push('qh.qualificacao_id = ?');
      bindings.push(qualificacaoId);
    }

    const whereClause = whereClauses.join(' AND ');
    const { cacheKey, scopeToken } = buildStatsExtendedCacheScope({
      empresaId: tenantCtx.empresaId,
      userId: getContextValue('userId'),
      userRole: getContextValue('userRole') || tenantCtx.role,
      contextFuncionarioId: getContextValue('funcionarioId'),
      access,
      employeeScope,
      funcionarioId,
      qualificacaoId,
    });
    const now = Date.now();

    let stats: {
      total: number;
      validas: number;
      vencendo: number;
      vencidas: number;
      renovadas: number;
      planejadas: number;
    } = { total: 0, validas: 0, vencendo: 0, vencidas: 0, renovadas: 0, planejadas: 0 };

    if (
      histCache.cache &&
      histCache.cache.key === cacheKey &&
      now - histCache.cache.ts < getCacheTtlMs(c.env)
    ) {
      stats = histCache.cache.data;
    } else if (histCache.inflight.has(cacheKey)) {
      // M-4: reutilizar promise in-flight existente para evitar stampede
      stats = await histCache.inflight.get(cacheKey)!;
    } else {
      const statsQuery = `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN ${renewedQualificationPredicate} THEN 0 WHEN qh.data_conclusao IS NULL THEN 0 WHEN julianday(qh.data_vencimento) >= julianday('now') AND julianday(qh.data_vencimento) - julianday('now') > 30 THEN 1 ELSE 0 END) as validas,
            SUM(CASE WHEN ${renewedQualificationPredicate} THEN 0 WHEN qh.data_conclusao IS NULL THEN 0 WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 AND julianday(qh.data_vencimento) >= julianday('now') THEN 1 ELSE 0 END) as vencendo,
            SUM(CASE WHEN ${renewedQualificationPredicate} THEN 0 WHEN qh.data_conclusao IS NULL THEN 0 WHEN julianday(qh.data_vencimento) < julianday('now') THEN 1 ELSE 0 END) as vencidas,
            SUM(CASE WHEN ${activeRenewedQualificationPredicate} THEN 1 ELSE 0 END) as renovadas,
            SUM(CASE WHEN ${activePlannedQualificationPredicate} THEN 1 ELSE 0 END) as planejadas
          ${baseFromAndJoins}
          WHERE ${whereClause}`;

      // M-4: registrar promise para partilhar entre requests concorrentes
      const fetchPromise: Promise<StatsCacheData> = (async () => {
        let result: StatsCacheData = {
          total: 0,
          validas: 0,
          vencendo: 0,
          vencidas: 0,
          renovadas: 0,
          planejadas: 0,
        };

        if (materialized) {
          const day = new Date().toISOString().substring(0, 10);
          const statsResult = await db
            .prepare(statsQuery)
            .bind(...bindings)
            .first();
          result = {
            total: Number((statsResult as any)?.total || 0),
            validas: Number((statsResult as any)?.validas || 0),
            vencendo: Number((statsResult as any)?.vencendo || 0),
            vencidas: Number((statsResult as any)?.vencidas || 0),
            renovadas: Number((statsResult as any)?.renovadas || 0),
            planejadas: Number((statsResult as any)?.planejadas || 0),
          };
          await db
            .prepare(
              `INSERT OR IGNORE INTO qualificacoes_historico_stats_daily (day, scope_hash, total, validas, vencendo, vencidas, renovadas) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              day,
              cacheKey,
              result.total,
              result.validas,
              result.vencendo,
              result.vencidas,
              result.renovadas,
            )
            .run();
        } else {
          const statsResult = await db
            .prepare(statsQuery)
            .bind(...bindings)
            .first();
          result = {
            total: Number((statsResult as any)?.total || 0),
            validas: Number((statsResult as any)?.validas || 0),
            vencendo: Number((statsResult as any)?.vencendo || 0),
            vencidas: Number((statsResult as any)?.vencidas || 0),
            renovadas: Number((statsResult as any)?.renovadas || 0),
            planejadas: Number((statsResult as any)?.planejadas || 0),
          };
        }
        return result;
      })();

      histCache.inflight.set(cacheKey, fetchPromise);
      try {
        stats = await fetchPromise;
      } finally {
        histCache.inflight.delete(cacheKey);
      }

      histCache.cache = { key: cacheKey, ts: now, data: stats };
    }

    const etag = generateETag([
      'historico-stats',
      stats.total,
      stats.validas,
      stats.vencendo,
      stats.vencidas,
      stats.renovadas,
      materialized ? 'mat' : 'live',
      scopeToken,
    ]);

    const ifNone = c.req.header('If-None-Match');
    if (ifNone && ifNone === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, max-age=30',
          'X-Cache-Status': 'HIT',
          'X-Materialized': materialized ? 'true' : 'false',
        },
      });
    }

    let extendedData: unknown = undefined;
    if (extended) {
      try {
        const extQuery = `SELECT qt.categoria AS categoria,
                  COUNT(*) AS total,
                  SUM(CASE WHEN ${renewedQualificationPredicate} THEN 0 WHEN julianday(qh.data_vencimento) < julianday('now') THEN 1 ELSE 0 END) AS vencidas,
                  SUM(CASE WHEN ${renewedQualificationPredicate} THEN 0 WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 AND julianday(qh.data_vencimento) >= julianday('now') THEN 1 ELSE 0 END) AS vencendo,
                  SUM(CASE WHEN ${renewedQualificationPredicate} THEN 0 WHEN julianday(qh.data_vencimento) - julianday('now') > 30 THEN 1 ELSE 0 END) AS validas
             ${baseFromAndJoins}
             WHERE ${whereClause}
             GROUP BY qt.categoria
             ORDER BY total DESC
             LIMIT 50`;
        const { results: catRows } = await db
          .prepare(extQuery)
          .bind(...bindings)
          .all();
        extendedData = catRows || [];
      } catch (e) {
        extendedData = { error: (e as Error).message };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: stats,
        extended: extendedData,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: etag,
          'Cache-Control': 'private, max-age=30',
          'X-Cache-Status': histCache.cache?.key === cacheKey ? 'HIT' : 'MISS',
          'X-Materialized': materialized ? 'true' : 'false',
        },
      },
    );
  }),
);

// ===== WRITE ROUTES (POST, PUT, PATCH, DELETE) =====
router.route('/', writeRouter);

export default router;
