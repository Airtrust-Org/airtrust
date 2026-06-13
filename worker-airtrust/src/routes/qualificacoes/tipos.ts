/**
 * QUALIFICACOES - MÓDULO TIPOS
 * Gestão de tipos de qualificações (CRUD)
 *
 * Endpoints:
 * - GET /tipos - Lista tipos
 * - POST /tipos - Cria tipo
 * - PUT /tipos/:id - Atualiza tipo
 * - DELETE /tipos/:id - Deleta tipo (soft delete)
 */

import { Hono } from 'hono';
import type { Env } from '../../types';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getTenantContext } from '../../middleware/tenant';
import { ApiError, forbidden } from '../../middleware/error-handler';
import { z } from 'zod';
import {
  buildHistoricoTipoSnapshot,
  shouldSyncHistoricoSnapshotsOnTipoUpdate,
  type QualificacaoTipoSnapshot,
} from '../../services/qualificacoes-tipos-sync';
import {
  isEadCategoria,
  reconcileImportedEdappHistory,
  softDeleteLmsCourseForQualificacaoTipo,
  syncLmsCourseFromQualificacaoTipo,
} from '../../services/lms-ead-ssot';
import {
  filterRequestedSetorIdsByAccess,
  getEmployeeSectorAccess,
  type EmployeeSectorAccess,
} from '../../services/employee-sector-access';

type TipoAtualizadoRow = {
  id: number;
  codigo: string | null;
  nome: string | null;
  categoria: string | null;
  validade: number | null;
  vencimento_fim_mes: number | null;
  carga_horaria: number | null;
  carga_horaria_inicial: number | null;
  carga_horaria_recorrente: number | null;
};

type HistoricoTipoSyncRow = {
  id: number;
  funcionario_id: number;
  data_conclusao: string | null;
  data_vencimento: string | null;
  tipo_treinamento: string | null;
  qualificacao_codigo: string | null;
  nascimento_funcionario: string | null;
  conflito_codigo: number;
};

type TipoExistenteRow = {
  id: number;
  deleted_at: string | null;
};

type TipoSetor = {
  id: number;
  nome: string;
};

type TipoQualificacaoRow = {
  id: number | string;
  tipo?: string | null;
  codigo?: string | null;
  nome?: string | null;
  descricao?: string | null;
  categoria?: string | null;
  categoria_id?: number | null;
  categoria_cor?: string | null;
  carga_horaria?: number | null;
  carga_horaria_inicial?: number | null;
  carga_horaria_recorrente?: number | null;
  conteudo_programatico?: string | null;
  validade?: number | null;
  vencimento_fim_mes?: number | null;
  observacoes?: string | null;
  ativo?: number | boolean | null;
  is_check?: number | boolean | null;
  created_at?: string;
  updated_at?: string | null;
  total_no_historico?: number | null;
  setores_json?: string | null;
  setores_count?: number | null;
};

const router = new Hono<{ Bindings: Env }>();

let tiposHasIsCheckCache: boolean | null = null;

type TiposColumnsSupport = {
  hasIsCheck: boolean;
  hasConteudoProgramatico: boolean;
  hasCargaInicial: boolean;
  hasCargaRecorrente: boolean;
};

function deriveModeloTipo(validade: number | null | undefined, categoria?: string | null): string {
  if (Number(validade || 0) === 6) return 'SEMESTRAL';
  return String(categoria || '')
    .trim()
    .toUpperCase();
}

function normalizeTipoCodigo(value: string): string {
  return value.trim().toUpperCase();
}

function isTipoCodigoUniqueConstraintError(error: unknown): boolean {
  const message = (error as Error)?.message || String(error || '');
  return message.includes('UNIQUE constraint failed: qualificacoes_tipos.codigo');
}

async function qualificacoesTiposHasIsCheck(db: D1Database): Promise<boolean> {
  if (tiposHasIsCheckCache !== null) return tiposHasIsCheckCache;
  try {
    const info = await db.prepare("PRAGMA table_info('qualificacoes_tipos')").all();
    const cols = (info.results || []) as Array<{ name?: string }>;
    tiposHasIsCheckCache = cols.some((c) => c.name === 'is_check');
    return tiposHasIsCheckCache;
  } catch {
    tiposHasIsCheckCache = false;
    return false;
  }
}

async function loadQualificacoesTiposColumnsSupport(
  db: D1Database,
): Promise<TiposColumnsSupport> {
  const info = await db.prepare("PRAGMA table_info('qualificacoes_tipos')").all();
  const cols = (info.results || []) as Array<{ name?: string }>;
  const hasColumn = (columnName: string) => cols.some((c) => c.name === columnName);

  const hasCargaInicial = hasColumn('carga_horaria_inicial');
  const hasCargaRecorrente = hasColumn('carga_horaria_recorrente');
  const hasConteudoProgramatico = hasColumn('conteudo_programatico');
  const hasIsCheck = hasColumn('is_check');

  return {
    hasIsCheck,
    hasConteudoProgramatico,
    hasCargaInicial,
    hasCargaRecorrente,
  };
}

// ===== SCHEMAS VALIDAÇÃO =====
const createTipoSchema = z.object({
  nome: z.string().min(3, 'Nome obrigatório (mínimo 3 caracteres)'),
  codigo: z.string().min(1, 'Código obrigatório'),
  categoria: z.string().min(1, 'Categoria obrigatória'),
  descricao: z.string().optional(),
  conteudo_programatico: z.string().nullable().optional(),
  carga_horaria_inicial: z.number().nullable().optional(),
  carga_horaria_recorrente: z.number().nullable().optional(),
  validade: z.number().nullable().optional(),
  vencimento_fim_mes: z.number().optional().default(1),
  observacoes: z.string().nullable().optional(),
  ativo: z.union([z.boolean(), z.number()]).optional().default(true),
  is_check: z.union([z.boolean(), z.number()]).optional().default(false),
});

const updateTipoSchema = z.object({
  nome: z.string().min(3).optional(),
  codigo: z.string().min(1).optional().nullable(),
  categoria: z.string().min(1).optional().nullable(),
  descricao: z.string().optional().nullable(),
  conteudo_programatico: z.string().optional().nullable(),
  carga_horaria_inicial: z.number().nullable().optional(),
  carga_horaria_recorrente: z.number().nullable().optional(),
  validade: z.number().nullable().optional(),
  vencimento_fim_mes: z.number().optional().nullable(),
  observacoes: z.string().nullable().optional(),
  ativo: z.union([z.boolean(), z.number()]).optional(),
  is_check: z.union([z.boolean(), z.number()]).optional(),
});

const updateTipoSetoresSchema = z.object({
  setor_ids: z.array(z.number().int().positive()).default([]),
});

// ===== HELPERS =====
function safe(fn: (c: any) => Promise<Response> | Response) {
  return async (c: any) => {
    try {
      return await fn(c);
    } catch (e) {
      if (e instanceof ApiError) {
        return c.json(
          { success: false, error: e.message, code: e.code },
          e.statusCode as 400 | 403 | 404 | 409 | 500,
        );
      }
      const errorMessage = (e as Error).message || String(e);
      console.error('[TIPOS_ERROR]', errorMessage, (e as Error).stack);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  };
}

async function logAuditoria(db: D1Database, entidade: string, entidade_id: string, acao: string) {
  try {
    const auditTable = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2' LIMIT 1",
      )
      .first();
    if (auditTable) {
      await db
        .prepare(
          "INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, origem) VALUES (?, ?, ?, 'api')",
        )
        .bind(entidade, entidade_id, acao)
        .run();
    }
  } catch (e) {
    console.warn('[AUDITORIA] falha ao registrar:', (e as Error).message);
  }
}

async function hasQualificacoesTiposSetoresTable(db: D1Database): Promise<boolean> {
  const table = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'qualificacoes_tipos_setores' LIMIT 1",
    )
    .first<{ name: string }>();

  return Boolean(table?.name);
}

function normalizeSetorIds(values: Array<string | number>): number[] {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

function parseRequestedSetorIds(rawSetorId?: string, rawSetorIds?: string): number[] {
  const ids: Array<string | number> = [];
  if (rawSetorId) ids.push(rawSetorId);
  if (rawSetorIds) {
    ids.push(
      ...rawSetorIds
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }
  return normalizeSetorIds(ids);
}

function parseSetoresJson(raw: string | null | undefined): TipoSetor[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ id?: number; nome?: string } | null>;
    return (parsed || [])
      .filter((item): item is { id: number; nome: string } => Boolean(item?.id && item?.nome))
      .map((item) => ({ id: Number(item.id), nome: String(item.nome) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } catch {
    return [];
  }
}

function enrichTipoRow<T extends TipoQualificacaoRow>(row: T) {
  const setores = parseSetoresJson(row.setores_json);
  return {
    ...row,
    setores,
    is_transversal: setores.length === 0,
    categoria_id: row.categoria_id ?? null,
    categoria_cor: row.categoria_cor ?? null,
  };
}

function buildTipoSetorVisibilityClause(
  access: EmployeeSectorAccess,
  hasQualificacoesTiposSetores: boolean,
  requestedSetorIds: number[],
): { clause: string; bindings: number[] } {
  if (!hasQualificacoesTiposSetores) {
    return requestedSetorIds.length > 0
      ? { clause: '1 = 0', bindings: [] }
      : { clause: '1 = 1', bindings: [] };
  }

  const activeLinksMissing = `NOT EXISTS (
    SELECT 1
      FROM qualificacoes_tipos_setores qts_scope
     WHERE qts_scope.tipo_id = qt.id
       AND qts_scope.empresa_id = qt.empresa_id
       AND qts_scope.deleted_at IS NULL
  )`;

  const setorIdsForScope =
    requestedSetorIds.length > 0 ? requestedSetorIds : access.mode === 'all' ? [] : access.setorIds;

  if (setorIdsForScope.length === 0) {
    return access.mode === 'all'
      ? { clause: '1 = 1', bindings: [] }
      : { clause: activeLinksMissing, bindings: [] };
  }

  const linkedToScopedSetor = `EXISTS (
    SELECT 1
      FROM qualificacoes_tipos_setores qts_scope
     WHERE qts_scope.tipo_id = qt.id
       AND qts_scope.empresa_id = qt.empresa_id
       AND qts_scope.deleted_at IS NULL
       AND qts_scope.setor_id IN (${setorIdsForScope.map(() => '?').join(', ')})
  )`;

  // When user explicitly requests specific sectors, only include tipos linked to those sectors.
  // activeLinksMissing is only a fallback for implicit sector-scoped access (no explicit filter).
  if (requestedSetorIds.length > 0) {
    return { clause: linkedToScopedSetor, bindings: setorIdsForScope };
  }

  return {
    clause: `(${activeLinksMissing} OR ${linkedToScopedSetor})`,
    bindings: setorIdsForScope,
  };
}

async function validateRequestedSetorScope(
  access: EmployeeSectorAccess,
  requestedSetorIds: number[],
): Promise<number[]> {
  if (requestedSetorIds.length === 0 || access.mode === 'all') {
    return requestedSetorIds;
  }

  const allowedRequestedSetorIds = filterRequestedSetorIdsByAccess(requestedSetorIds, access);
  if (allowedRequestedSetorIds.length !== requestedSetorIds.length) {
    forbidden('Filtro de setor fora do escopo permitido', 'SETOR_FORA_DO_ESCOPO');
  }

  return allowedRequestedSetorIds;
}

function buildSetoresAggregationSelect(hasQualificacoesTiposSetores: boolean): string {
  if (!hasQualificacoesTiposSetores) {
    return `'[]' AS setores_json, 0 AS setores_count`;
  }

  return `
    COALESCE(qtsa.setores_json, '[]') AS setores_json,
    COALESCE(qtsa.setores_count, 0) AS setores_count
  `;
}

function buildSetoresAggregationJoin(hasQualificacoesTiposSetores: boolean): string {
  if (!hasQualificacoesTiposSetores) {
    return '';
  }

  return `
    LEFT JOIN (
      SELECT
        qts.tipo_id,
        qts.empresa_id,
        json_group_array(json_object('id', s.id, 'nome', s.nome)) AS setores_json,
        COUNT(*) AS setores_count
      FROM qualificacoes_tipos_setores qts
      INNER JOIN setores s
        ON s.id = qts.setor_id
       AND s.empresa_id = qts.empresa_id
       AND s.deleted_at IS NULL
      WHERE qts.deleted_at IS NULL
      GROUP BY qts.tipo_id, qts.empresa_id
    ) qtsa
      ON qtsa.tipo_id = qt.id
     AND qtsa.empresa_id = qt.empresa_id
  `;
}

function buildCategoriaJoin(): string {
  return `LEFT JOIN qualificacoes_categorias qc
    ON qc.nome = qt.categoria
   AND qc.empresa_id = qt.empresa_id
   AND qc.deleted_at IS NULL`;
}

async function listTipoSetores(
  db: D1Database,
  empresaId: number,
  tipoId: string,
): Promise<TipoSetor[]> {
  if (!(await hasQualificacoesTiposSetoresTable(db))) {
    return [];
  }

  const { results } = await db
    .prepare(
      `SELECT s.id, s.nome
         FROM qualificacoes_tipos_setores qts
         INNER JOIN setores s
           ON s.id = qts.setor_id
          AND s.empresa_id = qts.empresa_id
          AND s.deleted_at IS NULL
        WHERE qts.tipo_id = ?
          AND qts.empresa_id = ?
          AND qts.deleted_at IS NULL
        ORDER BY s.nome ASC`,
    )
    .bind(tipoId, empresaId)
    .all<TipoSetor>();

  return (results || []).map((row) => ({ id: Number(row.id), nome: String(row.nome) }));
}

async function syncTipoSetores(
  db: D1Database,
  empresaId: number,
  tipoId: string,
  setorIds: number[],
): Promise<void> {
  if (!(await hasQualificacoesTiposSetoresTable(db))) {
    throw new ApiError(
      'Tabela qualificacoes_tipos_setores não disponível. Aplique a migration antes de editar vínculos.',
      500,
      'QUALIFICACOES_TIPOS_SETORES_MISSING',
    );
  }

  const normalizedSetorIds = normalizeSetorIds(setorIds);

  if (normalizedSetorIds.length > 0) {
    const setorRows = await db
      .prepare(
        `SELECT id
           FROM setores
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND id IN (${normalizedSetorIds.map(() => '?').join(', ')})`,
      )
      .bind(empresaId, ...normalizedSetorIds)
      .all<{ id: number }>();

    const foundIds = new Set((setorRows.results || []).map((row) => Number(row.id)));
    if (foundIds.size !== normalizedSetorIds.length) {
      throw new ApiError('Um ou mais setores não pertencem à empresa', 400, 'SETOR_INVALIDO');
    }
  }

  const existing = await db
    .prepare(
      `SELECT id, setor_id, deleted_at
         FROM qualificacoes_tipos_setores
        WHERE tipo_id = ?
          AND empresa_id = ?`,
    )
    .bind(tipoId, empresaId)
    .all<{ id: number; setor_id: number; deleted_at: string | null }>();

  const activeBySetorId = new Map<number, { id: number; deleted_at: string | null }>();
  const deletedBySetorId = new Map<number, { id: number; deleted_at: string | null }>();

  for (const row of existing.results || []) {
    const normalizedSetorId = Number(row.setor_id);
    if (row.deleted_at) deletedBySetorId.set(normalizedSetorId, row);
    else activeBySetorId.set(normalizedSetorId, row);
  }

  const statements: D1PreparedStatement[] = [];

  for (const [existingSetorId, row] of activeBySetorId.entries()) {
    if (!normalizedSetorIds.includes(existingSetorId)) {
      statements.push(
        db
          .prepare(
            `UPDATE qualificacoes_tipos_setores
                SET deleted_at = datetime('now'),
                    updated_at = datetime('now')
              WHERE id = ?`,
          )
          .bind(row.id),
      );
    }
  }

  for (const setorId of normalizedSetorIds) {
    if (activeBySetorId.has(setorId)) {
      continue;
    }

    const deletedRow = deletedBySetorId.get(setorId);
    if (deletedRow) {
      statements.push(
        db
          .prepare(
            `UPDATE qualificacoes_tipos_setores
                SET deleted_at = NULL,
                    updated_at = datetime('now')
              WHERE id = ?`,
          )
          .bind(deletedRow.id),
      );
      continue;
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO qualificacoes_tipos_setores
             (tipo_id, setor_id, empresa_id, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, datetime('now'), datetime('now'), NULL)`,
        )
        .bind(tipoId, setorId, empresaId),
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

// ===== ENDPOINTS =====

/**
 * GET /tipos
 * Lista tipos de qualificações
 */
router.get(
  '/',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const columnsSupport = await loadQualificacoesTiposColumnsSupport(db);
    const hasIsCheck = columnsSupport.hasIsCheck;
    const hasQualificacoesTiposSetores = await hasQualificacoesTiposSetoresTable(db);
    const limitRaw = c.req.query('limit');
    const limitParsed = parseInt(limitRaw || '200', 10);
    const limitFinal = Math.min(Math.max(limitParsed, 1), 500);
    const categoria = String(c.req.query('categoria') || '').trim();
    const categoriaIdRaw = parseInt(c.req.query('categoria_id') || '', 10);
    const categoriaId = Number.isFinite(categoriaIdRaw) && categoriaIdRaw > 0 ? categoriaIdRaw : 0;
    const search = String(c.req.query('search') || '').trim();
    const requestedSetorIds = await validateRequestedSetorScope(
      access,
      parseRequestedSetorIds(c.req.query('setor_id'), c.req.query('setor_ids')),
    );
    const setorScope = buildTipoSetorVisibilityClause(
      access,
      hasQualificacoesTiposSetores,
      requestedSetorIds,
    );
    const conditions = ['qt.deleted_at IS NULL', 'qt.empresa_id = ?', setorScope.clause];
    const bindings: unknown[] = [empresaId, ...setorScope.bindings];

    if (categoriaId > 0) {
      conditions.push('qc.id = ?');
      bindings.push(categoriaId);
    } else if (categoria) {
      conditions.push('qt.categoria = ?');
      bindings.push(categoria);
    }

    if (search) {
      conditions.push('(qt.nome LIKE ? OR qt.codigo LIKE ? OR qt.categoria LIKE ?)');
      const like = `%${search}%`;
      bindings.push(like, like, like);
    }

    const { results } = await db
      .prepare(
        `SELECT qt.id, qt.tipo, qt.codigo, qt.nome, qt.descricao, qt.categoria,
        qc.id as categoria_id, qc.cor as categoria_cor,
        qt.carga_horaria, ${
          columnsSupport.hasCargaInicial ? 'carga_horaria_inicial' : 'NULL as carga_horaria_inicial'
        }, ${
          columnsSupport.hasCargaRecorrente
            ? 'carga_horaria_recorrente'
            : 'NULL as carga_horaria_recorrente'
        }, ${
          columnsSupport.hasConteudoProgramatico
            ? 'conteudo_programatico'
            : 'NULL as conteudo_programatico'
        }, qt.validade, qt.vencimento_fim_mes, qt.observacoes, qt.ativo, ${
          hasIsCheck ? 'is_check' : '0 as is_check'
        }, qt.created_at, qt.updated_at,
        (SELECT COUNT(*) FROM qualificacoes_historico qh WHERE qh.qualificacao_id = qt.id AND qh.deleted_at IS NULL) AS total_no_historico,
        ${buildSetoresAggregationSelect(hasQualificacoesTiposSetores)}
        FROM qualificacoes_tipos qt
        ${buildCategoriaJoin()}
        ${buildSetoresAggregationJoin(hasQualificacoesTiposSetores)}
        WHERE ${conditions.join(' AND ')}
        ORDER BY qt.categoria, qt.nome
        LIMIT ?`,
      )
      .bind(...bindings, limitFinal)
      .all<TipoQualificacaoRow>();

    return c.json({
      success: true,
      data: (results || []).map(enrichTipoRow),
      meta: { count: (results || []).length, limit: limitFinal },
    });
  }),
);

router.get(
  '/:id',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const columnsSupport = await loadQualificacoesTiposColumnsSupport(db);
    const hasIsCheck = columnsSupport.hasIsCheck;
    const hasQualificacoesTiposSetores = await hasQualificacoesTiposSetoresTable(db);
    const id = c.req.param('id');
    const setorScope = buildTipoSetorVisibilityClause(access, hasQualificacoesTiposSetores, []);

    const tipo = await db
      .prepare(
        `SELECT qt.id, qt.tipo, qt.codigo, qt.nome, qt.descricao, qt.categoria,
        qc.id as categoria_id, qc.cor as categoria_cor,
        qt.carga_horaria, ${
          columnsSupport.hasCargaInicial ? 'carga_horaria_inicial' : 'NULL as carga_horaria_inicial'
        }, ${
          columnsSupport.hasCargaRecorrente
            ? 'carga_horaria_recorrente'
            : 'NULL as carga_horaria_recorrente'
        }, ${
          columnsSupport.hasConteudoProgramatico
            ? 'conteudo_programatico'
            : 'NULL as conteudo_programatico'
        }, qt.validade, qt.vencimento_fim_mes, qt.observacoes, qt.ativo, ${
          hasIsCheck ? 'is_check' : '0 as is_check'
        }, qt.created_at, qt.updated_at,
        ${buildSetoresAggregationSelect(hasQualificacoesTiposSetores)}
        FROM qualificacoes_tipos qt
        ${buildCategoriaJoin()}
        ${buildSetoresAggregationJoin(hasQualificacoesTiposSetores)}
        WHERE qt.id = ? AND qt.deleted_at IS NULL AND qt.empresa_id = ? AND ${setorScope.clause}
        LIMIT 1`,
      )
      .bind(id, empresaId, ...setorScope.bindings)
      .first<TipoQualificacaoRow>();

    if (!tipo) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    return c.json({ success: true, data: enrichTipoRow(tipo) });
  }),
);

router.get(
  '/:id/setores',
  auth(),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const hasQualificacoesTiposSetores = await hasQualificacoesTiposSetoresTable(db);
    const id = c.req.param('id');
    const setorScope = buildTipoSetorVisibilityClause(access, hasQualificacoesTiposSetores, []);

    const tipo = await db
      .prepare(
        `SELECT qt.id
           FROM qualificacoes_tipos qt
          WHERE qt.id = ?
            AND qt.empresa_id = ?
            AND qt.deleted_at IS NULL
            AND ${setorScope.clause}
          LIMIT 1`,
      )
      .bind(id, empresaId, ...setorScope.bindings)
      .first<{ id: number }>();

    if (!tipo) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    const setores = await listTipoSetores(db, empresaId, id);
    return c.json({
      success: true,
      data: {
        tipo_id: Number(id),
        setores,
        is_transversal: setores.length === 0,
      },
    });
  }),
);

/**
 * POST /tipos
 * Cria novo tipo
 */
router.post(
  '/',
  auth(),
  requireRole('admin'),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const columnsSupport = await loadQualificacoesTiposColumnsSupport(db);
    const hasIsCheck = columnsSupport.hasIsCheck;
    const body = await c.req.json();

    // Validar com Zod
    const parsed = createTipoSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return c.json(
        {
          success: false,
          error: 'Validação falhou',
          details: errors,
        },
        400,
      );
    }

    const data = parsed.data;
    const codigo = normalizeTipoCodigo(data.codigo);
    const nome = data.nome.trim();
    const categoria = data.categoria.trim();

    // Verificar duplicidade
    const existing = await db
      .prepare(
        `SELECT id, empresa_id, deleted_at
           FROM qualificacoes_tipos
         WHERE UPPER(TRIM(codigo)) = ?
           AND empresa_id = ?
          LIMIT 1`,
      )
      .bind(codigo, empresaId)
      .first();

    const existingRow = existing as TipoExistenteRow | null;

    if (existingRow && !existingRow.deleted_at) {
      return c.json({ success: false, error: 'Código já existe' }, 409);
    }

    const validade = data.validade == null ? null : Number(data.validade);
    const cargaHorariaInicial =
      data.carga_horaria_inicial == null ? null : Number(data.carga_horaria_inicial);
    const cargaHorariaRecorrente =
      data.carga_horaria_recorrente == null ? null : Number(data.carga_horaria_recorrente);
    const conteudoProgramatico = data.conteudo_programatico?.trim() || null;
    const vencimentoFimMes = data.vencimento_fim_mes ? 1 : 0;
    const ativo = data.ativo === false ? 0 : 1;
    const isCheck = data.is_check ? 1 : 0;

    // Inserir
    const insertSql = hasIsCheck
      ? `INSERT INTO qualificacoes_tipos 
         (tipo, codigo, nome, descricao, categoria, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, conteudo_programatico, validade, vencimento_fim_mes, observacoes, ativo, is_check, empresa_id, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)`
      : `INSERT INTO qualificacoes_tipos 
         (tipo, codigo, nome, descricao, categoria, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, conteudo_programatico, validade, vencimento_fim_mes, observacoes, ativo, empresa_id, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL)`;

    const insertBinds: unknown[] = [
      deriveModeloTipo(validade, categoria),
      codigo,
      nome,
      data.descricao || null,
      categoria,
      cargaHorariaRecorrente,
      cargaHorariaInicial,
      cargaHorariaRecorrente,
      conteudoProgramatico,
      validade,
      vencimentoFimMes,
      data.observacoes || null,
      ativo,
    ];
    if (hasIsCheck) insertBinds.push(isCheck);
    insertBinds.push(empresaId);

    if (existing?.deleted_at) {
      const restoreSql = hasIsCheck
        ? `UPDATE qualificacoes_tipos
              SET tipo = ?,
                  codigo = ?,
                  nome = ?,
                  descricao = ?,
                  categoria = ?,
                  carga_horaria = ?,
                  carga_horaria_inicial = ?,
                  carga_horaria_recorrente = ?,
                  conteudo_programatico = ?,
                  validade = ?,
                  vencimento_fim_mes = ?,
                  observacoes = ?,
                  ativo = ?,
                  is_check = ?,
                  deleted_at = NULL,
                  updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ?`
        : `UPDATE qualificacoes_tipos
              SET tipo = ?,
                  codigo = ?,
                  nome = ?,
                  descricao = ?,
                  categoria = ?,
                  carga_horaria = ?,
                  carga_horaria_inicial = ?,
                  carga_horaria_recorrente = ?,
                  conteudo_programatico = ?,
                  validade = ?,
                  vencimento_fim_mes = ?,
                  observacoes = ?,
                  ativo = ?,
                  deleted_at = NULL,
                  updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ?`;

      const restoreBinds = [...insertBinds.slice(0, -1), existing.id, empresaId];

      await db
        .prepare(restoreSql)
        .bind(...restoreBinds)
        .run();

      const restored = await db
        .prepare(
          `SELECT id, empresa_id, tipo, codigo, nome, descricao, categoria, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, conteudo_programatico, validade, vencimento_fim_mes, observacoes, ativo, ${
            hasIsCheck ? 'is_check' : '0 as is_check'
          }, created_at, updated_at FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? LIMIT 1`,
        )
        .bind(existing.id, empresaId)
        .first();

      await logAuditoria(db, 'qualificacoes_tipos', String(existing.id), 'RESTORE');

      if (isEadCategoria(categoria) && (restored as { empresa_id?: number | null })?.empresa_id) {
        await syncLmsCourseFromQualificacaoTipo(db, {
          empresaId: Number((restored as { empresa_id: number }).empresa_id),
          qualificacaoTipoId: existing.id,
        });
        await reconcileImportedEdappHistory(db, {
          empresaId: Number((restored as { empresa_id: number }).empresa_id),
          qualificacaoTipoId: existing.id,
        });
      }

      return c.json(
        {
          success: true,
          data: restored,
          message: 'Tipo reativado com sucesso',
        },
        200,
      );
    }

    let result;
    try {
      result = await db
        .prepare(insertSql)
        .bind(...insertBinds)
        .run();
    } catch (error) {
      if (isTipoCodigoUniqueConstraintError(error)) {
        return c.json({ success: false, error: 'Código já existe' }, 409);
      }
      throw error;
    }

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao criar tipo' }, 500);
    }

    const newId = result.meta.last_row_id;

    // Buscar registro criado
    const created = await db
      .prepare(
        `SELECT id, empresa_id, tipo, codigo, nome, descricao, categoria, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente, conteudo_programatico, validade, vencimento_fim_mes, observacoes, ativo, ${
          hasIsCheck ? 'is_check' : '0 as is_check'
        }, created_at, updated_at FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? LIMIT 1`,
      )
      .bind(newId, empresaId)
      .first();

    // Auditoria
    await logAuditoria(db, 'qualificacoes_tipos', String(newId), 'CREATE');

    if (isEadCategoria(categoria) && (created as { empresa_id?: number | null })?.empresa_id) {
      await syncLmsCourseFromQualificacaoTipo(db, {
        empresaId: Number((created as { empresa_id: number }).empresa_id),
        qualificacaoTipoId: Number(newId),
      });
      await reconcileImportedEdappHistory(db, {
        empresaId: Number((created as { empresa_id: number }).empresa_id),
        qualificacaoTipoId: Number(newId),
      });
    }

    return c.json({ success: true, data: created, message: 'Tipo criado com sucesso' }, 201);
  }),
);

/**
 * PUT /tipos/:id
 * Atualiza tipo
 */
router.put(
  '/:id',
  auth(),
  requireRole('admin'),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const columnsSupport = await loadQualificacoesTiposColumnsSupport(db);
    const hasIsCheck = columnsSupport.hasIsCheck;
    const id = c.req.param('id');
    const body = await c.req.json();

    // Validar com Zod
    const parsed = updateTipoSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return c.json(
        {
          success: false,
          error: 'Validação falhou',
          details: errors,
        },
        400,
      );
    }

    const data = parsed.data;

    // Verificar se tipo existe
    const existing = await db
      .prepare(
        'SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(id, empresaId)
      .first();

    if (!existing) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    // Se atualizando código, verificar duplicidade
    if (data.codigo) {
      const codigoExistente = await db
        .prepare(
          'SELECT id FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) AND id != ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
        )
        .bind(normalizeTipoCodigo(data.codigo), id, empresaId)
        .first();

      if (codigoExistente) {
        return c.json({ success: false, error: 'Código já existe' }, 409);
      }
    }

    const rowAtual = (await db
      .prepare(
        'SELECT empresa_id, categoria, validade FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(id, empresaId)
      .first()) as { empresa_id: number; categoria: string | null; validade: number | null } | null;

    const categoriaFinal =
      data.categoria !== undefined
        ? (data.categoria || '').trim()
        : String(rowAtual?.categoria || '');
    const validadeFinal =
      data.validade !== undefined
        ? data.validade == null
          ? null
          : Number(data.validade)
        : (rowAtual?.validade ?? null);

    // Construir UPDATE dinâmico
    const updateParts: string[] = [];
    const binds: unknown[] = [];

    if (data.nome) {
      updateParts.push('nome = ?');
      binds.push(data.nome.trim());
    }
    if (data.codigo) {
      updateParts.push('codigo = ?');
      binds.push(normalizeTipoCodigo(data.codigo));
    }
    if (data.categoria) {
      updateParts.push('categoria = ?');
      binds.push(data.categoria.trim());
    }
    if (data.descricao !== undefined) {
      updateParts.push('descricao = ?');
      binds.push(data.descricao || null);
    }
    if (data.conteudo_programatico !== undefined) {
      updateParts.push('conteudo_programatico = ?');
      binds.push(data.conteudo_programatico || null);
    }
    if (data.carga_horaria_inicial !== undefined) {
      updateParts.push('carga_horaria_inicial = ?');
      binds.push(data.carga_horaria_inicial == null ? null : Number(data.carga_horaria_inicial));
    }
    if (data.carga_horaria_recorrente !== undefined) {
      updateParts.push('carga_horaria_recorrente = ?');
      binds.push(
        data.carga_horaria_recorrente == null ? null : Number(data.carga_horaria_recorrente),
      );
      updateParts.push('carga_horaria = ?');
      binds.push(
        data.carga_horaria_recorrente == null ? null : Number(data.carga_horaria_recorrente),
      );
    }
    if (data.validade !== undefined) {
      updateParts.push('validade = ?');
      binds.push(data.validade == null ? null : Number(data.validade));
    }
    if (data.categoria !== undefined || data.validade !== undefined) {
      updateParts.push('tipo = ?');
      binds.push(deriveModeloTipo(validadeFinal, categoriaFinal));
    }
    if (data.vencimento_fim_mes !== undefined) {
      updateParts.push('vencimento_fim_mes = ?');
      binds.push(data.vencimento_fim_mes ? 1 : 0);
    }
    if (data.observacoes !== undefined) {
      updateParts.push('observacoes = ?');
      binds.push(data.observacoes || null);
    }
    if (data.ativo !== undefined) {
      updateParts.push('ativo = ?');
      binds.push(data.ativo ? 1 : 0);
    }

    if (hasIsCheck && data.is_check !== undefined) {
      updateParts.push('is_check = ?');
      binds.push(data.is_check ? 1 : 0);
    }

    if (updateParts.length === 0) {
      return c.json({ success: false, error: 'Nada para atualizar' }, 400);
    }

    updateParts.push("updated_at = datetime('now')");
    const sql = `UPDATE qualificacoes_tipos SET ${updateParts.join(
      ', ',
    )} WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`;
    binds.push(id, empresaId);

    let result;
    try {
      result = await db
        .prepare(sql)
        .bind(...binds)
        .run();
    } catch (error) {
      if (isTipoCodigoUniqueConstraintError(error)) {
        return c.json({ success: false, error: 'Código já existe' }, 409);
      }
      throw error;
    }

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao atualizar tipo' }, 500);
    }

    let historicosSincronizados = 0;

    if (shouldSyncHistoricoSnapshotsOnTipoUpdate(data)) {
      const tipoAtualizado = (await db
        .prepare(
          `SELECT id, codigo, nome, categoria, validade, vencimento_fim_mes,
                  carga_horaria, carga_horaria_inicial, carga_horaria_recorrente
             FROM qualificacoes_tipos
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
            LIMIT 1`,
        )
        .bind(id, empresaId)
        .first()) as TipoAtualizadoRow | null;

      if (tipoAtualizado) {
        const historicos = (await db
          .prepare(
            `SELECT qh.id,
                    qh.funcionario_id,
                    qh.data_conclusao,
                    qh.data_vencimento,
                    qh.tipo_treinamento,
                    qh.qualificacao_codigo,
                    CASE
                      WHEN EXISTS(
                        SELECT 1
                          FROM qualificacoes_historico qh_conf
                         WHERE qh_conf.id != qh.id
                           AND qh_conf.deleted_at IS NULL
                           AND qh_conf.funcionario_id = qh.funcionario_id
                           AND COALESCE(qh_conf.data_conclusao, '') = COALESCE(qh.data_conclusao, '')
                           AND COALESCE(qh_conf.qualificacao_codigo, ?) = ?
                      ) THEN 1
                      ELSE 0
                    END AS conflito_codigo,
                    f.nascimento AS nascimento_funcionario
               FROM qualificacoes_historico qh
               LEFT JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
              WHERE qh.qualificacao_id = ?
                AND qh.empresa_id = ?
                AND qh.deleted_at IS NULL`,
          )
          .bind(tipoAtualizado.codigo, tipoAtualizado.codigo, id, empresaId)
          .all()) as { results?: HistoricoTipoSyncRow[] };

        const tipoSnapshot: QualificacaoTipoSnapshot = {
          codigo: tipoAtualizado.codigo,
          nome: tipoAtualizado.nome,
          categoria: tipoAtualizado.categoria,
          validade: tipoAtualizado.validade,
          vencimentoFimMes: tipoAtualizado.vencimento_fim_mes,
          cargaHoraria: tipoAtualizado.carga_horaria,
          cargaHorariaInicial: tipoAtualizado.carga_horaria_inicial,
          cargaHorariaRecorrente: tipoAtualizado.carga_horaria_recorrente,
        };

        const statements = (historicos.results || []).map((historico: HistoricoTipoSyncRow) => {
          const snapshot = buildHistoricoTipoSnapshot(tipoSnapshot, {
            dataConclusao: historico.data_conclusao,
            dataVencimentoAtual: historico.data_vencimento,
            tipoTreinamento: historico.tipo_treinamento,
            nascimentoFuncionario: historico.nascimento_funcionario,
          });
          const qualificacaoCodigoFinal =
            historico.conflito_codigo === 1 &&
            snapshot.qualificacaoCodigo !== historico.qualificacao_codigo
              ? historico.qualificacao_codigo
              : snapshot.qualificacaoCodigo;

          return db
            .prepare(
              `UPDATE qualificacoes_historico
                  SET qualificacao_codigo = ?,
                      tipo = ?,
                      categoria = ?,
                      validade_meses = ?,
                      data_vencimento = ?,
                      carga_horaria = ?,
                      updated_at = datetime('now')
                WHERE id = ?
                  AND empresa_id = ?
                  AND deleted_at IS NULL`,
            )
            .bind(
              qualificacaoCodigoFinal,
              snapshot.tipo,
              snapshot.categoria,
              snapshot.validadeMeses,
              snapshot.dataVencimento,
              snapshot.cargaHoraria,
              historico.id,
              empresaId,
            );
        });

        if (statements.length > 0) {
          await db.batch(statements);
          historicosSincronizados = statements.length;
          console.log(
            `[TIPOS_SYNC] ${historicosSincronizados} historicos sincronizados para tipo_id=${id}`,
          );
        }
      }
    }

    // Auditoria
    await logAuditoria(db, 'qualificacoes_tipos', id, 'UPDATE');

    const categoriaEraEad = isEadCategoria(rowAtual?.categoria);
    const categoriaEhEad = isEadCategoria(categoriaFinal);

    // ⚠️ qualificacoes_tipos.id é TEXT (UUID desde migration 0031) — usar string diretamente
    const qualificacaoTipoId = String(id);

    if (rowAtual?.empresa_id && categoriaEhEad) {
      console.log(
        `[TIPOS_EAD] Sync EAD/LMS para tipo_id=${qualificacaoTipoId}, empresa=${rowAtual.empresa_id}`,
      );
      await syncLmsCourseFromQualificacaoTipo(db, {
        empresaId: rowAtual.empresa_id,
        qualificacaoTipoId,
      });
      await reconcileImportedEdappHistory(db, {
        empresaId: rowAtual.empresa_id,
        qualificacaoTipoId,
      });
    } else if (rowAtual?.empresa_id && categoriaEraEad && !categoriaEhEad) {
      console.log(
        `[TIPOS_EAD] Soft-delete LMS para tipo_id=${qualificacaoTipoId} (não é mais EAD)`,
      );
      await softDeleteLmsCourseForQualificacaoTipo(db, {
        empresaId: rowAtual.empresa_id,
        qualificacaoTipoId,
      });
    }

    return c.json({
      success: true,
      data: { id, historicos_sincronizados: historicosSincronizados },
      message: 'Tipo atualizado',
    });
  }),
);

router.put(
  '/:id/setores',
  auth(),
  requireRole('admin'),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');
    const body = await c.req.json();

    const parsed = updateTipoSetoresSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: 'Validação falhou',
          details: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    }

    const tipo = await db
      .prepare(
        'SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(id, empresaId)
      .first<{ id: number }>();

    if (!tipo) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    const setorIds = normalizeSetorIds(parsed.data.setor_ids);
    await syncTipoSetores(db, empresaId, id, setorIds);
    await logAuditoria(db, 'qualificacoes_tipos_setores', String(id), 'SYNC');

    const setores = await listTipoSetores(db, empresaId, id);
    return c.json({
      success: true,
      data: {
        tipo_id: Number(id),
        setores,
        is_transversal: setores.length === 0,
      },
      message: 'Vínculos de setores atualizados',
    });
  }),
);

/**
 * DELETE /tipos/:id
 * Deleta tipo (soft delete)
 */
router.delete(
  '/:id',
  auth(),
  requireRole('admin'),
  safe(async (c) => {
    const db = c.env.DB;
    const { empresaId } = getTenantContext(c);
    const id = c.req.param('id');

    if (!id || id.trim() === '') {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const existing = await db
      .prepare(
        'SELECT id, nome, empresa_id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .bind(id, empresaId)
      .first();

    if (!existing) {
      return c.json({ success: false, error: 'Tipo não encontrado' }, 404);
    }

    // Soft delete
    const result = await db
      .prepare(
        "UPDATE qualificacoes_tipos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
      )
      .bind(id, empresaId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Falha ao deletar tipo' }, 500);
    }

    // Auditoria
    await logAuditoria(db, 'qualificacoes_tipos', id, 'DELETE');
    await softDeleteLmsCourseForQualificacaoTipo(db, {
      empresaId: Number((existing as { empresa_id: number }).empresa_id),
      qualificacaoTipoId: String(id),
    });

    return c.json({ success: true, message: 'Tipo deletado com sucesso' });
  }),
);

export default router;
