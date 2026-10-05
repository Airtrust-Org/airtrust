import { ApiError } from '../middleware/error-handler';
import {
  filterRequestedSetorIdsByAccess,
  type EmployeeSectorAccess,
} from '../services/employee-sector-access';
import { getSchemaColumns } from '../utils/db-schema';

export function buildCourseSetorScope(
  access: EmployeeSectorAccess,
  courseAlias = 'c',
  schema: { hasCursoSetores: boolean; hasQualificacaoTipoSetores: boolean } = {
    hasCursoSetores: true,
    hasQualificacaoTipoSetores: true,
  },
): { clause: string; bindings: number[] } {
  if (access.mode === 'all') return { clause: '', bindings: [] };
  if (access.setorIds.length === 0) return { clause: ' AND 1 = 0', bindings: [] };
  if (!schema.hasCursoSetores && !schema.hasQualificacaoTipoSetores) {
    return { clause: ' AND 1 = 0', bindings: [] };
  }

  const placeholders = access.setorIds.map(() => '?').join(', ');
  const directScope = schema.hasCursoSetores
    ? `EXISTS (
        SELECT 1 FROM lms_cursos_setores lcs_f
        WHERE lcs_f.curso_id = ${courseAlias}.id
          AND lcs_f.empresa_id = ${courseAlias}.empresa_id
          AND lcs_f.setor_id IN (${placeholders})
          AND lcs_f.deleted_at IS NULL
      )`
    : '';
  const fallbackScope = schema.hasQualificacaoTipoSetores
    ? `(
        ${
          schema.hasCursoSetores
            ? `NOT EXISTS (
          SELECT 1 FROM lms_cursos_setores lcs_chk
          WHERE lcs_chk.curso_id = ${courseAlias}.id
            AND lcs_chk.empresa_id = ${courseAlias}.empresa_id
            AND lcs_chk.deleted_at IS NULL
        )
        AND `
            : ''
        }${courseAlias}.qualificacao_tipo_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM qualificacoes_tipos_setores qts_f
          WHERE qts_f.tipo_id = ${courseAlias}.qualificacao_tipo_id
            AND qts_f.empresa_id = ${courseAlias}.empresa_id
            AND qts_f.setor_id IN (${placeholders})
            AND qts_f.deleted_at IS NULL
        )
      )`
    : '';
  const scopeClauses = [directScope, fallbackScope].filter(Boolean);

  if (scopeClauses.length === 0) {
    return { clause: ' AND 1 = 0', bindings: [] };
  }

  const bindings =
    schema.hasCursoSetores && schema.hasQualificacaoTipoSetores
      ? [...access.setorIds, ...access.setorIds]
      : access.setorIds;

  return {
    clause: ` AND (${scopeClauses.join(' OR ')})`,
    bindings,
  };
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  try {
    const row = await db
      .prepare(
        `SELECT 1 AS ok
           FROM sqlite_master
          WHERE type = 'table'
            AND name = ?
          LIMIT 1`,
      )
      .bind(tableName)
      .first<{ ok: number }>();
    return row?.ok === 1;
  } catch {
    return true;
  }
}

export async function getCourseSetorSchema(db: D1Database): Promise<{
  hasCursoSetores: boolean;
  hasQualificacaoTipoSetores: boolean;
  hasLmsCursosFormato: boolean;
  hasLmsCursosDominioCodigo: boolean;
}> {
  const [hasCursoSetores, hasQualificacaoTipoSetores, lmsCursosColumns] = await Promise.all([
    tableExists(db, 'lms_cursos_setores'),
    tableExists(db, 'qualificacoes_tipos_setores'),
    getSchemaColumns(db, 'lms_cursos'),
  ]);
  const hasLmsCursosFormato = lmsCursosColumns.has('formato_id');
  const hasLmsCursosDominioCodigo = lmsCursosColumns.has('dominio_codigo');

  return {
    hasCursoSetores,
    hasQualificacaoTipoSetores,
    hasLmsCursosFormato,
    hasLmsCursosDominioCodigo,
  };
}

function assertSetorIdsWithinWriteScope(access: EmployeeSectorAccess, setorIds: number[]): void {
  if (access.mode === 'all') return;
  if (setorIds.length === 0) {
    throw new ApiError('Acesso negado: curso fora do seu escopo de setor', 403);
  }

  const allowedSetorIds = filterRequestedSetorIdsByAccess(setorIds, access);
  if (allowedSetorIds.length !== setorIds.length) {
    throw new ApiError('Acesso negado: setor fora do seu escopo', 403);
  }
}

async function listQualificacaoTipoSetorIds(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number | null | undefined,
  schema: { hasQualificacaoTipoSetores: boolean },
): Promise<number[]> {
  if (!schema.hasQualificacaoTipoSetores || !qualificacaoTipoId) return [];

  const rows = await db
    .prepare(
      `SELECT DISTINCT qts.setor_id
         FROM qualificacoes_tipos_setores qts
        WHERE qts.tipo_id = ?
          AND qts.empresa_id = ?
          AND qts.deleted_at IS NULL
        ORDER BY qts.setor_id ASC`,
    )
    .bind(qualificacaoTipoId, empresaId)
    .all<{ setor_id: number }>();

  return (rows.results ?? [])
    .map((row) => Number(row.setor_id))
    .filter((setorId) => Number.isInteger(setorId) && setorId > 0);
}

export async function assertCursoWriteScope(params: {
  db: D1Database;
  empresaId: number;
  access: EmployeeSectorAccess;
  schema: { hasCursoSetores: boolean; hasQualificacaoTipoSetores: boolean };
  setorIds: number[];
  qualificacaoTipoId: number | null | undefined;
}): Promise<void> {
  const { db, empresaId, access, schema, setorIds, qualificacaoTipoId } = params;

  if (access.mode === 'all') return;
  if (!schema.hasCursoSetores && !schema.hasQualificacaoTipoSetores) {
    throw new ApiError('Acesso negado: curso fora do seu escopo de setor', 403);
  }

  if (setorIds.length > 0) {
    if (!schema.hasCursoSetores) {
      throw new ApiError('Acesso negado: curso fora do seu escopo de setor', 403);
    }
    assertSetorIdsWithinWriteScope(access, setorIds);
    return;
  }

  const qualificacaoTipoSetorIds = await listQualificacaoTipoSetorIds(
    db,
    empresaId,
    qualificacaoTipoId,
    schema,
  );
  assertSetorIdsWithinWriteScope(access, qualificacaoTipoSetorIds);
}
