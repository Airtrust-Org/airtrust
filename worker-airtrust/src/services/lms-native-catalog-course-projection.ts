/**
 * Read-only, tenant-scoped Native catalog display projection.
 *
 * Physical D1 CHECK still allows only 'scorm' / legacy types. A governed
 * side-table can mark a NEW empty SCORM-physical course as Native. Never
 * reveal that course as SCORM to the LMS UI when staging reads are enabled.
 * No flag => no extra query, no behavior change to production.
 */
import { ApiError } from '../middleware/error-handler';
import type { Env } from '../types';
import { canReadNativeCatalogActivation } from './lms-native-catalog-legacy-guard';
import { hasSchemaTable } from '../utils/db-schema';

export async function projectNativeCatalogCourses<T extends Record<string, unknown>>(
  env: Env, empresaId: number, rows: readonly T[],
): Promise<T[]> {
  if (!rows.length || env.ENVIRONMENT !== 'staging') return [...rows];
  // The catalog flag only permits Native execution. After a marker has been
  // recorded, disabling that flag must not display the course as legacy SCORM.
  if (!canReadNativeCatalogActivation(env, empresaId)) {
    try {
      if (!(await hasSchemaTable(env.DB, 'lms_native_catalog_activation', { fresh: true }))) {
        return [...rows];
      }
    } catch {
      throw new ApiError('Identidade do catálogo Native indisponível.', 503,
        'NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED');
    }
  }
  const courseIds = rows.map((row) => Number(row.id));
  if (courseIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(courseIds).size !== courseIds.length) {
    throw new ApiError('Identificadores inválidos no catálogo LMS.', 503,
      'NATIVE_CATALOG_INVALID_COURSE_IDS');
  }
  // IDs are strictly validated integers; all values remain bound parameters.
  const placeholders = courseIds.map(() => '?').join(',');
  let marked: { success?: boolean; results?: { curso_id: number }[] } | null;
  try {
    marked = await env.DB.prepare(
      'SELECT curso_id FROM lms_native_catalog_activation ' +
      'WHERE empresa_id = ? AND curso_id IN (' + placeholders + ')',
    ).bind(empresaId, ...courseIds).all<{ curso_id: number }>();
  } catch {
    throw new ApiError('Catálogo Native indisponível para identificação dos cursos.',
      503, 'NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED');
  }
  if (!marked || marked.success !== true || !Array.isArray(marked.results)) {
    throw new ApiError('Resultado inválido na projeção do catálogo Native.',
      503, 'NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED');
  }
  const markedIds = new Set<number>();
  const knownIds = new Set(courseIds);
  for (const { curso_id } of marked.results) {
    if (!Number.isSafeInteger(curso_id) || !knownIds.has(curso_id) || markedIds.has(curso_id)) {
      throw new ApiError('Inconsistência na classificação de cursos Native.', 503,
        'NATIVE_CATALOG_ACTIVATION_CONFLICT');
    }
    markedIds.add(curso_id);
  }
  return rows.map((row) => {
    if (!markedIds.has(Number(row.id))) return row;
    if (String(row.tipo_conteudo ?? '').trim().toLowerCase() !== 'scorm') {
      throw new ApiError('Tipo do curso incompatível com ativação Native.',
        503, 'NATIVE_CATALOG_ACTIVATION_CONFLICT');
    }
    return { ...row, tipo_conteudo: 'native' };
  });
}

/** Reclassify enrollment rows by their course_id, not the matrícula id. */
export async function projectNativeCatalogEnrollments<T extends Record<string, unknown>>(
  env: Env, empresaId: number, rows: readonly T[],
): Promise<T[]> {
  if (!rows.length || env.ENVIRONMENT !== 'staging') return [...rows];
  const courses = new Map<number, string>();
  for (const row of rows) {
    const id = Number(row.curso_id);
    const type = String(row.tipo_conteudo ?? '').trim().toLowerCase();
    if (!Number.isSafeInteger(id) || id <= 0 ||
        !['scorm','native','h5p','pdf','pptx','video'].includes(type) ||
        (courses.has(id) && courses.get(id) !== type)) {
      throw new ApiError('Matrícula com identidade de curso inválida.', 503,
        'NATIVE_CATALOG_INVALID_ENROLLMENT_COURSE');
    }
    courses.set(id,type);
  }
  const projected = await projectNativeCatalogCourses(env, empresaId,
    [...courses].map(([id, tipo_conteudo]) => ({ id, tipo_conteudo })));
  const effective = new Map(projected.map(row => [row.id, row.tipo_conteudo]));
  return rows.map(row => {
    const type = effective.get(Number(row.curso_id));
    return type === row.tipo_conteudo ? row : { ...row, tipo_conteudo: type };
  });
}
