/**
 * FUNCIONARIOS ROUTES - Gestão de Funcionários
 *
 * Endpoints CRUD para funcionários:
 * - GET /api/funcionarios - Lista com paginação e busca
 * - GET /api/funcionarios/:id - Busca por ID
 * - POST /api/funcionarios - Cria novo
 * - PUT /api/funcionarios/:id - Atualiza
 * - DELETE /api/funcionarios/:id - Remove (soft delete)
 */

import { Hono } from 'hono';
import type { Env, Funcionario, ApiResponse, PaginatedResponse } from '../types';
import {
  softDelete,
  calculatePagination,
  countRecords,
  buildSearchWhere,
  buildOrderBy,
} from '../utils/db';
import { notFound, badRequest } from '../middleware/error-handler';
import { isValidEmail, isValidCPF, sanitizeString } from '../utils/security';
import { auth, optionalAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import type { Context } from 'hono';

function getEmpresaIdSafe(c: Context<{ Bindings: Env }>): number | undefined {
  try {
    return getEmpresaId(c);
  } catch {
    return undefined;
  }
}
import { registrarAuditoria, extrairUsuarioAuditoria } from '../utils/auditoria';
import { syncFuncionarioCertificacoes } from '../services/sync-certificacoes-funcionarios';
import { publishDomainEvent } from '../shared/domainEvents';
import {
  replaceManagedEscalaEvents,
  removeManagedEscalaEvents,
} from '../shared/syncEscalaEventosExternos';
import funcionariosMutationsRoutes from './funcionarios-mutations';

const app = new Hono<{ Bindings: Env }>();

function normalizeAeronaveLabel(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return ['S76', 'SK76'].includes(trimmed.toUpperCase()) ? 'SK76' : trimmed;
}

function normalizeFuncionarioStatus(value?: string | null): string {
  const normalized = (value || '').trim().toUpperCase();
  if (!normalized) return 'ATIVO';
  return normalized === 'DESLIGADO' ? 'INATIVO' : normalized;
}

function buildNormalizedFuncionarioStatusExpr(funcAlias = 'f'): string {
  return `CASE
    WHEN UPPER(COALESCE(NULLIF(TRIM(${funcAlias}.status), ''), 'ATIVO')) = 'DESLIGADO' THEN 'INATIVO'
    ELSE UPPER(COALESCE(NULLIF(TRIM(${funcAlias}.status), ''), 'ATIVO'))
  END`;
}

function buildFuncionarioAeronaveDisplayExpr(funcAlias = 'f'): string {
  const modeloIdsExpr = `',' || REPLACE(COALESCE(${funcAlias}.modelo_aeronave_id, ''), ' ', '') || ','`;

  return `COALESCE(
    NULLIF(
      REPLACE(
        (
          SELECT GROUP_CONCAT(
            DISTINCT CASE
              WHEN UPPER(TRIM(COALESCE(ma_multi.modelo, ma_multi.codigo, ma_multi.nome, ''))) = 'SK76'
                OR UPPER(TRIM(COALESCE(ma_multi.codigo, ma_multi.nome, ma_multi.modelo, ''))) IN ('S76', 'SK76')
                THEN 'SK76'
              ELSE COALESCE(
                NULLIF(TRIM(ma_multi.modelo), ''),
                NULLIF(TRIM(ma_multi.codigo), ''),
                NULLIF(TRIM(ma_multi.nome), '')
              )
            END
          )
          FROM modelos_aeronave ma_multi
          WHERE ma_multi.deleted_at IS NULL
            AND instr(${modeloIdsExpr}, ',' || CAST(ma_multi.id AS TEXT) || ',') > 0
        ),
        ',',
        ' / '
      ),
      ''
    ),
    CASE
      WHEN UPPER(TRIM(COALESCE(${funcAlias}.aeronave, ''))) IN ('S76', 'SK76') THEN 'SK76'
      WHEN NULLIF(TRIM(COALESCE(${funcAlias}.aeronave, '')), '') IS NOT NULL THEN TRIM(${funcAlias}.aeronave)
      ELSE 'Sem Aeronave'
    END
  )`;
}

function buildFuncionarioAeronaveTokensExpr(funcAlias = 'f'): string {
  return `',' || REPLACE(UPPER(${buildFuncionarioAeronaveDisplayExpr(funcAlias)}), ' / ', ',') || ','`;
}

/**
 * GET /api/funcionarios
 * Lista funcionários com paginação e busca
 *
 * Query params:
 * - page: número da página (default: 1)
 * - limit: itens por página (default: 50, max: 100)
 * - search: busca por nome, email, cpf, matricula
 * - status: filtro por ativo (true/false)
 * - cargo: filtro por cargo
 * - setor: filtro por setor
 * - aeronave: filtro por aeronave (string exibida; usa COALESCE(modelo/codigo/nome/aeronave)
 * - orderBy: coluna para ordenação (default: id)
 * - order: direção (ASC/DESC, default: DESC)
 */
app.get('/', optionalAuth(), async (c) => {
  const db = c.env.DB;
  const aeronaveSelectExpr = buildFuncionarioAeronaveDisplayExpr('f');

  // Parâmetros de paginação
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');

  // Parâmetros de busca/filtro
  const search = c.req.query('search');
  const status = c.req.query('status'); // "true" ou "false"
  const ativoParam = c.req.query('ativo'); // compat: ativo=true/false
  const cargo = c.req.query('cargo');
  const setor = c.req.query('setor'); // ✅ ATENÇÃO: Requer migration 0006 aplicada
  const funcao = c.req.query('funcao'); // ✅ Filtro de função
  const aeronave = c.req.query('aeronave'); // ✅ Filtro por aeronave (texto)
  const quinzena = c.req.query('quinzena'); // primeira|segunda|personalizada
  const examinador = c.req.query('examinador'); // NOVO: Filtro para examinadores

  // Parâmetros de ordenação
  const orderBy = c.req.query('orderBy');
  const order = c.req.query('order')?.toUpperCase() as 'ASC' | 'DESC' | undefined;

  // Descobrir schema real (status TEXT vs. ativo INTEGER)
  const cols = (await db.prepare("PRAGMA table_info('funcionarios')").all<{ name: string }>())
    .results as Array<{ name: string }>;
  const hasStatus = cols.some((c) => c.name === 'status');
  const hasAtivo = cols.some((c) => c.name === 'ativo');
  const hasIsExaminador = cols.some((c) => c.name === 'is_examinador');
  const hasIsChecador = cols.some((c) => c.name === 'is_checador');

  // Construir WHERE clauses (main query uses alias `f`; countRecords does not)
  const whereClausesQuery: string[] = ['f.deleted_at IS NULL'];
  const whereClausesCount: string[] = [];
  const bindings: unknown[] = [];

  // Filtro por empresa (multi-tenant)
  const empresaId = getEmpresaIdSafe(c);
  if (empresaId !== undefined) {
    whereClausesQuery.push('f.empresa_id = ?');
    whereClausesCount.push('empresa_id = ?');
    bindings.push(empresaId);
  }

  // Busca textual
  if (search) {
    const searchConditionQuery = buildSearchWhere(
      ['f.nome', 'f.email', 'f.cpf', 'f.matricula'],
      search,
    );
    const searchConditionCount = buildSearchWhere(['nome', 'email', 'cpf', 'matricula'], search);
    if (searchConditionQuery && searchConditionCount) {
      whereClausesQuery.push(searchConditionQuery.clause);
      whereClausesCount.push(searchConditionCount.clause);
      // Adicionar binding para cada coluna
      bindings.push(
        searchConditionQuery.binding,
        searchConditionQuery.binding,
        searchConditionQuery.binding,
        searchConditionQuery.binding,
      );
    }
  }

  // Filtro por status/ativo (compatível com ambos os schemas)
  // Regra global: sem filtro explícito, retornar somente ATIVOS
  const statusEfetivo = status ?? (ativoParam !== undefined ? ativoParam : 'ativos');
  // Aceita: status=true/false OU status=ativo/inativo/afastados/ferias
  if (statusEfetivo === 'true' || statusEfetivo === 'ativo' || statusEfetivo === 'ativos') {
    if (hasStatus) {
      whereClausesQuery.push("UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'");
      whereClausesCount.push("UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'");
    } else if (hasAtivo) {
      whereClausesQuery.push('COALESCE(f.ativo, 1) = 1');
      whereClausesCount.push('COALESCE(ativo, 1) = 1');
    }
  } else if (statusEfetivo === 'todos' || statusEfetivo === 'all') {
    // Sem filtro explícito: retornar ativos e inativos.
  } else if (
    statusEfetivo === 'false' ||
    statusEfetivo === 'inativo' ||
    statusEfetivo === 'inativos' ||
    statusEfetivo === 'desligados' ||
    statusEfetivo === 'desligado'
  ) {
    if (hasStatus) {
      whereClausesQuery.push(
        "UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) IN ('INATIVO', 'DESLIGADO')",
      );
      whereClausesCount.push(
        "UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) IN ('INATIVO', 'DESLIGADO')",
      );
    } else if (hasAtivo) {
      whereClausesQuery.push('COALESCE(f.ativo, 1) = 0');
      whereClausesCount.push('COALESCE(ativo, 1) = 0');
    }
  } else if (statusEfetivo === 'afastados' || statusEfetivo === 'afastado') {
    if (hasStatus) {
      whereClausesQuery.push("UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'AFASTADO'");
      whereClausesCount.push("UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'AFASTADO'");
    }
  } else if (statusEfetivo === 'ferias') {
    if (hasStatus) {
      whereClausesQuery.push("UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'FERIAS'");
      whereClausesCount.push("UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'FERIAS'");
    }
  }

  // Filtro por cargo
  if (cargo) {
    whereClausesQuery.push('f.cargo = ?');
    whereClausesCount.push('cargo = ?');
    bindings.push(cargo);
  }

  // Filtro por setor (✅ ATENÇÃO: Requer migration 0006 aplicada)
  if (setor) {
    whereClausesQuery.push('f.setor = ?');
    whereClausesCount.push('setor = ?');
    bindings.push(setor);
  }

  // Filtro por função
  if (funcao) {
    whereClausesQuery.push('f.funcao = ?');
    whereClausesCount.push('funcao = ?');
    bindings.push(funcao);
  }

  // Filtro por aeronave (usa o mesmo COALESCE do SELECT)
  if (aeronave) {
    const aeronaveNormalizada = normalizeAeronaveLabel(aeronave)?.toUpperCase();
    if (aeronaveNormalizada) {
      const aeronaveTokensExpr = buildFuncionarioAeronaveTokensExpr('f');
      whereClausesQuery.push(`${aeronaveTokensExpr} LIKE ?`);
      whereClausesCount.push(`${aeronaveTokensExpr} LIKE ?`);
      bindings.push(`%,${aeronaveNormalizada},%`);
    }
  }

  if (quinzena) {
    whereClausesQuery.push("COALESCE(f.quinzena, '') = ?");
    whereClausesCount.push("COALESCE(quinzena, '') = ?");
    bindings.push(quinzena);
  }

  // Filtro por examinador
  if (examinador === 'true') {
    // Compat: projetos antigos usam is_checador; novos podem ter is_examinador
    if (hasIsExaminador && hasIsChecador) {
      whereClausesQuery.push(
        '(COALESCE(f.is_examinador, 0) = 1 OR COALESCE(f.is_checador, 0) = 1)',
      );
      whereClausesCount.push('(COALESCE(is_examinador, 0) = 1 OR COALESCE(is_checador, 0) = 1)');
    } else if (hasIsExaminador) {
      whereClausesQuery.push('COALESCE(f.is_examinador, 0) = 1');
      whereClausesCount.push('COALESCE(is_examinador, 0) = 1');
    } else if (hasIsChecador) {
      whereClausesQuery.push('COALESCE(f.is_checador, 0) = 1');
      whereClausesCount.push('COALESCE(is_checador, 0) = 1');
    } else {
      // Sem colunas de flag disponíveis
      whereClausesQuery.push('0 = 1');
      whereClausesCount.push('0 = 1');
    }
  }

  const whereClauseQuery = whereClausesQuery.join(' AND ');
  const whereClauseCount = whereClausesCount.join(' AND ');
  const totalResult = await db
    .prepare(
      `
      SELECT COUNT(DISTINCT f.id) AS total
      FROM funcionarios f
      WHERE ${whereClauseCount}
    `,
    )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = totalResult?.total || 0;

  // Calcular paginação
  const pagination = calculatePagination({ page, limit }, total);

  // Construir ORDER BY (✅ ATENÇÃO: 'setor' requer migration 0006 aplicada)
  const orderByClause = buildOrderBy(
    ['id', 'nome', 'matricula', 'email', 'cargo', 'setor', 'quinzena', 'created_at'],
    orderBy || 'nome',
    order || 'ASC',
  );
  const [orderByColumn, orderByDirection] = orderByClause.split(' ');
  const orderByQueryClause = `f.${orderByColumn} ${orderByDirection}`;

  // Query principal (✅ ATENÇÃO: Coluna 'setor' requer migration 0006 aplicada em produção)
  // Seleção compatível com ambos os schemas
  const statusExprList = hasStatus
    ? `${buildNormalizedFuncionarioStatusExpr('f')} AS status, CASE WHEN ${buildNormalizedFuncionarioStatusExpr('f')} = 'ATIVO' THEN 1 ELSE 0 END AS ativo`
    : hasAtivo
      ? "CASE WHEN COALESCE(f.ativo, 1) = 1 THEN 'ATIVO' ELSE 'INATIVO' END AS status, COALESCE(f.ativo, 1) AS ativo"
      : "'ATIVO' AS status, 1 AS ativo";

  const query = `
    SELECT 
      f.id, f.matricula, f.nome, f.guerra, f.cpf, f.email, f.telefone,
      f.cargo, f.setor, f.funcao,
      ${aeronaveSelectExpr} AS aeronave,
      f.quinzena,
      f.codigo_anac,
      f.nascimento, f.licenca, f.codigo_anac, f.sispat, f.prestserv,
      f.admissao,
      ${statusExprList},
      f.is_instrutor, f.is_checador,
      f.created_at, f.updated_at
    FROM funcionarios f
    WHERE ${whereClauseQuery}
    ORDER BY ${orderByQueryClause}
    LIMIT ? OFFSET ?
  `;

  const { results } = await db
    .prepare(query)
    .bind(...bindings, pagination.limit, pagination.offset)
    .all<Funcionario>();

  const response: PaginatedResponse<Funcionario> = {
    success: true,
    data: results || [],
    pagination,
  };

  return c.json(response);
});

/**
 * GET /api/funcionarios/stats
 * Retorna estatísticas dos funcionários (total, ativos, inativos)
 */
app.get('/stats', optionalAuth(), async (c) => {
  const db = c.env.DB;

  // Descobrir schema real (status TEXT vs. ativo INTEGER)
  const cols = (await db.prepare("PRAGMA table_info('funcionarios')").all<{ name: string }>())
    .results as Array<{ name: string }>;
  const hasStatus = cols.some((col) => col.name === 'status');
  const hasAtivo = cols.some((col) => col.name === 'ativo');

  // Construir expressão para contar ativos/inativos
  // Observação: alguns registros podem ter status = '' (string vazia). Tratar como ATIVO.
  let ativoExpr: string;
  if (hasStatus) {
    ativoExpr = "UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'";
  } else if (hasAtivo) {
    // Tratar NULL como ativo por padrão, para evitar totais sem ativos/inativos.
    ativoExpr = 'COALESCE(f.ativo, 1) = 1';
  } else {
    ativoExpr = '1 = 1'; // Assume todos ativos se não há campo
  }

  const stats = await db
    .prepare(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ${ativoExpr} THEN 1 ELSE 0 END) as ativos,
        SUM(CASE WHEN NOT (${ativoExpr}) THEN 1 ELSE 0 END) as inativos
      FROM funcionarios f
      LEFT JOIN modelos_aeronave ma ON CAST(ma.id AS TEXT) = f.modelo_aeronave_id
      WHERE f.deleted_at IS NULL
    `,
    )
    .first<{ total: number; ativos: number; inativos: number }>();

  return c.json({
    success: true,
    data: {
      total: stats?.total || 0,
      ativos: stats?.ativos || 0,
      inativos: stats?.inativos || 0,
    },
  });
});

/**
 * GET /api/funcionarios/stats/dashboard
 * Retorna estatísticas detalhadas para o dashboard (aeronaves, setores, funções, etc.)
 */
app.get('/stats/dashboard', optionalAuth(), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaIdSafe(c);
    const aeronaveSelectExpr = buildFuncionarioAeronaveDisplayExpr('f');

    // Descobrir schema real
    const cols = (await db.prepare("PRAGMA table_info('funcionarios')").all<{ name: string }>())
      .results as Array<{ name: string }>;
    const hasStatus = cols.some((col) => col.name === 'status');
    const hasAtivo = cols.some((col) => col.name === 'ativo');

    let ativoExpr: string;
    if (hasStatus) {
      ativoExpr = "UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'";
    } else if (hasAtivo) {
      ativoExpr = 'COALESCE(f.ativo, 1) = 1';
    } else {
      ativoExpr = '1 = 1';
    }

    // Stats gerais
    const generalStats = await db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ${ativoExpr} THEN 1 ELSE 0 END) as ativos,
        SUM(CASE WHEN NOT (${ativoExpr}) THEN 1 ELSE 0 END) as inativos
      FROM funcionarios f
      WHERE f.deleted_at IS NULL
        AND (? IS NULL OR f.empresa_id = ?)
    `,
      )
      .bind(empresaId ?? null, empresaId ?? null)
      .first<{ total: number; ativos: number; inativos: number }>();

    // Funcionários por aeronave
    const porAeronave = await db
      .prepare(
        `
      SELECT 
        aeronave,
        COUNT(DISTINCT funcionario_id) as total,
        COUNT(DISTINCT funcionario_id) as ativos
      FROM (
        SELECT
          f.id as funcionario_id,
          CASE
            WHEN UPPER(TRIM(COALESCE(ma.modelo, ma.codigo, ma.nome, ''))) = 'SK76'
              OR UPPER(TRIM(COALESCE(ma.codigo, ma.nome, ma.modelo, ''))) IN ('S76', 'SK76')
              THEN 'SK76'
            ELSE COALESCE(
              NULLIF(TRIM(ma.modelo), ''),
              NULLIF(TRIM(ma.codigo), ''),
              NULLIF(TRIM(ma.nome), '')
            )
          END AS aeronave
        FROM funcionarios f
        JOIN modelos_aeronave ma
          ON ma.deleted_at IS NULL
         AND instr(',' || REPLACE(COALESCE(f.modelo_aeronave_id, ''), ' ', '') || ',', ',' || CAST(ma.id AS TEXT) || ',') > 0
        WHERE f.deleted_at IS NULL
          AND ${ativoExpr}
          AND (? IS NULL OR f.empresa_id = ?)

        UNION ALL

        SELECT
          f.id as funcionario_id,
          CASE
            WHEN UPPER(TRIM(COALESCE(f.aeronave, ''))) IN ('S76', 'SK76') THEN 'SK76'
            ELSE TRIM(f.aeronave)
          END AS aeronave
        FROM funcionarios f
        WHERE f.deleted_at IS NULL
          AND ${ativoExpr}
          AND (? IS NULL OR f.empresa_id = ?)
          AND NULLIF(TRIM(COALESCE(f.aeronave, '')), '') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM modelos_aeronave ma
            WHERE ma.deleted_at IS NULL
              AND instr(',' || REPLACE(COALESCE(f.modelo_aeronave_id, ''), ' ', '') || ',', ',' || CAST(ma.id AS TEXT) || ',') > 0
          )
      ) base
      WHERE NULLIF(TRIM(COALESCE(aeronave, '')), '') IS NOT NULL
      GROUP BY aeronave
      ORDER BY total DESC, aeronave ASC
      LIMIT 10
    `,
      )
      .bind(empresaId ?? null, empresaId ?? null, empresaId ?? null, empresaId ?? null)
      .all<{ aeronave: string; total: number; ativos: number }>();

    // Funcionários por função
    const porFuncao = await db
      .prepare(
        `
      SELECT 
        COALESCE(NULLIF(TRIM(f.funcao), ''), 'Não Definida') as funcao,
        COUNT(*) as total,
        COUNT(*) as ativos
      FROM funcionarios f
      WHERE f.deleted_at IS NULL
        AND ${ativoExpr}
        AND (? IS NULL OR f.empresa_id = ?)
      GROUP BY UPPER(TRIM(COALESCE(f.funcao, '')))
      ORDER BY total DESC
      LIMIT 10
    `,
      )
      .bind(empresaId ?? null, empresaId ?? null)
      .all<{ funcao: string; total: number; ativos: number }>();

    // Funcionários por setor
    const porSetor = await db
      .prepare(
        `
      SELECT 
        COALESCE(NULLIF(TRIM(f.setor), ''), 'Não Definido') as setor,
        COUNT(*) as total,
        COUNT(*) as ativos
      FROM funcionarios f
      WHERE f.deleted_at IS NULL
        AND ${ativoExpr}
        AND (? IS NULL OR f.empresa_id = ?)
      GROUP BY UPPER(TRIM(COALESCE(f.setor, '')))
      ORDER BY total DESC
      LIMIT 10
    `,
      )
      .bind(empresaId ?? null, empresaId ?? null)
      .all<{ setor: string; total: number; ativos: number }>();

    // Distribuição por status (detalhada)
    const porStatus = await db
      .prepare(
        `
      SELECT 
        ${buildNormalizedFuncionarioStatusExpr('f')} as status,
        COUNT(*) as total
      FROM funcionarios f
      WHERE f.deleted_at IS NULL
        AND (? IS NULL OR f.empresa_id = ?)
      GROUP BY ${buildNormalizedFuncionarioStatusExpr('f')}
      ORDER BY total DESC
    `,
      )
      .bind(empresaId ?? null, empresaId ?? null)
      .all<{ status: string; total: number }>();

    const qualificacoesStats = await db
      .prepare(
        `
      WITH qualificacoes_ativas AS (
        SELECT
          qh.funcionario_id,
          COALESCE(
            date(qh.data_vencimento),
            date(
              qh.data_conclusao,
              '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months'
            )
          ) AS data_vencimento_calculada
        FROM qualificacoes_historico qh
        JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
        LEFT JOIN qualificacoes_tipos qt
          ON qt.deleted_at IS NULL
         AND (
           qt.id = qh.qualificacao_id
           OR (
             qh.qualificacao_id IS NULL
             AND UPPER(TRIM(COALESCE(qh.qualificacao_codigo, ''))) = UPPER(TRIM(COALESCE(qt.codigo, '')))
           )
         )
        WHERE qh.deleted_at IS NULL
          AND COALESCE(qh.renovada, 0) = 0
          AND ${ativoExpr}
          AND (? IS NULL OR f.empresa_id = ?)
          AND qh.id IN (
            SELECT MAX(sub.id)
            FROM qualificacoes_historico sub
            WHERE sub.deleted_at IS NULL
              AND COALESCE(sub.renovada, 0) = 0
              AND sub.funcionario_id = qh.funcionario_id
              AND COALESCE(NULLIF(TRIM(sub.qualificacao_codigo), ''), CAST(sub.qualificacao_id AS TEXT)) =
                  COALESCE(NULLIF(TRIM(qh.qualificacao_codigo), ''), CAST(qh.qualificacao_id AS TEXT))
          )
      )
      SELECT
        COUNT(DISTINCT funcionario_id) as funcionarios_com_qualificacoes,
        COUNT(*) as total_qualificacoes,
        SUM(
          CASE
            WHEN data_vencimento_calculada IS NULL OR data_vencimento_calculada >= date('now') THEN 1
            ELSE 0
          END
        ) as qualificacoes_validas,
        SUM(
          CASE
            WHEN data_vencimento_calculada IS NOT NULL AND data_vencimento_calculada < date('now') THEN 1
            ELSE 0
          END
        ) as qualificacoes_vencidas
      FROM qualificacoes_ativas
    `,
      )
      .bind(empresaId ?? null, empresaId ?? null)
      .first<{
        funcionarios_com_qualificacoes: number;
        total_qualificacoes: number;
        qualificacoes_validas: number;
        qualificacoes_vencidas: number;
      }>();

    const generalTotal = generalStats?.total || 0;
    const generalAtivos = generalStats?.ativos || 0;
    const generalInativos = generalStats?.inativos || 0;

    return c.json({
      success: true,
      data: {
        geral: {
          total: generalTotal,
          ativos: generalAtivos,
          inativos: generalInativos,
          percentual_ativos:
            generalTotal === 0 ? 0 : Math.round((generalAtivos / generalTotal) * 100),
        },
        por_aeronave: porAeronave.results || [],
        por_funcao: porFuncao.results || [],
        por_setor: porSetor.results || [],
        por_status: porStatus.results || [],
        qualificacoes: {
          funcionarios_com_qualificacoes: qualificacoesStats?.funcionarios_com_qualificacoes || 0,
          total_qualificacoes: qualificacoesStats?.total_qualificacoes || 0,
          qualificacoes_validas: qualificacoesStats?.qualificacoes_validas || 0,
          qualificacoes_vencidas: qualificacoesStats?.qualificacoes_vencidas || 0,
          percentual_validas:
            (qualificacoesStats?.total_qualificacoes || 0) === 0
              ? 0
              : Math.round(
                  ((qualificacoesStats?.qualificacoes_validas || 0) /
                    (qualificacoesStats?.total_qualificacoes || 0)) *
                    100,
                ),
        },
      },
    });
  } catch (error) {
    console.error('Erro em /stats/dashboard:', error);
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR',
      },
      500,
    );
  }
});

app.get('/:fid/ferias', auth(), async (c) => {
  const db = c.env.DB;
  const funcionarioId = c.req.param('fid');
  const empresaId = getEmpresaIdSafe(c);

  const rows = await db
    .prepare(
      `SELECT
         ff.*, 
        CASE WHEN ff.escala_alocacao_id IS NULL THEN 'funcionario' ELSE 'escala' END AS origem,
         f.nome,
         f.guerra AS nome_guerra,
         em.id AS escala_id,
         em.mes AS escala_mes,
         em.ano AS escala_ano,
         em.titulo AS escala_titulo
       FROM funcionario_ferias ff
       JOIN funcionarios f ON f.id = ff.funcionario_id AND f.deleted_at IS NULL
       LEFT JOIN escala_alocacoes ea ON ea.id = ff.escala_alocacao_id AND ea.deleted_at IS NULL
       LEFT JOIN escalas_mensais em ON em.id = ea.escala_id AND em.deleted_at IS NULL
       WHERE ff.funcionario_id = ?
         AND ff.deleted_at IS NULL
         AND (? IS NULL OR f.empresa_id = ?)
       ORDER BY ff.data_inicio DESC`,
    )
    .bind(funcionarioId, empresaId ?? null, empresaId ?? null)
    .all<{
      id: string;
      funcionario_id: string;
      data_inicio: string;
      data_fim: string;
      tipo: string;
      observacoes: string | null;
      escala_alocacao_id: string | null;
      origem: 'funcionario' | 'escala';
      created_at: string;
      updated_at: string;
      nome: string;
      nome_guerra: string | null;
      escala_id: string | null;
      escala_mes: number | null;
      escala_ano: number | null;
      escala_titulo: string | null;
    }>();

  return c.json({ success: true, data: rows.results || [] });
});

app.post('/:fid/ferias', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const funcionarioId = c.req.param('fid');
  const empresaId = getEmpresaIdSafe(c);
  const userId = String(extrairUsuarioAuditoria(c) || 'system');
  const body = (await c.req.json().catch(() => null)) as {
    data_inicio?: string;
    data_fim?: string;
    tipo?: string;
    observacoes?: string | null;
  } | null;

  const dataInicio = String(body?.data_inicio || '');
  const dataFim = String(body?.data_fim || '');
  const tipo = String(body?.tipo || 'FERIAS')
    .trim()
    .toUpperCase();
  const observacoes = body?.observacoes || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) {
    return c.json({ success: false, error: 'Datas devem estar no formato YYYY-MM-DD' }, 400);
  }
  if (dataFim < dataInicio) {
    return c.json({ success: false, error: 'data_fim deve ser >= data_inicio' }, 400);
  }

  const funcionario = await db
    .prepare(
      `SELECT id FROM funcionarios
        WHERE id = ? AND deleted_at IS NULL AND (? IS NULL OR empresa_id = ?)
        LIMIT 1`,
    )
    .bind(funcionarioId, empresaId ?? null, empresaId ?? null)
    .first<{ id: string }>();

  if (!funcionario) {
    return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
  }

  const sobreposicao = await db
    .prepare(
      `SELECT id, data_inicio, data_fim, tipo
         FROM funcionario_ferias
        WHERE funcionario_id = ?
          AND deleted_at IS NULL
          AND NOT (data_fim < ? OR data_inicio > ?)
        LIMIT 1`,
    )
    .bind(funcionarioId, dataInicio, dataFim)
    .first<{ id: string; data_inicio: string; data_fim: string; tipo: string }>();

  if (sobreposicao) {
    return c.json(
      {
        success: false,
        code: 'SOBREPOSICAO_PERIODO',
        error: `Já existe ${sobreposicao.tipo} no período de ${sobreposicao.data_inicio} a ${sobreposicao.data_fim}`,
        conflito: sobreposicao,
      },
      409,
    );
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO funcionario_ferias
       (id, funcionario_id, data_inicio, data_fim, tipo, observacoes, escala_alocacao_id, criado_por, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, datetime('now'), datetime('now'))`,
    )
    .bind(id, funcionarioId, dataInicio, dataFim, tipo, observacoes, userId)
    .run();

  try {
    await replaceManagedEscalaEvents({
      db,
      empresaId,
      funcionarioId,
      origem: 'funcionario_ferias',
      linkId: `func_ferias:${id}`,
      tipoEvento: tipo === 'AFT' ? 'licenca' : 'ferias',
      dataInicio,
      dataFim,
      createdBy: userId,
      status: 'confirmado',
      observacoes,
      motivoAutomatico:
        'Gerado automaticamente a partir do lançamento global de férias/afastamento.',
      replaceAutoTipos: ['voo', 'folga'],
    });
  } catch (error) {
    console.error('[funcionarios/ferias] sync escala_eventos error:', error);
  }

  return c.json(
    {
      success: true,
      data: {
        id,
        funcionario_id: funcionarioId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        tipo,
        observacoes,
      },
    },
    201,
  );
});

app.delete('/:fid/ferias/:feriasId', auth(), requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const funcionarioId = c.req.param('fid');
  const feriasId = c.req.param('feriasId');
  const empresaId = getEmpresaIdSafe(c);

  const periodo = await db
    .prepare(
      `SELECT
         ff.id,
         ff.funcionario_id,
         ff.tipo,
         ff.data_inicio,
         ff.data_fim,
         ff.escala_alocacao_id
       FROM funcionario_ferias ff
       JOIN funcionarios f ON f.id = ff.funcionario_id AND f.deleted_at IS NULL
       WHERE ff.id = ?
         AND ff.funcionario_id = ?
         AND ff.deleted_at IS NULL
         AND (? IS NULL OR f.empresa_id = ?)
       LIMIT 1`,
    )
    .bind(feriasId, funcionarioId, empresaId ?? null, empresaId ?? null)
    .first<{
      id: string;
      funcionario_id: string;
      tipo: string;
      data_inicio: string;
      data_fim: string;
      escala_alocacao_id: string | null;
    }>();

  if (!periodo) {
    return c.json({ success: false, error: 'Período não encontrado' }, 404);
  }

  if (periodo.escala_alocacao_id) {
    return c.json(
      {
        success: false,
        error:
          'Este período foi gerado a partir de uma situação da escala. Remova a situação na escala correspondente.',
      },
      409,
    );
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE funcionario_ferias
          SET deleted_at = ?, updated_at = ?
        WHERE id = ?
          AND funcionario_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(now, now, feriasId, funcionarioId)
    .run();

  await removeManagedEscalaEvents({
    db,
    funcionarioId,
    origem: 'funcionario_ferias',
    linkId: `func_ferias:${feriasId}`,
  });

  return c.json({
    success: true,
    data: {
      id: periodo.id,
      funcionario_id: periodo.funcionario_id,
      tipo: periodo.tipo,
      data_inicio: periodo.data_inicio,
      data_fim: periodo.data_fim,
    },
  });
});

/**
 * GET /api/funcionarios/:id
 * Busca funcionário por ID com TODOS os campos
 */
app.get('/:id', optionalAuth(), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Descobrir schema real
  const cols = (await db.prepare("PRAGMA table_info('funcionarios')").all<{ name: string }>())
    .results as Array<{ name: string }>;
  const hasStatus = cols.some((c) => c.name === 'status');
  const hasAtivo = cols.some((c) => c.name === 'ativo');

  const statusExpr = hasStatus
    ? `${buildNormalizedFuncionarioStatusExpr('funcionarios')} AS status`
    : hasAtivo
      ? "CASE WHEN ativo = 1 THEN 'ATIVO' ELSE 'INATIVO' END AS status"
      : "'ATIVO' AS status";

  // Query com TODOS os campos incluindo dados pessoais, profissionais e endereço
  const funcionario = await db
    .prepare(
      `
    SELECT 
      id, matricula, nome, guerra, cpf, rg, 
      nascimento, email, telefone,
      funcao, cargo, setor, base, aeronave, modelo_aeronave_id,
      admissao, codigo_anac,
      nivel_icao, data_realizacao_icao, validade_icao, 
      cma, data_realizacao_cma, validade_cma, 
      aso, data_realizacao_aso, validade_aso, 
      sispat, prestserv,
      cep, logradouro, numero, complemento, bairro, cidade, estado,
      observacoes, endereco,
      quinzena,
      ${statusExpr},
      is_instrutor, is_checador,
      created_at, updated_at
    FROM funcionarios
    WHERE id = ? AND deleted_at IS NULL
      AND (? IS NULL OR empresa_id = ?)
  `,
    )
    .bind(id, getEmpresaIdSafe(c) ?? null, getEmpresaIdSafe(c) ?? null)
    .first<Funcionario>();

  if (!funcionario) {
    notFound('Funcionário não encontrado');
  }

  const treinamentos = await db
    .prepare(
      `SELECT
         id,
         registro_tipo,
         origem,
         origem_label,
         curso_id,
         player_matricula_id,
         status,
         progresso_pct,
         data_matricula,
         data_inicio,
         data_conclusao,
         prazo_conclusao,
         qualificacao_historico_id,
         titulo,
         categoria,
         tipo_conteudo,
         qualificacao_codigo,
         ordem_data
       FROM (
         SELECT
           m.id,
           'matricula' AS registro_tipo,
           'LMS' AS origem,
           'LMS nativo' AS origem_label,
           m.curso_id,
           m.id AS player_matricula_id,
           m.status,
           m.progresso_pct,
           m.data_matricula,
           m.data_inicio,
           m.data_conclusao,
           m.data_expiracao AS prazo_conclusao,
           m.qualificacao_historico_id,
           c.titulo,
           c.categoria,
           c.tipo_conteudo,
           qt.codigo AS qualificacao_codigo,
           m.created_at AS ordem_data
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id AND c.deleted_at IS NULL
         LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.deleted_at IS NULL
         WHERE m.funcionario_id = ?
           AND m.empresa_id = ?
           AND m.deleted_at IS NULL

         UNION ALL

         SELECT
           h.id,
           'historico_importado' AS registro_tipo,
           h.fonte AS origem,
           CASE WHEN h.fonte = 'EDAPP' THEN 'EdApp importado' ELSE h.fonte END AS origem_label,
           h.curso_id,
           NULL AS player_matricula_id,
           h.status,
           COALESCE(h.progresso_pct, 100) AS progresso_pct,
           NULL AS data_matricula,
           NULL AS data_inicio,
           h.data_conclusao,
           NULL AS prazo_conclusao,
           h.qualificacao_historico_id,
           h.curso_titulo AS titulo,
           COALESCE(h.curso_categoria, 'Treinamento legado') AS categoria,
           h.tipo_conteudo,
           h.qualificacao_codigo,
           COALESCE(h.completed_at, h.updated_at, h.created_at) AS ordem_data
         FROM lms_historico_importado h
         WHERE h.funcionario_id = ?
           AND h.empresa_id = ?
           AND h.deleted_at IS NULL
       ) treinamentos
       ORDER BY datetime(ordem_data) DESC, id DESC`,
    )
    .bind(id, getEmpresaIdSafe(c), id, getEmpresaIdSafe(c))
    .all<Record<string, unknown>>();

  const response: ApiResponse = {
    success: true,
    data: { ...funcionario, treinamentos: treinamentos.results },
  };

  return c.json(response);
});

app.route('/', funcionariosMutationsRoutes);

export default app;
