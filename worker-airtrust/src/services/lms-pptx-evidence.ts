/** Immutable, tenant-scoped, edition-bound PPTX coverage service. */
import { hasSchemaTable } from '../utils/db-schema';
import { ApiError } from '../middleware/error-handler';

export const MIN_SLIDE_INTERVAL_MS = 1500;
const MAX_SLIDES = 1000;

export type PptxEnrollment = {
  matricula_id: number;
  funcionario_id: number;
  curso_id: number;
  ciclo_id: number;
  status: string;
  ativo: number;
  publicado: number;
  tipo_conteudo: string;
  gerar_qualificacao_ao_concluir: number;
  pptx_r2_key: string | null;
  pptx_slide_count: number | null;
};

export type PptxCoverage = {
  matricula_id: number;
  curso_id: number;
  total_slides: number;
  visited_indexes: number[];
  next_slide: number;
  ready_to_finalize: boolean;
  content_sha256: string;
};

export function isActiveEnrollment(status: string): boolean {
  return ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(String(status).trim().toUpperCase());
}

export async function readCurrentPptxEnrollment(
  db: D1Database,
  empresaId: number,
  matriculaId: number,
): Promise<PptxEnrollment | null> {
  return db.prepare(
    `SELECT m.id AS matricula_id, m.funcionario_id, m.curso_id, m.status,
            c.ativo, c.publicado, c.tipo_conteudo, c.gerar_qualificacao_ao_concluir,
            c.pptx_r2_key, c.pptx_slide_count, cy.id AS ciclo_id
       FROM lms_matriculas m
       JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
         AND c.deleted_at IS NULL
       JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
         AND cy.curso_id=m.curso_id AND cy.funcionario_id=m.funcionario_id
         AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
      WHERE m.id=? AND m.empresa_id=? AND m.deleted_at IS NULL
      LIMIT 1`,
  ).bind(matriculaId, empresaId).first<PptxEnrollment>();
}

async function authoritativePptxVersion(
  bucket: R2Bucket,
  empresaId: number,
  enrollment: PptxEnrollment,
): Promise<{ contentSha256: string; totalSlides: number }> {
  const totalSlides = Number(enrollment.pptx_slide_count);
  if (!Number.isSafeInteger(totalSlides) || totalSlides < 1 || totalSlides > MAX_SLIDES) {
    throw new ApiError('Contagem de slides não validada no catálogo do curso', 409, 'PPTX_SLIDE_COUNT_NOT_CONFIGURED');
  }
  const key = String(enrollment.pptx_r2_key || '').trim();
  if (!key) throw new ApiError('Arquivo PPTX não publicado', 409, 'PPTX_ASSET_UNAVAILABLE');
  const object = await bucket.head(key);
  if (!object?.etag) throw new ApiError('Arquivo PPTX indisponível para validação', 503, 'PPTX_ASSET_UNAVAILABLE');
  const input = new TextEncoder().encode([
    empresaId, enrollment.curso_id, key, object.etag, totalSlides,
  ].join(':'));
  const hash = await crypto.subtle.digest('SHA-256', input);
  const contentSha256 = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { contentSha256, totalSlides };
}

async function requireEvidenceSchema(db: D1Database): Promise<void> {
  if (!(await hasSchemaTable(db, 'lms_pptx_slide_evidences'))) {
    throw new ApiError('Evidência de consumo PPTX ainda não habilitada', 503, 'PPTX_EVIDENCE_SCHEMA_REQUIRED');
  }
}

async function readCoverage(
  db: D1Database,
  empresaId: number,
  enrollment: PptxEnrollment,
  contentSha256: string,
  totalSlides: number,
): Promise<{ coverage: PptxCoverage; lastRecordedAt: string | null }> {
  const query = await db.prepare(
    `SELECT slide_index, server_received_at
       FROM lms_pptx_slide_evidences
      WHERE empresa_id=? AND matricula_id=? AND ciclo_id=? AND content_sha256=?
      ORDER BY slide_index ASC`,
  ).bind(empresaId, enrollment.matricula_id, enrollment.ciclo_id, contentSha256)
    .all<{ slide_index: number; server_received_at: string }>();
  const rows = query.results || [];
  const visitedIndexes = rows.map((row) => Number(row.slide_index));
  // The immutable SQL table should contain only a contiguous prefix.
  // A corrupted/gapped ledger is fail-closed and never counts as completion.
  const contiguous = visitedIndexes.every((index, offset) => index === offset);
  if (!contiguous || visitedIndexes.length > totalSlides) {
    throw new ApiError('Evidência de consumo PPTX inconsistente', 409, 'PPTX_EVIDENCE_INCONSISTENT');
  }
  return {
    coverage: {
      matricula_id: enrollment.matricula_id,
      curso_id: enrollment.curso_id,
      total_slides: totalSlides,
      visited_indexes: visitedIndexes,
      next_slide: visitedIndexes.length,
      ready_to_finalize: visitedIndexes.length === totalSlides,
      content_sha256: contentSha256,
    },
    lastRecordedAt: rows.length ? rows[rows.length - 1].server_received_at : null,
  };
}

export async function getPptxEvidenceState(
  db: D1Database,
  bucket: R2Bucket,
  empresaId: number,
  matriculaId: number,
): Promise<{ enrollment: PptxEnrollment; coverage: PptxCoverage; lastRecordedAt: string | null }> {
  const enrollment = await readCurrentPptxEnrollment(db, empresaId, matriculaId);
  if (!enrollment || enrollment.tipo_conteudo !== 'pptx') {
    throw new ApiError('Matrícula PPTX não encontrada', 404, 'PPTX_ENROLLMENT_NOT_FOUND');
  }
  if (enrollment.ativo !== 1 || enrollment.publicado !== 1) {
    throw new ApiError('Curso PPTX indisponível', 409, 'PPTX_COURSE_UNAVAILABLE');
  }
  if (enrollment.gerar_qualificacao_ao_concluir !== 1) {
    throw new ApiError('Evidência qualificante não é exigida neste curso', 409, 'PPTX_EVIDENCE_NOT_REQUIRED');
  }
  await requireEvidenceSchema(db);
  const { contentSha256, totalSlides } = await authoritativePptxVersion(bucket, empresaId, enrollment);
  const { coverage, lastRecordedAt } = await readCoverage(db, empresaId, enrollment, contentSha256, totalSlides);
  return { enrollment, coverage, lastRecordedAt };
}

/**
 * Only the attested, current-cycle, current-asset contiguous evidence may
 * authorize a qualifying PPTX completion. A client 100% progress never does.
 */
export async function isPptxCompletionEvidenceReady(
  db: D1Database,
  bucket: R2Bucket,
  empresaId: number,
  matriculaId: number,
): Promise<boolean> {
  const state = await getPptxEvidenceState(db, bucket, empresaId, matriculaId);
  return state.coverage.ready_to_finalize;
}

// Completion checks fail closed if schema, R2 or evidence is unavailable.
export async function hasPptxEvidenceForCompletion(
  db: D1Database, bucket: R2Bucket, empresaId: number, matriculaId: number,
): Promise<boolean> {
  try {
    return await isPptxCompletionEvidenceReady(db, bucket, empresaId, matriculaId);
  } catch {
    return false;
  }
}
