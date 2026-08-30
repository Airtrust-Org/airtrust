import { ApiError } from '../../middleware/error-handler';
import { extractAndValidateLmsPackage, extractScormStaticGateMetadata } from './lms-package-validator';
import { validateScormPackageQuality, type ScormQualityGateResult } from './lms-scorm-quality-gate';
import { applyRuntimeConformance } from './lms-scorm-quality-gate';
import { runScormBrowserConformance } from './lms-scorm-browser-run';
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
      for (const item of pkg.entries) {
        await params.bucket.put(`${prefix}${item.path}`, item.data, { httpMetadata: { contentType: mimeType(item.path), cacheControl: 'public, max-age=86400' } });
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

export async function activateScormPackageVersion(params: { db: D1Database; empresaId: number; cursoId: number; packageId: string; userId: number | null }) {
  const candidate = await params.db.prepare(
    `SELECT id, empresa_id, curso_id, package_sha256, r2_prefix, launch_file, status, validation_result_json
       FROM lms_scorm_package_versions WHERE id = ? AND empresa_id = ? AND curso_id = ?`,
  ).bind(params.packageId, params.empresaId, params.cursoId).first<PackageRow>();
  if (!candidate) throw new ApiError('Versão candidata não encontrada', 404);
  const quality = parseStoredScormValidation<ScormQualityGateResult>(candidate.validation_result_json);
  if (candidate.status !== 'VALIDATED' || !quality?.publishable) {
    throw new ApiError('Pacote não pode ser ativado: todos os gates obrigatórios devem passar', 409);
  }
  const originalFilename = readScormUploadFilename(quality);
  // Atomic D1 batch switches the course pointer only after the stored, exact SHA result is publishable.
  await params.db.batch([
    params.db.prepare(`UPDATE lms_scorm_package_versions SET status = 'SUPERSEDED' WHERE empresa_id = ? AND curso_id = ? AND status = 'ACTIVE'`).bind(params.empresaId, params.cursoId),
    params.db.prepare(`UPDATE lms_scorm_package_versions SET status = 'ACTIVE', activated_at = datetime('now'), activated_by = ? WHERE id = ? AND empresa_id = ? AND curso_id = ? AND package_sha256 = ? AND status = 'VALIDATED'`).bind(params.userId, candidate.id, params.empresaId, params.cursoId, candidate.package_sha256),
    params.db.prepare(`UPDATE lms_cursos SET tipo_conteudo = 'scorm', scorm_package_r2_prefix = ?, scorm_launch_file = ?, scorm_versao = '1.2', conteudo_arquivo_nome = COALESCE(?, conteudo_arquivo_nome), updated_at = datetime('now') WHERE id = ? AND empresa_id = ?`).bind(candidate.r2_prefix, candidate.launch_file, originalFilename, params.cursoId, params.empresaId),
  ]);
  await params.db.prepare(
    `INSERT INTO lms_scorm_package_audit_log (id, empresa_id, curso_id, package_id, action, actor_id, created_at)
     VALUES (?, ?, ?, ?, 'ACTIVATED', ?, datetime('now'))`,
  ).bind(crypto.randomUUID(), params.empresaId, params.cursoId, candidate.id, params.userId).run();
  // O snapshot informativo de diagnóstico (lms_completion_diagnostics_snapshots)
  // é chaveado por empresa/matrícula/curso/tentativa — não por identidade do
  // pacote. Ao trocar efetivamente o pacote SCORM ativo, invalidamos os
  // snapshots do curso (tenant-scoped) para que um 68% antigo não fique preso ao
  // novo pacote. É read model puramente informativo: não toca matrícula,
  // progresso, conclusão nem qualificação.
  await params.db
    .prepare(
      `DELETE FROM lms_completion_diagnostics_snapshots WHERE empresa_id = ? AND curso_id = ?`,
    )
    .bind(params.empresaId, params.cursoId)
    .run();
  return packageReadModel({ ...candidate, status: 'ACTIVE' });
}

async function candidateAssets(bucket: R2Bucket, prefix: string) {
  const assets: Array<{ path: string; data: Uint8Array }> = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const item of page.objects) {
      const object = await bucket.get(item.key);
      if (object) assets.push({ path: item.key.slice(prefix.length), data: new Uint8Array(await object.arrayBuffer()) });
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
    params.db.prepare(`INSERT INTO lms_scorm_package_audit_log (id, empresa_id, curso_id, package_id, action, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).bind(crypto.randomUUID(), params.empresaId, params.cursoId, candidate.id, runtime.status === 'PASS' ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED', params.userId, runtime.errors.join('; ')),
  ]);
  return { ...result, runtime };
}
