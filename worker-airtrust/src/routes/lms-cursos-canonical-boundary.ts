import { Hono, type Context } from 'hono';
import type { Env } from '../types';
import legacyRoutes from './lms-cursos-legacy';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from './escalas-shared';
import { requireActiveQualificationCategoryById } from '../services/qualification-category-contract';

const router = new Hono<{ Bindings: Env }>();

type JsonObject = Record<string, unknown>;

type CourseBinding = {
  cursoId: number | null;
  tipoId: number | null;
  categoriaId: number | null;
  categoriaNome: string | null;
  categoriaCodigo: string | null;
  dominioCodigo: string | null;
  lmsIntegrada: boolean;
};

type ExistingCourseBinding = {
  tipoId: number | null;
  gerarQualificacao: boolean;
};

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadExistingCourseBinding(
  db: D1Database,
  empresaId: number,
  courseId: number | null,
): Promise<ExistingCourseBinding | null> {
  if (!courseId) return null;
  const row = await db
    .prepare(
      `SELECT qualificacao_tipo_id,
              gerar_qualificacao_ao_concluir
         FROM lms_cursos
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(courseId, empresaId)
    .first<{
      qualificacao_tipo_id: number | null;
      gerar_qualificacao_ao_concluir: number | null;
    }>();
  if (!row) return null;
  return {
    tipoId: positiveInteger(row.qualificacao_tipo_id),
    gerarQualificacao: Number(row.gerar_qualificacao_ao_concluir || 0) === 1,
  };
}

export function shouldValidateCourseQualificationBinding(params: {
  courseId: number | null;
  existingBinding: ExistingCourseBinding | null;
  requestedTipoId: number | null;
  requestedGerarQualificacao: boolean;
}) {
  if (!params.courseId || !params.existingBinding) {
    return params.requestedTipoId !== null;
  }
  return (
    params.requestedTipoId !== params.existingBinding.tipoId ||
    params.requestedGerarQualificacao !== params.existingBinding.gerarQualificacao
  );
}

async function resolveCourseBinding(
  db: D1Database,
  empresaId: number,
  tipoId: number,
): Promise<CourseBinding> {
  const type = await db
    .prepare(
      `SELECT qt.id,
              qt.categoria_id,
              COALESCE(qt.dominio_codigo, qc.dominio_codigo) AS dominio_codigo
         FROM qualificacoes_tipos qt
         LEFT JOIN qualificacoes_categorias qc
           ON qc.id = qt.categoria_id
          AND qc.empresa_id = qt.empresa_id
          AND qc.deleted_at IS NULL
        WHERE qt.id = ?
          AND qt.empresa_id = ?
          AND qt.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(tipoId, empresaId)
    .first<{ id: number; categoria_id: number | null; dominio_codigo: string | null }>();

  if (!type?.categoria_id) {
    throw new ApiError(
      'Tipo de qualificação sem categoria_id canônico',
      422,
      'LMS_QUALIFICATION_MAPPING_INVALID',
    );
  }

  const category = await requireActiveQualificationCategoryById(db, empresaId, type.categoria_id);
  if (!category.lmsIntegrada) {
    throw new ApiError(
      'A categoria do tipo não está integrada ao LMS',
      422,
      'LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED',
    );
  }

  return {
    cursoId: null,
    tipoId,
    categoriaId: category.id,
    categoriaNome: category.nome,
    categoriaCodigo: category.codigo,
    dominioCodigo: type.dominio_codigo || category.dominioCodigo,
    lmsIntegrada: true,
  };
}

function courseIdFromPath(c: Context<{ Bindings: Env }>): number | null {
  const raw = c.req.param('id');
  return positiveInteger(raw);
}

async function normalizeCourseWrite(c: Context<{ Bindings: Env }>): Promise<CourseBinding | null> {
  if (!['POST', 'PUT', 'PATCH'].includes(c.req.method)) return null;
  const contentType = c.req.header('content-type') || '';
  if (!contentType.includes('application/json')) return null;

  const empresaId = getEmpresaIdSafe(c);
  const original = (await c.req.json()) as JsonObject;
  const courseId = courseIdFromPath(c);
  const existingBinding = await loadExistingCourseBinding(c.env.DB, empresaId, courseId);
  const hasExplicitTypeId = Object.prototype.hasOwnProperty.call(original, 'qualificacao_tipo_id');
  const explicitTypeId = positiveInteger(original.qualificacao_tipo_id);
  const tipoId = hasExplicitTypeId ? explicitTypeId : (existingBinding?.tipoId ?? null);
  const hasExplicitGerarQualificacao = Object.prototype.hasOwnProperty.call(
    original,
    'gerar_qualificacao_ao_concluir',
  );
  const gerarQualificacao = hasExplicitGerarQualificacao
    ? original.gerar_qualificacao_ao_concluir === true ||
      Number(original.gerar_qualificacao_ao_concluir || 0) === 1
    : (existingBinding?.gerarQualificacao ?? false);
  const legacyFormatRequested = positiveInteger(original.formato_id) !== null;
  const legacyEadText = ['EAD', 'TREINAMENTO EAD'].includes(
    String(original.categoria || '')
      .trim()
      .toUpperCase(),
  );

  if (!tipoId && (gerarQualificacao || legacyFormatRequested || legacyEadText)) {
    throw new ApiError(
      'Curso que gera qualificação deve informar qualificacao_tipo_id canônico',
      422,
      'LMS_QUALIFICATION_MAPPING_INVALID',
    );
  }

  const normalized: JsonObject = { ...original };
  delete normalized.formato;
  delete normalized.formato_id;
  delete normalized.formato_codigo;

  const validateBinding = shouldValidateCourseQualificationBinding({
    courseId,
    existingBinding,
    requestedTipoId: tipoId,
    requestedGerarQualificacao: gerarQualificacao,
  });

  let binding: CourseBinding | null = null;
  if (tipoId && validateBinding) {
    binding = await resolveCourseBinding(c.env.DB, empresaId, tipoId);
    normalized.qualificacao_tipo_id = tipoId;
    normalized.gerar_qualificacao_ao_concluir = gerarQualificacao ? 1 : 0;
    // Compatibility value consumed by the monolithic legacy handler only.
    // The DB trigger overwrites it with the canonical category snapshot.
    normalized.categoria = 'EAD';
    normalized.dominio_codigo = binding.dominioCodigo;
  } else if (!tipoId) {
    normalized.qualificacao_tipo_id = null;
    normalized.gerar_qualificacao_ao_concluir = 0;
  }

  Object.defineProperty(c.req, 'json', {
    configurable: true,
    value: async () => normalized,
  });
  return binding ? { ...binding, cursoId: courseId } : null;
}

function scrubLegacyFormat(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubLegacyFormat);
  if (!isJsonObject(value)) return value;
  const clean: JsonObject = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'formato' || key === 'formato_id' || key === 'formato_codigo') continue;
    clean[key] = scrubLegacyFormat(nested);
  }
  return clean;
}

async function canonicalizeResponse(
  c: Context<{ Bindings: Env }>,
  requestBinding: CourseBinding | null,
): Promise<void> {
  if (c.res.status < 200 || c.res.status >= 300) return;
  if (!(c.res.headers.get('content-type') || '').includes('application/json')) return;
  const payload = await c.res
    .clone()
    .json()
    .catch(() => null);
  if (payload === null) return;

  const scrubbed = scrubLegacyFormat(payload);
  if (requestBinding && isJsonObject(scrubbed)) {
    const data = isJsonObject(scrubbed.data) ? scrubbed.data : null;
    if (data) {
      data.categoria_id = requestBinding.categoriaId;
      data.categoria = requestBinding.categoriaNome;
      data.categoria_codigo = requestBinding.categoriaCodigo;
      data.dominio_codigo = requestBinding.dominioCodigo;
      data.categoria_lms_integrada = true;
    }
  }

  const headers = new Headers(c.res.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=UTF-8');
  c.res = new Response(JSON.stringify(scrubbed), {
    status: c.res.status,
    statusText: c.res.statusText,
    headers,
  });
}

router.use('*', async (c, next) => {
  try {
    const binding = await normalizeCourseWrite(c);
    await next();
    await canonicalizeResponse(c, binding);
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

router.route('/', legacyRoutes);

export default router;
