/**
 * Read-only revalidation of a legacy VALIDATED candidate whose immutable ZIP
 * was ingested before Schema V2 0569 pinned the formative profile.
 *
 * Never upgrades a scored package or changes an ACTIVE edition. The server
 * reads the already stored R2 members, reruns its current static Quality Gate
 * and CAS-pins only the missing profile on this same tenant/course/SHA.
 */
import { FORMATIVE_PROFILE } from './lms-scorm-formative-profile';
import { validateScormPackageQuality, type ScormQualityGateResult } from './lms-scorm-quality-gate';
import { parseStoredScormValidation } from './lms-scorm-package-filename';
import type { FormativeCandidateRow } from './lms-scorm-formative-service';
import type { ValidatedPackageEntry } from './lms-package-validator';

const MAX_OBJECTS = 2500;
const MAX_META_BYTES = 16 * 1024 * 1024;
const REQUIRED = new Set(['imsmanifest.xml', 'airtrust-completion-manifest.json']);
const readContents = (path: string) => REQUIRED.has(path.toLowerCase()) || /\.(js|css)$/i.test(path);

export async function reclassifyLegacyFormativeCandidate(params: {
  db: D1Database; bucket: R2Bucket;
  empresaId: number; cursoId: number; packageId: string; actorId: number; row: FormativeCandidateRow;
}): Promise<boolean> {
  const { db, bucket, empresaId, cursoId, packageId, actorId, row } = params;
  // Non-null policy/profile is never silently rewritten, even when erroneous.
  if (!Number.isSafeInteger(actorId) || actorId <= 0 ||
      row.status !== 'VALIDATED' || row.assessment_policy != null ||
      row.certification_profile != null || row.id !== packageId ||
      row.empresa_id !== empresaId || row.curso_id !== cursoId ||
      !/^[0-9a-f-]{36}$/i.test(packageId) ||
      !/^[0-9a-f]{64}$/.test(row.package_sha256) ||
      row.r2_prefix !== `lms/scorm/${empresaId}/${cursoId}/_candidates/${packageId}/`) {
    return false;
  }
  const previous = parseStoredScormValidation<ScormQualityGateResult>(row.validation_result_json);
  if (!previous || previous.structural?.status !== 'PASS' ||
      previous.completionManifest?.status !== 'PASS' ||
      previous.diagnostics?.status !== 'PASS' ||
      (previous.formativeContract != null && previous.formativeContract.eligible !== true) ||
      (previous.assessmentPolicy != null && previous.assessmentPolicy !== 'FORMATIVE') ||
      (previous.certificationProfile != null && previous.certificationProfile !== FORMATIVE_PROFILE)) {
    return false;
  }

  let cursor: string | undefined;
  const paths: string[] = [];
  const seen = new Set<string>();
  let metadataBytes = 0;
  do {
    const page = await bucket.list({ prefix: row.r2_prefix, cursor, limit: 1000 });
    for (const object of page.objects) {
      if (!object.key.startsWith(row.r2_prefix)) return false;
      const path = object.key.slice(row.r2_prefix.length);
      const folded = path.toLowerCase();
      if (!path || path.startsWith('/') || path.includes('..') ||
          seen.has(folded) || paths.length >= MAX_OBJECTS) return false;
      seen.add(folded);
      paths.push(path);
      if (readContents(path)) {
        metadataBytes += object.size;
        if (metadataBytes > MAX_META_BYTES) return false;
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
    if (page.truncated && !cursor) return false;
  } while (cursor);
  if (![...REQUIRED].every(p => seen.has(p)) || !seen.has('course-model.js') ||
      !seen.has(row.launch_file.toLowerCase())) return false;

  const entries: ValidatedPackageEntry[] = [];
  // Only executable/metadata members need their bytes for the static gate;
  // media is checked for existence by the exact path list.
  for (const path of paths) entries.push({ path, data: new Uint8Array(0) });
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (!readContents(entry.path)) continue;
    const object = await bucket.get(row.r2_prefix + entry.path);
    if (!object) return false;
    const data = new Uint8Array(await object.arrayBuffer());
    if (data.byteLength > MAX_META_BYTES) return false;
    entry.data = data;
  }

  const quality = validateScormPackageQuality({
    tipoConteudo: 'scorm', entries, totalUncompressedBytes: 0,
    launchFile: row.launch_file, scormVersao: '1.2', tipoH5p: null,
  });
  if (quality.structural.status !== 'PASS' ||
      quality.completionManifest.status !== 'PASS' ||
      quality.diagnostics.status !== 'PASS' ||
      quality.certificationProfile !== FORMATIVE_PROFILE ||
      quality.assessmentPolicy !== 'FORMATIVE' ||
      !quality.formativeContract?.eligible ||
      quality.formativeContract.requiredSlides < 1 ||
      quality.formativeContract.requiredActivities < 1) return false;

  const updated = JSON.stringify({
    ...previous,
    assessmentPolicy: 'FORMATIVE',
    certificationProfile: FORMATIVE_PROFILE,
    formativeContract: quality.formativeContract,
  });
  const auditId = crypto.randomUUID();
  const writes = await db.batch([
    db.prepare(`UPDATE lms_scorm_package_versions
      SET assessment_policy='FORMATIVE', certification_profile=?, validation_result_json=?
      WHERE id=? AND empresa_id=? AND curso_id=? AND package_sha256=?
        AND r2_prefix=? AND status='VALIDATED'
        AND assessment_policy IS NULL AND certification_profile IS NULL
        AND validation_result_json=?`
    ).bind(FORMATIVE_PROFILE, updated, row.id, empresaId, cursoId,
      row.package_sha256, row.r2_prefix, row.validation_result_json),
    db.prepare(`INSERT INTO lms_scorm_package_audit_log
      (id, empresa_id, curso_id, package_id, action, actor_id, reason, created_at)
      SELECT ?,?,?,?,'VALIDATION_PASSED',?,?,datetime('now')
      WHERE changes()=1`
    ).bind(auditId, empresaId, cursoId, packageId, actorId, 'LEGACY_FORMATIVE_STATIC_REVALIDATION'),
  ]);
  return Number(writes[0]?.meta?.changes) === 1 && Number(writes[1]?.meta?.changes) === 1;
}
