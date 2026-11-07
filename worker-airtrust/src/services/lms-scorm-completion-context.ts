/**
 * Loads the read-only, active-package context that every SCORM completion
 * guard must share (commit, explicit finalization, server-side finalization,
 * diagnostics and the stuck-enrollment classifier). One verdict, many callers.
 */
import {
  readActiveManifestCoverage,
  type ManifestStudyCoverage,
} from './lms-completion-manifest-evidence';
import { findApprovedExamEvidence, type ApprovedExamEvidence } from './lms-exams/exam-attempt-store';
export interface ScormManifestClosureEvidence {
  coverage: ManifestStudyCoverage;
  /**
   * Passed, sealed AirTrust exam attempt for the active cycle and edition. Only
   * looked up for assessment.mode=EXTERNAL; absent = still pending (fail-closed).
   */
  externalExam?: ApprovedExamEvidence | null;
}

export async function loadScormManifestClosureEvidence(params: {
  bucket: R2Bucket | null | undefined;
  empresaId: number;
  cursoId: number;
  matriculaId: number;
  cicloId?: number | null;
  activePrefix: unknown;
  contentType: unknown;
  cmiJson: string | null | undefined;
  suspendData?: string | null;
  db?: D1Database | null;
}): Promise<ScormManifestClosureEvidence | null> {
  const coverage = await readActiveManifestCoverage(params);
  if (!coverage) return null;
  if (coverage.assessment_mode !== 'EXTERNAL' || !params.db) return { coverage };
  const externalExam = await findApprovedExamEvidence(params.db, {
    empresaId: params.empresaId, matriculaId: params.matriculaId,
    activePackagePrefix: params.activePrefix,
  });
  return { coverage, externalExam };
}

/**
 * Route-facing wrapper: derives the same active-package manifest verdict the
 * middleware uses from an enrollment row joined with lms_cursos. Returns null
 * (previous strict behaviour) for non-SCORM content, a missing prefix or any
 * read failure — it never throws and never writes.
 */
export async function loadManifestEvidenceForEnrollment(
  bucket: R2Bucket | null | undefined,
  row: {
    id?: unknown;
    curso_id?: unknown;
    cicloId?: unknown;
    scorm_package_r2_prefix?: unknown;
    tipo_conteudo?: unknown;
  },
  empresaId: number,
  cmiJson: string | null | undefined,
  suspendData?: string | null,
  db?: D1Database | null,
): Promise<ScormManifestClosureEvidence | null> {
  try {
    const matriculaId = Number(row.id);
    const cursoId = Number(row.curso_id);
    if (!Number.isSafeInteger(matriculaId) || !Number.isSafeInteger(cursoId)) return null;
    return await loadScormManifestClosureEvidence({
      bucket, empresaId, cursoId, matriculaId,
      cicloId: Number.isSafeInteger(Number(row.cicloId)) ? Number(row.cicloId) : null,
      activePrefix: row.scorm_package_r2_prefix,
      contentType: row.tipo_conteudo ?? 'scorm',
      cmiJson, suspendData, db,
    });
  } catch {
    return null;
  }
}
