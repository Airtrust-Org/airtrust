import { ApiError } from '../../middleware/error-handler';

const MiB = 1024 * 1024;
export const F5_STREAMED_ZIP_LIMITS = Object.freeze({
  zipBytes: 80 * MiB,
  partBytes: 8 * MiB,
  maxParts: 10,
  leaseMs: 30 * 60 * 1000,
  mutexName: 'airtrust-staging-mutations-and-scorm-qa',
});

type GrantCourse = {
  tenantId: number;
  courseId: number;
  packageSha256: string;
  zipBytes: number;
};
type Grant = {
  grantId: string;
  runtimeSha: string;
  expiresAt: string;
  mutex: string;
  courses: GrantCourse[];
};
type IntakeMarker = {
  operationId: string;
  uploadId: string;
  state: 'initializing' | 'uploading';
  tenantId: number;
  courseId: number;
  packageSha256: string;
  zipBytes: number;
  grantId: string;
  runtimeSha: string;
  arquivoNome: string | null;
};

function fail(message: string, status = 400): never {
  throw new ApiError(message, status);
}

function cleanEtag(etag: string | undefined): string | undefined {
  if (typeof etag !== 'string') return undefined;
  const trimmed = etag.trim().replace(/^"+|"+$/g, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseF5Grant(raw: string | undefined, params: {
  environment: string;
  runtimeSha: string | undefined;
  tenantId: number;
  courseId: number;
  packageSha256: string;
  zipBytes: number;
  allowExpiredForRecovery?: boolean;
}) {
  if (params.environment !== 'staging' || !raw || !params.runtimeSha) {
    fail('Importação SCORM F5 indisponível fora do grant de staging', 403);
  }
  let grant: Grant;
  try { grant = JSON.parse(raw) as Grant; } catch { fail('Grant SCORM F5 inválido', 403); }
  if (!grant.grantId || grant.runtimeSha !== params.runtimeSha ||
      grant.mutex !== F5_STREAMED_ZIP_LIMITS.mutexName ||
      !Number.isFinite(Date.parse(grant.expiresAt)) ||
      (!params.allowExpiredForRecovery && Date.parse(grant.expiresAt) <= Date.now()) ||
      !Array.isArray(grant.courses)) {
    fail('Grant SCORM F5 expirado ou incompatível com o runtime/mutex', 403);
  }
  const approved = grant.courses.some((item) => item.tenantId === params.tenantId &&
    item.courseId === params.courseId && item.packageSha256 === params.packageSha256 &&
    item.zipBytes === params.zipBytes);
  if (!approved) fail('Curso, tenant, SHA-256 ou tamanho fora do grant F5', 403);
  if (!/^[a-f0-9]{64}$/.test(params.packageSha256) || !Number.isSafeInteger(params.zipBytes) ||
      params.zipBytes < 22 || params.zipBytes > F5_STREAMED_ZIP_LIMITS.zipBytes) {
    fail('Tamanho ou SHA-256 do pacote SCORM inválido', 413);
  }
  return grant;
}

export function streamedIntakeKeys(tenantId: number, courseId: number, operationId: string) {
  const prefix = `lms/scorm/${tenantId}/${courseId}/_intake/${operationId}/`;
  return {
    prefix,
    zip: `${prefix}package.zip`,
    marker: `${prefix}.intake.json`,
    part: (number: number) => `${prefix}.parts/${number}.json`,
    lock: 'lms/scorm/_intake/.f5-staging-mutex',
  };
}

export async function beginF5StreamedIntake(params: {
  bucket: R2Bucket;
  operationId: string;
  grantId: string;
  runtimeSha: string;
  tenantId: number;
  courseId: number;
  packageSha256: string;
  zipBytes: number;
  arquivoNome: string | null;
}) {
  const operationId = params.operationId;
  if (!/^[a-f0-9-]{36}$/i.test(operationId)) fail('Identidade da importação SCORM inválida', 400);
  const keys = streamedIntakeKeys(params.tenantId, params.courseId, operationId);
  const lockToken = crypto.randomUUID();
  const lockHead = await params.bucket.head(keys.lock);
  if (lockHead) {
    let current: { state?: string; operationId?: string } | null = null;
    try {
      const object = await params.bucket.get(keys.lock);
      current = object ? await object.json<{ state?: string; operationId?: string }>() : null;
    } catch { /* malformed lock requires authenticated manual recovery */ }
    if (current?.state === 'active' && current.operationId === operationId) {
      const markerObject = await params.bucket.get(keys.marker);
      const marker = markerObject ? await markerObject.json<IntakeMarker>() : null;
      if (marker && marker.state === 'uploading' && marker.uploadId && marker.operationId === operationId && marker.tenantId === params.tenantId &&
          marker.courseId === params.courseId && marker.packageSha256 === params.packageSha256 &&
          marker.zipBytes === params.zipBytes && marker.grantId === params.grantId &&
          marker.runtimeSha === params.runtimeSha) {
        return { operationId, zipBytes: marker.zipBytes, partBytes: F5_STREAMED_ZIP_LIMITS.partBytes,
          partCount: Math.ceil(marker.zipBytes / F5_STREAMED_ZIP_LIMITS.partBytes), resumed: true };
      }
    }
    if (current?.state !== 'released') {
      fail('Já existe importação SCORM F5; use a recuperação autenticada antes de iniciar outra', 409);
    }
  }
  const lockValue = JSON.stringify({ state: 'active', token: lockToken, operationId, expiresAt: Date.now() + F5_STREAMED_ZIP_LIMITS.leaseMs });
  const lockEtag = cleanEtag(lockHead?.etag ?? lockHead?.httpEtag);
  const acquired = await params.bucket.put(keys.lock, lockValue, {
    onlyIf: lockEtag ? { etagMatches: lockEtag } : { etagDoesNotMatch: '*' },
  });
  if (!acquired) fail('Mutex F5 ocupado por outra importação', 409);

  let upload: R2MultipartUpload | null = null;
  let markerOwned = false;
  try {
    const initialMarker: IntakeMarker = { operationId, uploadId: '', state: 'initializing',
      tenantId: params.tenantId, courseId: params.courseId,
      packageSha256: params.packageSha256, zipBytes: params.zipBytes,
      grantId: params.grantId, runtimeSha: params.runtimeSha,
      arquivoNome: params.arquivoNome };
    const markerReceipt = await params.bucket.put(keys.marker, JSON.stringify(initialMarker), {
      onlyIf: { etagDoesNotMatch: '*' },
    });
    if (!markerReceipt) fail('Registro do multipart SCORM já existe; recuperação necessária', 409);
    markerOwned = true;
    upload = await params.bucket.createMultipartUpload(keys.zip, {
      httpMetadata: { contentType: 'application/zip', cacheControl: 'private, no-store' },
      customMetadata: {
        purpose: 'scorm-f5-inactive-intake', tenantId: String(params.tenantId),
        courseId: String(params.courseId), operationId, packageSha256: params.packageSha256,
        zipBytes: String(params.zipBytes), grantId: params.grantId, runtimeSha: params.runtimeSha,
      },
    });
    const marker: IntakeMarker = { operationId, uploadId: upload.uploadId, state: 'uploading',
      tenantId: params.tenantId, courseId: params.courseId,
      packageSha256: params.packageSha256, zipBytes: params.zipBytes,
      grantId: params.grantId, runtimeSha: params.runtimeSha,
      arquivoNome: params.arquivoNome };
    const markerEtag = cleanEtag(markerReceipt?.etag ?? markerReceipt?.httpEtag);
    const storedMarker = await params.bucket.put(keys.marker, JSON.stringify(marker), {
      onlyIf: markerEtag ? { etagMatches: markerEtag } : undefined,
    });
    if (!storedMarker) fail('Registro do multipart SCORM já existe; recuperação necessária', 409);
    return { operationId, zipBytes: params.zipBytes, partBytes: F5_STREAMED_ZIP_LIMITS.partBytes,
      partCount: Math.ceil(params.zipBytes / F5_STREAMED_ZIP_LIMITS.partBytes), resumed: false };
  } catch (error) {
    if (upload) await upload.abort().catch(() => {});
    if (markerOwned) await params.bucket.delete(keys.marker);
    await releaseF5Mutex(params.bucket, keys.lock, operationId);
    throw error;
  }
}

async function readMarker(bucket: R2Bucket, keys: ReturnType<typeof streamedIntakeKeys>, operationId: string, allowExpired = false) {
  const object = await bucket.get(keys.marker);
  if (!object) fail('Importação SCORM F5 não encontrada', 404);
  const marker = await object.json<IntakeMarker>();
  if (marker.operationId !== operationId) fail('Identidade da importação SCORM inválida', 404);
  const lock = await bucket.get(keys.lock);
  if (!lock) fail('Mutex da importação SCORM expirado; recuperação necessária', 409);
  const lockState = await lock.json<{ state?: string; operationId: string; expiresAt: number }>();
  if (lockState.state !== 'active' || lockState.operationId !== operationId || (!allowExpired && lockState.expiresAt <= Date.now())) {
    fail('Mutex da importação SCORM expirado ou incompatível', 409);
  }
  return marker;
}

async function releaseF5Mutex(bucket: R2Bucket, lockKey: string, operationId: string) {
  const current = await bucket.get(lockKey);
  if (!current) return;
  try {
    const state = await current.json<{ operationId?: string }>();
    if (state.operationId !== operationId) return;
    await bucket.put(lockKey, JSON.stringify({ state: 'released', operationId, expiresAt: 0 }));
  } catch { /* preserve an unreadable lock for explicit recovery */ }
}

export async function authorizeF5IntakeOperation(params: {
  bucket: R2Bucket; rawGrant: string | undefined; environment: string;
  runtimeSha: string | undefined; tenantId: number; courseId: number; operationId: string;
  allowExpiredForRecovery?: boolean;
}) {
  const keys = streamedIntakeKeys(params.tenantId, params.courseId, params.operationId);
  const marker = await readMarker(params.bucket, keys, params.operationId, params.allowExpiredForRecovery);
  parseF5Grant(params.rawGrant, {
    environment: params.environment, runtimeSha: params.runtimeSha,
    tenantId: params.tenantId, courseId: params.courseId,
    packageSha256: marker.packageSha256, zipBytes: marker.zipBytes,
    allowExpiredForRecovery: params.allowExpiredForRecovery,
  });
  let grant: Grant;
  try { grant = JSON.parse(params.rawGrant!) as Grant; } catch { fail('Grant SCORM F5 inválido', 403); }
  if (marker.grantId !== grant.grantId) fail('Grant não corresponde à operação SCORM F5', 403);
  return marker;
}

export async function putF5StreamedIntakePart(params: {
  bucket: R2Bucket; tenantId: number; courseId: number; operationId: string;
  partNumber: number; contentLength: number | null; body: ReadableStream<Uint8Array>;
}) {
  const keys = streamedIntakeKeys(params.tenantId, params.courseId, params.operationId);
  const marker = await readMarker(params.bucket, keys, params.operationId);
  const count = Math.ceil(marker.zipBytes / F5_STREAMED_ZIP_LIMITS.partBytes);
  if (!Number.isInteger(params.partNumber) || params.partNumber < 1 || params.partNumber > count) {
    fail('Número de parte SCORM fora do intervalo', 400);
  }
  if (count > F5_STREAMED_ZIP_LIMITS.maxParts) fail('O ZIP excede o número máximo de partes F5', 413);
  const expected = params.partNumber === count
    ? marker.zipBytes - (count - 1) * F5_STREAMED_ZIP_LIMITS.partBytes
    : F5_STREAMED_ZIP_LIMITS.partBytes;
  if (params.contentLength !== expected) fail('Content-Length da parte não corresponde ao grant', 411);
  const prior = await params.bucket.get(keys.part(params.partNumber));
  if (prior) {
    await params.body.cancel().catch(() => {});
    return await prior.json<{ partNumber: number; etag: string; bytes: number }>();
  }
  const partLockKey = `${keys.part(params.partNumber)}.lock`;
  const partLock = await params.bucket.put(partLockKey, params.operationId, { onlyIf: { etagDoesNotMatch: '*' } });
  if (!partLock) fail('Parte já está sendo recebida; consulte o recibo antes de repetir', 409);
  let bytes = 0;
  const bounded = params.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > expected) controller.error(new Error('F5_STREAMED_PART_OVERFLOW'));
      else controller.enqueue(chunk);
    },
  }));
  const upload = params.bucket.resumeMultipartUpload(keys.zip, marker.uploadId);
  try {
    const uploaded = await upload.uploadPart(params.partNumber, bounded);
    if (bytes !== expected) fail('Parte SCORM truncada; multipart abortado', 400);
    const receipt = { partNumber: params.partNumber, etag: uploaded.etag, bytes };
    const written = await params.bucket.put(keys.part(params.partNumber), JSON.stringify(receipt), {
      onlyIf: { etagDoesNotMatch: '*' },
    });
    if (!written) fail('Parte já registrada; recupere o recibo existente', 409);
    await params.bucket.delete(partLockKey);
    return receipt;
  } catch (error) {
    await upload.abort().catch(() => {});
    throw error;
  }
}

export async function completeF5StreamedIntake(params: {
  bucket: R2Bucket; tenantId: number; courseId: number; operationId: string;
}) {
  const keys = streamedIntakeKeys(params.tenantId, params.courseId, params.operationId);
  const marker = await readMarker(params.bucket, keys, params.operationId);
  const partCount = Math.ceil(marker.zipBytes / F5_STREAMED_ZIP_LIMITS.partBytes);
  const uploaded: R2UploadedPart[] = [];
  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const object = await params.bucket.get(keys.part(partNumber));
    if (!object) fail(`Parte ${partNumber} ausente`, 409);
    const receipt = await object.json<{ partNumber: number; etag: string; bytes: number }>();
    const expected = partNumber === partCount
      ? marker.zipBytes - (partCount - 1) * F5_STREAMED_ZIP_LIMITS.partBytes
      : F5_STREAMED_ZIP_LIMITS.partBytes;
    if (receipt.partNumber !== partNumber || receipt.bytes !== expected || !receipt.etag) {
      fail(`Recibo da parte ${partNumber} inválido`, 409);
    }
    uploaded.push({ partNumber, etag: receipt.etag });
  }
  const result = await params.bucket.resumeMultipartUpload(keys.zip, marker.uploadId).complete(uploaded);
  const head = await params.bucket.head(keys.zip);
  if (!head || result.size !== marker.zipBytes || head.size !== marker.zipBytes ||
      head.customMetadata?.packageSha256 !== marker.packageSha256 ||
      head.customMetadata?.grantId !== marker.grantId) {
    await params.bucket.delete(keys.zip);
    fail('ZIP concluído diverge do grant; objeto descartado', 409);
  }
  return { marker, key: keys.zip, size: head.size };
}

export async function abortF5StreamedIntake(params: {
  bucket: R2Bucket; tenantId: number; courseId: number; operationId: string;
}) {
  const keys = streamedIntakeKeys(params.tenantId, params.courseId, params.operationId);
  const marker = await readMarker(params.bucket, keys, params.operationId, true);
  try { await params.bucket.resumeMultipartUpload(keys.zip, marker.uploadId).abort(); } catch { /* already completed or aborted */ }
  await params.bucket.delete([keys.zip, keys.marker]);
  const pages = await params.bucket.list({ prefix: `${keys.prefix}.parts/`, limit: 1000 });
  if (pages.objects.length) await params.bucket.delete(pages.objects.map((item) => item.key));
  await releaseF5Mutex(params.bucket, keys.lock, params.operationId);
  return { operationId: params.operationId, aborted: true };
}

export async function cleanupF5StreamedIntake(bucket: R2Bucket, tenantId: number, courseId: number, operationId: string) {
  const keys = streamedIntakeKeys(tenantId, courseId, operationId);
  const markerObject = await bucket.get(keys.marker);
  if (markerObject) {
    try {
      const marker = await markerObject.json<IntakeMarker>();
      await bucket.resumeMultipartUpload(keys.zip, marker.uploadId).abort().catch(() => {});
    } catch { /* completed multipart may no longer be resumable */ }
  }
  await bucket.delete([keys.zip, keys.marker]);
  const lock = await bucket.get(keys.lock);
  if (lock) {
    try {
      const state = await lock.json<{ operationId: string }>();
      if (state.operationId === operationId) await releaseF5Mutex(bucket, keys.lock, operationId);
    } catch { /* fail closed: preserve mutex requiring recovery */ }
  }
  const page = await bucket.list({ prefix: `${keys.prefix}.parts/`, limit: 1000 });
  if (page.objects.length) await bucket.delete(page.objects.map((item) => item.key));
}
