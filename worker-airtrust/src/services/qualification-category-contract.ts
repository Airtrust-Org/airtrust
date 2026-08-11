import { ApiError } from '../middleware/error-handler';

export type QualificationCategoryContract = {
  id: number;
  empresaId: number;
  nome: string;
  codigo: string;
  ativo: boolean;
  dominioCodigo: string | null;
  lmsIntegrada: boolean;
  lmsIntegrationSource: 'explicit' | 'legacy-code-compat';
};

type CategoryColumnSupport = {
  dominioCodigo: boolean;
  lmsIntegrada: boolean;
};

async function categoryColumnSupport(db: D1Database): Promise<CategoryColumnSupport> {
  const result = await db
    .prepare("PRAGMA table_info('qualificacoes_categorias')")
    .all<{ name?: string }>();
  const names = new Set((result.results || []).map((row) => String(row.name || '')));
  return {
    dominioCodigo: names.has('dominio_codigo'),
    lmsIntegrada: names.has('lms_integrada'),
  };
}

export async function resolveQualificationCategoryById(
  db: D1Database,
  params: {
    empresaId: number;
    categoriaId: number;
    requireActive?: boolean;
  },
): Promise<QualificationCategoryContract | null> {
  const support = await categoryColumnSupport(db);
  const row = await db
    .prepare(
      `SELECT id,
              empresa_id,
              nome,
              codigo,
              ativo,
              ${support.dominioCodigo ? 'dominio_codigo' : 'NULL'} AS dominio_codigo,
              ${support.lmsIntegrada ? 'COALESCE(lms_integrada, 0)' : 'NULL'} AS lms_integrada
         FROM qualificacoes_categorias
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
          ${params.requireActive ? 'AND ativo = 1' : ''}
        LIMIT 1`,
    )
    .bind(params.categoriaId, params.empresaId)
    .first<{
      id: number;
      empresa_id: number;
      nome: string;
      codigo: string;
      ativo: number;
      dominio_codigo: string | null;
      lms_integrada: number | null;
    }>();

  if (!row) return null;

  const normalizedCode = String(row.codigo || '')
    .trim()
    .toUpperCase();
  const explicitLmsIntegration = support.lmsIntegrada && Number(row.lms_integrada || 0) === 1;
  const legacyCodeCompatibility = !support.lmsIntegrada && normalizedCode === 'EAD';

  return {
    id: Number(row.id),
    empresaId: Number(row.empresa_id),
    nome: String(row.nome),
    codigo: normalizedCode,
    ativo: Number(row.ativo) === 1,
    dominioCodigo: row.dominio_codigo ? String(row.dominio_codigo) : null,
    lmsIntegrada: explicitLmsIntegration || legacyCodeCompatibility,
    lmsIntegrationSource: explicitLmsIntegration ? 'explicit' : 'legacy-code-compat',
  };
}

export async function requireActiveQualificationCategoryById(
  db: D1Database,
  empresaId: number,
  categoriaId: number,
): Promise<QualificationCategoryContract> {
  const category = await resolveQualificationCategoryById(db, {
    empresaId,
    categoriaId,
    requireActive: true,
  });
  if (!category) {
    throw new ApiError(
      'Categoria de qualificação não encontrada, inativa ou pertencente a outro tenant',
      422,
      'QUALIFICATION_CATEGORY_INVALID',
    );
  }
  return category;
}

export async function resolveTenantLmsIntegratedCategory(
  db: D1Database,
  empresaId: number,
): Promise<QualificationCategoryContract> {
  const support = await categoryColumnSupport(db);
  const integrationPredicate = support.lmsIntegrada
    ? 'COALESCE(lms_integrada, 0) = 1'
    : "UPPER(TRIM(codigo)) = 'EAD'";

  const rows = await db
    .prepare(
      `SELECT id
         FROM qualificacoes_categorias
        WHERE empresa_id = ?
          AND ativo = 1
          AND deleted_at IS NULL
          AND ${integrationPredicate}
        ORDER BY id`,
    )
    .bind(empresaId)
    .all<{ id: number }>();

  if ((rows.results || []).length !== 1) {
    throw new ApiError(
      'O tenant deve possuir exatamente uma categoria ativa integrada ao LMS',
      409,
      'LMS_CATEGORY_CONFIGURATION_INVALID',
    );
  }

  const category = await requireActiveQualificationCategoryById(
    db,
    empresaId,
    Number(rows.results![0]!.id),
  );
  if (!category.lmsIntegrada) {
    throw new ApiError(
      'Categoria LMS não possui contrato canônico válido',
      409,
      'LMS_CATEGORY_CONFIGURATION_INVALID',
    );
  }
  return category;
}

export async function assertQualificationCategoryCanBeDeactivated(
  db: D1Database,
  category: QualificationCategoryContract,
): Promise<void> {
  const references = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM qualificacoes_tipos
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND ativo = 1
          AND (
            categoria_id = ?
            OR (
              categoria_id IS NULL
              AND UPPER(TRIM(COALESCE(categoria, ''))) = UPPER(TRIM(?))
            )
          )`,
    )
    .bind(category.empresaId, category.id, category.nome)
    .first<{ total: number }>();

  if (Number(references?.total || 0) > 0) {
    throw new ApiError(
      `Categoria referenciada por ${Number(references?.total || 0)} modelo(s) ativo(s)`,
      409,
      'QUALIFICATION_CATEGORY_IN_USE',
    );
  }
}

export function categorySnapshot(category: QualificationCategoryContract) {
  return {
    categoria_id: category.id,
    categoria: category.nome,
    categoria_codigo: category.codigo,
  };
}
