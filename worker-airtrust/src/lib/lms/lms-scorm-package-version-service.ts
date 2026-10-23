import { ApiError } from '../../middleware/error-handler';
import { extractAndValidateLmsPackage, extractScormStaticGateMetadata, normalizeLmsArchivePath, validateStructuredScormMetadata } from './lms-package-validator';
import { canActivateCertifiedScormPackage, validateScormPackageQuality, type ScormQualityGateResult } from './lms-scorm-quality-gate';
import { applyRuntimeConformance } from './lms-scorm-quality-gate';
import { runScormBrowserConformance } from './lms-scorm-browser-run';
import { commitCertifiedScormActivation } from './lms-scorm-package-activation';
import { validateF5R2ArchiveReadOnly } from './lms-scorm-r2-reader.mjs';
import {
  verifyTrustedScormAttestation,
  type TrustedScormAttestation,
} from './lms-scorm-trusted-attestation';
import {
  normalizeScormUploadFilename,
  parseStoredScormValidation,
  readScormUploadFilename,
  withScormUploadMetadata,
} from './lms-scorm-package-filename';

type PackageRow = {
  id: string; empresa_id: number; curso_id: number; package_sha256: string; r2_prefix: string;
  launch_file: string; status: string; validation_result_json: string | null;
};

// Large SCORM packages can contain hundreds of small visual assets. Serial R2
// put/get calls keep the browser at the 25%/65% milestone for minutes and can
// outlive the request even when the ZIP itself is within the governed memory budget.
// The legacy uploader already uses a batch of 10 as the safe R2 concurrency
// boundary, so keep the versioned Quality Gate path on the same limit.
const SCORM_PACKAGE_R2_BATCH_SIZE = 10;

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: Uint8Array) {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

function mimeType(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  return extension === 'html' ? 'text/html; charset=utf-8' : extension === 'js' ? 'application/javascript' : extension === 'css' ? 'text/css' : extension === 'xml' ? 'application/xml' : extension === 'json' ? 'application/json' : 'application/octet-stream';
}

function sha256Bytes(hexDigest: string) {
  const bytes = new Uint8Array(hexDigest.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hexDigest.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function errors(result: ScormQualityGateResult) {
  return [result.structural, result.completionManifest, result.diagnostics]
    .flatMap((section) => section.errors);
}

export async function createScormPackageCandidate(params: {
  db: D1Database; bucket: R2Bucket; empresaId: number; cursoId: number; userId: number | null;
  bytes: Uint8Array; arquivoNome: string | null;
}) {
  // Cheap first pass: central-directory inspection + decompression of only
  // the small metadata files the static gate reads (imsmanifest.xml,
  // airtrust-completion-manifest.json, airtrust-completion-diagnostics.json)
  // — never the media/HTML/JS payload. Lets a REJECTED verdict be reached
  // without paying full-archive decompression CPU for packages that were
  // never going to be stored anyway.
  const staticPkg = extractScormStaticGateMetadata(params.bytes);
  if (!staticPkg.launchFile) {
    throw new ApiError('Não foi possível identificar o launch file do pacote SCORM', 400);
  }
  const staticQuality = validateScormPackageQuality(staticPkg);
  const staticRejected = staticQuality.structural.status === 'FAIL' || staticQuality.completionManifest.status === 'FAIL' || staticQuality.diagnostics.status === 'FAIL';

  const packageSha256 = await sha256(params.bytes);
  const originalFilename = normalizeScormUploadFilename(params.arquivoNome);
  const existing = await params.db.prepare(
    `SELECT id, empresa_id, curso_id, package_sha256, r2_prefix, launch_file, status, validation_result_json
       FROM lms_scorm_package_versions WHERE empresa_id = ? AND curso_id = ? AND package_sha256 = ?`,
  ).bind(params.empresaId, params.cursoId, packageSha256).first<PackageRow>();
  if (existing) {
    const storedValidation = parseStoredScormValidation<ScormQualityGateResult>(
      existing.validation_result_json,
    );
    if (storedValidation && originalFilename) {
      const nextValidationJson = JSON.stringify(
        withScormUploadMetadata(storedValidation, originalFilename),
      );
      if (nextValidationJson !== existing.validation_result_json) {
        await params.db
          .prepare(
            `UPDATE lms_scorm_package_versions
                SET validation_result_json = ?
              WHERE id = ? AND empresa_id = ? AND curso_id = ? AND package_sha256 = ?`,
          )
          .bind(
            nextValidationJson,
            existing.id,
            params.empresaId,
            params.cursoId,
            packageSha256,
          )
          .run();
        existing.validation_result_json = nextValidationJson;
      }
    }
    // A re-upload of the exact ACTIVE SHA is a no-op for content, but the
    // operator-visible file label must still reflect the file just selected.
    if (existing.status === 'ACTIVE' && originalFilename) {
      await params.db
        .prepare(
          `UPDATE lms_cursos
              SET conteudo_arquivo_nome = ?, updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ?`,
        )
        .bind(originalFilename, params.cursoId, params.empresaId)
        .run();
    }
    return packageReadModel(existing);
  }

  const course = await params.db.prepare(
    'SELECT id FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
  ).bind(params.cursoId, params.empresaId).first<{ id: number }>();
  if (!course) throw new ApiError('Curso não encontrado', 404);

  // A candidate the static gate already rejects will never be stored/played,
  // so the expensive full extraction (every entry decompressed, including
  // media) only runs for candidates that still have a chance of activation.
  const pkg = staticRejected ? staticPkg : extractAndValidateLmsPackage(params.bytes, 'scorm');
  const quality = staticRejected ? staticQuality : validateScormPackageQuality(pkg);
  const rejected = quality.structural.status === 'FAIL' || quality.completionManifest.status === 'FAIL' || quality.diagnostics.status === 'FAIL';
  const status = rejected ? 'REJECTED' : 'VALIDATED';
  const storedQuality = withScormUploadMetadata(quality, originalFilename);

  const id = crypto.randomUUID();
  const prefix = `lms/scorm/${params.empresaId}/${params.cursoId}/_candidates/${id}/`;
  try {
    if (!rejected) {
      for (let index = 0; index < pkg.entries.length; index += SCORM_PACKAGE_R2_BATCH_SIZE) {
        const batch = pkg.entries.slice(index, index + SCORM_PACKAGE_R2_BATCH_SIZE);
        await Promise.all(
          batch.map((item) =>
            params.bucket.put(`${prefix}${item.path}`, item.data, {
              httpMetadata: {
                contentType: mimeType(item.path),
                cacheControl: 'public, max-age=86400',
              },
            }),
          ),
        );
      }
    }
    await params.db.prepare(
      `INSERT INTO lms_scorm_package_versions (
        id, empresa_id, curso_id, package_version, package_sha256, zip_size_bytes, r2_prefix, launch_file, scorm_versao,
        uploaded_by, uploaded_at, status, validation_version, validation_started_at, validation_finished_at,
        validation_result_json, rejection_reasons_json, previous_active_package_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '1.2', ?, datetime('now'), ?, ?, datetime('now'), datetime('now'), ?, ?,
        (SELECT id FROM lms_scorm_package_versions WHERE empresa_id = ? AND curso_id = ? AND status = 'ACTIVE'))`,
    ).bind(id, params.empresaId, params.cursoId, `${new Date().toISOString()}-${packageSha256.slice(0, 12)}`, packageSha256,
      params.bytes.byteLength, prefix, pkg.launchFile, params.userId, status, quality.validatorVersion,
      JSON.stringify(storedQuality), JSON.stringify(errors(quality)), params.empresaId, params.cursoId).run();
    await params.db.prepare(
      `INSERT INTO lms_scorm_package_audit_log (id, empresa_id, curso_id, package_id, action, actor_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(crypto.randomUUID(), params.empresaId, params.cursoId, id, 'UPLOAD', params.userId, null).run();
    await params.db.prepare(
      `INSERT INTO lms_scorm_package_audit_log (id, empresa_id, curso_id, package_id, action, actor_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(crypto.randomUUID(), params.empresaId, params.cursoId, id, rejected ? 'VALIDATION_FAILED' : 'VALIDATION_PASSED', params.userId, rejected ? errors(quality).join('; ') : null).run();
  } catch (error) {
    // Candidate content is never live. Best-effort compensation cannot affect ACTIVE.
    const listed = await params.bucket.list({ prefix });
    if (listed.objects.length) await params.bucket.delete(listed.objects.map((item) => item.key));
    throw error;
  }
  return { packageId: id, packageSha256, status, ...quality, arquivoNome: originalFilename };
}

/**
 * Creates a static, INACTIVE SCORM candidate from a completed multipart ZIP
 * already staged in the tenant/course _intake prefix. The original ZIP is
 * verified by the shared bounded R2 reader; members are CRC/SHA checked while
 * being written one at a time. This never invokes conformance, attestation or
 * activation and keeps only Quality Gate inputs resident in memory.
 */
export async function createScormPackageCandidateFromR2Intake(params: {
  db: D1Database;
  bucket: R2Bucket;
  empresaId: number;
  cursoId: number;
  userId: number | null;
  operationId: string;
  expectedSha256: string;
  arquivoNome: string | null;
}) {
  if (!/^[a-f0-9-]{36}$/i.test(params.operationId) || !/^[a-f0-9]{64}$/.test(params.expectedSha256)) {
    throw new ApiError('Identidade da importação SCORM inválida', 400);
  }
  const existing = await params.db.prepare(
    `SELECT id, empresa_id, curso_id, package_sha256, r2_prefix, launch_file, status, validation_result_json
       FROM lms_scorm_package_versions WHERE empresa_id = ? AND curso_id = ? AND package_sha256 = ?`,
  ).bind(params.empresaId, params.cursoId, params.expectedSha256).first<PackageRow>();
  if (existing) {
    await params.bucket.delete(`lms/scorm/${params.empresaId}/${params.cursoId}/_intake/${params.operationId}/package.zip`);
    return { ...packageReadModel(existing), alreadyExisted: true, active: existing.status === 'ACTIVE' };
  }
  const course = await params.db.prepare(
    'SELECT id FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
  ).bind(params.cursoId, params.empresaId).first<{ id: number }>();
  if (!course) throw new ApiError('Curso não encontrado', 404);

  const originalFilename = normalizeScormUploadFilename(params.arquivoNome);
  const intakePrefix = `lms/scorm/${params.empresaId}/${params.cursoId}/_intake/${params.operationId}/`;
  const intakeKey = `${intakePrefix}package.zip`;
  const id = params.operationId;
  const prefix = `lms/scorm/${params.empresaId}/${params.cursoId}/_candidates/${id}/`;
  const descriptors: Array<{ path: string; size: number }> = [];
  const qualityEntries: Array<{ path: string; data: Uint8Array }> = [];
  let qualityBytes = 0;
  const MAX_QUALITY_GATE_BYTES = 32 * 1024 * 1024;
  let registered = false;
  try {
    const result = await validateF5R2ArchiveReadOnly({
      bucket: params.bucket,
      key: intakeKey,
      expectedPrefix: intakePrefix,
      expectedSha256: params.expectedSha256,
      onMember: async (member: { path: string; data: Uint8Array; sha256: string; bytes: number }) => {
        const path = normalizeLmsArchivePath(member.path);
        if (!path) return;
        descriptors.push({ path, size: member.bytes });
        const basename = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
        const qualityInput = basename === 'imsmanifest.xml' ||
          basename === 'airtrust-completion-manifest.json' ||
          basename === 'airtrust-completion-diagnostics.json' ||
          basename === 'course-model.js' || /\.(?:js|css)$/.test(basename);
        let data: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
        if (qualityInput) {
          qualityBytes += member.bytes;
          if (qualityBytes > MAX_QUALITY_GATE_BYTES) {
            throw new ApiError('Arquivos de validação excedem o limite de memória do Quality Gate', 413);
          }
          data = member.data;
        }
        qualityEntries.push({ path, data });
        await params.bucket.put(`${prefix}${path}`, member.data, {
          sha256: sha256Bytes(member.sha256),
          httpMetadata: { contentType: mimeType(path), cacheControl: 'public, max-age=86400' },
        });
      },
    });
    if (result.zipSha256 !== params.expectedSha256 || result.r2ReadStats.rangeRequests > 6) {
      throw new ApiError('Readback do ZIP SCORM não corresponde ao candidato esperado', 409);
    }
    const manifest = qualityEntries.find((item) => item.path.toLowerCase() === 'imsmanifest.xml');
    if (!manifest) throw new ApiError('imsmanifest.xml ausente no candidato', 400);
    const metadata = validateStructuredScormMetadata({
      entries: descriptors,
      manifestPath: manifest.path,
      manifestBytes: manifest.data,
      limits: { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 250 * 1024 * 1024 },
    });
    const pkg = {
      tipoConteudo: 'scorm' as const,
      entries: qualityEntries,
      totalUncompressedBytes: result.expandedBytes,
      launchFile: metadata.launchFile,
      scormVersao: metadata.scormVersao,
      tipoH5p: null,
    };
    const quality = validateScormPackageQuality(pkg);
    const rejected = quality.structural.status === 'FAIL' ||
      quality.completionManifest.status === 'FAIL' || quality.diagnostics.status === 'FAIL';
    const status = rejected ? 'REJECTED' : 'VALIDATED';
    if (rejected) {
      const objects = await params.bucket.list({ prefix });
      if (objects.objects.length) await params.bucket.delete(objects.objects.map((item) => item.key));
    }
    const storedQuality = withScormUploadMetadata(quality, originalFilename);
    try {
      await params.db.batch([
        params.db.prepare(
        `INSERT INTO lms_scorm_package_versions (
          id, empresa_id, curso_id, package_version, package_sha256, zip_size_bytes, r2_prefix, launch_file, scorm_versao,
          uploaded_by, uploaded_at, status, validation_version, validation_started_at, validation_finished_at,
          validation_result_json, rejection_reasons_json, previous_active_package_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'), datetime('now'), ?, ?,
          (SELECT id FROM lms_scorm_package_versions WHERE empresa_id = ? AND curso_id = ? AND status = 'ACTIVE'))`,
        ).bind(id, params.empresaId, params.cursoId, `${new Date().toISOString()}-${params.expectedSha256.slice(0, 12)}`,
          params.expectedSha256, result.zipBytes, prefix, metadata.launchFile, metadata.scormVersao, params.userId, status,
          quality.validatorVersion, JSON.stringify(storedQuality), JSON.stringify(errors(quality)), params.empresaId,
          params.cursoId),
        params.db.prepare(
          `INSERT INTO lms_scorm_package_audit_log (id, empresa_id, curso_id, package_id, action, actor_id, created_at)
           VALUES (?, ?, ?, ?, 'UPLOAD', ?, datetime('now'))`,
        ).bind(crypto.randomUUID(), params.empresaId, params.cursoId, id, params.userId),
        params.db.prepare(
          `INSERT INTO lms_scorm_package_audit_log (id, empresa_id, curso_id, package_id, action, actor_id, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        ).bind(crypto.randomUUID(), params.empresaId, params.cursoId, id,
          rejected ? 'VALIDATION_FAILED' : 'VALIDATION_PASSED', params.userId,
          rejected ? errors(quality).join('; ') : 'STREAMED_ZIP_SHA_CRC_VALIDATED'),
      ]);
      registered = true;
    } catch (error) {
      // A concurrent retry with the same tenant/course/SHA is idempotent.
      const duplicate = await params.db.prepare(
        `SELECT id, empresa_id, curso_id, package_sha256, r2_prefix, launch_file, status, validation_result_json
           FROM lms_scorm_package_versions WHERE empresa_id = ? AND curso_id = ? AND package_sha256 = ?`,
      ).bind(params.empresaId, params.cursoId, params.expectedSha256).first<PackageRow>();
      if (duplicate) {
        const objects = await params.bucket.list({ prefix });
        if (objects.objects.length) await params.bucket.delete(objects.objects.map((item) => item.key));
        return { ...packageReadModel(duplicate), alreadyExisted: true, active: duplicate.status === 'ACTIVE' };
      }
      throw error;
    }
    return { packageId: id, packageSha256: params.expectedSha256, status, ...quality,
      arquivoNome: originalFilename, zipBytes: result.zipBytes, expandedBytes: result.expandedBytes,
      members: result.members, r2ReadStats: result.r2ReadStats,
      active: false, completionWritten: false, certificateIssued: false };
  } catch (error) {
    if (!registered) {
      const objects = await params.bucket.list({ prefix });
      if (objects.objects.length) await params.bucket.delete(objects.objects.map((item) => item.key));
    }
    throw error;
  } finally {
    await params.bucket.delete(intakeKey).catch(() => {});
  }
}

export function packageReadModel(row: PackageRow) {
  const validation = parseStoredScormValidation<ScormQualityGateResult>(row.validation_result_json);
  return {
    packageId: row.id,
    packageSha256: row.package_sha256,
    status: row.status,
    validatorVersion: validation?.validatorVersion ?? null,
    ...validation,
    r2Prefix: row.r2_prefix,
    launchFile: row.launch_file,
    arquivoNome: readScormUploadFilename(validation),
  };
}

export async function listScormPackageVersions(db: D1Database, empresaId: number, cursoId: number) {
  const rows = await db.prepare(
    `SELECT id, empresa_id, curso_id, package_sha256, r2_prefix, launch_file, status, validation_result_json
       FROM lms_scorm_package_versions WHERE empresa_id = ? AND curso_id = ? ORDER BY uploaded_at DESC`,
  ).bind(empresaId, cursoId).all<PackageRow>();
  return (rows.results ?? []).map(packageReadModel);
}

export async function activateScormPackageVersion(params: { db: D1Database; empresaId: number; cursoId: number; packageId: string; userId: number | null; attestationSecret?: string; runtimeSha?: string }) {
  const candidate = await params.db.prepare(
    `SELECT id, empresa_id, curso_id, package_sha256, r2_prefix, launch_file, status, validation_result_json
       FROM lms_scorm_package_versions WHERE id = ? AND empresa_id = ? AND curso_id = ?`,
  ).bind(params.packageId, params.empresaId, params.cursoId).first<PackageRow>();
  if (!candidate) throw new ApiError('Versão candidata não encontrada', 404);
  const quality = parseStoredScormValidation<ScormQualityGateResult>(candidate.validation_result_json);
  // Legacy validation JSON can contain publishable=true from a protocol-only
  // browser run. Never promote it without a complete SHA-bound functional gate.
  const storedAttestation = (quality as (ScormQualityGateResult & {
    trustedAttestation?: TrustedScormAttestation;
  }) | null)?.trustedAttestation;
  const provenanceVerified = await verifyTrustedScormAttestation(storedAttestation, {
    empresaId: params.empresaId, cursoId: params.cursoId,
    packageId: candidate.id, packageSha256: candidate.package_sha256,
    runtimeSha: params.runtimeSha ?? '',
    requiresAssessment: quality?.functionalCertification?.requiresAssessment ?? true,
  }, params.attestationSecret);
  if (candidate.status !== 'VALIDATED' || !provenanceVerified ||
      !canActivateCertifiedScormPackage(quality, candidate.package_sha256)) {
    throw new ApiError('Pacote não pode ser ativado: todos os gates obrigatórios devem passar', 409);
  }
  const originalFilename = readScormUploadFilename(quality);
  // The preflight can race with another activation of the same certified ZIP.
  // Enforce a second immutable validation check inside the D1 transaction.
  const activated = await commitCertifiedScormActivation({
    db: params.db, empresaId: params.empresaId, cursoId: params.cursoId,
    packageId: candidate.id, packageSha256: candidate.package_sha256,
    prefix: candidate.r2_prefix, launchFile: candidate.launch_file,
    originalFilename, actorId: params.userId,
    auditId: crypto.randomUUID(),
    validationJson: candidate.validation_result_json,
  });
  if (!activated) {
    throw new ApiError('A edição SCORM mudou durante a ativação; revalide o pacote', 409);
  }
  // Activation receipt and tenant-scoped diagnostic invalidation were already
  // committed in the same D1 batch as the certified course pointer switch.
  return packageReadModel({ ...candidate, status: 'ACTIVE' });
}

async function candidateAssets(bucket: R2Bucket, prefix: string) {
  const assets: Array<{ path: string; data: Uint8Array }> = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (let index = 0; index < page.objects.length; index += SCORM_PACKAGE_R2_BATCH_SIZE) {
      const batch = await Promise.all(
        page.objects
          .slice(index, index + SCORM_PACKAGE_R2_BATCH_SIZE)
          .map(async (item) => {
            const object = await bucket.get(item.key);
            if (!object) return null;
            return {
              path: item.key.slice(prefix.length),
              data: new Uint8Array(await object.arrayBuffer()),
            };
          }),
      );
      for (const asset of batch) {
        if (asset) assets.push(asset);
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return assets;
}

export async function runScormPackageConformance(params: {
  db: D1Database; bucket: R2Bucket; browserBinding: unknown; empresaId: number; cursoId: number; packageId: string; userId: number | null;
}) {
  const candidate = await params.db.prepare(
    `SELECT id, empresa_id, curso_id, package_sha256, r2_prefix, launch_file, status, validation_result_json
       FROM lms_scorm_package_versions WHERE id = ? AND empresa_id = ? AND curso_id = ?`,
  ).bind(params.packageId, params.empresaId, params.cursoId).first<PackageRow>();
  if (!candidate) throw new ApiError('Versão candidata não encontrada', 404);
  if (!['VALIDATED', 'REJECTED'].includes(candidate.status)) throw new ApiError('Estado do candidato não permite conformance', 409);
  const staticResult = parseStoredScormValidation<ScormQualityGateResult>(
    candidate.validation_result_json,
  );
  if (!staticResult) throw new ApiError('Validação estática ausente', 409);
  const originalFilename = readScormUploadFilename(staticResult);
  const runtime = await runScormBrowserConformance({ browserBinding: params.browserBinding, candidateSha256: candidate.package_sha256, launchFile: candidate.launch_file, assets: await candidateAssets(params.bucket, candidate.r2_prefix) });
  const result = applyRuntimeConformance(staticResult, runtime, candidate.package_sha256);
  const status = result.publishable ? 'VALIDATED' : staticResult.structural.status === 'FAIL' || staticResult.completionManifest.status === 'FAIL' || staticResult.diagnostics.status === 'FAIL' ? 'REJECTED' : 'VALIDATED';
  const storedResult = withScormUploadMetadata({ ...result, runtime }, originalFilename);
  await params.db.batch([
    params.db.prepare(`UPDATE lms_scorm_package_versions SET status = ?, validation_finished_at = datetime('now'), validation_result_json = ?, rejection_reasons_json = ? WHERE id = ? AND empresa_id = ? AND curso_id = ? AND package_sha256 = ?`).bind(status, JSON.stringify(storedResult), JSON.stringify(runtime.errors), candidate.id, params.empresaId, params.cursoId, candidate.package_sha256),
    params.db.prepare(`INSERT INTO lms_scorm_package_audit_log (id, empresa_id, curso_id, package_id, action, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).bind(crypto.randomUUID(), params.empresaId, params.cursoId, candidate.id, result.publishable ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED', params.userId, runtime.errors.join('; ')),
  ]);
  return { ...result, runtime };
}

/**
 * Import a separately signed, staging-proven QA result for an immutable ZIP
 * edition. The actor cannot set "CERTIFIED" or the course pointer directly.
 * Only this verifier can reconstruct a publishable stored gate verdict.
 */
export async function importScormFunctionalAttestation(params: {
  db: D1Database; empresaId: number; cursoId: number; packageId: string;
  userId: number | null; attestation: unknown;
  attestationSecret?: string; runtimeSha?: string;
}) {
  const candidate = await params.db.prepare(
    `SELECT id, empresa_id, curso_id, package_sha256, r2_prefix, launch_file, status, validation_result_json
       FROM lms_scorm_package_versions WHERE id = ? AND empresa_id = ? AND curso_id = ?`,
  ).bind(params.packageId, params.empresaId, params.cursoId).first<PackageRow>();
  if (!candidate) throw new ApiError('Versão candidata não encontrada', 404);
  const quality = parseStoredScormValidation<ScormQualityGateResult>(candidate.validation_result_json);
  const runtime = (quality as (ScormQualityGateResult & { runtime?: import('./lms-scorm-quality-gate').ScormRuntimeConformance }) | null)?.runtime;
  if (candidate.status !== 'VALIDATED' || !runtime ||
      runtime.status !== 'PASS' || runtime.candidateSha256 !== candidate.package_sha256 ||
      !quality || quality.conformance?.status !== 'PASS') {
    throw new ApiError('Conformidade técnica persistida não aprovada para esta edição', 409);
  }
  const envelope = params.attestation as TrustedScormAttestation | null;
  const expectedPolicy = runtime.requiresAssessmentEvidence !== false;
  const verified = await verifyTrustedScormAttestation(envelope, {
    empresaId: params.empresaId, cursoId: params.cursoId,
    packageId: candidate.id, packageSha256: candidate.package_sha256,
    runtimeSha: params.runtimeSha ?? '', requiresAssessment: expectedPolicy,
  }, params.attestationSecret);
  if (!verified || !envelope) {
    throw new ApiError('Atestação funcional independente inválida ou sem proveniência', 409);
  }
  const result = applyRuntimeConformance(quality, runtime,
    candidate.package_sha256, envelope.payload.runs);
  if (!result.publishable || !canActivateCertifiedScormPackage(result, candidate.package_sha256)) {
    throw new ApiError('Cenários funcionais incompletos; ativação não autorizada', 409);
  }
  const stored = { ...result, runtime, trustedAttestation: envelope };
  await params.db.batch([
    params.db.prepare(
      `UPDATE lms_scorm_package_versions
         SET validation_result_json = ?, validation_finished_at = datetime('now')
       WHERE id = ? AND empresa_id = ? AND curso_id = ? AND package_sha256 = ? AND status = 'VALIDATED'`,
    ).bind(JSON.stringify(stored), candidate.id, params.empresaId, params.cursoId,
      candidate.package_sha256),
    params.db.prepare(
      `INSERT INTO lms_scorm_package_audit_log
         (id, empresa_id, curso_id, package_id, action, actor_id, reason, created_at)
       VALUES (?, ?, ?, ?, 'VALIDATION_PASSED', ?, ?, datetime('now'))`,
    ).bind(crypto.randomUUID(), params.empresaId, params.cursoId,
      candidate.id, params.userId, 'SIGNED_FUNCTIONAL_ATTESTATION'),
  ]);
  return { packageId: candidate.id, packageSha256: candidate.package_sha256,
    status: result.functionalCertification.status, publishable: result.publishable };
}
