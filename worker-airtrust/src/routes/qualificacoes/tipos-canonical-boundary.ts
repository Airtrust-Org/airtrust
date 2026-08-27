import { Hono, type Context } from 'hono';
import type { Env } from '../../types';
import legacyTiposRouter from './tipos';
import { auth } from '../../middleware/auth';
import {
  requireActiveQualificationCategoryById,
  resolveQualificationCategoryById,
} from '../../services/qualification-category-contract';
import {
  reconcileImportedEdappHistory,
  softDeleteLmsCourseForQualificacaoTipo,
  syncLmsCourseFromQualificacaoTipo,
} from '../../services/lms-ead-ssot';
import { getTenantContext } from '../../middleware/tenant';
import { ApiError } from '../../middleware/error-handler';

const router = new Hono<{ Bindings: Env }>();
router.use('*', auth());

type JsonObject = Record<string, unknown>;

type CanonicalTypeCategoryRow = {
  tipo_id: string | number;
  categoria_id: number | null;
  categoria_snapshot: string | null;
  categoria_nome: string | null;
  categoria_codigo: string | null;
  categoria_ativo: number | null;
  categoria_dominio_codigo: string | null;
  categoria_lms_integrada: number;
};

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function categoryHasColumn(db: D1Database, column: string): Promise<boolean> {
  const info = await db
    .prepare("PRAGMA table_info('qualificacoes_categorias')")
    .all<{ name?: string }>();
  return (info.results || []).some((row) => row.name === column);
}

// D1 impõe um teto de variáveis ligadas por consulta (SQLITE_MAX_VARIABLE_NUMBER).
// O filtro `qt.id IN (...)` usa um placeholder por tipo (+1 do empresa_id). Com o
// teto de listagem elevado de 75 para 500 (c35b6f25), uma única consulta passou a
// estourar esse limite quando a listagem tinha 100+ linhas, retornando 500
// ("D1_ERROR: too many SQL variables"). Dividimos os IDs em lotes de até 99
// (99 ids + 1 empresa_id = 100 variáveis) e consolidamos em um único Map.
const MAX_D1_BIND_VARIABLES = 100;
const CATEGORY_ROWS_CHUNK_SIZE = MAX_D1_BIND_VARIABLES - 1;

export async function loadCanonicalCategoryRows(
  db: D1Database,
  empresaId: number,
  tipoIds: Array<string | number>,
): Promise<Map<string, CanonicalTypeCategoryRow>> {
  const uniqueIds = [...new Set(tipoIds.map((id) => String(id)).filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const hasDomain = await categoryHasColumn(db, 'dominio_codigo');
  const hasLmsFlag = await categoryHasColumn(db, 'lms_integrada');

  const buildSql = (chunkSize: number) =>
    `SELECT qt.id AS tipo_id,
            qt.categoria_id,
            qt.categoria AS categoria_snapshot,
            qc.nome AS categoria_nome,
            qc.codigo AS categoria_codigo,
            qc.ativo AS categoria_ativo,
            ${hasDomain ? 'qc.dominio_codigo' : 'NULL'} AS categoria_dominio_codigo,
            ${
              hasLmsFlag
                ? 'COALESCE(qc.lms_integrada, 0)'
                : "CASE WHEN UPPER(TRIM(COALESCE(qc.codigo, ''))) = 'EAD' THEN 1 ELSE 0 END"
            } AS categoria_lms_integrada
       FROM qualificacoes_tipos qt
       LEFT JOIN qualificacoes_categorias qc
         ON qc.id = qt.categoria_id
        AND qc.empresa_id = qt.empresa_id
        AND qc.deleted_at IS NULL
      WHERE qt.empresa_id = ?
        AND qt.deleted_at IS NULL
        AND qt.id IN (${Array.from({ length: chunkSize }, () => '?').join(', ')})`;

  const rows: CanonicalTypeCategoryRow[] = [];
  for (let index = 0; index < uniqueIds.length; index += CATEGORY_ROWS_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + CATEGORY_ROWS_CHUNK_SIZE);
    const result = await db
      .prepare(buildSql(chunk.length))
      .bind(empresaId, ...chunk)
      .all<CanonicalTypeCategoryRow>();
    rows.push(...(result.results || []));
  }

  return new Map(rows.map((row) => [String(row.tipo_id), row]));
}

function stripLegacyFormat(row: JsonObject): JsonObject {
  const copy = { ...row };
  delete copy.formato_id;
  delete copy.formato_codigo;
  delete copy.formato_nome;
  delete copy.formato_cor;
  return copy;
}

function overlayCanonicalCategory(
  row: JsonObject,
  category: CanonicalTypeCategoryRow | undefined,
): JsonObject {
  const clean = stripLegacyFormat(row);
  if (!category) return clean;
  return {
    ...clean,
    categoria_id: category.categoria_id,
    categoria: category.categoria_nome ?? category.categoria_snapshot,
    categoria_codigo: category.categoria_codigo,
    categoria_ativa: category.categoria_ativo === 1,
    categoria_dominio_codigo: category.categoria_dominio_codigo,
    categoria_lms_integrada: category.categoria_lms_integrada === 1,
  };
}

function collectRows(payload: unknown): JsonObject[] {
  if (Array.isArray(payload)) return payload.filter(isJsonObject);
  if (!isJsonObject(payload)) return [];
  const data = payload.data;
  if (Array.isArray(data)) return data.filter(isJsonObject);
  if (isJsonObject(data)) return [data];
  return [];
}

function replaceRows(payload: unknown, rows: JsonObject[]): unknown {
  if (Array.isArray(payload)) return rows;
  if (!isJsonObject(payload)) return payload;
  if (Array.isArray(payload.data)) return { ...payload, data: rows };
  if (isJsonObject(payload.data)) return { ...payload, data: rows[0] ?? payload.data };
  return payload;
}

async function parseSuccessfulJson(c: Context<{ Bindings: Env }>): Promise<unknown | null> {
  if (c.res.status < 200 || c.res.status >= 300) return null;
  const contentType = c.res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  return c.res
    .clone()
    .json()
    .catch(() => null);
}

function replaceJsonResponse(c: Context<{ Bindings: Env }>, payload: unknown): void {
  const headers = new Headers(c.res.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=UTF-8');
  c.res = new Response(JSON.stringify(payload), {
    status: c.res.status,
    statusText: c.res.statusText,
    headers,
  });
}

async function enforceCanonicalWriteInput(c: Context<{ Bindings: Env }>): Promise<void> {
  if (!['POST', 'PUT', 'PATCH'].includes(c.req.method)) return;
  const original = (await c.req.json()) as JsonObject;
  const categoryId = Number(original.categoria_id || 0);
  const hasCategoryId = Number.isInteger(categoryId) && categoryId > 0;
  const hasTextCategory =
    typeof original.categoria === 'string' && original.categoria.trim().length > 0;

  if (hasTextCategory && !hasCategoryId) {
    throw new ApiError(
      'categoria textual não é aceita; informe categoria_id',
      422,
      'CATEGORY_ID_REQUIRED',
    );
  }
  if (c.req.method === 'POST' && !hasCategoryId) {
    throw new ApiError('categoria_id é obrigatório', 422, 'CATEGORY_ID_REQUIRED');
  }

  const normalized = { ...original };
  if (hasCategoryId) {
    const { empresaId } = getTenantContext(c);
    const category = await requireActiveQualificationCategoryById(c.env.DB, empresaId, categoryId);
    normalized.categoria_id = category.id;
  }
  delete normalized.categoria;
  delete normalized.formato;
  delete normalized.formato_id;

  Object.defineProperty(c.req, 'json', {
    configurable: true,
    value: async () => normalized,
  });
}

async function reconcileLmsMirror(
  db: D1Database,
  empresaId: number,
  categoryRows: Map<string, CanonicalTypeCategoryRow>,
): Promise<void> {
  for (const [tipoId, category] of categoryRows) {
    if (
      category.categoria_id &&
      category.categoria_ativo === 1 &&
      category.categoria_lms_integrada === 1
    ) {
      await syncLmsCourseFromQualificacaoTipo(db, {
        empresaId,
        qualificacaoTipoId: tipoId,
      });
      await reconcileImportedEdappHistory(db, {
        empresaId,
        qualificacaoTipoId: tipoId,
      });
    } else {
      await softDeleteLmsCourseForQualificacaoTipo(db, {
        empresaId,
        qualificacaoTipoId: tipoId,
      });
    }
  }
}

router.use('*', async (c, next) => {
  try {
    await enforceCanonicalWriteInput(c);
    await next();

    const payload = await parseSuccessfulJson(c);
    if (payload === null) return;
    const rows = collectRows(payload);
    if (rows.length === 0) return;

    const ids = rows
      .map((row) => row.id)
      .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number');
    if (ids.length === 0) return;

    const { empresaId } = getTenantContext(c);
    const categories = await loadCanonicalCategoryRows(c.env.DB, empresaId, ids);
    const nextRows = rows.map((row) =>
      overlayCanonicalCategory(row, categories.get(String(row.id))),
    );

    if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
      await reconcileLmsMirror(c.env.DB, empresaId, categories);
    }
    replaceJsonResponse(c, replaceRows(payload, nextRows));
  } catch (error) {
    if (error instanceof ApiError) {
      c.res = c.json(
        { success: false, error: error.message, code: error.code },
        error.statusCode as 400 | 403 | 404 | 409 | 422 | 500,
      );
      return;
    }
    throw error;
  }
});

router.route('/', legacyTiposRouter);

export async function resolveCanonicalCategoryForType(
  db: D1Database,
  empresaId: number,
  tipoId: string | number,
) {
  const rows = await loadCanonicalCategoryRows(db, empresaId, [tipoId]);
  const row = rows.get(String(tipoId));
  if (!row?.categoria_id) return null;
  return resolveQualificationCategoryById(db, {
    empresaId,
    categoriaId: row.categoria_id,
  });
}

export default router;
