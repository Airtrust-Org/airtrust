/**
 * Explicit same-SHA retry for a package REJECTED by an earlier static gate.
 * Fresh client bytes are hash-matched before this function is reached; ONLY
 * a full current Quality Gate PASS can restore the existing inactive candidate.
 * The ACTIVE edition and enrollment ledger are never changed here.
 */
import { guessMime } from '../../routes/lms-scorm-asset-paths';
import { FORMATIVE_PROFILE } from './lms-scorm-formative-profile';
import type { ValidatedLmsPackage } from './lms-package-validator';
import type { ScormQualityGateResult } from './lms-scorm-quality-gate';

const BATCH_SIZE = 10;

export type RejectedCandidateRow = {
  id: string;
  empresa_id: number;
  curso_id: number;
  package_sha256: string;
  r2_prefix: string;
  launch_file: string;
  status: string;
  validation_result_json: string | null;
  assessment_policy?: string | null;
  certification_profile?: string | null;
};

export async function revalidateRejectedFormativeScormCandidate(params: {
  db: D1Database;
  bucket: R2Bucket;
  row: RejectedCandidateRow;
  empresaId: number;
  cursoId: number;
  actorId: number | null;
  packageSha256: string;
  pkg: ValidatedLmsPackage;
  quality: ScormQualityGateResult;
  storedQualityJson: string;
}): Promise<boolean> {
  const { db, bucket, row, empresaId, cursoId, actorId, packageSha256, pkg, quality, storedQualityJson } = params;
  if (!Number.isSafeInteger(actorId) || Number(actorId) <= 0 ||
      !Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      !Number.isSafeInteger(cursoId) || cursoId <= 0 ||
      row.empresa_id !== empresaId || row.curso_id !== cursoId ||
      !/^[0-9a-f]{64}$/.test(packageSha256) ||
      row.package_sha256 !== packageSha256 ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(row.id) ||
      row.r2_prefix !== `lms/scorm/${empresaId}/${cursoId}/_candidates/${row.id}/` ||
      row.status !== 'REJECTED' ||
      row.assessment_policy != null || row.certification_profile != null ||
      pkg.tipoConteudo !== 'scorm' || pkg.scormVersao !== '1.2' ||
      !pkg.launchFile || row.launch_file !== pkg.launchFile ||
      !pkg.entries.some(entry => entry.path === pkg.launchFile) ||
      quality.structural.status !== 'PASS' ||
      quality.completionManifest.status !== 'PASS' ||
      quality.diagnostics.status !== 'PASS' ||
      quality.certificationProfile !== FORMATIVE_PROFILE ||
      quality.assessmentPolicy !== 'FORMATIVE' ||
      !quality.formativeContract?.eligible ||
      quality.formativeContract.requiredSlides < 1 ||
      quality.formativeContract.requiredActivities < 1) {
    return false;
  }

  // Before status can change, save every member again, because a rejected
  // first attempt may never have put its members into R2.
  for (let i = 0; i < pkg.entries.length; i += BATCH_SIZE) {
    const batch = pkg.entries.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(entry =>
      bucket.put(`${row.r2_prefix}${entry.path}`, entry.data, {
        httpMetadata: {
          contentType: guessMime(entry.path),
          cacheControl: 'public, max-age=86400',
        },
      }),
    ));
  }

  // CAS against the EXACT old verdict prevents concurrent retries from
  // silently reviving a different candidate, course, tenant or SHA.
  // The audit insertion is conditional on the preceding UPDATE's changes().
  const changes = await db.batch([
    db.prepare(`UPDATE lms_scorm_package_versions
      SET status='VALIDATED', validation_version=?,
          validation_started_at=datetime('now'), validation_finished_at=datetime('now'),
          validation_result_json=?, rejection_reasons_json='[]',
          assessment_policy='FORMATIVE', certification_profile=?
      WHERE id=? AND empresa_id=? AND curso_id=? AND package_sha256=?
        AND r2_prefix=? AND launch_file=? AND status='REJECTED'
        AND assessment_policy IS NULL AND certification_profile IS NULL
        AND validation_result_json IS ?`
    ).bind(quality.validatorVersion, storedQualityJson, FORMATIVE_PROFILE,
      row.id, empresaId, cursoId, packageSha256, row.r2_prefix,
      row.launch_file, row.validation_result_json),
    db.prepare(`INSERT INTO lms_scorm_package_audit_log
      (id, empresa_id, curso_id, package_id, action, actor_id, reason, created_at)
      SELECT ?,?,?,?,'VALIDATION_PASSED',?,?,datetime('now')
      WHERE changes()=1`
    ).bind(crypto.randomUUID(), empresaId, cursoId, row.id, actorId,
      'EXPLICIT_SAME_SHA_REUPLOAD_CURRENT_STATIC_GATE_PASS'),
  ]);
  return Number(changes[0]?.meta?.changes) === 1 &&
    Number(changes[1]?.meta?.changes) === 1;
}
