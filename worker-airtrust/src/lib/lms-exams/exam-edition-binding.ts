/**
 * Single contract for "this SCORM edition has a usable AirTrust exam".
 *
 * Used by the learner exam gate AND by the EXTERNAL edition activation guard,
 * so an edition can only become ACTIVE with examMode=EXTERNAL when the learner
 * gate would actually offer an exam for it. Otherwise learners would finish the
 * study and stay in EXTERNAL_ASSESSMENT_PENDING with no possible path (F-01,
 * auditoria 2026-11-20: LOSA #64 active with zero bindings).
 *
 * Bindings and plans are immutable (Schema V2 0572 triggers), so a positive
 * answer cannot be revoked between this check and a later activation commit.
 * D1 errors propagate: callers must fail closed instead of assuming readiness.
 */
import { validExamAttemptPolicy, type ExamAttemptPolicy } from './question-bank-domain';

export async function loadBoundExamAttemptPolicy(
  db: D1Database,
  edition: Readonly<{ empresaId: number; cursoId: number; packageSha256: string }>,
): Promise<ExamAttemptPolicy | null> {
  const binding = await db.prepare(
    'SELECT p.plan_json FROM lms_exam_edition_bindings b JOIN lms_exam_plans p ' +
    'ON p.empresa_id=b.empresa_id AND p.curso_id=b.curso_id AND p.exam_id=b.exam_id ' +
    'AND p.version=b.exam_version AND p.plan_sha256=b.plan_sha256 ' +
    'WHERE b.empresa_id=? AND b.curso_id=? AND b.package_sha256=? LIMIT 1'
  ).bind(edition.empresaId, edition.cursoId, edition.packageSha256)
    .first<{ plan_json: string }>();
  if (!binding) return null;
  try {
    const data = JSON.parse(binding.plan_json) as { attemptPolicy?: unknown };
    return validExamAttemptPolicy(data.attemptPolicy) ? data.attemptPolicy : null;
  } catch {
    return null;
  }
}
