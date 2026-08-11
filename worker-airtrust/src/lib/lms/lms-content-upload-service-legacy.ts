import { ApiError } from '../../middleware/error-handler';
import {
  extractAndValidateLmsPackage,
  LMS_PACKAGE_LIMITS,
  normalizeLmsArchivePath,
  type LmsStructuredContentType,
  type UploadedEntryDescriptor,
  type ValidatedLmsPackage,
  validateStructuredH5pMetadata,
  validateStructuredScormMetadata,
  validateUploadedEntryDescriptors,
} from './lms-package-validator';

export type CourseUploadContext = {
  id: number;
  empresa_id: number;
  titulo: string;
  version_tag: string | null;
  scorm_package_r2_prefix: string | null;
  tipo_conteudo: string | null;
  h5p_conteudo_id: number | null;
};

export type UploadOperationMarker = {
  schemaVersion: 1;
  operationId: string;
  idempotencyKeyHash: string | null;
  empresaId: number;
  cursoId: number;
  tipoConteudo: LmsStructuredContentType;
  prefix: string;
  relativePrefix: string;
  previousPrefix: string | null;
  previousVersionTag: string | null;
  previousH5pConteudoId: number | null;
  status: 'uploading' | 'completed';
  createdAt: string;
  completedAt?: string;
  result?: UploadCommitResult;
};

export type UploadCommitResult = {
  prefix: string;
  launch_file: string | null;
  scorm_versao: '1.2' | '2004' | null;
  h5p_id: number | null;
  tipo_h5p: string | null;
  conteudo_arquivo_nome: string | null;
  files_uploaded: number;
};

export type BeginUploadParams = {
  db: D1Database;
  bucket: R2Bucket;
  empresaId: number;
  cursoId: number;
  tipoConteudo: LmsStructuredContentType;
  hasH5pConteudoIdColumn: boolean;
  idempotencyKey?: string | null;
};

const MARKER_FILE = '.airtrust-upload.json';
const OPERATION_ID_PATTERN = /^[a-f0-9-]{16,64}$/i;

function mimeType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const known: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
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
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    pdf: 'application/pdf',
  };
  return known[extension] ?? 'application/octet-stream';
}

function basePrefix(tipoConteudo: LmsStructuredContentType, empresaId: number, cursoId: number) {
  return `lms/${tipoConteudo}/${empresaId}/${cursoId}/`;
}

function markerKey(prefix: string) {
  return `${prefix}${MARKER_FILE}`;
}

function createVersionTag() {
  return `${new Date().toISOString()}-${crypto.randomUUID()}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function resolveOperationId(params: {
  empresaId: number;
  cursoId: number;
  tipoConteudo: LmsStructuredContentType;
  idempotencyKey?: string | null;
}) {
  const normalizedKey = params.idempotencyKey?.trim();
  if (!normalizedKey) return { operationId: crypto.randomUUID(), idempotencyKeyHash: null };
  if (normalizedKey.length > 200) throw new ApiError('Idempotency-Key excede 200 caracteres', 400);
  const idempotencyKeyHash = await sha256Hex(
    `${params.empresaId}:${params.cursoId}:${params.tipoConteudo}:${normalizedKey}`,
  );
  return { operationId: idempotencyKeyHash.slice(0, 40), idempotencyKeyHash };
}

async function readMarker(bucket: R2Bucket, prefix: string): Promise<UploadOperationMarker | null> {
  const object = await bucket.get(markerKey(prefix));
  if (!object) return null;
  try {
    const parsed = JSON.parse(await object.text()) as UploadOperationMarker;
    return parsed?.schemaVersion === 1 ? parsed : null;
  } catch {
    throw new ApiError('Estado da operação de upload está corrompido', 500);
  }
}

async function writeMarker(bucket: R2Bucket, marker: UploadOperationMarker) {
  await bucket.put(markerKey(marker.prefix), JSON.stringify(marker), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
  });
}

export async function purgeR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.map((object) => object.key);
    if (keys.length > 0) await bucket.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

async function safePurgeAttempt(bucket: R2Bucket, prefix: string): Promise<void> {
  try {
    await purgeR2Prefix(bucket, prefix);
  } catch (error) {
    console.error('[LMS_UPLOAD_COMPENSATION_FAILED]', {
      code: 'LMS_UPLOAD_COMPENSATION_FAILED',
      prefix,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}

function canDeletePreviousPrefix(previousPrefix: string | null, newPrefix: string): boolean {
  if (!previousPrefix || previousPrefix === newPrefix) return false;
  if (newPrefix.startsWith(previousPrefix)) return false;
  return previousPrefix.includes('/_versions/');
}

async function getCourseContext(
  db: D1Database,
  empresaId: number,
  cursoId: number,
  hasH5pConteudoIdColumn: boolean,
): Promise<CourseUploadContext> {
  const h5pSelect = hasH5pConteudoIdColumn ? 'h5p_conteudo_id' : 'NULL AS h5p_conteudo_id';
  const course = await db
    .prepare(
      `SELECT id, empresa_id, titulo, version_tag, scorm_package_r2_prefix, tipo_conteudo,
              ${h5pSelect}
         FROM lms_cursos
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(cursoId, empresaId)
    .first<CourseUploadContext>();
  if (!course) throw new ApiError('Curso não encontrado', 404);
  return course;
}

export async function beginLmsContentUpload(params: BeginUploadParams): Promise<UploadOperationMarker> {
  const course = await getCourseContext(
    params.db,
    params.empresaId,
    params.cursoId,
    params.hasH5pConteudoIdColumn,
  );
  const { operationId, idempotencyKeyHash } = await resolveOperationId(params);
  const relativePrefix = `_versions/${operationId}/`;
  const prefix = `${basePrefix(params.tipoConteudo, params.empresaId, params.cursoId)}${relativePrefix}`;

  const existing = await readMarker(params.bucket, prefix);
  if (existing) {
    if (
      existing.empresaId !== params.empresaId ||
      existing.cursoId !== params.cursoId ||
      existing.tipoConteudo !== params.tipoConteudo ||
      existing.idempotencyKeyHash !== idempotencyKeyHash
    ) {
      throw new ApiError('Conflito de idempotência na operação de upload', 409);
    }
    return existing;
  }

  const marker: UploadOperationMarker = {
    schemaVersion: 1,
    operationId,
    idempotencyKeyHash,
    empresaId: params.empresaId,
    cursoId: params.cursoId,
    tipoConteudo: params.tipoConteudo,
    prefix,
    relativePrefix,
    previousPrefix: course.scorm_package_r2_prefix,
    previousVersionTag: course.version_tag,
    previousH5pConteudoId: course.h5p_conteudo_id,
    status: 'uploading',
    createdAt: new Date().toISOString(),
  };
  await writeMarker(params.bucket, marker);
  return marker;
}

function assertMarkerScope(
  marker: UploadOperationMarker,
  params: { empresaId: number; cursoId: number; tipoConteudo: LmsStructuredContentType; operationId: string },
) {
  if (!OPERATION_ID_PATTERN.test(params.operationId)) throw new ApiError('upload_id inválido', 400);
  if (
    marker.operationId !== params.operationId ||
    marker.empresaId !== params.empresaId ||
    marker.cursoId !== params.cursoId ||
    marker.tipoConteudo !== params.tipoConteudo
  ) {
    throw new ApiError('Operação de upload não pertence a este curso/tenant', 403);
  }
}

export async function putLmsContentUploadFile(params: {
  bucket: R2Bucket;
  empresaId: number;
  cursoId: number;
  tipoConteudo: LmsStructuredContentType;
  operationId: string;
  path: string;
  body: ReadableStream<Uint8Array> | Uint8Array;
  byteLength: number;
}) {
  const prefix = `${basePrefix(params.tipoConteudo, params.empresaId, params.cursoId)}_versions/${params.operationId}/`;
  const marker = await readMarker(params.bucket, prefix);
  if (!marker) throw new ApiError('Operação de upload não encontrada ou expirada', 404);
  assertMarkerScope(marker, params);
  if (marker.status !== 'uploading') throw new ApiError('Operação de upload já finalizada', 409);

  const path = normalizeLmsArchivePath(params.path);
  if (!path) throw new ApiError('Caminho de arquivo inválido', 400);
  if (params.byteLength > LMS_PACKAGE_LIMITS.maxFileBytes) {
    throw new ApiError('Arquivo individual excede o limite de 64 MB', 413);
  }

  await params.bucket.put(`${prefix}${path}`, params.body, {
    httpMetadata: { contentType: mimeType(path), cacheControl: 'public, max-age=86400' },
  });
  return { path, bytes: params.byteLength };
}

async function listUploadedEntries(bucket: R2Bucket, marker: UploadOperationMarker) {
  const entries: UploadedEntryDescriptor[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: marker.prefix, cursor, limit: 1000 });
    for (const object of page.objects) {
      if (object.key === markerKey(marker.prefix)) continue;
      if (!object.key.startsWith(marker.prefix)) continue;
      entries.push({ path: object.key.slice(marker.prefix.length), size: object.size });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return validateUploadedEntryDescriptors(entries).normalized;
}

async function getRequiredObject(bucket: R2Bucket, key: string, label: string): Promise<Uint8Array> {
  const object = await bucket.get(key);
  if (!object) throw new ApiError(`${label} não encontrado no storage`, 500);
  return new Uint8Array(await object.arrayBuffer());
}

async function validateStructuredOperation(bucket: R2Bucket, marker: UploadOperationMarker) {
  const entries = await listUploadedEntries(bucket, marker);
  if (marker.tipoConteudo === 'scorm') {
    const manifestMatches = entries.filter(
      (entry) =>
        entry.path.toLowerCase() === 'imsmanifest.xml' ||
        entry.path.toLowerCase().endsWith('/imsmanifest.xml'),
    );
    if (manifestMatches.length !== 1) {
      throw new ApiError(
        manifestMatches.length === 0
          ? 'imsmanifest.xml não encontrado no upload'
          : 'O upload contém mais de um imsmanifest.xml',
        400,
      );
    }
    const manifest = manifestMatches[0]!;
    const bytes = await getRequiredObject(bucket, `${marker.prefix}${manifest.path}`, 'imsmanifest.xml');
    const validated = validateStructuredScormMetadata({
      entries,
      manifestPath: manifest.path,
      manifestBytes: bytes,
    });
    return { entries, launchFile: validated.launchFile, scormVersao: validated.scormVersao, tipoH5p: null };
  }

  const h5pMatches = entries.filter(
    (entry) => entry.path.toLowerCase() === 'h5p.json' || entry.path.toLowerCase().endsWith('/h5p.json'),
  );
  if (h5pMatches.length !== 1) {
    throw new ApiError(
      h5pMatches.length === 0 ? 'h5p.json não encontrado no upload' : 'O upload contém mais de um h5p.json',
      400,
    );
  }
  const h5pJson = h5pMatches[0]!;
  const bytes = await getRequiredObject(bucket, `${marker.prefix}${h5pJson.path}`, 'h5p.json');
  const validated = validateStructuredH5pMetadata({ entries, h5pJsonPath: h5pJson.path, h5pJsonBytes: bytes });
  return { entries, launchFile: null, scormVersao: null, tipoH5p: validated.tipoH5p };
}

async function findH5pByPrefix(db: D1Database, empresaId: number, prefix: string) {
  return db
    .prepare(
      `SELECT id FROM lms_h5p_conteudos
        WHERE empresa_id = ? AND r2_key = ? AND ativo = 1 AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 1`,
    )
    .bind(empresaId, prefix)
    .first<{ id: number }>();
}

async function compensateH5pRow(db: D1Database, empresaId: number, h5pId: number | null) {
  if (!h5pId) return;
  try {
    await db
      .prepare(
        `UPDATE lms_h5p_conteudos
            SET ativo = 0, deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ?`,
      )
      .bind(h5pId, empresaId)
      .run();
  } catch (error) {
    console.error('[LMS_H5P_DB_COMPENSATION_FAILED]', {
      code: 'LMS_H5P_DB_COMPENSATION_FAILED',
      empresaId,
      h5pId,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}

async function commitCoursePointer(params: {
  db: D1Database;
  marker: UploadOperationMarker;
  courseTitle: string;
  hasH5pConteudoIdColumn: boolean;
  launchFile: string | null;
  scormVersao: '1.2' | '2004' | null;
  tipoH5p: string | null;
  arquivoNome: string | null;
  filesUploaded: number;
}): Promise<UploadCommitResult> {
  const { db, marker } = params;
  const versionTag = createVersionTag();
  let newH5pId: number | null = null;

  if (marker.tipoConteudo === 'h5p') {
    const insert = await db
      .prepare(
        `INSERT INTO lms_h5p_conteudos (empresa_id, titulo, tipo_h5p, r2_key)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(marker.empresaId, params.courseTitle, params.tipoH5p ?? 'CoursePresentation', marker.prefix)
      .run();
    newH5pId = Number(insert.meta.last_row_id);
    if (!newH5pId) throw new ApiError('Falha ao criar associação H5P', 500);
  }

  const launchFile =
    marker.tipoConteudo === 'scorm' && params.launchFile
      ? `${marker.relativePrefix}${params.launchFile}`
      : null;
  const h5pColumnSet = params.hasH5pConteudoIdColumn ? ', h5p_conteudo_id = ?' : '';
  const values: unknown[] = [
    marker.tipoConteudo,
    marker.prefix,
    launchFile,
    params.scormVersao,
    params.arquivoNome,
    versionTag,
  ];
  if (params.hasH5pConteudoIdColumn) values.push(newH5pId);
  values.push(
    marker.cursoId,
    marker.empresaId,
    marker.previousVersionTag,
    marker.previousPrefix,
  );

  let update;
  try {
    update = await db
      .prepare(
        `UPDATE lms_cursos
            SET tipo_conteudo = ?,
                scorm_package_r2_prefix = ?,
                scorm_launch_file = ?,
                scorm_versao = ?,
                conteudo_arquivo_nome = ?,
                version_tag = ?,
                updated_at = datetime('now')
                ${h5pColumnSet}
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
            AND COALESCE(version_tag, '') = COALESCE(?, '')
            AND COALESCE(scorm_package_r2_prefix, '') = COALESCE(?, '')`,
      )
      .bind(...values)
      .run();
  } catch (error) {
    await compensateH5pRow(db, marker.empresaId, newH5pId);
    throw error;
  }

  if (Number(update.meta.changes ?? 0) !== 1) {
    const current = await getCourseContext(
      db,
      marker.empresaId,
      marker.cursoId,
      params.hasH5pConteudoIdColumn,
    );
    if (current.scorm_package_r2_prefix === marker.prefix) {
      const existingH5p = marker.tipoConteudo === 'h5p'
        ? await findH5pByPrefix(db, marker.empresaId, marker.prefix)
        : null;
      return {
        prefix: marker.prefix,
        launch_file: current.tipo_conteudo === 'scorm' ? launchFile : null,
        scorm_versao: params.scormVersao,
        h5p_id: existingH5p?.id ?? newH5pId,
        tipo_h5p: params.tipoH5p,
        conteudo_arquivo_nome: params.arquivoNome,
        files_uploaded: params.filesUploaded,
      };
    }

    await compensateH5pRow(db, marker.empresaId, newH5pId);
    throw new ApiError('Outro upload alterou este curso; a tentativa concorrente foi descartada', 409);
  }

  if (marker.previousH5pConteudoId && marker.previousH5pConteudoId !== newH5pId) {
    await compensateH5pRow(db, marker.empresaId, marker.previousH5pConteudoId);
  }

  return {
    prefix: marker.prefix,
    launch_file: launchFile,
    scorm_versao: params.scormVersao,
    h5p_id: newH5pId,
    tipo_h5p: params.tipoH5p,
    conteudo_arquivo_nome: params.arquivoNome,
    files_uploaded: params.filesUploaded,
  };
}

async function finishOperation(params: {
  db: D1Database;
  bucket: R2Bucket;
  marker: UploadOperationMarker;
  hasH5pConteudoIdColumn: boolean;
  arquivoNome: string | null;
  packageMeta: {
    launchFile: string | null;
    scormVersao: '1.2' | '2004' | null;
    tipoH5p: string | null;
    filesUploaded: number;
  };
}) {
  if (params.marker.status === 'completed' && params.marker.result) return params.marker.result;

  const course = await getCourseContext(
    params.db,
    params.marker.empresaId,
    params.marker.cursoId,
    params.hasH5pConteudoIdColumn,
  );

  let result: UploadCommitResult;
  if (course.scorm_package_r2_prefix === params.marker.prefix) {
    const existingH5p = params.marker.tipoConteudo === 'h5p'
      ? await findH5pByPrefix(params.db, params.marker.empresaId, params.marker.prefix)
      : null;
    result = {
      prefix: params.marker.prefix,
      launch_file:
        params.marker.tipoConteudo === 'scorm' && params.packageMeta.launchFile
          ? `${params.marker.relativePrefix}${params.packageMeta.launchFile}`
          : null,
      scorm_versao: params.packageMeta.scormVersao,
      h5p_id: course.h5p_conteudo_id ?? existingH5p?.id ?? null,
      tipo_h5p: params.packageMeta.tipoH5p,
      conteudo_arquivo_nome: params.arquivoNome,
      files_uploaded: params.packageMeta.filesUploaded,
    };
  } else {
    try {
      result = await commitCoursePointer({
        db: params.db,
        marker: params.marker,
        courseTitle: course.titulo,
        hasH5pConteudoIdColumn: params.hasH5pConteudoIdColumn,
        launchFile: params.packageMeta.launchFile,
        scormVersao: params.packageMeta.scormVersao,
        tipoH5p: params.packageMeta.tipoH5p,
        arquivoNome: params.arquivoNome,
        filesUploaded: params.packageMeta.filesUploaded,
      });
    } catch (error) {
      await safePurgeAttempt(params.bucket, params.marker.prefix);
      throw error;
    }
  }

  const completedMarker: UploadOperationMarker = {
    ...params.marker,
    status: 'completed',
    completedAt: new Date().toISOString(),
    result,
  };
  try {
    await writeMarker(params.bucket, completedMarker);
  } catch (error) {
    console.error('[LMS_UPLOAD_MARKER_FINALIZE_FAILED]', {
      code: 'LMS_UPLOAD_MARKER_FINALIZE_FAILED',
      operationId: params.marker.operationId,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }

  if (canDeletePreviousPrefix(params.marker.previousPrefix, params.marker.prefix)) {
    await safePurgeAttempt(params.bucket, params.marker.previousPrefix!);
  }
  return result;
}

export async function completeStructuredLmsContentUpload(params: {
  db: D1Database;
  bucket: R2Bucket;
  empresaId: number;
  cursoId: number;
  tipoConteudo: LmsStructuredContentType;
  operationId: string;
  hasH5pConteudoIdColumn: boolean;
  arquivoNome: string | null;
}) {
  const prefix = `${basePrefix(params.tipoConteudo, params.empresaId, params.cursoId)}_versions/${params.operationId}/`;
  const marker = await readMarker(params.bucket, prefix);
  if (!marker) throw new ApiError('Operação de upload não encontrada ou expirada', 404);
  assertMarkerScope(marker, params);
  if (marker.status === 'completed' && marker.result) return marker.result;

  const validated = await validateStructuredOperation(params.bucket, marker);
  return finishOperation({
    ...params,
    marker,
    arquivoNome: params.arquivoNome,
    packageMeta: {
      launchFile: validated.launchFile,
      scormVersao: validated.scormVersao,
      tipoH5p: validated.tipoH5p,
      filesUploaded: validated.entries.length,
    },
  });
}

async function uploadPackageEntries(
  bucket: R2Bucket,
  marker: UploadOperationMarker,
  pkg: ValidatedLmsPackage,
) {
  for (let index = 0; index < pkg.entries.length; index += LMS_PACKAGE_LIMITS.uploadBatchSize) {
    const batch = pkg.entries.slice(index, index + LMS_PACKAGE_LIMITS.uploadBatchSize);
    await Promise.all(
      batch.map((entry) =>
        bucket.put(`${marker.prefix}${entry.path}`, entry.data, {
          httpMetadata: { contentType: mimeType(entry.path), cacheControl: 'public, max-age=86400' },
        }),
      ),
    );
  }

  const listed = await listUploadedEntries(bucket, marker);
  const expected = new Set(pkg.entries.map((entry) => entry.path));
  if (listed.length !== expected.size || listed.some((entry) => !expected.has(entry.path))) {
    throw new ApiError(
      `Upload incompleto: ${listed.length}/${expected.size} arquivos confirmados no storage`,
      500,
    );
  }
}

export async function uploadLmsZipPackage(params: BeginUploadParams & {
  bytes: Uint8Array;
  arquivoNome: string | null;
}): Promise<UploadCommitResult> {
  const pkg = extractAndValidateLmsPackage(params.bytes, params.tipoConteudo);
  const marker = await beginLmsContentUpload(params);
  if (marker.status === 'completed' && marker.result) return marker.result;

  try {
    await uploadPackageEntries(params.bucket, marker, pkg);
    return await finishOperation({
      db: params.db,
      bucket: params.bucket,
      marker,
      hasH5pConteudoIdColumn: params.hasH5pConteudoIdColumn,
      arquivoNome: params.arquivoNome,
      packageMeta: {
        launchFile: pkg.launchFile,
        scormVersao: pkg.scormVersao,
        tipoH5p: pkg.tipoH5p,
        filesUploaded: pkg.entries.length,
      },
    });
  } catch (error) {
    await safePurgeAttempt(params.bucket, marker.prefix);
    throw error;
  }
}
