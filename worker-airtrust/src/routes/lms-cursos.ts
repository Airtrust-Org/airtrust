/**
 * LMS — Rotas de Cursos
 * CRUD do catálogo, upload e extração de pacotes SCORM para R2.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { unzipSync, strFromU8 } from 'fflate';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from './escalas-shared';
import {
  employeeSectorSql,
  filterRequestedSetorIdsByAccess,
  getEmployeeSectorAccess,
  type EmployeeSectorAccess,
} from '../services/employee-sector-access';
import { logAudit } from '../utils/db';
import { getAuditContextSnapshot } from '../lib/audit/context';
import { recordAuditEventV2 } from '../lib/audit/audit-events-v2';
import {
  ensureQualificacaoTipoForCurso,
  isEadCategoria,
  isEadFormato,
  reconcileImportedEdappHistory,
  resolveCanonicalEadQualificacaoTipoId,
  syncAllEadCoursesFromQualificacoes,
  syncLmsCourseFromQualificacaoTipo,
  syncQualificacaoTipoFromCurso,
} from '../services/lms-ead-ssot';
import { CANONICAL_TRAINING_CATEGORY } from '../services/lms-ead-ssot';
import type { Env, AppEnv } from '../types';

const app = new Hono<{ Bindings: Env }>();
const LMS_PACKAGE_MAX_BYTES = 512 * 1024 * 1024;
const LMS_SCORM_ALLOWED_EXTENSIONS = new Set(['.zip']);
const LMS_H5P_ALLOWED_EXTENSIONS = new Set(['.h5p', '.zip']);
const LMS_CURSOS_SELECT_COLUMNS = `
  id,
  empresa_id,
  titulo,
  descricao,
  categoria,
  carga_horaria_minutos,
  idioma,
  thumbnail_r2_key,
  scorm_versao,
  scorm_package_r2_prefix,
  scorm_launch_file,
  scorm_mastery_score,
  qualificacao_tipo_id,
  gerar_qualificacao_ao_concluir,
  ativo,
  publicado,
  version_tag,
  created_at,
  updated_at,
  deleted_at,
  tipo_conteudo,
  conteudo_programatico,
  observacoes,
  carga_horaria_inicial_horas,
  carga_horaria_recorrente_horas,
  pdf_r2_key,
  pptx_r2_key,
  pptx_slide_count,
  conteudo_arquivo_nome
`;

app.use('*', auth());

function buildCourseSetorScope(
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
        ${schema.hasCursoSetores
          ? `NOT EXISTS (
          SELECT 1 FROM lms_cursos_setores lcs_chk
          WHERE lcs_chk.curso_id = ${courseAlias}.id
            AND lcs_chk.empresa_id = ${courseAlias}.empresa_id
            AND lcs_chk.deleted_at IS NULL
        )
        AND `
          : ''}${courseAlias}.qualificacao_tipo_id IS NOT NULL
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

async function hasColumn(db: D1Database, table: string, column: string): Promise<boolean> {
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
    return (results || []).some((col: any) => col?.name === column);
  } catch {
    return false;
  }
}

async function getCourseSetorSchema(db: D1Database): Promise<{
  hasCursoSetores: boolean;
  hasQualificacaoTipoSetores: boolean;
  hasLmsCursosFormato: boolean;
}> {
  const [hasCursoSetores, hasQualificacaoTipoSetores, hasLmsCursosFormato] = await Promise.all([
    tableExists(db, 'lms_cursos_setores'),
    tableExists(db, 'qualificacoes_tipos_setores'),
    hasColumn(db, 'lms_cursos', 'formato_id'),
  ]);

  return { hasCursoSetores, hasQualificacaoTipoSetores, hasLmsCursosFormato };
}

function assertSetorIdsWithinWriteScope(
  access: EmployeeSectorAccess,
  setorIds: number[],
): void {
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

async function assertCursoWriteScope(params: {
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

function buildMatriculaEmployeeScope(
  access: EmployeeSectorAccess,
  matriculaAlias = 'm',
): { clause: string; bindings: number[] } {
  if (access.mode === 'all') return { clause: '', bindings: [] };
  if (access.mode === 'self') {
    return { clause: ` AND ${matriculaAlias}.funcionario_id = ?`, bindings: [access.funcionarioId] };
  }
  if (access.setorIds.length === 0) return { clause: ' AND 1 = 0', bindings: [] };

  const placeholders = access.setorIds.map(() => '?').join(', ');
  return {
    clause: ` AND EXISTS (
      SELECT 1 FROM funcionarios f_scope
      WHERE f_scope.id = ${matriculaAlias}.funcionario_id
        AND f_scope.empresa_id = ${matriculaAlias}.empresa_id
        AND f_scope.deleted_at IS NULL
        AND f_scope.setor_id IN (${placeholders})
    )`,
    bindings: access.setorIds,
  };
}

function getCallerUserId(
  c: Context,
) {
  const raw: unknown = c.get('userId');
  const parsed = typeof raw === 'string' ? Number(raw) : (raw as number | null | undefined);
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : undefined;
}

async function logLmsCourseAudit(
  db: D1Database,
  c: Context,
  params: {
    action: string;
    cursoId: number;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  },
) {
  try {
    await logAudit(db, {
      userId: getCallerUserId(c),
      action: params.action,
      entityType: 'lms_cursos',
      entityId: params.cursoId,
      oldValues: params.oldValues,
      newValues: params.newValues,
      ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? undefined,
      userAgent: c.req.header('user-agent') ?? undefined,
    });
  } catch (error) {
    console.warn('[LMS] Falha ao registrar audit log de curso:', error);
  }

  const env = c.env as unknown as Record<string, unknown>;
  if (env.AUDIT_EVENTS_V2_DUAL_WRITE !== 'true') return;

  const context = getAuditContextSnapshot(c);
  try {
    await recordAuditEventV2(db, {
      empresaId: getEmpresaIdSafe(c),
      actorUserId: context.userId,
      actorEmpresaId: context.empresaId,
      actorRole: context.userRole,
      requestId: context.requestId,
      eventCategory: 'ADMIN_OPERATION',
      eventAction: params.action,
      entityType: 'lms_cursos',
      entityId: params.cursoId,
      riskLevel: 'high',
      retentionClass: 'SECURITY_LONG',
      metadata: {
        module: 'lms',
        resource_kind: 'course',
      },
    });
  } catch {
    console.warn('[LMS] Falha inesperada no audit v2 de curso');
  }
}

// ── Schemas ─────────────────────────────────────────────────────────────────

const trimNullableText = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}, z.string().nullable().optional());

const intWithDefault = (fallback: number, min: number, max?: number) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === '') return fallback;
      return value;
    },
    max === undefined ? z.number().int().min(min) : z.number().int().min(min).max(max),
  );

const optionalNullablePositiveInt = z.preprocess((value) => {
  if (value === '') return null;
  return value;
}, z.number().int().positive().nullable().optional());

const optionalNullableScormVersion = z.preprocess(
  (value) => {
    if (value === '') return null;
    return value;
  },
  z.enum(['1.2', '2004']).nullable().optional(),
);

const optionalNullableNonNegativeNumber = z.preprocess((value) => {
  if (value === '') return null;
  return value;
}, z.number().nonnegative().nullable().optional());

const binaryFlagWithDefault = (fallback: 0 | 1) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === '') return fallback;
      if (value === true) return 1;
      if (value === false) return 0;
      return value;
    },
    z.union([z.literal(0), z.literal(1)]),
  );

const optionalBinaryFlag = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === true) return 1;
    if (value === false) return 0;
    return value;
  },
  z.union([z.literal(0), z.literal(1)]).optional(),
);

function ensureQualificacaoBinding(
  gerarQualificacao: number | undefined,
  qualificacaoTipoId: number | null | undefined,
  isEadCourse: boolean,
) {
  if (gerarQualificacao === 1 && !qualificacaoTipoId && !isEadCourse) {
    throw new ApiError(
      'Selecione um tipo de qualificação antes de ativar a geração automática, ou marque o curso como EAD pelo formato para criá-lo automaticamente.',
      400,
    );
  }
}

async function resolveEadQualificacaoBinding(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number | null | undefined,
  options?: { allowMissingForEad?: boolean },
) {
  if (!qualificacaoTipoId) return null;

  const tipo = await db
    .prepare(
      `SELECT qt.id, qt.nome, qt.categoria, qf.codigo AS formato_codigo
       FROM qualificacoes_tipos qt
       LEFT JOIN qualificacoes_formatos qf
         ON qf.id = qt.formato_id
        AND qf.deleted_at IS NULL
       WHERE qt.id = ? AND qt.empresa_id = ? AND qt.deleted_at IS NULL`,
    )
    .bind(qualificacaoTipoId, empresaId)
    .first<{ id: number; nome: string; categoria: string | null; formato_codigo: string | null }>();

  if (!tipo) {
    if (options?.allowMissingForEad) return null;
    throw new ApiError('Tipo de qualificação não encontrado para esta empresa.', 404);
  }

  if (!isEadFormato(tipo)) {
    throw new ApiError(
      `O curso LMS só pode ser vinculado a tipos de qualificação EAD. "${tipo.nome}" está na categoria ${tipo.categoria ?? 'sem categoria'} / formato ${tipo.formato_codigo ?? 'sem formato'}.`,
      400,
    );
  }

  return resolveCanonicalEadQualificacaoTipoId(db, empresaId, tipo.id);
}

async function isLegacyNonEadQualificacaoBinding(
  db: D1Database,
  empresaId: number,
  qualificacaoTipoId: number | null | undefined,
) {
  if (!qualificacaoTipoId) return false;

  const tipo = await db
    .prepare(
      `SELECT qt.categoria, qf.codigo AS formato_codigo
       FROM qualificacoes_tipos qt
       LEFT JOIN qualificacoes_formatos qf
         ON qf.id = qt.formato_id
        AND qf.deleted_at IS NULL
       WHERE qt.id = ? AND qt.empresa_id = ? AND qt.deleted_at IS NULL`,
    )
    .bind(qualificacaoTipoId, empresaId)
    .first<{ categoria: string | null; formato_codigo: string | null }>();

  if (!tipo) return false;

  return !isEadFormato(tipo);
}

async function isEadCourseRequest(
  db: D1Database,
  empresaId: number,
  params: {
    qualificacaoTipoId?: number | null;
    formatoId?: number | null;
    categoria?: string | null;
  },
) {
  if (params.qualificacaoTipoId) {
    try {
      await resolveEadQualificacaoBinding(db, empresaId, params.qualificacaoTipoId, {
        allowMissingForEad: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  return isEadCategoria(params.categoria);
}

type EadQualificacaoTipoRow = {
  id: number;
  empresa_id: number;
  nome: string;
  codigo: string | null;
  categoria: string | null;
  descricao: string | null;
  conteudo_programatico: string | null;
  observacoes: string | null;
  carga_horaria: number | null;
  carga_horaria_inicial: number | null;
  carga_horaria_recorrente: number | null;
};

type SyncableCursoRow = {
  id: number;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  carga_horaria_minutos: number | null;
  qualificacao_tipo_id: number | null;
  gerar_qualificacao_ao_concluir: number;
  conteudo_programatico: string | null;
  observacoes: string | null;
  carga_horaria_inicial_horas: number | null;
  carga_horaria_recorrente_horas: number | null;
};

function normalizeNullableText(value: string | null | undefined) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hoursToMinutes(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.round(value * 60));
}

function resolveCursoCargaHorariaMinutos(tipo: EadQualificacaoTipoRow) {
  return hoursToMinutes(
    tipo.carga_horaria_recorrente ?? tipo.carga_horaria_inicial ?? tipo.carga_horaria,
  );
}

function buildEadCursoSeed(tipo: EadQualificacaoTipoRow) {
  const descricao = normalizeNullableText(tipo.descricao);

  return {
    titulo: tipo.nome.trim(),
    descricao:
      descricao ??
      `Curso LMS espelhado automaticamente do tipo de qualificação EAD ${tipo.nome.trim()}.`,
    categoria: CANONICAL_TRAINING_CATEGORY,
    carga_horaria_minutos: resolveCursoCargaHorariaMinutos(tipo),
    conteudo_programatico: normalizeNullableText(tipo.conteudo_programatico),
    observacoes: normalizeNullableText(tipo.observacoes),
    carga_horaria_inicial_horas: normalizeNullableNumber(tipo.carga_horaria_inicial),
    carga_horaria_recorrente_horas: normalizeNullableNumber(tipo.carga_horaria_recorrente),
  };
}

async function listEmpresaEadQualificacaoTipos(db: D1Database, empresaId: number) {
  const result = await db
    .prepare(
      `SELECT qt.id,
              qt.empresa_id,
              qt.nome,
              qt.codigo,
              qt.categoria,
              qf.codigo AS formato_codigo,
              qt.descricao,
              qt.conteudo_programatico,
              qt.observacoes,
              qt.carga_horaria,
              qt.carga_horaria_inicial,
              qt.carga_horaria_recorrente
         FROM qualificacoes_tipos qt
         LEFT JOIN qualificacoes_formatos qf
           ON qf.id = qt.formato_id
          AND qf.deleted_at IS NULL
        WHERE qt.empresa_id = ?
          AND qt.deleted_at IS NULL
          AND (
            UPPER(TRIM(COALESCE(qf.codigo, ''))) = 'EAD'
            OR UPPER(TRIM(COALESCE(qt.categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')
          )
        ORDER BY qt.nome ASC`,
    )
    .bind(empresaId)
    .all<EadQualificacaoTipoRow>();

  return result.results ?? [];
}

async function syncEadCoursesFromQualificacoes(
  db: D1Database,
  empresaId: number,
  c: Context,
) {
  const result = await syncAllEadCoursesFromQualificacoes(db, empresaId);

  for (const cursoId of result.created) {
    await logLmsCourseAudit(db, c, {
      action: 'LMS_CURSO_EAD_SINCRONIZADO',
      cursoId,
      newValues: { criado_automaticamente: true },
    });
  }

  for (const cursoId of result.updated) {
    await logLmsCourseAudit(db, c, {
      action: 'LMS_CURSO_EAD_SINCRONIZADO',
      cursoId,
      newValues: { atualizado_automaticamente: true },
    });
  }

  return result;
}

function normalizeR2Path(path: string): string {
  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    throw new ApiError('Caminho inválido', 400);
  }

  const normalized = decodedPath.replace(/^\/+/, '').replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new ApiError('Caminho inválido', 400);
  }

  return segments.join('/');
}

function sanitizeArchivePath(path: string): string | null {
  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    throw new ApiError('Caminho inválido', 400);
  }

  const rawNormalized = decodedPath.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!rawNormalized || rawNormalized.endsWith('/') || rawNormalized.startsWith('__MACOSX/')) {
    return null;
  }

  const normalized = normalizeR2Path(path);

  if (!normalized || normalized.startsWith('__MACOSX/')) {
    return null;
  }

  return normalized;
}

const setorIdsSchema = z.preprocess(
  (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return value;
  },
  z.array(z.number().int().positive()).optional(),
);

const CursoCreateSchema = z.object({
  titulo: z.string().min(2).max(255),
  descricao: trimNullableText,
  categoria: trimNullableText,
  carga_horaria_minutos: intWithDefault(0, 0),
  conteudo_programatico: trimNullableText,
  observacoes: trimNullableText,
  carga_horaria_inicial_horas: optionalNullableNonNegativeNumber,
  carga_horaria_recorrente_horas: optionalNullableNonNegativeNumber,
  idioma: z.preprocess(
    (value) => (value === null || value === undefined || value === '' ? 'pt-BR' : value),
    z.string(),
  ),
  tipo_conteudo: z.preprocess(
    (value) => (value === null || value === undefined || value === '' ? 'scorm' : value),
    z.enum(['scorm', 'h5p', 'video', 'pdf', 'pptx']),
  ),
  scorm_versao: optionalNullableScormVersion,
  scorm_mastery_score: intWithDefault(70, 0, 100),
  qualificacao_tipo_id: optionalNullablePositiveInt,
  gerar_qualificacao_ao_concluir: binaryFlagWithDefault(0),
  publicado: binaryFlagWithDefault(0),
  setor_ids: setorIdsSchema,
  formato_id: z.number().int().positive().nullable().optional(),
});

const CursoUpdateSchema = z.object({
  titulo: z.string().min(2).max(255).optional(),
  descricao: trimNullableText,
  categoria: trimNullableText,
  carga_horaria_minutos: z.preprocess(
    (value) => (value === null || value === '' ? 0 : value),
    z.number().int().min(0).optional(),
  ),
  conteudo_programatico: trimNullableText,
  observacoes: trimNullableText,
  carga_horaria_inicial_horas: optionalNullableNonNegativeNumber,
  carga_horaria_recorrente_horas: optionalNullableNonNegativeNumber,
  idioma: z.preprocess((value) => (value === '' ? 'pt-BR' : value), z.string().optional()),
  tipo_conteudo: z.enum(['scorm', 'h5p', 'video', 'pdf', 'pptx']).optional(),
  scorm_versao: optionalNullableScormVersion,
  scorm_mastery_score: z.preprocess(
    (value) => (value === null || value === '' ? 70 : value),
    z.number().int().min(0).max(100).optional(),
  ),
  qualificacao_tipo_id: optionalNullablePositiveInt,
  gerar_qualificacao_ao_concluir: optionalBinaryFlag,
  publicado: optionalBinaryFlag,
  ativo: optionalBinaryFlag,
  version_tag: trimNullableText,
  setor_ids: setorIdsSchema,
  formato_id: z.number().int().positive().nullable().optional(),
});

const StructuredContentInitSchema = z.object({
  tipo_conteudo: z.enum(['scorm', 'h5p']),
  skip_purge: z.boolean().optional(),
});

const StructuredContentCompleteSchema = z.object({
  tipo_conteudo: z.enum(['scorm', 'h5p']),
  launch_file: trimNullableText,
  scorm_versao: optionalNullableScormVersion,
  tipo_h5p: trimNullableText,
  arquivo_nome: trimNullableText,
  files_uploaded: z.number().int().min(1).optional(),
  uploaded_paths: z.array(z.string().trim().min(1)).min(1).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePositiveInt(val: string | null | undefined, fallback: number) {
  const n = parseInt(val ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseNullableText(
  value: string | null | undefined,
): string | null | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseOptionalInt(value: string | null | undefined): number | null | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBinary(value: string | null | undefined): 0 | 1 | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === '1' || value.toLowerCase() === 'true') return 1;
  if (value === '0' || value.toLowerCase() === 'false') return 0;
  return undefined;
}

function parseOptionalScormVersion(
  value: string | null | undefined,
): '1.2' | '2004' | null | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.trim() === '') return null;
  return value === '1.2' || value === '2004' ? value : undefined;
}

function pickUploadFile(formData: FormData): File | null {
  for (const key of ['arquivo', 'file', 'h5p', 'scorm']) {
    const entry = formData.get(key) as File | string | null;
    if (entry instanceof File) return entry;
  }
  return null;
}

function normalizeUploadFileName(file: File | null): string | null {
  const fileName = file?.name?.trim();
  return fileName ? fileName : null;
}

function validatePackageBytes(bytes: Uint8Array) {
  if (bytes.length === 0) throw new ApiError('Arquivo vazio', 400);
  if (bytes.length > LMS_PACKAGE_MAX_BYTES) {
    throw new ApiError('Pacote excede o limite máximo de 512 MB', 400);
  }
}

function validatePackageFile(file: File, tipoConteudo: 'scorm' | 'h5p') {
  const normalizedName = file.name.trim().toLowerCase();
  const allowedExtensions =
    tipoConteudo === 'scorm' ? LMS_SCORM_ALLOWED_EXTENSIONS : LMS_H5P_ALLOWED_EXTENSIONS;

  if (normalizedName) {
    const isAllowed = [...allowedExtensions].some((extension) =>
      normalizedName.endsWith(extension),
    );
    if (!isAllowed) {
      throw new ApiError(
        tipoConteudo === 'scorm'
          ? 'Envie um arquivo .zip válido para o conteúdo SCORM'
          : 'Envie um arquivo .h5p ou .zip válido para o conteúdo H5P',
        400,
      );
    }
  }
}

const LMS_THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;
const LMS_THUMBNAIL_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

function pickThumbnailFile(formData: FormData): File | null {
  for (const key of ['thumbnail', 'cover', 'image', 'file']) {
    const entry = formData.get(key) as File | string | null;
    if (entry instanceof File) return entry;
  }
  return null;
}

function resolveThumbnailContentType(file: File) {
  const declaredType = file.type.trim().toLowerCase();
  if (LMS_THUMBNAIL_ALLOWED_MIME_TYPES.has(declaredType)) return declaredType;

  const guessedType = guessMime(file.name).split(';')[0]?.trim().toLowerCase() ?? '';
  if (LMS_THUMBNAIL_ALLOWED_MIME_TYPES.has(guessedType)) return guessedType;

  throw new ApiError('Formato de imagem inválido. Use PNG, JPG, WEBP ou GIF.', 400);
}

function getThumbnailExtension(contentType: string) {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}

async function uploadCursoThumbnail(params: {
  db: D1Database;
  bucket: R2Bucket;
  empresaId: number;
  cursoId: number;
  file: File;
}) {
  const curso = await params.db
    .prepare(
      'SELECT id, thumbnail_r2_key FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(params.cursoId, params.empresaId)
    .first<{ id: number; thumbnail_r2_key: string | null }>();

  if (!curso) throw new ApiError('Curso não encontrado', 404);

  const contentType = resolveThumbnailContentType(params.file);
  const bytes = new Uint8Array(await params.file.arrayBuffer());

  if (bytes.length === 0) {
    throw new ApiError('A imagem enviada está vazia.', 400);
  }

  if (bytes.length > LMS_THUMBNAIL_MAX_BYTES) {
    throw new ApiError('A capa excede o limite de 5 MB.', 400);
  }

  const versionTag = new Date().toISOString();
  const key = `lms/course-thumbnails/${params.empresaId}/${params.cursoId}/${Date.now()}.${getThumbnailExtension(contentType)}`;

  await params.bucket.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=86400',
    },
  });

  if (curso.thumbnail_r2_key && curso.thumbnail_r2_key !== key) {
    try {
      await params.bucket.delete(curso.thumbnail_r2_key);
    } catch (error) {
      console.warn('[LMS] Falha ao remover thumbnail antigo do curso:', error);
    }
  }

  await params.db
    .prepare(
      `
      UPDATE lms_cursos
      SET thumbnail_r2_key = ?,
          version_tag = ?,
          updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ?
    `,
    )
    .bind(key, versionTag, params.cursoId, params.empresaId)
    .run();

  return { thumbnail_r2_key: key, version_tag: versionTag };
}

async function parseCursoCreateRequest(
  c: Context,
) {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const rawSetorIds = formData.get('setor_ids');
    const parsedSetorIds: number[] = [];
    if (typeof rawSetorIds === 'string' && rawSetorIds.trim()) {
      for (const s of rawSetorIds.split(',')) {
        const n = parseInt(s.trim(), 10);
        if (Number.isFinite(n) && n > 0) parsedSetorIds.push(n);
      }
    }
    const payload = {
      titulo: String(formData.get('titulo') ?? '').trim(),
      descricao: parseNullableText(formData.get('descricao')),
      categoria: parseNullableText(formData.get('categoria')),
      carga_horaria_minutos: parseOptionalInt(formData.get('carga_horaria_minutos')),
      idioma: String(formData.get('idioma') ?? 'pt-BR').trim() || 'pt-BR',
      tipo_conteudo: String(formData.get('tipo_conteudo') ?? 'scorm').trim() || 'scorm',
      scorm_versao: parseOptionalScormVersion(formData.get('scorm_versao')),
      scorm_mastery_score: parseOptionalInt(formData.get('scorm_mastery_score')),
      qualificacao_tipo_id: parseOptionalInt(formData.get('qualificacao_tipo_id')),
      gerar_qualificacao_ao_concluir: parseOptionalBinary(
        formData.get('gerar_qualificacao_ao_concluir'),
      ),
      publicado: parseOptionalBinary(formData.get('publicado')),
      setor_ids: parsedSetorIds.length > 0 ? parsedSetorIds : undefined,
    };

    const parsed = CursoCreateSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
    }

    return { data: parsed.data, uploadFile: pickUploadFile(formData) };
  }

  const body = await c.req.json<unknown>();
  const parsed = CursoCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
  }

  return { data: parsed.data, uploadFile: null };
}

async function validateSetorIds(
  db: D1Database,
  empresaId: number,
  setorIds: number[],
): Promise<void> {
  if (setorIds.length === 0) return;
  const placeholders = setorIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT id FROM setores WHERE id IN (${placeholders}) AND empresa_id = ? AND ativo = 1`,
    )
    .bind(...setorIds, empresaId)
    .all<{ id: number }>();
  const found = new Set((rows.results ?? []).map((r) => r.id));
  const invalid = setorIds.filter((id) => !found.has(id));
  if (invalid.length > 0) {
    throw new ApiError(`Setor(es) inválido(s) para esta empresa: ${invalid.join(', ')}`, 400);
  }
}

async function upsertCursoSetores(
  db: D1Database,
  empresaId: number,
  cursoId: number,
  setorIds: number[],
): Promise<void> {
  if (setorIds.length === 0) return;
  for (const setorId of setorIds) {
    await db
      .prepare(
        `INSERT INTO lms_cursos_setores (curso_id, setor_id, empresa_id)
         VALUES (?, ?, ?)
         ON CONFLICT DO UPDATE SET deleted_at = NULL, updated_at = datetime('now')`,
      )
      .bind(cursoId, setorId, empresaId)
      .run();
  }
}

async function replaceCursoSetores(
  db: D1Database,
  empresaId: number,
  cursoId: number,
  setorIds: number[],
): Promise<void> {
  await db
    .prepare(
      `UPDATE lms_cursos_setores
       SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE curso_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(cursoId, empresaId)
    .run();
  await upsertCursoSetores(db, empresaId, cursoId, setorIds);
}

async function getCursoSetores(
  db: D1Database,
  empresaId: number,
  cursoId: number,
): Promise<{ id: number; nome: string }[]> {
  const rows = await db
    .prepare(
      `SELECT s.id, s.nome
       FROM lms_cursos_setores cs
       JOIN setores s ON s.id = cs.setor_id
       WHERE cs.curso_id = ? AND cs.empresa_id = ? AND cs.deleted_at IS NULL
       ORDER BY s.nome ASC`,
    )
    .bind(cursoId, empresaId)
    .all<{ id: number; nome: string }>();
  return rows.results ?? [];
}

async function getCursoSetorIds(
  db: D1Database,
  empresaId: number,
  cursoId: number,
  schema: { hasCursoSetores: boolean },
): Promise<number[]> {
  if (!schema.hasCursoSetores) return [];
  const setores = await getCursoSetores(db, empresaId, cursoId);
  return setores.map((setor) => Number(setor.id)).filter((setorId) => setorId > 0);
}

/** Extrai launch file do imsmanifest.xml (SCORM 1.2 e 2004) */
function parseLaunchFile(manifestXml: string): string | null {
  // SCORM 1.2: <item ... href="..."> dentro de <resources>
  // SCORM 2004: <resource ... href="...">
  const resourceMatch = manifestXml.match(/<resource[^>]+href="([^"]+)"/i);
  if (resourceMatch) return resourceMatch[1] ?? null;
  const itemMatch = manifestXml.match(/<item[^>]+identifierref="([^"]+)"/i);
  if (itemMatch) {
    const resId = itemMatch[1];
    const refMatch = new RegExp(`identifier="${resId}"[^>]*href="([^"]+)"`, 'i').exec(manifestXml);
    if (refMatch) return refMatch[1] ?? null;
  }
  return null;
}

/** Deterimna versão SCORM pelo imsmanifest.xml */
function parseScormVersion(manifestXml: string): '1.2' | '2004' {
  if (manifestXml.includes('adlcp:schemaversion') && manifestXml.includes('2004')) return '2004';
  if (manifestXml.includes('1.2')) return '1.2';
  return '1.2';
}

function getStructuredUploadPrefix(
  tipoConteudo: 'scorm' | 'h5p',
  empresaId: number,
  cursoId: number,
) {
  return `lms/${tipoConteudo}/${empresaId}/${cursoId}/`;
}

async function purgeStructuredUploadPrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({ prefix, cursor });
    const keys = listed.objects.map((item) => item.key);

    if (keys.length > 0) {
      await bucket.delete(keys);
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function purgeStructuredCourseAssets(
  bucket: R2Bucket,
  empresaId: number,
  cursoId: number,
  params?: { keepTipo?: 'scorm' | 'h5p' },
) {
  const tipos: Array<'scorm' | 'h5p'> = ['scorm', 'h5p'];

  await Promise.all(
    tipos
      .filter((tipo) => tipo !== params?.keepTipo)
      .map((tipo) =>
        purgeStructuredUploadPrefix(bucket, getStructuredUploadPrefix(tipo, empresaId, cursoId)),
      ),
  );
}

async function getCursoUploadContext(db: D1Database, empresaId: number, cursoId: number) {
  const curso = await db
    .prepare(
      'SELECT id, empresa_id, titulo FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(cursoId, empresaId)
    .first<{ id: number; empresa_id: number; titulo: string }>();

  if (!curso) throw new ApiError('Curso não encontrado', 404);

  return curso;
}

async function verifyStructuredUploadPresence(params: {
  bucket: R2Bucket;
  prefix: string;
  expectedCount?: number;
  uploadedPaths?: string[];
}) {
  const expectedKeys = params.uploadedPaths?.length
    ? new Set(
        params.uploadedPaths.map((path) => {
          const normalizedPath = sanitizeArchivePath(path);
          if (!normalizedPath) {
            throw new ApiError('Caminho de arquivo inválido', 400);
          }
          return params.prefix + normalizedPath;
        }),
      )
    : null;

  let listedCount = 0;
  let confirmedExpected = 0;
  let cursor: string | undefined;

  do {
    const listed = await params.bucket.list({ prefix: params.prefix, cursor, limit: 1000 });
    listedCount += listed.objects.length;

    if (expectedKeys) {
      for (const obj of listed.objects) {
        if (expectedKeys.has(obj.key)) confirmedExpected++;
      }
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  if (expectedKeys) {
    if (confirmedExpected < expectedKeys.size) {
      throw new ApiError(
        `Upload incompleto: ${confirmedExpected}/${expectedKeys.size} arquivos confirmados no storage`,
        500,
      );
    }
    return;
  }

  if (params.expectedCount && listedCount < params.expectedCount) {
    throw new ApiError(
      `Upload incompleto: ${listedCount}/${params.expectedCount} arquivos confirmados no storage`,
      500,
    );
  }
}

async function finalizeStructuredContentUpload(
  bucket: R2Bucket,
  db: D1Database,
  empresaId: number,
  cursoId: number,
  cursoTitulo: string,
  tipoConteudo: 'scorm' | 'h5p',
  meta: {
    launchFile?: string | null;
    scormVersao?: '1.2' | '2004' | null;
    tipoH5p?: string | null;
    arquivoNome?: string | null;
  },
) {
  const prefix = getStructuredUploadPrefix(tipoConteudo, empresaId, cursoId);

  if (tipoConteudo === 'scorm') {
    if (!meta.launchFile) {
      throw new ApiError('Launch file SCORM não informado', 400);
    }

    await db
      .prepare(
        `
        UPDATE lms_cursos
        SET scorm_package_r2_prefix = ?,
            scorm_launch_file = ?,
            scorm_versao = ?,
            conteudo_arquivo_nome = ?,
            version_tag = ?,
            updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?
      `,
      )
      .bind(
        prefix,
        normalizeR2Path(meta.launchFile),
        meta.scormVersao ?? null,
        meta.arquivoNome ?? null,
        new Date().toISOString(),
        cursoId,
        empresaId,
      )
      .run();

    await purgeStructuredCourseAssets(bucket, empresaId, cursoId, { keepTipo: 'scorm' });

    return {
      prefix,
      launch_file: normalizeR2Path(meta.launchFile),
      scorm_versao: meta.scormVersao ?? null,
      conteudo_arquivo_nome: meta.arquivoNome ?? null,
    };
  }

  const existing = await db
    .prepare(
      `
      SELECT id
      FROM lms_h5p_conteudos
      WHERE empresa_id = ? AND titulo = ? AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .bind(empresaId, cursoTitulo)
    .first<{ id: number }>();

  let h5pId: number;
  if (existing) {
    await db
      .prepare(
        `
        UPDATE lms_h5p_conteudos
        SET r2_key = ?, tipo_h5p = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?
      `,
      )
      .bind(prefix, meta.tipoH5p ?? 'CoursePresentation', existing.id, empresaId)
      .run();
    h5pId = existing.id;
  } else {
    const result = await db
      .prepare(
        'INSERT INTO lms_h5p_conteudos (empresa_id, titulo, tipo_h5p, r2_key) VALUES (?,?,?,?)',
      )
      .bind(empresaId, cursoTitulo, meta.tipoH5p ?? 'CoursePresentation', prefix)
      .run();
    h5pId = result.meta.last_row_id;
  }

  await db
    .prepare(
      `
      UPDATE lms_cursos
      SET tipo_conteudo = 'h5p',
          scorm_package_r2_prefix = ?,
          scorm_launch_file = NULL,
          conteudo_arquivo_nome = ?,
          updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ?
    `,
    )
    .bind(prefix, meta.arquivoNome ?? null, cursoId, empresaId)
    .run();

  await purgeStructuredCourseAssets(bucket, empresaId, cursoId, { keepTipo: 'h5p' });

  return {
    h5p_id: h5pId,
    prefix,
    tipo_h5p: meta.tipoH5p ?? 'CoursePresentation',
    conteudo_arquivo_nome: meta.arquivoNome ?? null,
  };
}

async function processScormUpload(
  bucket: R2Bucket,
  empresaId: number,
  cursoId: number,
  zipBytes: Uint8Array,
  skipPurge = false,
) {
  if (zipBytes.length === 0) throw new ApiError('Arquivo vazio', 400);

  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    throw new ApiError('Arquivo ZIP inválido ou corrompido', 400);
  }

  const sanitizedEntries = Object.entries(files)
    .map(([path, data]) => [sanitizeArchivePath(path), data] as const)
    .filter((entry): entry is readonly [string, Uint8Array<ArrayBuffer>] => entry[0] !== null);

  const prefix = `lms/scorm/${empresaId}/${cursoId}/`;
  const manifestKey = sanitizedEntries.find(
    ([path]) =>
      path.toLowerCase() === 'imsmanifest.xml' || path.toLowerCase().endsWith('/imsmanifest.xml'),
  )?.[0];
  if (!manifestKey) throw new ApiError('imsmanifest.xml não encontrado no pacote', 400);

  const manifestData = sanitizedEntries.find(([path]) => path === manifestKey)?.[1];
  if (!manifestData) throw new ApiError('imsmanifest.xml não encontrado no pacote', 400);

  const manifestXml = strFromU8(manifestData);
  const launchFile = parseLaunchFile(manifestXml);
  const scormVersao = parseScormVersion(manifestXml);
  const baseDir = manifestKey.includes('/')
    ? manifestKey.slice(0, manifestKey.lastIndexOf('/') + 1)
    : '';

  if (!skipPurge) {
    await purgeStructuredUploadPrefix(bucket, prefix);
  }

  // Upload in batches of 10 to avoid R2 subrequest concurrency limits
  const BATCH_SIZE = 10;
  for (let i = 0; i < sanitizedEntries.length; i += BATCH_SIZE) {
    await Promise.all(
      sanitizedEntries.slice(i, i + BATCH_SIZE).map(([path, data]) =>
        bucket.put(prefix + path, data, {
          httpMetadata: {
            contentType: guessMime(path),
            cacheControl: 'public, max-age=86400',
          },
        }),
      ),
    );
  }

  // Verify all uploaded files are confirmed in R2 (catches silent partial failures)
  const expectedKeys = new Set(sanitizedEntries.map(([path]) => prefix + path));
  let confirmedCount = 0;
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const obj of listed.objects) {
      if (expectedKeys.has(obj.key)) confirmedCount++;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  if (confirmedCount < expectedKeys.size) {
    throw new ApiError(
      `Upload incompleto: ${confirmedCount}/${expectedKeys.size} arquivos confirmados no storage`,
      500,
    );
  }

  return {
    prefix,
    launchFileFull: launchFile ? normalizeR2Path(`${baseDir}${launchFile}`) : null,
    scormVersao,
    filesUploaded: sanitizedEntries.length,
  };
}

async function processH5pUpload(
  bucket: R2Bucket,
  empresaId: number,
  cursoId: number,
  zipBytes: Uint8Array,
) {
  if (zipBytes.length === 0) throw new ApiError('Arquivo vazio', 400);

  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    throw new ApiError('Arquivo H5P inválido (não é um ZIP válido)', 400);
  }

  const sanitizedEntries = Object.entries(files)
    .map(([path, data]) => [sanitizeArchivePath(path), data] as const)
    .filter((entry): entry is readonly [string, Uint8Array<ArrayBuffer>] => entry[0] !== null);

  const prefix = `lms/h5p/${empresaId}/${cursoId}/`;
  let tipoH5p = 'CoursePresentation';
  const h5pJsonKey = sanitizedEntries.find(
    ([path]) => path === 'h5p.json' || path.endsWith('/h5p.json'),
  )?.[0];
  if (h5pJsonKey) {
    try {
      const metaData = sanitizedEntries.find(([path]) => path === h5pJsonKey)?.[1];
      if (!metaData) {
        throw new ApiError('h5p.json não encontrado no pacote', 400);
      }

      const meta = JSON.parse(strFromU8(metaData)) as Record<string, unknown>;
      const mainLib = meta.mainLibrary as string | undefined;
      if (mainLib) tipoH5p = mainLib.replace(/\s+\d.*$/, '');
    } catch {
      /* ignore parse errors */
    }
  }

  await purgeStructuredUploadPrefix(bucket, prefix);

  await Promise.all(
    sanitizedEntries.map(([path, data]) =>
      bucket.put(prefix + path, data, {
        httpMetadata: {
          contentType: guessMime(path),
          cacheControl: 'public, max-age=86400',
        },
      }),
    ),
  );

  return {
    prefix,
    tipoH5p,
    filesUploaded: sanitizedEntries.length,
  };
}

async function attachUploadedContentToCurso(
  db: D1Database,
  bucket: R2Bucket,
  empresaId: number,
  cursoId: number,
  cursoTitulo: string,
  tipoConteudo: 'scorm' | 'h5p' | 'video',
  file: File | null,
) {
  if (!file || tipoConteudo === 'video') {
    return null;
  }

  const zipBytes = new Uint8Array(await file.arrayBuffer());

  if (tipoConteudo === 'scorm') {
    const upload = await processScormUpload(bucket, empresaId, cursoId, zipBytes);
    await db
      .prepare(
        `
        UPDATE lms_cursos
        SET scorm_package_r2_prefix = ?,
            scorm_launch_file = ?,
            scorm_versao = ?,
            conteudo_arquivo_nome = ?,
            version_tag = ?,
            updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?
      `,
      )
      .bind(
        upload.prefix,
        upload.launchFileFull,
        upload.scormVersao,
        normalizeUploadFileName(file),
        new Date().toISOString(),
        cursoId,
        empresaId,
      )
      .run();

    await purgeStructuredCourseAssets(bucket, empresaId, cursoId, { keepTipo: 'scorm' });

    return upload;
  }

  const upload = await processH5pUpload(bucket, empresaId, cursoId, zipBytes);
  const existing = await db
    .prepare(
      `
      SELECT id
      FROM lms_h5p_conteudos
      WHERE empresa_id = ? AND titulo = ? AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .bind(empresaId, cursoTitulo)
    .first<{ id: number }>();

  if (existing) {
    await db
      .prepare(
        `
        UPDATE lms_h5p_conteudos
        SET r2_key = ?, tipo_h5p = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?
      `,
      )
      .bind(upload.prefix, upload.tipoH5p, existing.id, empresaId)
      .run();
  } else {
    await db
      .prepare(
        'INSERT INTO lms_h5p_conteudos (empresa_id, titulo, tipo_h5p, r2_key) VALUES (?,?,?,?)',
      )
      .bind(empresaId, cursoTitulo, upload.tipoH5p, upload.prefix)
      .run();
  }

  await db
    .prepare(
      `
      UPDATE lms_cursos
      SET tipo_conteudo = 'h5p',
          scorm_package_r2_prefix = ?,
          scorm_launch_file = NULL,
          conteudo_arquivo_nome = ?,
          updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ?
    `,
    )
    .bind(upload.prefix, normalizeUploadFileName(file), cursoId, empresaId)
    .run();

  await purgeStructuredCourseAssets(bucket, empresaId, cursoId, { keepTipo: 'h5p' });

  return upload;
}

// ── Listar cursos ────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  const page = parsePositiveInt(c.req.query('page'), 1);
  const limit = Math.min(parsePositiveInt(c.req.query('limit'), 50), 200);
  const offset = (page - 1) * limit;
  const categoria = c.req.query('categoria');
  const q = c.req.query('q');
  const somentePublicados = c.req.query('publicados') !== '0';

  const rawSetorIds = c.req.query('setor_ids') || c.req.query('setor_id');
  const requestedSetorIds: number[] = rawSetorIds
    ? rawSetorIds.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const access = await getEmployeeSectorAccess(c, empresaId);
  const courseSetorSchema = await getCourseSetorSchema(db);

  let finalSetorIds: number[] | null = null;
  if (requestedSetorIds.length > 0) {
    if (access.mode !== 'all') {
      const allowed = requestedSetorIds.filter((id) => access.setorIds.includes(id));
      if (allowed.length !== requestedSetorIds.length) {
        return c.json({ success: false, error: 'Filtro de setor fora do escopo permitido' }, 403);
      }
      finalSetorIds = allowed;
    } else {
      finalSetorIds = requestedSetorIds;
    }
  } else if (access.mode !== 'all') {
    finalSetorIds = access.setorIds;
  }

  let where = 'WHERE c.empresa_id = ? AND c.deleted_at IS NULL AND c.ativo = 1';
  const binds: (string | number)[] = [empresaId];

  if (somentePublicados) {
    where += ' AND c.publicado = 1';
  }
  if (categoria) {
    where += ' AND c.categoria = ?';
    binds.push(categoria);
  }
  if (q) {
    where += ' AND c.titulo LIKE ?';
    binds.push(`%${q}%`);
  }
  if (finalSetorIds !== null && finalSetorIds.length === 0) {
    where += ' AND 1 = 0';
  } else if (finalSetorIds !== null) {
    const placeholders = finalSetorIds.map(() => '?').join(', ');
    const directScope = courseSetorSchema.hasCursoSetores
      ? `EXISTS (
          SELECT 1 FROM lms_cursos_setores lcs_f
          WHERE lcs_f.curso_id = c.id
            AND lcs_f.empresa_id = c.empresa_id
            AND lcs_f.setor_id IN (${placeholders})
            AND lcs_f.deleted_at IS NULL
        )`
      : '';
    const fallbackScope = courseSetorSchema.hasQualificacaoTipoSetores
      ? `(
          ${courseSetorSchema.hasCursoSetores
            ? `NOT EXISTS (
            SELECT 1 FROM lms_cursos_setores lcs_chk
            WHERE lcs_chk.curso_id = c.id AND lcs_chk.empresa_id = c.empresa_id AND lcs_chk.deleted_at IS NULL
          )
          AND `
            : ''}EXISTS (
            SELECT 1 FROM qualificacoes_tipos_setores qts_f
            WHERE qts_f.tipo_id = c.qualificacao_tipo_id
              AND qts_f.empresa_id = c.empresa_id
              AND qts_f.setor_id IN (${placeholders})
              AND qts_f.deleted_at IS NULL
          )
        )`
      : '';
    const scopeClauses = [directScope, fallbackScope].filter(Boolean);
    if (scopeClauses.length === 0) {
      where += ' AND 1 = 0';
    } else {
      where += ` AND (${scopeClauses.join(' OR ')})`;
      binds.push(
        ...finalSetorIds,
        ...(courseSetorSchema.hasCursoSetores && courseSetorSchema.hasQualificacaoTipoSetores
          ? finalSetorIds
          : []),
      );
    }
  }

  const matriculaScope = buildMatriculaEmployeeScope(access, 'm');
  const setoresJsonExpr = courseSetorSchema.hasCursoSetores
    ? `(SELECT json_group_array(json_object('id', s.id, 'nome', s.nome))
         FROM lms_cursos_setores lcs
         JOIN setores s ON s.id = lcs.setor_id
         WHERE lcs.curso_id = c.id AND lcs.empresa_id = c.empresa_id AND lcs.deleted_at IS NULL
         ORDER BY s.nome ASC)`
    : 'NULL';

  const total = await db
    .prepare(`SELECT COUNT(*) as n FROM lms_cursos c ${where}`)
    .bind(...binds)
    .first<{ n: number }>();

  const formatoJoin = courseSetorSchema.hasLmsCursosFormato
    ? `LEFT JOIN qualificacoes_formatos qf
         ON qf.id = c.formato_id
        AND qf.empresa_id = c.empresa_id
        AND qf.deleted_at IS NULL`
    : '';
  const formatoSelect = courseSetorSchema.hasLmsCursosFormato
    ? 'qf.codigo AS formato_codigo, qf.nome AS formato_nome,'
    : '';

  const rows = await db
    .prepare(
      `
      SELECT c.*,
        qt.nome AS qualificacao_tipo_nome,
        h.id AS h5p_conteudo_id,
        ${formatoSelect}
        (SELECT COUNT(*) FROM lms_matriculas m
         WHERE m.curso_id = c.id AND m.empresa_id = c.empresa_id AND m.deleted_at IS NULL${matriculaScope.clause}) AS total_matriculas,
        (SELECT COUNT(*) FROM lms_matriculas m
         WHERE m.curso_id = c.id AND m.empresa_id = c.empresa_id AND m.status = 'CONCLUIDO' AND m.deleted_at IS NULL${matriculaScope.clause}) AS total_concluidos,
        ${setoresJsonExpr} AS setores_json
      FROM lms_cursos c
      LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id
      ${formatoJoin}
      LEFT JOIN lms_h5p_conteudos h
        ON h.empresa_id = c.empresa_id
       AND h.r2_key = c.scorm_package_r2_prefix
       AND h.ativo = 1
       AND h.deleted_at IS NULL
      ${where}
      ORDER BY c.titulo ASC
      LIMIT ? OFFSET ?
    `,
    )
    .bind(...matriculaScope.bindings, ...matriculaScope.bindings, ...binds, limit, offset)
    .all<Record<string, unknown>>();

  const data = (rows.results ?? []).map((row) => {
    const setoresJson = row.setores_json as string | null;
    const { setores_json: _, ...rest } = row;
    return {
      ...rest,
      setores: setoresJson ? (JSON.parse(setoresJson) as { id: number; nome: string }[]) : [],
    };
  });

  return c.json({
    success: true,
    data,
    pagination: { page, limit, total: total?.n ?? 0 },
  });
});

async function handleLmsStats(
  c: Context,
) {
  const db = c.env.DB as D1Database;
  const empresaId = getEmpresaIdSafe(c);

  const access = await getEmployeeSectorAccess(c, empresaId);
  const courseSetorSchema = await getCourseSetorSchema(db);
  const courseSectorScope = buildCourseSetorScope(access, 'c', courseSetorSchema);
  const employeeScope = employeeSectorSql(access, 'f');

  const [totaisCursos, totaisMatriculas, topCursos, atrasadas, recentCompletions, featuredCourses] =
    await Promise.all([
      db
        .prepare(
          `SELECT
           COUNT(*) AS total_cursos,
           SUM(CASE WHEN c.publicado = 1 THEN 1 ELSE 0 END) AS cursos_publicados
         FROM lms_cursos c
         WHERE c.empresa_id = ? AND c.deleted_at IS NULL AND c.ativo = 1${courseSectorScope.clause}`,
        )
        .bind(empresaId, ...courseSectorScope.bindings)
        .first<{ total_cursos: number; cursos_publicados: number }>(),

      db
        .prepare(
          `SELECT
           COUNT(*) AS total_matriculas,
           SUM(CASE WHEN m.status = 'CONCLUIDO' THEN 1 ELSE 0 END) AS concluidas,
           SUM(CASE WHEN m.status = 'EM_ANDAMENTO' THEN 1 ELSE 0 END) AS em_andamento,
           SUM(CASE WHEN m.status = 'NAO_INICIADO' THEN 1 ELSE 0 END) AS nao_iniciadas,
           SUM(CASE WHEN m.qualificacao_historico_id IS NOT NULL THEN 1 ELSE 0 END) AS qualificacoes_geradas,
           COUNT(DISTINCT funcionario_id) AS total_alunos
         FROM lms_matriculas m
         JOIN funcionarios f
           ON f.id = m.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         WHERE m.empresa_id = ?
           AND m.deleted_at IS NULL
           AND ${employeeScope.clause}`,
        )
        .bind(empresaId, ...employeeScope.bindings)
        .first<{
          total_matriculas: number;
          concluidas: number;
          em_andamento: number;
          nao_iniciadas: number;
          qualificacoes_geradas: number;
          total_alunos: number;
        }>(),

      db
        .prepare(
          `SELECT
           c.id,
           c.titulo,
           c.tipo_conteudo,
           c.categoria,
           c.descricao,
           c.carga_horaria_minutos,
           c.thumbnail_r2_key,
           c.created_at,
           COUNT(f.id) AS total_matriculas,
           ROUND(COALESCE(AVG(CASE WHEN f.id IS NOT NULL THEN m.progresso_pct END), 0), 0) AS progresso_medio_pct,
           SUM(CASE WHEN f.id IS NOT NULL AND m.status = 'CONCLUIDO' THEN 1 ELSE 0 END) AS concluidas,
           CASE
             WHEN COUNT(f.id) = 0 THEN 0
             ELSE ROUND(SUM(CASE WHEN f.id IS NOT NULL AND m.status = 'CONCLUIDO' THEN 1.0 ELSE 0 END) / COUNT(f.id) * 100, 0)
           END AS taxa_conclusao_pct
         FROM lms_cursos c
         LEFT JOIN lms_matriculas m ON m.curso_id = c.id AND m.empresa_id = c.empresa_id AND m.deleted_at IS NULL
         LEFT JOIN funcionarios f
           ON f.id = m.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          AND ${employeeScope.clause}
         WHERE c.empresa_id = ? AND c.deleted_at IS NULL AND c.ativo = 1 AND c.publicado = 1${courseSectorScope.clause}
        GROUP BY c.id, c.titulo, c.tipo_conteudo, c.categoria, c.descricao, c.carga_horaria_minutos, c.thumbnail_r2_key, c.created_at
        ORDER BY
          CASE WHEN COUNT(f.id) > 0 THEN 0 ELSE 1 END,
          COUNT(f.id) DESC,
          progresso_medio_pct DESC,
          c.created_at DESC
         LIMIT 5`,
        )
        .bind(...employeeScope.bindings, empresaId, ...courseSectorScope.bindings)
        .all<{
          id: number;
          titulo: string;
          tipo_conteudo: 'scorm' | 'h5p' | 'video';
          categoria: string | null;
          descricao: string | null;
          carga_horaria_minutos: number | null;
          thumbnail_r2_key: string | null;
          created_at: string;
          total_matriculas: number;
          progresso_medio_pct: number;
          concluidas: number;
          taxa_conclusao_pct: number;
        }>(),

      db
        .prepare(
          `SELECT
           m.id,
           m.funcionario_id,
           m.curso_id,
           m.progresso_pct,
           m.data_matricula,
           c.titulo AS curso_titulo,
           f.nome AS funcionario_nome
         FROM lms_matriculas m
         INNER JOIN lms_cursos c ON c.id = m.curso_id
         INNER JOIN funcionarios f
           ON f.id = m.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          AND ${employeeScope.clause}
         WHERE m.empresa_id = ?
           AND m.deleted_at IS NULL
           AND m.status = 'EM_ANDAMENTO'
           AND m.progresso_pct < 10
           AND m.data_matricula < datetime('now', '-14 days')${courseSectorScope.clause}
         ORDER BY m.data_matricula ASC
         LIMIT 20`,
        )
        .bind(...employeeScope.bindings, empresaId, ...courseSectorScope.bindings)
        .all<{
          id: number;
          funcionario_id: number;
          curso_id: number;
          progresso_pct: number;
          data_matricula: string;
          curso_titulo: string;
          funcionario_nome: string;
        }>(),

      db
        .prepare(
          `SELECT
           m.id,
           m.funcionario_id,
           f.nome AS funcionario_nome,
           c.id AS curso_id,
           c.titulo AS curso_titulo,
           m.data_conclusao
         FROM lms_matriculas m
         INNER JOIN funcionarios f
           ON f.id = m.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          AND ${employeeScope.clause}
         INNER JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
         WHERE m.empresa_id = ?
           AND m.deleted_at IS NULL
           AND m.status = 'CONCLUIDO'
           AND m.data_conclusao IS NOT NULL
           AND m.data_conclusao >= datetime('now', '-7 days')${courseSectorScope.clause}
         ORDER BY m.data_conclusao DESC
         LIMIT 8`,
        )
        .bind(...employeeScope.bindings, empresaId, ...courseSectorScope.bindings)
        .all<{
          id: number;
          funcionario_id: number;
          funcionario_nome: string;
          curso_id: number;
          curso_titulo: string;
          data_conclusao: string;
        }>(),

      db
        .prepare(
          `SELECT
           c.id,
           c.titulo,
           c.tipo_conteudo,
           c.categoria,
           c.descricao,
           c.carga_horaria_minutos,
           c.thumbnail_r2_key,
           c.publicado,
           c.created_at,
           COUNT(f.id) AS total_matriculas
         FROM lms_cursos c
         LEFT JOIN lms_matriculas m ON m.curso_id = c.id AND m.empresa_id = c.empresa_id AND m.deleted_at IS NULL
         LEFT JOIN funcionarios f
           ON f.id = m.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
          AND ${employeeScope.clause}
         WHERE c.empresa_id = ? AND c.deleted_at IS NULL AND c.ativo = 1 AND c.publicado = 1${courseSectorScope.clause}
         GROUP BY c.id, c.titulo, c.tipo_conteudo, c.categoria, c.descricao, c.carga_horaria_minutos, c.thumbnail_r2_key, c.publicado, c.created_at
         ORDER BY COUNT(f.id) DESC, c.created_at DESC
         LIMIT 3`,
        )
        .bind(...employeeScope.bindings, empresaId, ...courseSectorScope.bindings)
        .all<{
          id: number;
          titulo: string;
          tipo_conteudo: 'scorm' | 'h5p' | 'video';
          categoria: string | null;
          descricao: string | null;
          carga_horaria_minutos: number | null;
          thumbnail_r2_key: string | null;
          publicado: number;
          created_at: string;
          total_matriculas: number;
        }>(),
    ]);

  const tm = {
    total_matriculas: Number(totaisMatriculas?.total_matriculas ?? 0),
    concluidas: Number(totaisMatriculas?.concluidas ?? 0),
    em_andamento: Number(totaisMatriculas?.em_andamento ?? 0),
    nao_iniciadas: Number(totaisMatriculas?.nao_iniciadas ?? 0),
    qualificacoes_geradas: Number(totaisMatriculas?.qualificacoes_geradas ?? 0),
    total_alunos: Number(totaisMatriculas?.total_alunos ?? 0),
  };
  const tc = {
    total_cursos: Number(totaisCursos?.total_cursos ?? 0),
    cursos_publicados: Number(totaisCursos?.cursos_publicados ?? 0),
  };

  const taxa_conclusao_pct =
    tm.total_matriculas > 0 ? Math.round((tm.concluidas / tm.total_matriculas) * 100) : 0;

  return c.json({
    success: true,
    data: {
      cursos_ativos: tc.total_cursos,
      total_cursos: tc.total_cursos,
      cursos_publicados: tc.cursos_publicados,
      total_alunos: tm.total_alunos,
      total_matriculados: tm.total_matriculas,
      total_matriculas: tm.total_matriculas,
      concluidas: tm.concluidas,
      em_andamento: tm.em_andamento,
      nao_iniciadas: tm.nao_iniciadas,
      qualificacoes_geradas: tm.qualificacoes_geradas,
      taxa_conclusao_pct,
      top_cursos: topCursos.results ?? [],
      atrasadas: atrasadas.results ?? [],
      recent_completions: recentCompletions.results ?? [],
      featured_courses: featuredCourses.results ?? [],
    },
  });
}

// ── KPIs / Stats ─────────────────────────────────────────────────────────────

app.get('/stats', requireRole('admin', 'manager'), handleLmsStats);
app.get('/cursos/stats', requireRole('admin', 'manager'), handleLmsStats);

// ── Detalhes de curso ────────────────────────────────────────────────────────

app.get('/:id{[0-9]+}', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));

  const access = await getEmployeeSectorAccess(c, empresaId);
  const courseSetorSchema = await getCourseSetorSchema(db);
  const setoresJsonExpr = courseSetorSchema.hasCursoSetores
    ? `(SELECT json_group_array(json_object('id', s.id, 'nome', s.nome))
         FROM lms_cursos_setores lcs
         JOIN setores s ON s.id = lcs.setor_id
         WHERE lcs.curso_id = c.id AND lcs.empresa_id = c.empresa_id AND lcs.deleted_at IS NULL
         ORDER BY s.nome ASC)`
    : 'NULL';

  const curso = await db
    .prepare(
      `
      SELECT c.*,
        qt.nome AS qualificacao_tipo_nome,
        qt.codigo AS qualificacao_tipo_codigo,
        h.id AS h5p_conteudo_id,
        ${setoresJsonExpr} AS setores_json
      FROM lms_cursos c
      LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id
      LEFT JOIN lms_h5p_conteudos h
        ON h.empresa_id = c.empresa_id
       AND h.r2_key = c.scorm_package_r2_prefix
       AND h.ativo = 1
       AND h.deleted_at IS NULL
      WHERE c.id = ? AND c.empresa_id = ? AND c.deleted_at IS NULL
    `,
    )
    .bind(cursoId, empresaId)
    .first<Record<string, unknown>>();

  if (!curso) throw new ApiError('Curso não encontrado', 404);

  // ── Sector scope check for restricted users ─────────────────────────
  if (access.mode !== 'all') {
    const courseSectorScope = buildCourseSetorScope(access, 'c', courseSetorSchema);
    const inScope = await db
      .prepare(
        `SELECT 1 as ok FROM lms_cursos c
         WHERE c.id = ? AND c.empresa_id = ? AND c.deleted_at IS NULL
         ${courseSectorScope.clause}`,
      )
      .bind(cursoId, empresaId, ...courseSectorScope.bindings)
      .first();
    if (!inScope) {
      return c.json({ success: false, error: 'Acesso negado: curso fora do seu escopo de setor' }, 403);
    }
  }

  const setoresJson = curso.setores_json as string | null;
  const { setores_json: _, ...cursoRest } = curso;
  const data = {
    ...cursoRest,
    setores: setoresJson ? (JSON.parse(setoresJson) as { id: number; nome: string }[]) : [],
  };

  return c.json({ success: true, data });
});

// ── Criar curso ──────────────────────────────────────────────────────────────

app.post('/', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const courseSetorSchema = await getCourseSetorSchema(db);

  const { data: d, uploadFile } = await parseCursoCreateRequest(c);
  const isEadCourse = await isEadCourseRequest(db, empresaId, {
    qualificacaoTipoId: d.qualificacao_tipo_id ?? null,
    formatoId: d.formato_id ?? null,
    categoria: d.categoria ?? null,
  });
  ensureQualificacaoBinding(
    d.gerar_qualificacao_ao_concluir,
    d.qualificacao_tipo_id ?? null,
    isEadCourse,
  );
  const resolvedQualificacaoTipoId = await resolveEadQualificacaoBinding(
    db,
    empresaId,
    d.qualificacao_tipo_id ?? null,
    { allowMissingForEad: isEadCourse },
  );

  const setorIds = Array.isArray(d.setor_ids) && d.setor_ids.length > 0 ? d.setor_ids : [];
  await assertCursoWriteScope({
    db,
    empresaId,
    access,
    schema: courseSetorSchema,
    setorIds,
    qualificacaoTipoId: resolvedQualificacaoTipoId,
  });
  if (setorIds.length > 0) {
    await validateSetorIds(db, empresaId, setorIds);
  }

  const insertCols = [
    'empresa_id', 'titulo', 'descricao', 'categoria', 'carga_horaria_minutos', 'idioma',
    'conteudo_programatico', 'observacoes', 'carga_horaria_inicial_horas',
    'carga_horaria_recorrente_horas', 'tipo_conteudo', 'scorm_versao',
    'scorm_mastery_score', 'qualificacao_tipo_id', 'gerar_qualificacao_ao_concluir', 'publicado',
  ];
  const insertVals: unknown[] = [
    empresaId,
    d.titulo,
    d.descricao ?? null,
    d.categoria ?? null,
    d.carga_horaria_minutos,
    d.idioma,
    d.conteudo_programatico ?? null,
    d.observacoes ?? null,
    d.carga_horaria_inicial_horas ?? null,
    d.carga_horaria_recorrente_horas ?? null,
    d.tipo_conteudo,
    d.scorm_versao ?? null,
    d.scorm_mastery_score,
    resolvedQualificacaoTipoId,
    d.gerar_qualificacao_ao_concluir,
    d.publicado,
  ];
  if (courseSetorSchema.hasLmsCursosFormato) {
    insertCols.push('formato_id');
    insertVals.push(d.formato_id ?? null);
  }
  const result = await db
    .prepare(
      `INSERT INTO lms_cursos (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})`,
    )
    .bind(...insertVals)
    .run();

  const id = result.meta.last_row_id;

  if (setorIds.length > 0 && courseSetorSchema.hasCursoSetores) {
    await upsertCursoSetores(db, empresaId, id, setorIds);
  }

  try {
    if (
      uploadFile &&
      (d.tipo_conteudo === 'scorm' || d.tipo_conteudo === 'h5p' || d.tipo_conteudo === 'video')
    ) {
      if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);
      await attachUploadedContentToCurso(
        db,
        c.env.BUCKET,
        empresaId,
        id,
        d.titulo,
        d.tipo_conteudo,
        uploadFile,
      );
    }
  } catch (error) {
    await db
      .prepare(
        "UPDATE lms_cursos SET deleted_at = datetime('now'), ativo = 0 WHERE id = ? AND empresa_id = ?",
      )
      .bind(id, empresaId)
      .run();
    throw error;
  }

  let finalQualificacaoTipoId = resolvedQualificacaoTipoId;
  if (!finalQualificacaoTipoId && isEadCourse) {
    finalQualificacaoTipoId = await ensureQualificacaoTipoForCurso(db, {
      empresaId,
      cursoId: Number(id),
    });
  }

  const cursoSetores = courseSetorSchema.hasCursoSetores
    ? await getCursoSetores(db, empresaId, id)
    : [];
  const curso = {
    ...(await db
      .prepare(`SELECT ${LMS_CURSOS_SELECT_COLUMNS} FROM lms_cursos WHERE id = ?`)
      .bind(id)
      .first()),
    setores: cursoSetores,
  };
  if (finalQualificacaoTipoId) {
    await syncQualificacaoTipoFromCurso(db, { empresaId, cursoId: Number(id) });
    await syncLmsCourseFromQualificacaoTipo(db, {
      empresaId,
      qualificacaoTipoId: Number(finalQualificacaoTipoId),
    });

    const reconcileTask = reconcileImportedEdappHistory(db, {
      empresaId,
      qualificacaoTipoId: Number(finalQualificacaoTipoId),
      cursoId: Number(id),
    }).catch((error) => {
      console.error('[LMS] Failed to reconcile imported EDAPP history after course creation', {
        empresaId,
        cursoId: Number(id),
        qualificacaoTipoId: Number(finalQualificacaoTipoId),
        error,
      });
    });

    if (c.executionCtx) {
      c.executionCtx.waitUntil(reconcileTask);
    } else {
      await reconcileTask;
    }
  }
  await logLmsCourseAudit(db, c, {
    action: 'LMS_CURSO_CRIADO',
    cursoId: id,
    newValues: {
      empresa_id: empresaId,
      titulo: d.titulo,
      tipo_conteudo: d.tipo_conteudo,
      publicado: d.publicado,
      qualificacao_tipo_id: finalQualificacaoTipoId,
      gerar_qualificacao_ao_concluir:
        finalQualificacaoTipoId != null ? 1 : d.gerar_qualificacao_ao_concluir,
      setor_ids: setorIds,
    },
  });
  return c.json({ success: true, data: curso }, 201);
});

// ── Editar curso ─────────────────────────────────────────────────────────────

app.put('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));
  const access = await getEmployeeSectorAccess(c, empresaId);
  const courseSetorSchema = await getCourseSetorSchema(db);

  const existing = await db
    .prepare(
      'SELECT id, titulo, categoria, tipo_conteudo, publicado, ativo, qualificacao_tipo_id, gerar_qualificacao_ao_concluir FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(cursoId, empresaId)
    .first<{
      id: number;
      titulo: string;
      categoria: string | null;
      tipo_conteudo: string;
      publicado: number;
      ativo: number;
      qualificacao_tipo_id: number | null;
      gerar_qualificacao_ao_concluir: number;
    }>();
  if (!existing) throw new ApiError('Curso não encontrado', 404);

  const currentCursoSetorIds = await getCursoSetorIds(db, empresaId, cursoId, courseSetorSchema);
  await assertCursoWriteScope({
    db,
    empresaId,
    access,
    schema: courseSetorSchema,
    setorIds: currentCursoSetorIds,
    qualificacaoTipoId: existing.qualificacao_tipo_id,
  });

  const body = await c.req.json<unknown>();
  const parsed = CursoUpdateSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);

  const d = parsed.data;
  const nextGerarQualificacao =
    d.gerar_qualificacao_ao_concluir ?? existing.gerar_qualificacao_ao_concluir;
  const nextQualificacaoTipoId =
    d.qualificacao_tipo_id !== undefined ? d.qualificacao_tipo_id : existing.qualificacao_tipo_id;
  const nextCategoria = d.categoria !== undefined ? d.categoria : existing.categoria;
  const nextFormatoId = d.formato_id !== undefined ? d.formato_id : undefined;
  const isEadCourse = await isEadCourseRequest(db, empresaId, {
    qualificacaoTipoId: nextQualificacaoTipoId ?? null,
    formatoId: nextFormatoId ?? null,
    categoria: nextCategoria,
  });
  const qualificacaoBindingChanged =
    nextGerarQualificacao !== existing.gerar_qualificacao_ao_concluir ||
    nextQualificacaoTipoId !== existing.qualificacao_tipo_id;

  ensureQualificacaoBinding(
    nextGerarQualificacao,
    nextQualificacaoTipoId ?? null,
    isEadCourse,
  );

  let resolvedQualificacaoTipoId = nextQualificacaoTipoId ?? null;

  if (!qualificacaoBindingChanged) {
    const hasLegacyBinding = await isLegacyNonEadQualificacaoBinding(
      db,
      empresaId,
      nextQualificacaoTipoId ?? null,
    );

    if (!hasLegacyBinding) {
      resolvedQualificacaoTipoId = await resolveEadQualificacaoBinding(
        db,
        empresaId,
        nextQualificacaoTipoId ?? null,
        { allowMissingForEad: isEadCourse },
      );
    }
  } else {
    resolvedQualificacaoTipoId = await resolveEadQualificacaoBinding(
      db,
      empresaId,
      nextQualificacaoTipoId ?? null,
      { allowMissingForEad: isEadCourse },
    );
  }

  const nextResolvedGerarQualificacao =
    resolvedQualificacaoTipoId != null ? 1 : nextGerarQualificacao;

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  const map: Record<string, unknown> = {
    ...d,
    qualificacao_tipo_id: resolvedQualificacaoTipoId,
    gerar_qualificacao_ao_concluir: nextResolvedGerarQualificacao,
  };
  const updateKeys = [
    'titulo',
    'descricao',
    'categoria',
    'carga_horaria_minutos',
    'conteudo_programatico',
    'observacoes',
    'carga_horaria_inicial_horas',
    'carga_horaria_recorrente_horas',
    'idioma',
    'tipo_conteudo',
    'scorm_versao',
    'scorm_mastery_score',
    'qualificacao_tipo_id',
    'gerar_qualificacao_ao_concluir',
    'publicado',
    'ativo',
    'version_tag',
  ];
  if (courseSetorSchema.hasLmsCursosFormato) updateKeys.push('formato_id');
  for (const key of updateKeys) {
    if (key in map && map[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(map[key] as string | number | null);
    }
  }

  const updateSetorIds =
    Array.isArray(d.setor_ids) && d.setor_ids.length > 0 ? d.setor_ids : null;
  const nextCursoSetorIds = updateSetorIds ?? currentCursoSetorIds;
  await assertCursoWriteScope({
    db,
    empresaId,
    access,
    schema: courseSetorSchema,
    setorIds: nextCursoSetorIds,
    qualificacaoTipoId: resolvedQualificacaoTipoId,
  });
  if (updateSetorIds !== null) {
    await validateSetorIds(db, empresaId, updateSetorIds);
  }

  if (sets.length === 0 && updateSetorIds === null) throw new ApiError('Nenhum campo para atualizar', 400);

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    await db
      .prepare(`UPDATE lms_cursos SET ${sets.join(', ')} WHERE id = ? AND empresa_id = ?`)
      .bind(...vals, cursoId, empresaId)
      .run();
  }

  if (updateSetorIds !== null && courseSetorSchema.hasCursoSetores) {
    await replaceCursoSetores(db, empresaId, cursoId, updateSetorIds);
  }

  if (!resolvedQualificacaoTipoId && isEadCourse) {
    resolvedQualificacaoTipoId = await ensureQualificacaoTipoForCurso(db, { empresaId, cursoId });
  }

  if (resolvedQualificacaoTipoId) {
    await syncQualificacaoTipoFromCurso(db, { empresaId, cursoId });
    await syncLmsCourseFromQualificacaoTipo(db, {
      empresaId,
      qualificacaoTipoId: Number(resolvedQualificacaoTipoId),
    });

    const reconcileTask = reconcileImportedEdappHistory(db, {
      empresaId,
      qualificacaoTipoId: Number(resolvedQualificacaoTipoId),
      cursoId,
    }).catch((error) => {
      console.error('[LMS] Failed to reconcile imported EDAPP history after course update', {
        empresaId,
        cursoId,
        qualificacaoTipoId: Number(resolvedQualificacaoTipoId),
        error,
      });
    });

    if (c.executionCtx) {
      c.executionCtx.waitUntil(reconcileTask);
    } else {
      await reconcileTask;
    }
  }

  const cursoSetores = courseSetorSchema.hasCursoSetores
    ? await getCursoSetores(db, empresaId, cursoId)
    : [];
  const curso = {
    ...(await db
      .prepare(
        `SELECT c.*,
           qt.nome AS qualificacao_tipo_nome,
           qt.codigo AS qualificacao_tipo_codigo
         FROM lms_cursos c
         LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id
         WHERE c.id = ?`,
      )
      .bind(cursoId)
      .first()),
    setores: cursoSetores,
  };
  await logLmsCourseAudit(db, c, {
    action: 'LMS_CURSO_EDITADO',
    cursoId,
    oldValues: {
      titulo: existing.titulo,
      tipo_conteudo: existing.tipo_conteudo,
      publicado: existing.publicado,
      ativo: existing.ativo,
      qualificacao_tipo_id: existing.qualificacao_tipo_id,
      gerar_qualificacao_ao_concluir: existing.gerar_qualificacao_ao_concluir,
    },
    newValues: {
      ...d,
      qualificacao_tipo_id: resolvedQualificacaoTipoId ?? null,
      gerar_qualificacao_ao_concluir:
        resolvedQualificacaoTipoId != null ? 1 : nextGerarQualificacao,
      setor_ids: updateSetorIds ?? undefined,
    },
  });
  return c.json({ success: true, data: curso });
});

app.post('/sync-ead', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);

  const result = await syncEadCoursesFromQualificacoes(db, empresaId, c);

  return c.json({
    success: true,
    data: {
      total_tipos_ead: result.total_tipos_ead,
      created: result.created.length,
      updated: result.updated.length,
      skipped: result.skipped,
      created_courses: result.created,
      updated_courses: result.updated,
    },
  });
});

// ── Upload endpoints (specific paths before generic /:id) ─────────────────────

app.post('/:id/thumbnail-upload', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));

  if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);

  const formData = await c.req.formData();
  const thumbnailFile = pickThumbnailFile(formData);
  if (!thumbnailFile) throw new ApiError('Arquivo de capa não encontrado', 400);

  const result = await uploadCursoThumbnail({
    db,
    bucket: c.env.BUCKET,
    empresaId,
    cursoId,
    file: thumbnailFile,
  });

  await logLmsCourseAudit(db, c, {
    action: 'LMS_CURSO_CAPA_ATUALIZADA',
    cursoId,
    newValues: {
      thumbnail_r2_key: result.thumbnail_r2_key,
      version_tag: result.version_tag,
    },
  });

  return c.json({ success: true, data: result });
});

// ── Upload pacote SCORM (ZIP) ────────────────────────────────────────────────
// POST /api/lms/cursos/:id/scorm-upload
// Content-Type: application/octet-stream (body = zip raw bytes)
// ou multipart/form-data com campo "file"

app.post('/:id/content-upload/init', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));

  if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);

  const body = await c.req.json<unknown>();
  const parsed = StructuredContentInitSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
  }

  await getCursoUploadContext(db, empresaId, cursoId);

  const prefix = getStructuredUploadPrefix(parsed.data.tipo_conteudo, empresaId, cursoId);
  if (!parsed.data.skip_purge) {
    await purgeStructuredUploadPrefix(c.env.BUCKET, prefix);
  }

  return c.json({
    success: true,
    data: {
      prefix,
      tipo_conteudo: parsed.data.tipo_conteudo,
    },
  });
});

app.post('/:id/content-upload/file', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));
  const tipoConteudo = c.req.query('tipo_conteudo');
  const path = c.req.query('path');

  if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);
  if (tipoConteudo !== 'scorm' && tipoConteudo !== 'h5p') {
    throw new ApiError('Tipo de conteúdo inválido', 400);
  }

  await getCursoUploadContext(db, empresaId, cursoId);

  const normalizedPath = sanitizeArchivePath(path ?? '');
  if (!normalizedPath) throw new ApiError('Caminho de arquivo inválido', 400);

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  validatePackageBytes(bytes);

  const prefix = getStructuredUploadPrefix(tipoConteudo, empresaId, cursoId);
  await c.env.BUCKET.put(prefix + normalizedPath, bytes, {
    httpMetadata: {
      contentType: guessMime(normalizedPath),
      cacheControl: 'public, max-age=86400',
    },
  });

  return c.json({
    success: true,
    data: {
      path: normalizedPath,
      bytes: bytes.length,
    },
  });
});

app.post('/:id/content-upload/complete', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));

  const body = await c.req.json<unknown>();
  const parsed = StructuredContentCompleteSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
  }

  if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);

  // Verify expected file count is present in R2 before committing DB changes
  const prefix = getStructuredUploadPrefix(parsed.data.tipo_conteudo, empresaId, cursoId);
  await verifyStructuredUploadPresence({
    bucket: c.env.BUCKET,
    prefix,
    expectedCount: parsed.data.files_uploaded,
    uploadedPaths: parsed.data.uploaded_paths,
  });

  const curso = await getCursoUploadContext(db, empresaId, cursoId);
  const result = await finalizeStructuredContentUpload(
    c.env.BUCKET,
    db,
    empresaId,
    cursoId,
    curso.titulo,
    parsed.data.tipo_conteudo,
    {
      launchFile: parsed.data.launch_file ?? null,
      scormVersao: parsed.data.scorm_versao,
      tipoH5p: parsed.data.tipo_h5p ?? null,
      arquivoNome: parsed.data.arquivo_nome ?? null,
    },
  );

  return c.json({
    success: true,
    data: {
      ...result,
      files_uploaded: parsed.data.files_uploaded ?? null,
    },
  });
});

app.post('/:id/scorm-upload', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));

  const curso = await db
    .prepare(
      'SELECT id, empresa_id FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(cursoId, empresaId)
    .first<{ id: number; empresa_id: number }>();
  if (!curso) throw new ApiError('Curso não encontrado', 404);

  if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);

  let zipBytes: Uint8Array;
  let uploadedFileName: string | null = null;
  const ct = c.req.header('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = pickUploadFile(formData);
    if (!file) throw new ApiError('Campo de arquivo não encontrado', 400);
    validatePackageFile(file, 'scorm');
    uploadedFileName = normalizeUploadFileName(file);
    zipBytes = new Uint8Array(await file.arrayBuffer());
  } else {
    zipBytes = new Uint8Array(await c.req.arrayBuffer());
  }

  validatePackageBytes(zipBytes);

  const skipPurge = c.req.query('skip_purge') === 'true';
  const upload = await processScormUpload(c.env.BUCKET, empresaId, cursoId, zipBytes, skipPurge);

  await db
    .prepare(
      `
      UPDATE lms_cursos
      SET scorm_package_r2_prefix = ?,
          scorm_launch_file = ?,
          scorm_versao = ?,
          conteudo_arquivo_nome = ?,
          version_tag = ?,
          updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ?
    `,
    )
    .bind(
      upload.prefix,
      upload.launchFileFull,
      upload.scormVersao,
      uploadedFileName,
      new Date().toISOString(),
      cursoId,
      empresaId,
    )
    .run();

  await purgeStructuredCourseAssets(c.env.BUCKET, empresaId, cursoId, { keepTipo: 'scorm' });

  return c.json({
    success: true,
    data: {
      prefix: upload.prefix,
      launch_file: upload.launchFileFull,
      scorm_versao: upload.scormVersao,
      conteudo_arquivo_nome: uploadedFileName,
      files_uploaded: upload.filesUploaded,
    },
  });
});

// ── Upload H5P ───────────────────────────────────────────────────────────────
// POST /api/lms/cursos/:id/upload/h5p
// O .h5p é um ZIP renomeado — extraímos e guardamos no R2 sob lms/h5p/{empresa_id}/{curso_id}/

app.post('/:id/upload/h5p', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));

  const curso = await db
    .prepare(
      'SELECT id, empresa_id, titulo FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(cursoId, empresaId)
    .first<{ id: number; empresa_id: number; titulo: string }>();
  if (!curso) throw new ApiError('Curso não encontrado', 404);

  if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);

  let zipBytes: Uint8Array;
  let uploadedFileName: string | null = null;
  const ct = c.req.header('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = pickUploadFile(formData);
    if (!file) throw new ApiError('Campo "file" ou "h5p" não encontrado', 400);
    validatePackageFile(file, 'h5p');
    uploadedFileName = normalizeUploadFileName(file);
    zipBytes = new Uint8Array(await file.arrayBuffer());
  } else {
    zipBytes = new Uint8Array(await c.req.arrayBuffer());
  }

  validatePackageBytes(zipBytes);

  const upload = await processH5pUpload(c.env.BUCKET, empresaId, cursoId, zipBytes);
  const existing = await db
    .prepare(
      `
      SELECT id
      FROM lms_h5p_conteudos
      WHERE empresa_id = ? AND titulo = ? AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .bind(empresaId, curso.titulo)
    .first<{ id: number }>();

  let h5pId: number;
  if (existing) {
    await db
      .prepare(
        "UPDATE lms_h5p_conteudos SET r2_key = ?, tipo_h5p = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
      )
      .bind(upload.prefix, upload.tipoH5p, existing.id, empresaId)
      .run();
    h5pId = existing.id;
  } else {
    const r = await db
      .prepare(
        'INSERT INTO lms_h5p_conteudos (empresa_id, titulo, tipo_h5p, r2_key) VALUES (?,?,?,?)',
      )
      .bind(empresaId, curso.titulo, upload.tipoH5p, upload.prefix)
      .run();
    h5pId = r.meta.last_row_id;
  }

  await db
    .prepare(
      "UPDATE lms_cursos SET tipo_conteudo = 'h5p', scorm_package_r2_prefix = ?, scorm_launch_file = NULL, conteudo_arquivo_nome = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
    )
    .bind(upload.prefix, uploadedFileName, cursoId, empresaId)
    .run();

  await purgeStructuredCourseAssets(c.env.BUCKET, empresaId, cursoId, { keepTipo: 'h5p' });

  return c.json({
    success: true,
    data: {
      h5p_id: h5pId,
      prefix: upload.prefix,
      tipo_h5p: upload.tipoH5p,
      conteudo_arquivo_nome: uploadedFileName,
      files_uploaded: upload.filesUploaded,
    },
  });
});

// Alias para compatibilidade com prompt 2.4: /upload/scorm
app.post('/:id/upload/scorm', requireRole('admin', 'manager'), async (c) => {
  // Forward to /:id/scorm-upload handler logic inline (avoid duplication by delegating)
  c.req.param = Object.assign(c.req.param.bind(c.req), { bind: c.req.param.bind(c.req) });
  // Re-dispatch via internal redirect is not Hono-native; instead we call the existing handler
  // by just duplicating the param name mapping — the scorm-upload route already handles this.
  // Simpler: redirect via 307 to keep DRY
  const id = c.req.param('id');
  return c.redirect(`/api/lms/cursos/${id}/scorm-upload`, 307);
});

// ── MIME guess helper ────────────────────────────────────────────────────────

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    js: 'application/javascript',
    mjs: 'application/javascript',
    css: 'text/css',
    xml: 'application/xml',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogv: 'video/ogg',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
    swf: 'application/x-shockwave-flash',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}

// ── Upload PDF ───────────────────────────────────────────────────────────────

const LMS_PDF_MAX_BYTES = 200 * 1024 * 1024; // 200 MB

app.post('/:id/upload/pdf', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));

  const curso = await db
    .prepare(
      'SELECT id, empresa_id, titulo, pdf_r2_key FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(cursoId, empresaId)
    .first<{ id: number; empresa_id: number; titulo: string; pdf_r2_key: string | null }>();
  if (!curso) throw new ApiError('Curso não encontrado', 404);

  const formData = await c.req.formData();
  const file = (formData.get('arquivo') ?? formData.get('file')) as File | string | null;
  if (!(file instanceof File)) throw new ApiError('Arquivo PDF obrigatório', 400);

  const normalizedName = file.name.trim().toLowerCase();
  if (normalizedName && !normalizedName.endsWith('.pdf')) {
    throw new ApiError('Envie um arquivo .pdf válido', 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) throw new ApiError('Arquivo vazio', 400);
  if (bytes.length > LMS_PDF_MAX_BYTES) throw new ApiError('PDF excede o limite de 200 MB', 400);

  const key = `lms/pdf/${empresaId}/${cursoId}/document.pdf`;

  await c.env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: 'application/pdf', cacheControl: 'no-store' },
  });

  if (curso.pdf_r2_key && curso.pdf_r2_key !== key) {
    try {
      await c.env.BUCKET.delete(curso.pdf_r2_key);
    } catch {
      /* ignore */
    }
  }

  await db
    .prepare(
      `UPDATE lms_cursos SET tipo_conteudo = 'pdf', pdf_r2_key = ?, conteudo_arquivo_nome = ?, version_tag = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?`,
    )
    .bind(key, normalizeUploadFileName(file), new Date().toISOString(), cursoId, empresaId)
    .run();

  return c.json({
    success: true,
    data: { pdf_r2_key: key, conteudo_arquivo_nome: normalizeUploadFileName(file) },
  });
});

// ── Upload PPTX ──────────────────────────────────────────────────────────────

const LMS_PPTX_MAX_BYTES = 200 * 1024 * 1024; // 200 MB

app.post('/:id/upload/pptx', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));

  const curso = await db
    .prepare(
      'SELECT id, empresa_id, titulo, pptx_r2_key FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(cursoId, empresaId)
    .first<{ id: number; empresa_id: number; titulo: string; pptx_r2_key: string | null }>();
  if (!curso) throw new ApiError('Curso não encontrado', 404);

  const formData = await c.req.formData();
  const file = (formData.get('arquivo') ?? formData.get('file')) as File | string | null;
  if (!(file instanceof File)) throw new ApiError('Arquivo PPTX obrigatório', 400);

  const normalizedName = file.name.trim().toLowerCase();
  if (normalizedName && !normalizedName.endsWith('.pptx') && !normalizedName.endsWith('.ppt')) {
    throw new ApiError('Envie um arquivo .pptx válido', 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) throw new ApiError('Arquivo vazio', 400);
  if (bytes.length > LMS_PPTX_MAX_BYTES) throw new ApiError('PPTX excede o limite de 200 MB', 400);

  // Extrair contagem de slides (PPTX é um ZIP com ppt/slides/slideN.xml)
  let slideCount = 0;
  try {
    const { unzipSync: uz } = await import('fflate');
    const files = uz(bytes);
    slideCount = Object.keys(files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p)).length;
  } catch {
    // Se falhar a extração da contagem, continua com 0
  }

  const key = `lms/pptx/${empresaId}/${cursoId}/presentation.pptx`;

  await c.env.BUCKET.put(key, bytes, {
    httpMetadata: {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      cacheControl: 'no-store',
    },
  });

  if (curso.pptx_r2_key && curso.pptx_r2_key !== key) {
    try {
      await c.env.BUCKET.delete(curso.pptx_r2_key);
    } catch {
      /* ignore */
    }
  }

  await db
    .prepare(
      `UPDATE lms_cursos SET tipo_conteudo = 'pptx', pptx_r2_key = ?, pptx_slide_count = ?, conteudo_arquivo_nome = ?, version_tag = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?`,
    )
    .bind(
      key,
      slideCount,
      normalizeUploadFileName(file),
      new Date().toISOString(),
      cursoId,
      empresaId,
    )
    .run();

  return c.json({
    success: true,
    data: {
      pptx_r2_key: key,
      slide_count: slideCount,
      conteudo_arquivo_nome: normalizeUploadFileName(file),
    },
  });
});

// ── Desativar (soft delete) ──────────────────────────────────────────────────
// MUST BE LAST: generic /:id route needs to come after all specific /:id/path routes

app.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));

  const existing = await db
    .prepare(
      'SELECT id, titulo, tipo_conteudo, publicado, ativo FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(cursoId, empresaId)
    .first<{
      id: number;
      titulo: string;
      tipo_conteudo: string;
      publicado: number;
      ativo: number;
    }>();
  if (!existing) throw new ApiError('Curso não encontrado', 404);

  await db
    .prepare(
      "UPDATE lms_cursos SET deleted_at = datetime('now'), ativo = 0 WHERE id = ? AND empresa_id = ?",
    )
    .bind(cursoId, empresaId)
    .run();

  if (c.env.BUCKET) {
    try {
      await purgeStructuredCourseAssets(c.env.BUCKET, empresaId, cursoId);
    } catch (error) {
      console.warn('[LMS] Falha ao limpar assets do curso removido:', error);
    }
  }

  await logLmsCourseAudit(db, c, {
    action: 'LMS_CURSO_REMOVIDO',
    cursoId,
    oldValues: {
      titulo: existing.titulo,
      tipo_conteudo: existing.tipo_conteudo,
      publicado: existing.publicado,
      ativo: existing.ativo,
    },
    newValues: { deleted: true, ativo: 0 },
  });

  return c.json({ success: true, data: { id: cursoId, deleted: true } });
});

export default app;
