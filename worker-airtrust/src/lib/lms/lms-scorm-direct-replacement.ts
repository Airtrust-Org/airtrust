/**
 * Explicit administrator-only replacement for server-validated, non-scored
 * SCORM editions. No signed QA JSON or independent-review ceremony.
 *
 * This is NOT a learner completion/certification shortcut: no cycles,
 * scores, qualifications or certificates are created by this operation.
 * The existing transactional pointer/policy switch preserves terminal cycles.
 */
import { ApiError } from '../errors/api-error';
import {
  assertActivationConfirmation, evaluateFormativeActivation,
} from './lms-scorm-formative-service';
import { FORMATIVE_PROFILE } from './lms-scorm-formative-profile';
import { reclassifyLegacyFormativeCandidate } from './lms-scorm-legacy-formative-reclassification';
import { commitCertifiedScormActivation } from './lms-scorm-package-activation';
import { parseStoredScormValidation, readScormUploadFilename } from './lms-scorm-package-filename';
import type { ScormQualityGateResult } from './lms-scorm-quality-gate';

export type DirectReplacementConfirmation = {
  cursoId?: unknown;
  packageSha256?: unknown;
  acknowledgeInProgress?: unknown;
};

/** Resolve a legacy candidate's profile BEFORE the upload route counts active
 * enrollments for its one-click replacement acknowledgement. */
export async function preflightDirectFormativeReplacement(params: {
  db: D1Database; bucket: R2Bucket; empresaId: number; cursoId: number;
  packageId: string; userId: number | null;
}) {
  if (!Number.isSafeInteger(params.userId) || Number(params.userId) <= 0) {
    throw new ApiError('Somente um administrador autenticado pode substituir conteúdo', 403, 'SCORM_REPLACE_ADMIN_REQUIRED');
  }
  let preflight = await evaluateFormativeActivation({
    db: params.db, empresaId: params.empresaId,
    cursoId: params.cursoId, packageId: params.packageId,
  });
  // Existing uploads can predate Schema V2 0569. A receipt of VALIDATED
  // confirms structural acceptance, not that the new policy columns were
  // pinned. Revalidate trusted R2 members and CAS-pin only missing metadata.
  if (preflight.row.status === 'VALIDATED' &&
      preflight.row.assessment_policy == null &&
      preflight.row.certification_profile == null) {
    const upgraded = await reclassifyLegacyFormativeCandidate({
      db: params.db, bucket: params.bucket, empresaId: params.empresaId,
      cursoId: params.cursoId, packageId: params.packageId, actorId: params.userId!, row: preflight.row,
    });
    if (upgraded) {
      preflight = await evaluateFormativeActivation({
        db: params.db, empresaId: params.empresaId,
        cursoId: params.cursoId, packageId: params.packageId,
      });
    }
  }
  return preflight;
}


/**
 * Read-only reconciliation of an exact-SHA duplicate replacement response.
 * The CAS stays fail-closed. An already-applied response is truthful ONLY if
 * the same tenant/course/package/SHA is ACTIVE and the course launch pointer
 * and formative policy match the activated edition.
 */
export async function readAlreadyActiveFormativeReplacement(params: {
  db: D1Database; bucket: R2Bucket; empresaId: number; cursoId: number;
  packageId: string; packageSha256: string;
}) {
  const row = await params.db.prepare(`SELECT v.id, v.package_sha256, v.r2_prefix, v.launch_file
    FROM lms_scorm_package_versions v
    INNER JOIN lms_cursos c ON c.id=v.curso_id AND c.empresa_id=v.empresa_id
    WHERE v.id=? AND v.empresa_id=? AND v.curso_id=? AND v.package_sha256=?
      AND v.status='ACTIVE' AND v.assessment_policy='FORMATIVE'
      AND v.certification_profile=?
      AND c.deleted_at IS NULL AND c.tipo_conteudo='scorm'
      AND c.scorm_assessment_policy='FORMATIVE'
      AND c.scorm_package_r2_prefix=v.r2_prefix
      AND c.scorm_launch_file=v.launch_file
      AND EXISTS(SELECT 1 FROM lms_scorm_package_audit_log a
        WHERE a.empresa_id=v.empresa_id AND a.curso_id=v.curso_id
          AND a.package_id=v.id AND a.action='ACTIVATED')
      LIMIT 1`)
    .bind(params.packageId, params.empresaId, params.cursoId,
      params.packageSha256, FORMATIVE_PROFILE)
    .first<{ id: string; package_sha256: string; r2_prefix: string; launch_file: string }>();
  if (!row || !await params.bucket.head(row.r2_prefix + row.launch_file)) return null;
  return {
    packageId: row.id, packageSha256: row.package_sha256,
    status: 'ACTIVE' as const, cursoId: params.cursoId,
    assessmentPolicy: 'FORMATIVE' as const,
    validationMode: 'SERVER_STATIC_GATE' as const,
    alreadyActive: true as const,
  };
}


/**
 * An EXTERNAL exam is not an exam INSIDE the SCO. The learner's separate exam
 * remains authoritative; activating a content edition must neither invent an
 * exam pass nor mint a qualification. The course stays SCORED, so completion
 * requires its existing independent evaluation in the Worker.
 *
 * The administrator may replace the course CONTENT after the server's static
 * Quality Gate. This does not waive admin RBAC, tenant scope, exact-SHA
 * confirmation, immutable ZIP validation, R2 launch readback or atomic CAS.
 * It does not apply to scored SCORM packages or private DO_NOT_ACTIVATE ZIPs.
 */
export async function readAlreadyActiveExternalReplacement(params: {
  db: D1Database; bucket: R2Bucket; empresaId: number; cursoId: number;
  packageId: string; packageSha256: string;
}) {
  const row = await params.db.prepare(`SELECT v.id, v.package_sha256, v.r2_prefix,
      v.launch_file, v.validation_result_json
    FROM lms_scorm_package_versions v
    JOIN lms_cursos c ON c.id=v.curso_id AND c.empresa_id=v.empresa_id
    WHERE v.id=? AND v.empresa_id=? AND v.curso_id=? AND v.package_sha256=?
      AND v.status='ACTIVE' AND c.deleted_at IS NULL
      AND c.tipo_conteudo='scorm' AND c.scorm_assessment_policy='SCORED'
      AND c.scorm_package_r2_prefix=v.r2_prefix AND c.scorm_launch_file=v.launch_file
      AND EXISTS(SELECT 1 FROM lms_scorm_package_audit_log a
        WHERE a.empresa_id=v.empresa_id AND a.curso_id=v.curso_id
          AND a.package_id=v.id AND a.action='ACTIVATED')
    LIMIT 1`)
    .bind(params.packageId, params.empresaId, params.cursoId, params.packageSha256)
    .first<{ id: string; package_sha256: string; r2_prefix: string;
      launch_file: string; validation_result_json: string | null }>();
  if (!row) return null;
  const quality = parseStoredScormValidation<ScormQualityGateResult>(row.validation_result_json);
  if (quality?.authoringReview?.externalExam !== true ||
      quality.authoringReview.privateRelease !== false ||
      quality.structural?.status !== 'PASS' ||
      quality.completionManifest?.status !== 'PASS' ||
      quality.diagnostics?.status !== 'PASS') return null;
  if (!await params.bucket.head(row.r2_prefix + row.launch_file)) return null;
  return {
    packageId: row.id, packageSha256: row.package_sha256,
    status: 'ACTIVE' as const, cursoId: params.cursoId,
    assessmentPolicy: 'SCORED' as const, examMode: 'EXTERNAL' as const,
    validationMode: 'SERVER_STATIC_GATE' as const, alreadyActive: true as const,
  };
}

export async function replaceValidatedExternalScorm(params: {
  db: D1Database; bucket: R2Bucket; empresaId: number; cursoId: number;
  packageId: string; userId: number | null;
  confirm: DirectReplacementConfirmation | undefined;
}) {
  if (!Number.isSafeInteger(params.userId) || Number(params.userId) <= 0) {
    throw new ApiError('Somente um administrador autenticado pode substituir conteúdo', 403, 'SCORM_REPLACE_ADMIN_REQUIRED');
  }
  const preflight = await evaluateFormativeActivation({
    db: params.db, empresaId: params.empresaId,
    cursoId: params.cursoId, packageId: params.packageId,
  });
  const row = preflight.row;
  const quality = parseStoredScormValidation<ScormQualityGateResult>(row.validation_result_json);
  if (row.status !== 'VALIDATED' || row.certification_profile !== null ||
      quality?.authoringReview?.externalExam !== true ||
      quality.authoringReview.privateRelease !== false ||
      quality.structural?.status !== 'PASS' ||
      quality.completionManifest?.status !== 'PASS' ||
      quality.diagnostics?.status !== 'PASS') {
    throw new ApiError('Pacote com prova externa não passou no Quality Gate estático', 409, 'SCORM_EXTERNAL_STATIC_GATE_FAILED');
  }
  // EXTERNAL remains a scored course-level qualification policy. The SCO only
  // records content coverage; it cannot self-issue a score or exam approval.
  if (preflight.course.tipoConteudo !== 'scorm' ||
      !['SCORED', 'FORMATIVE'].includes(preflight.course.currentPolicy) ||
      !Number.isFinite(Number(preflight.course.masteryScore)) ||
      Number(preflight.course.masteryScore) <= 0) {
    throw new ApiError('Curso não dispõe de política de prova externa segura', 409, 'SCORM_EXTERNAL_POLICY_INVALID');
  }
  const failed = preflight.checks.filter(check =>
    !check.ok && check.id !== 'NOT_ALREADY_ACTIVE');
  if (failed.length || preflight.checks.find(c => c.id === 'NOT_ALREADY_ACTIVE')?.ok !== true) {
    throw new ApiError('Curso ou versão incompatível com substituição direta', 409, 'SCORM_EXTERNAL_PREFLIGHT_FAILED');
  }
  // Unlike the formative helper, the exact identity is always required,
  // including SCORED -> SCORED replacements with no policy transition.
  if (params.confirm?.cursoId !== params.cursoId ||
      params.confirm?.packageSha256 !== row.package_sha256) {
    throw new ApiError('Confirme o curso e o SHA-256 exatos do pacote', 409, 'ACTIVATION_CONFIRMATION_REQUIRED');
  }
  assertActivationConfirmation(preflight, row, params.cursoId, params.confirm);
  if (!await params.bucket.head(row.r2_prefix + row.launch_file)) {
    throw new ApiError('Arquivo principal da edição não está disponível', 409, 'SCORM_REPLACE_ASSETS_MISSING');
  }
  const activated = await commitCertifiedScormActivation({
    db: params.db, empresaId: params.empresaId, cursoId: params.cursoId,
    packageId: row.id, packageSha256: row.package_sha256,
    prefix: row.r2_prefix, launchFile: row.launch_file,
    originalFilename: readScormUploadFilename(quality),
    actorId: params.userId, auditId: crypto.randomUUID(),
    validationJson: row.validation_result_json,
    observed: {
      activePackageId: preflight.active?.packageId ?? null,
      coursePolicy: preflight.course.currentPolicy as 'SCORED' | 'FORMATIVE',
    },
    policy: { incoming: 'SCORED' },
  });
  if (!activated) {
    const alreadyActive = await readAlreadyActiveExternalReplacement({
      db: params.db, bucket: params.bucket, empresaId: params.empresaId,
      cursoId: params.cursoId, packageId: row.id, packageSha256: row.package_sha256,
    });
    if (alreadyActive) return alreadyActive;
    throw new ApiError('O curso mudou durante a substituição; recarregue antes de tentar novamente', 409, 'SCORM_REPLACE_RACE');
  }
  return {
    packageId: row.id, packageSha256: row.package_sha256,
    status: 'ACTIVE' as const, cursoId: params.cursoId,
    assessmentPolicy: 'SCORED' as const, examMode: 'EXTERNAL' as const,
    validationMode: 'SERVER_STATIC_GATE' as const,
    impactedInProgress: preflight.impact.inProgress,
  };
}

export async function replaceValidatedFormativeScorm(params: {
  db: D1Database;
  bucket: R2Bucket;
  empresaId: number;
  cursoId: number;
  packageId: string;
  userId: number | null;
  confirm: DirectReplacementConfirmation | undefined;
}) {
  if (!Number.isSafeInteger(params.userId) || Number(params.userId) <= 0) {
    throw new ApiError('Somente um administrador autenticado pode substituir conteúdo', 403, 'SCORM_REPLACE_ADMIN_REQUIRED');
  }
  // Reuse the canonical course/tenant/policy/cycle read model; only the two
  // external approval checks are intentionally replaced by the static gates.
  const preflight = await preflightDirectFormativeReplacement(params);
  const row = preflight.row;
  const quality = parseStoredScormValidation<ScormQualityGateResult>(row.validation_result_json);
  if (row.status !== 'VALIDATED' ||
      row.certification_profile !== FORMATIVE_PROFILE ||
      row.assessment_policy !== 'FORMATIVE' ||
      quality?.certificationProfile !== FORMATIVE_PROFILE ||
      quality.assessmentPolicy !== 'FORMATIVE' ||
      !quality.formativeContract?.eligible ||
      quality.structural?.status !== 'PASS' ||
      quality.completionManifest?.status !== 'PASS' ||
      quality.diagnostics?.status !== 'PASS' ||
      quality.formativeContract.requiredSlides <= 0 ||
      quality.formativeContract.requiredActivities <= 0) {
    throw new ApiError('O pacote não passou na validação automática do perfil formativo', 409, 'SCORM_REPLACE_STATIC_GATE_FAILED');
  }
  const otherFailures = preflight.checks.filter((check) =>
    !check.ok && check.id !== 'JOURNEY_EVIDENCE' && check.id !== 'ADMIN_APPROVAL');
  if (otherFailures.length || preflight.incomingPolicy !== 'FORMATIVE' ||
      preflight.course.tipoConteudo !== 'scorm') {
    throw new ApiError('Curso ou versão incompatível com substituição direta', 409, 'SCORM_REPLACE_PREFLIGHT_FAILED');
  }
  assertActivationConfirmation(preflight, row, params.cursoId, params.confirm);

  // Verified stored ZIP + R2 launch file, never a claimed client-side verdict.
  const launch = await params.bucket.head(row.r2_prefix + row.launch_file);
  if (!launch) {
    throw new ApiError('Arquivo principal da edição não está disponível', 409, 'SCORM_REPLACE_ASSETS_MISSING');
  }

  const activated = await commitCertifiedScormActivation({
    db: params.db, empresaId: params.empresaId, cursoId: params.cursoId,
    packageId: row.id, packageSha256: row.package_sha256,
    prefix: row.r2_prefix, launchFile: row.launch_file,
    originalFilename: readScormUploadFilename(quality),
    actorId: params.userId, auditId: crypto.randomUUID(),
    validationJson: row.validation_result_json,
    observed: {
      activePackageId: preflight.active?.packageId ?? null,
      coursePolicy: preflight.course.currentPolicy as 'SCORED' | 'FORMATIVE',
    },
    policy: { incoming: 'FORMATIVE' },
  });
  if (!activated) {
    // A concurrent identical request may have committed before this CAS.
    // Never retry the mutation or translate a DIFFERENT active edition into success.
    const alreadyActive = await readAlreadyActiveFormativeReplacement({
      db: params.db, bucket: params.bucket, empresaId: params.empresaId,
      cursoId: params.cursoId, packageId: row.id, packageSha256: row.package_sha256,
    });
    if (alreadyActive) return alreadyActive;
    throw new ApiError('O curso mudou durante a substituição; recarregue antes de tentar novamente', 409, 'SCORM_REPLACE_RACE');
  }
  return {
    packageId: row.id, packageSha256: row.package_sha256,
    status: 'ACTIVE' as const, cursoId: params.cursoId,
    assessmentPolicy: 'FORMATIVE' as const,
    validationMode: 'SERVER_STATIC_GATE' as const,
    impactedInProgress: preflight.impact.inProgress,
  };
}
