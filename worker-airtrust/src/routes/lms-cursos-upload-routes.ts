import { Hono } from 'hono';
import {assertScormQaReadbackAccess, readScormQaBackendEvidence} from '../lib/lms/lms-scorm-staging-readback';
import { readScormQaCandidate } from '../lib/lms/lms-scorm-candidate-preview';
import { provisionScormF0QaBinding } from '../lib/lms/lms-scorm-f0-staging-provision';
import { recoverF0CandidateFixture } from '../lib/lms/lms-scorm-f0-staging-runtime';
import type { Context } from 'hono';
import { z } from 'zod';

import {
  beginLmsContentUpload,
  completeStructuredLmsContentUpload,
  putLmsContentUploadFile,
  uploadLmsZipPackage,
} from '../lib/lms/lms-content-upload-service';
import {
  LMS_PACKAGE_LIMITS,
  normalizeLmsArchivePath,
  type LmsStructuredContentType,
} from '../lib/lms/lms-package-validator';
import { getLmsSchemaSnapshot } from '../lib/lms/lms-schema-state';
import { ApiError } from '../middleware/error-handler';
import { requirePermission, requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { getEmpresaIdSafe } from '../utils/tenant-resolution';
import { requireOperacoesCurso } from './lms-cursos-rbac';
import {
  activateScormPackageVersion,
  createScormPackageCandidate,
  createScormPackageCandidateFromR2Intake,
  removeFailedScormPackageCandidate,
  importScormFunctionalAttestation,
  listScormPackageVersions,
  runScormPackageConformance,
} from '../lib/lms/lms-scorm-package-version-service';
import {
  approveFormativePackage,
  evaluateFormativeActivation,
  importFormativeAttestation,
  readCandidate,
  rollbackScormPackageVersion,
} from '../lib/lms/lms-scorm-formative-service';
import { FORMATIVE_PROFILE } from '../lib/lms/lms-scorm-formative-profile';
import { preflightDirectFormativeReplacement, readAlreadyActiveFormativeReplacement, replaceValidatedFormativeScorm } from '../lib/lms/lms-scorm-direct-replacement';
import {
  abortF5StreamedIntake,
  authorizeF5IntakeOperation,
  beginF5StreamedIntake,
  cleanupF5StreamedIntake,
  completeF5StreamedIntake,
  F5_STREAMED_ZIP_LIMITS,
  parseF5Grant,
  putF5StreamedIntakePart,
} from '../lib/lms/lms-scorm-streamed-intake';

const app = new Hono<{ Bindings: Env }>();

const InitSchema = z.object({
  tipo_conteudo: z.enum(['scorm', 'h5p']),
  idempotency_key: z.string().trim().min(1).max(200).optional(),
  skip_purge: z.boolean().optional(),
});

const CompleteSchema = z.object({
  tipo_conteudo: z.enum(['scorm', 'h5p']),
  upload_id: z
    .string()
    .trim()
    .regex(/^[a-f0-9-]{16,64}$/i),
  arquivo_nome: z.string().trim().max(255).nullable().optional(),
  // Accepted only for backwards-compatible clients. Canonical metadata is
  // re-read from the objects in R2 and these values are never trusted.
  launch_file: z.string().nullable().optional(),
  scorm_versao: z.enum(['1.2', '2004']).nullable().optional(),
  tipo_h5p: z.string().nullable().optional(),
  files_uploaded: z.number().int().positive().optional(),
  uploaded_paths: z.array(z.string()).optional(),
});

const F5StreamedInitSchema = z.object({
  operation_id: z.string().regex(/^[a-f0-9-]{36}$/i),
  expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  zip_bytes: z.number().int().min(22).max(F5_STREAMED_ZIP_LIMITS.zipBytes),
  arquivo_nome: z.string().trim().min(1).max(255).regex(/\.zip$/i),
});

function validCourseId(c: Context<{ Bindings: Env }>) {
  const id = Number(c.req.param('id'));
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError('Curso inválido', 400, 'UPLOAD_COURSE_INVALID');
  return id;
}

function f5Grant(c: Context<{ Bindings: Env }>, empresaId: number, cursoId: number, sha256: string, bytes: number) {
  return parseF5Grant(c.env.SCORM_F5_STREAMED_INTAKE_GRANT, {
    environment: c.env.ENVIRONMENT,
    runtimeSha: c.env.AIRTRUST_SOURCE_SHA,
    tenantId: empresaId, courseId: cursoId, packageSha256: sha256, zipBytes: bytes,
  });
}

function authorizeF5Operation(c: Context<{ Bindings: Env }>, empresaId: number, cursoId: number, allowExpiredForRecovery = false) {
  return authorizeF5IntakeOperation({
    bucket: c.env.BUCKET,
    rawGrant: c.env.SCORM_F5_STREAMED_INTAKE_GRANT,
    environment: c.env.ENVIRONMENT,
    runtimeSha: c.env.AIRTRUST_SOURCE_SHA,
    tenantId: empresaId,
    courseId: cursoId,
    operationId: c.req.param('operationId') ?? '',
    allowExpiredForRecovery,
  });
}

function hasH5pBindingColumn(c: Parameters<typeof getLmsSchemaSnapshot>[0]) {
  return getLmsSchemaSnapshot(c).lmsCursosColumns.h5p_conteudo_id === 'present';
}

function contentLengthWithinLimit(
  request: Request,
  maxBytes: number,
  label: string,
): number | null {
  const raw = request.headers.get('content-length');
  if (!raw) return null;
  const length = Number(raw);
  if (Number.isFinite(length) && length > maxBytes) {
    throw new ApiError(`${label} excede o limite permitido`, 413);
  }
  return Number.isFinite(length) && length >= 0 ? length : null;
}

function assertContentLengthWithinLimit(request: Request, maxBytes: number, label: string) {
  contentLengthWithinLimit(request, maxBytes, label);
}

type UploadedFile = {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

function isUploadedFile(value: unknown): value is UploadedFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<UploadedFile>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.arrayBuffer === 'function'
  );
}

function normalizeFileName(file: UploadedFile | null): string | null {
  const value = file?.name?.trim();
  return value || null;
}

function validateExtension(file: UploadedFile, tipoConteudo: LmsStructuredContentType) {
  const name = file.name.trim().toLowerCase();
  if (!name) return;
  if (tipoConteudo === 'scorm' && !name.endsWith('.zip')) {
    throw new ApiError('Envie um arquivo .zip válido para o conteúdo SCORM', 400, 'UPLOAD_ZIP_EXTENSION_INVALID');
  }
  if (tipoConteudo === 'h5p' && !name.endsWith('.h5p') && !name.endsWith('.zip')) {
    throw new ApiError('Envie um arquivo .h5p ou .zip válido para o conteúdo H5P', 400, 'UPLOAD_H5P_EXTENSION_INVALID');
  }
}

async function listUploadedOperationFiles(bucket: R2Bucket, prefix: string) {
  const files: Array<{ path: string; size: number }> = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const object of page.objects) {
      if (!object.key.startsWith(prefix)) continue;
      const path = object.key.slice(prefix.length);
      if (!path || path === '.airtrust-upload.json') continue;
      files.push({ path, size: object.size });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return files;
}

async function readPackageRequest(
  c: Context<{ Bindings: Env }>,
  tipoConteudo: LmsStructuredContentType,
) {
  assertContentLengthWithinLimit(c.req.raw, LMS_PACKAGE_LIMITS.maxCompressedBytes, 'Pacote');
  const contentType = c.req.header('content-type') ?? '';
  let file: UploadedFile | null = null;
  let bytes: Uint8Array;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    for (const field of ['arquivo', 'file', 'h5p', 'scorm']) {
      const value = formData.get(field);
      if (isUploadedFile(value)) {
        file = value;
        break;
      }
    }
    if (!file) throw new ApiError('Campo de arquivo não encontrado', 400, 'UPLOAD_FILE_FIELD_MISSING');
    validateExtension(file, tipoConteudo);
    if (file.size > LMS_PACKAGE_LIMITS.maxCompressedBytes) {
      throw new ApiError('Pacote excede o limite comprimido de 32 MB', 413, 'UPLOAD_ZIP_TOO_LARGE');
    }
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    bytes = new Uint8Array(await c.req.arrayBuffer());
  }

  return { bytes, arquivoNome: normalizeFileName(file) };
}

async function handleDirectPackageUpload(
  c: Context<{ Bindings: Env }>,
  tipoConteudo: LmsStructuredContentType,
) {
  if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));
  if (!Number.isInteger(cursoId) || cursoId <= 0) {
    throw new ApiError('Curso inválido', 400, 'UPLOAD_COURSE_INVALID');
  }

  const { bytes, arquivoNome } = await readPackageRequest(c, tipoConteudo);
  if (tipoConteudo === 'scorm') {
    const result = await createScormPackageCandidate({
      db: c.env.DB,
      bucket: c.env.BUCKET,
      empresaId,
      cursoId,
      userId: Number((c.get as (key: string) => unknown)('userId')) || null,
      bytes,
      arquivoNome,
    });
    return c.json({ success: true, data: result }, 202);
  }
  const result = await uploadLmsZipPackage({
    db: c.env.DB,
    bucket: c.env.BUCKET,
    empresaId,
    cursoId,
    tipoConteudo,
    bytes,
    arquivoNome,
    hasH5pConteudoIdColumn: hasH5pBindingColumn(c),
    idempotencyKey: c.req.header('idempotency-key') ?? null,
  });
  return c.json({ success: true, data: result });
}

// Inline package creation used to insert the course and then mutate R2/D1 in
// a non-atomic tail. Metadata creation remains available as JSON; packages use
// the explicit versioned upload protocol after the course exists.
app.post('/', async (c, next) => {
  if ((c.req.header('content-type') ?? '').includes('multipart/form-data')) {
    throw new ApiError(
      'Crie o curso sem arquivo e envie SCORM/H5P pelo fluxo de upload versionado',
      409,
      'UPLOAD_INLINE_PACKAGE_DISABLED',
    );
  }
  return next();
});

app.post(
  '/:id/content-upload/init',
  requirePermission('lms', 'editar', 'admin', 'manager'),
  requireOperacoesCurso('update'),
  async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    const parsed = InitSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
    }
    if (parsed.data.tipo_conteudo === 'scorm') {
      // A file-by-file protocol cannot certify the SHA-256 of the submitted ZIP.
      // Keep it out of the activation path rather than creating an unverifiable
      // package version; clients must use the candidate ZIP endpoint.
      throw new ApiError(
        'Upload SCORM estruturado foi desativado: envie o ZIP para o Quality Gate',
        409,
        'UPLOAD_STRUCTURED_SCORM_DISABLED',
      );
    }

    const marker = await beginLmsContentUpload({
      db: c.env.DB,
      bucket: c.env.BUCKET,
      empresaId: getEmpresaIdSafe(c),
      cursoId: Number(c.req.param('id')),
      tipoConteudo: parsed.data.tipo_conteudo,
      hasH5pConteudoIdColumn: hasH5pBindingColumn(c),
      idempotencyKey: parsed.data.idempotency_key ?? c.req.header('idempotency-key') ?? null,
    });
    const uploadedFiles =
      marker.status === 'uploading'
        ? await listUploadedOperationFiles(c.env.BUCKET, marker.prefix)
        : [];

    return c.json({
      success: true,
      data: {
        upload_id: marker.operationId,
        prefix: marker.prefix,
        tipo_conteudo: marker.tipoConteudo,
        status: marker.status,
        result: marker.result ?? null,
        uploaded_files: uploadedFiles,
      },
    });
  },
);

app.post('/:id/scorm-replace',
  requireRole('admin'), requirePermission('lms', 'editar', 'admin'), requireOperacoesCurso('update'), async (c) => {
    if (c.req.query('confirm') !== 'REPLACE_AFTER_VALIDATION') {
      throw new ApiError('Confirmação explícita de substituição obrigatória', 400, 'SCORM_REPLACE_CONFIRMATION_INVALID');
    }
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    const empresaId = getEmpresaIdSafe(c), cursoId = courseIdParam(c);
    const { bytes, arquivoNome } = await readPackageRequest(c, 'scorm');
    const candidate = await createScormPackageCandidate({
      db: c.env.DB, bucket: c.env.BUCKET, empresaId, cursoId,
      userId: actorId(c), bytes, arquivoNome,
    });
    if (candidate.status === 'ACTIVE') {
      // Idempotent exact-SHA resubmission after the first request completed.
      // Do not re-run activation, invalidate snapshots or change enrollments.
      const receipt = await readAlreadyActiveFormativeReplacement({
        db: c.env.DB, bucket: c.env.BUCKET, empresaId, cursoId,
        packageId: candidate.packageId, packageSha256: candidate.packageSha256,
      });
      if (receipt) return c.json({ success: true, data: receipt });
    }
    if (candidate.status !== 'VALIDATED') {
      const sections = [candidate.structural, candidate.completionManifest, candidate.diagnostics];
      const reasons = sections.flatMap(section => section?.errors ?? [])
        .filter((reason): reason is string => typeof reason === 'string')
        .slice(0, 2).join('; ').slice(0, 240);
      const explanation = candidate.status === 'ACTIVE'
        ? 'Este SHA já consta como edição ativa; atualize a página antes de tentar novamente'
        : reasons || 'O candidato deste SHA não foi aprovado nos gates atuais';
      throw new ApiError(
        `ZIP recusado pela validação automática; treinamento atual preservado. Motivo: ${explanation}`,
        409, 'SCORM_REPLACE_STATIC_GATE_FAILED',
      );
    }
    // Clicking the unambiguous replacement button acknowledges that any open
    // enrollment uses the incoming course policy; the server supplies its own
    // contemporaneous count and retains CAS protection on policy+active SHA.
    const preflight = await preflightDirectFormativeReplacement({
      db: c.env.DB, bucket: c.env.BUCKET, empresaId, cursoId,
      packageId: candidate.packageId, userId: actorId(c),
    });
    const data = await replaceValidatedFormativeScorm({
      db: c.env.DB, bucket: c.env.BUCKET, empresaId, cursoId,
      packageId: candidate.packageId, userId: actorId(c),
      confirm: {
        cursoId, packageSha256: candidate.packageSha256,
        acknowledgeInProgress: preflight.impact.inProgress,
      },
    });
    return c.json({ success: true, data });
  });

app.get('/:id/scorm-package-versions', requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
  const cursoId = Number(c.req.param('id'));
  if (!Number.isInteger(cursoId) || cursoId <= 0) throw new ApiError('Curso inválido', 400, 'UPLOAD_COURSE_INVALID');
  return c.json({ success: true, data: await listScormPackageVersions(c.env.DB, getEmpresaIdSafe(c), cursoId) });
});

// Large F5 ZIPs use a separately granted staging-only multipart protocol.
// Each part streams directly to R2; only a fully read-back, hash-checked ZIP
// can enter the existing SCORM Quality Gate as an inactive version candidate.
app.post('/:id/scorm-upload/streamed/init',
  requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    assertContentLengthWithinLimit(c.req.raw, 4096, 'Solicitação de intake');
    const parsed = F5StreamedInitSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
    const empresaId = getEmpresaIdSafe(c), cursoId = validCourseId(c);
    const grant = f5Grant(c, empresaId, cursoId, parsed.data.expected_sha256, parsed.data.zip_bytes);
    const course = await c.env.DB.prepare(
      'SELECT id FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    ).bind(cursoId, empresaId).first<{ id: number }>();
    if (!course) throw new ApiError('Curso não encontrado', 404);
    const data = await beginF5StreamedIntake({
      bucket: c.env.BUCKET, grantId: grant.grantId, runtimeSha: grant.runtimeSha,
      operationId: parsed.data.operation_id,
      tenantId: empresaId, courseId: cursoId,
      packageSha256: parsed.data.expected_sha256, zipBytes: parsed.data.zip_bytes,
      arquivoNome: parsed.data.arquivo_nome,
    });
    return c.json({ success: true, data }, 201);
  });

app.put('/:id/scorm-upload/streamed/:operationId/parts/:partNumber',
  requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    const empresaId = getEmpresaIdSafe(c), cursoId = validCourseId(c);
    await authorizeF5Operation(c, empresaId, cursoId);
    const partNumber = Number(c.req.param('partNumber'));
    const contentLength = contentLengthWithinLimit(c.req.raw, F5_STREAMED_ZIP_LIMITS.partBytes, 'Parte SCORM');
    if (!c.req.raw.body) throw new ApiError('Corpo da parte SCORM ausente', 400, 'UPLOAD_PART_BODY_MISSING');
    const data = await putF5StreamedIntakePart({
      bucket: c.env.BUCKET, tenantId: empresaId, courseId: cursoId,
      operationId: c.req.param('operationId'), partNumber, contentLength, body: c.req.raw.body,
    });
    return c.json({ success: true, data });
  });

app.post('/:id/scorm-upload/streamed/:operationId/complete',
  requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    const empresaId = getEmpresaIdSafe(c), cursoId = validCourseId(c);
    const marker = await authorizeF5Operation(c, empresaId, cursoId);
    try {
      const completed = await completeF5StreamedIntake({
        bucket: c.env.BUCKET, tenantId: empresaId, courseId: cursoId,
        operationId: c.req.param('operationId'),
      });
      const data = await createScormPackageCandidateFromR2Intake({
        db: c.env.DB, bucket: c.env.BUCKET, empresaId, cursoId,
        userId: Number((c.get as (key: string) => unknown)('userId')) || null,
        operationId: marker.operationId, expectedSha256: marker.packageSha256,
        arquivoNome: marker.arquivoNome,
      });
      return c.json({ success: true, data: { ...data, zipBytes: completed.size } }, 202);
    } finally {
      await cleanupF5StreamedIntake(c.env.BUCKET, empresaId, cursoId, marker.operationId);
    }
  });

app.post('/:id/scorm-upload/streamed/:operationId/abort',
  requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    const empresaId = getEmpresaIdSafe(c), cursoId = validCourseId(c);
    try {
      await authorizeF5Operation(c, empresaId, cursoId, true);
      const data = await abortF5StreamedIntake({
        bucket: c.env.BUCKET, tenantId: empresaId, courseId: cursoId,
        operationId: c.req.param('operationId'),
      });
      return c.json({ success: true, data });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        return c.json({ success: true, data: { operationId: c.req.param('operationId'), aborted: true, alreadyClean: true } });
      }
      throw err;
    }
  });

// Resolve a lost multipart completion response through Worker-owned R2/D1
// state. Candidate ownership is tied to the operation ID in upload metadata.
app.get('/:id/scorm-upload/streamed/:operationId/status',
  requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
    const empresaId = getEmpresaIdSafe(c), cursoId = validCourseId(c);
    const operationId = c.req.param('operationId');
    const expectedSha = c.req.query('sha256') ?? '';
    if (!/^[a-f0-9-]{36}$/i.test(operationId)) throw new ApiError('Operação F5 inválida', 400, 'UPLOAD_OPERATION_INVALID');
    if (!/^[a-f0-9]{64}$/.test(expectedSha)) throw new ApiError('SHA F5 inválido', 400, 'UPLOAD_SHA_INVALID');
    const versions = await listScormPackageVersions(c.env.DB, empresaId, cursoId);
    const expectedName = `f5-${expectedSha}-${operationId}.zip`;
    const candidate = versions.find(item => item.arquivoNome === expectedName &&
      item.packageSha256 === expectedSha);
    if (candidate) {
      const source = await c.env.DB.prepare(`SELECT zip_size_bytes FROM lms_scorm_package_versions
        WHERE id=? AND empresa_id=? AND curso_id=? AND package_sha256=? AND status='VALIDATED'`)
        .bind(candidate.packageId,empresaId,cursoId,candidate.packageSha256)
        .first<{zip_size_bytes:number}>();
      if (!Number.isSafeInteger(source?.zip_size_bytes) || Number(source?.zip_size_bytes)<22) {
        throw new ApiError('Candidato F5 sem proveniência de tamanho',409);
      }
      f5Grant(c,empresaId,cursoId,candidate.packageSha256,Number(source!.zip_size_bytes));
      return c.json({ success: true, data: { source: 'WORKER_F5_INTAKE_STATUS',
      state: 'CANDIDATE_PRESENT', operationId, candidate: { packageId: candidate.packageId,
        packageSha256: candidate.packageSha256, active: candidate.active,
        createdByOperation: true, alreadyExisted: false } } });
    }
    try {
      const marker = await authorizeF5Operation(c, empresaId, cursoId, true);
      if (marker.packageSha256 !== expectedSha) throw new ApiError('SHA da operação F5 divergente', 409, 'UPLOAD_SHA_MISMATCH');
      return c.json({ success: true, data: { source: 'WORKER_F5_INTAKE_STATUS',
        state: 'INTAKE_PRESENT', operationId, packageSha256: marker.packageSha256 } });
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) throw error;
    }
    return c.json({ success: true, data: { source: 'WORKER_F5_INTAKE_STATUS',
      state: 'CLEAN', operationId } });
  });


const F0StagingProvisionSchema = z.object({
  enrollmentId: z.number().int().positive(),
  cycleId: z.number().int().positive(),
  packageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  approvalReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  runId: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  expiresAt: z.string().min(20).max(35),
}).strict();

// F0 binding is restricted to the protected staging QA tenant, single
// candidate Worker grant, tenant admin and dedicated QA readback secret.
// This endpoint CANNOT activate a course, fabricate a commit or certify a ZIP.
app.post('/:id/scorm-package-versions/:packageId/qa-f0/bind',
  requirePermission('lms', 'editar', 'admin'),
  requireOperacoesCurso('update'),
  async (c) => {
    const tenantId = getEmpresaIdSafe(c);
    const courseId = validCourseId(c);
    assertScormQaReadbackAccess({
      environment: c.env.ENVIRONMENT, tenantId,
      authorizedTenant: c.env.SCORM_QA_SYNTHETIC_TENANT_ID,
      secret: c.env.SCORM_QA_READBACK_SECRET,
      providedSecret: c.req.header('X-Airtrust-F5-QA-Readback'),
      runtimeSha: c.env.AIRTRUST_SOURCE_SHA,
    });
    const parsed = F0StagingProvisionSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!parsed.success) throw new ApiError('Escopo de vínculo F0 inválido', 400);
    const payload = parsed.data;
    const candidate = await readScormQaCandidate(c.env.DB, {
      empresaId: tenantId, cursoId: courseId,
      packageId: c.req.param('packageId'),
      expectedSha: payload.packageSha256,
    });
    const source = await c.env.DB.prepare(
      `SELECT zip_size_bytes FROM lms_scorm_package_versions
         WHERE id=? AND empresa_id=? AND curso_id=? AND package_sha256=?
           AND status='VALIDATED'`,
    ).bind(candidate.id, tenantId, courseId, candidate.package_sha256)
      .first<{ zip_size_bytes: number }>();
    if (!Number.isSafeInteger(source?.zip_size_bytes) || Number(source?.zip_size_bytes) < 22) {
      throw new ApiError('Pacote F0 inválido', 409);
    }
    const grant = parseF5Grant(c.env.SCORM_F5_STREAMED_INTAKE_GRANT, {
      environment: c.env.ENVIRONMENT,
      runtimeSha: c.env.AIRTRUST_SOURCE_SHA,
      tenantId, courseId, packageSha256: candidate.package_sha256,
      zipBytes: Number(source!.zip_size_bytes),
    });
    const actorId = Number(c.get('userId' as never));
    const bound = await provisionScormF0QaBinding(c.env.DB, {
      tenantId, courseId, packageId: candidate.id,
      packageSha256: candidate.package_sha256,
      enrollmentId: payload.enrollmentId, cycleId: payload.cycleId,
      runId: payload.runId, approvalReceiptSha256: payload.approvalReceiptSha256,
      runtimeSha: c.env.AIRTRUST_SOURCE_SHA ?? '',
      expiresAt: payload.expiresAt, grantId: grant.grantId, actorId,
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json({ success: true, data: bound }, 201);
  },
);

const F0RecoverySchema = z.object({
  enrollmentId: z.number().int().positive(), cycleId: z.number().int().positive(),
  runId: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  packageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

// Restore only the clean synthetic preimage. Keep append-only binding and
// audit rows, and retain the candidate package for later review.
async function recoverF0Route(c: Context<{ Bindings: Env }>) {
  const tenantId = getEmpresaIdSafe(c), courseId = validCourseId(c);
  assertScormQaReadbackAccess({ environment: c.env.ENVIRONMENT, tenantId,
    authorizedTenant: c.env.SCORM_QA_SYNTHETIC_TENANT_ID,
    secret: c.env.SCORM_QA_READBACK_SECRET,
    providedSecret: c.req.header('X-Airtrust-F5-QA-Readback'),
    runtimeSha: c.env.AIRTRUST_SOURCE_SHA });
  const parsed = F0RecoverySchema.safeParse(await c.req.json<unknown>().catch(() => null));
  if (!parsed.success) throw new ApiError('Escopo de recuperação F0 inválido', 400);
  const { enrollmentId, cycleId, runId, packageSha256, receiptSha256 } = parsed.data;
  const packageId = c.req.param('packageId');
  if (!packageId) throw new ApiError('Candidato F0 inválido', 400);
  await readScormQaCandidate(c.env.DB, { empresaId: tenantId, cursoId: courseId, packageId,
    expectedSha: packageSha256 });
  const result = await recoverF0CandidateFixture(c.env.DB, { tenantId, courseId,
    packageId, packageSha256, enrollmentId, cycleId, runId,
    runtimeSha: c.env.AIRTRUST_SOURCE_SHA ?? '', recoveryReceiptSha256: receiptSha256 });
  c.header('Cache-Control', 'private, no-store');
  return c.json({ success: true, data: { ...result, syntheticFixtureCleaned: true } });
}

app.post('/:id/scorm-package-versions/:packageId/qa-f0/recover',
  requirePermission('lms', 'editar', 'admin'), requireOperacoesCurso('update'), recoverF0Route);
app.post('/:id/scorm-package-versions/:packageId/qa-f0/cleanup',
  requirePermission('lms', 'editar', 'admin'), requireOperacoesCurso('update'), recoverF0Route);

const F0FailedCandidateCleanupSchema=z.object({
  packageSha256:z.string().regex(/^[a-f0-9]{64}$/),
  operationId:z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
}).strict();
app.post('/:id/scorm-package-versions/:packageId/qa-f0/remove-failed-candidate',
  requirePermission('lms','editar','admin'),requireOperacoesCurso('update'),async c=>{
    const tenantId=getEmpresaIdSafe(c),courseId=validCourseId(c);
    assertScormQaReadbackAccess({environment:c.env.ENVIRONMENT,tenantId,
      authorizedTenant:c.env.SCORM_QA_SYNTHETIC_TENANT_ID,
      secret:c.env.SCORM_QA_READBACK_SECRET,
      providedSecret:c.req.header('X-Airtrust-F5-QA-Readback'),
      runtimeSha:c.env.AIRTRUST_SOURCE_SHA});
    const parsed=F0FailedCandidateCleanupSchema.safeParse(await c.req.json<unknown>().catch(()=>null));
    if(!parsed.success)throw new ApiError('Escopo de remoção do candidato inválido',400);
    const {packageSha256,operationId}=parsed.data,packageId=c.req.param('packageId');
    const source=await c.env.DB.prepare(`SELECT zip_size_bytes FROM lms_scorm_package_versions
      WHERE id=? AND empresa_id=? AND curso_id=? AND package_sha256=?`)
      .bind(packageId,tenantId,courseId,packageSha256).first<{zip_size_bytes:number}>();
    if(!Number.isSafeInteger(source?.zip_size_bytes)||Number(source?.zip_size_bytes)<22)
      throw new ApiError('Tamanho do candidato F5 inválido',409);
    f5Grant(c,tenantId,courseId,packageSha256,Number(source!.zip_size_bytes));
    const result=await removeFailedScormPackageCandidate({db:c.env.DB,bucket:c.env.BUCKET,
      empresaId:tenantId,cursoId:courseId,packageId,packageSha256,operationId,
      actorId:Number(c.get('userId' as never))||null});
    c.header('Cache-Control','private, no-store');
    return c.json({success:true,data:result});
  });

// Only protected staging QA administrators with a dedicated F0-provisioned
// readback secret. No public learner or candidate preview route obtains this.
app.get('/:id/scorm-package-versions/:packageId/qa-evidence/:enrollmentId',
  requirePermission('lms', 'editar', 'admin'),
  requireOperacoesCurso('update'),
  async (c) => {
    const empresaId=getEmpresaIdSafe(c),cursoId=Number(c.req.param('id'));
    assertScormQaReadbackAccess({
      environment:c.env.ENVIRONMENT, tenantId:empresaId,
      authorizedTenant:c.env.SCORM_QA_SYNTHETIC_TENANT_ID,
      secret:c.env.SCORM_QA_READBACK_SECRET,
      providedSecret:c.req.header('X-Airtrust-F5-QA-Readback'),
      runtimeSha:c.env.AIRTRUST_SOURCE_SHA,
    });
    if(!Number.isSafeInteger(cursoId)||cursoId<=0)throw new ApiError('Curso inválido',400);
    const data=await readScormQaBackendEvidence({
      db:c.env.DB,empresaId,cursoId,
      packageId:c.req.param('packageId'),
      packageSha256:c.req.query('sha256')??'',
      matriculaId:Number(c.req.param('enrollmentId')),
      runtimeSha:c.env.AIRTRUST_SOURCE_SHA!,
    });
    c.header('Cache-Control','private, no-store');
    return c.json({success:true,data});
  },
);

const ActivateSchema = z.object({
  confirm: z.object({
    cursoId: z.number().int().positive(),
    packageSha256: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledgeInProgress: z.number().int().min(0).optional(),
  }).strict().optional(),
}).strict();

const ApproveSchema = z.object({
  confirm: z.object({
    cursoId: z.number().int().positive(),
    packageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  note: z.string().trim().min(10).max(500),
  editorialReviewRef: z.string().trim().min(6).max(200).nullable().optional(),
}).strict();

const RollbackSchema = z.object({
  confirm: z.object({
    cursoId: z.number().int().positive(),
    restorePackageId: z.string().regex(/^[a-f0-9-]{36}$/i),
  }).strict(),
}).strict();

async function readSmallJson(c: Context<{ Bindings: Env }>, limit: number, label: string): Promise<unknown> {
  assertContentLengthWithinLimit(c.req.raw, limit, label);
  const raw = await c.req.text();
  if (raw.length > limit) throw new ApiError(`${label} muito extenso`, 413);
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw new ApiError(`${label} inválido`, 400); }
}

function actorId(c: Context<{ Bindings: Env }>): number | null {
  return Number((c.get as (key: string) => unknown)('userId')) || null;
}

function courseIdParam(c: Context<{ Bindings: Env }>): number {
  const cursoId = Number(c.req.param('id'));
  if (!Number.isInteger(cursoId) || cursoId <= 0) throw new ApiError('Curso inválido', 400, 'UPLOAD_COURSE_INVALID');
  return cursoId;
}

// Default administrator flow: server-validated formative ZIP, no external
// attestation upload or review ceremony. Full scored/exam route stays governed.
app.post('/:id/scorm-package-versions/:packageId/replace-direct',
  requireRole('admin'), requirePermission('lms', 'editar', 'admin'), requireOperacoesCurso('update'), async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    const body = ActivateSchema.safeParse(await readSmallJson(c, 2_048, 'Confirmação de substituição'));
    if (!body.success || !body.data.confirm) {
      throw new ApiError('Confirmação do curso e SHA do pacote obrigatória', 400, 'SCORM_REPLACE_CONFIRMATION_INVALID');
    }
    const data = await replaceValidatedFormativeScorm({
      db: c.env.DB, bucket: c.env.BUCKET, empresaId: getEmpresaIdSafe(c),
      cursoId: courseIdParam(c), packageId: c.req.param('packageId'),
      userId: actorId(c), confirm: body.data.confirm,
    });
    return c.json({ success: true, data });
  });

app.post('/:id/scorm-package-versions/:packageId/activate', requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
  const cursoId = courseIdParam(c);
  const body = ActivateSchema.safeParse(await readSmallJson(c, 2_048, 'Confirmação de ativação'));
  if (!body.success) throw new ApiError('Confirmação de ativação inválida', 400, 'ACTIVATION_CONFIRMATION_INVALID');
  const data = await activateScormPackageVersion({
    db: c.env.DB, empresaId: getEmpresaIdSafe(c), cursoId, packageId: c.req.param('packageId'), userId: actorId(c),
    attestationSecret: c.env.SCORM_QA_ATTESTATION_SECRET,
    runtimeSha: c.env.AIRTRUST_SOURCE_SHA,
    confirm: body.data.confirm,
  });
  return c.json({ success: true, data });
});

// Read-only: the exact checklist the activation itself enforces (same function).
app.get('/:id/scorm-package-versions/:packageId/activation-preflight',
  requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
    const { row: _row, ...data } = await evaluateFormativeActivation({
      db: c.env.DB, empresaId: getEmpresaIdSafe(c), cursoId: courseIdParam(c),
      packageId: c.req.param('packageId'),
      attestationSecret: c.env.SCORM_QA_ATTESTATION_SECRET, runtimeSha: c.env.AIRTRUST_SOURCE_SHA,
    });
    void _row;
    c.header('Cache-Control', 'private, no-store');
    return c.json({ success: true, data });
  });

// Administrative approval bound to tenant + course + package SHA. Admin only.
app.post('/:id/scorm-package-versions/:packageId/approve',
  requirePermission('lms', 'editar', 'admin'), requireOperacoesCurso('update'), async (c) => {
    const body = ApproveSchema.safeParse(await readSmallJson(c, 4_096, 'Aprovação'));
    if (!body.success) throw new ApiError('Aprovação inválida', 400, 'FORMATIVE_APPROVAL_INVALID');
    const data = await approveFormativePackage({
      db: c.env.DB, empresaId: getEmpresaIdSafe(c), cursoId: courseIdParam(c),
      packageId: c.req.param('packageId'), userId: actorId(c),
      confirm: body.data.confirm, note: body.data.note,
      editorialReviewRef: body.data.editorialReviewRef ?? null,
      attestationSecret: c.env.SCORM_QA_ATTESTATION_SECRET, runtimeSha: c.env.AIRTRUST_SOURCE_SHA,
    });
    return c.json({ success: true, data });
  });

// Restores the immediately previous edition atomically. Admin only.
app.post('/:id/scorm-package-versions/rollback',
  requirePermission('lms', 'editar', 'admin'), requireOperacoesCurso('update'), async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    const body = RollbackSchema.safeParse(await readSmallJson(c, 2_048, 'Rollback'));
    if (!body.success) throw new ApiError('Confirmação de rollback inválida', 400, 'ROLLBACK_CONFIRMATION_INVALID');
    const data = await rollbackScormPackageVersion({
      db: c.env.DB, bucket: c.env.BUCKET, empresaId: getEmpresaIdSafe(c), cursoId: courseIdParam(c),
      userId: actorId(c), confirm: body.data.confirm,
    });
    return c.json({ success: true, data });
  });

// This endpoint is never used by a learner or a SCORM package. Admin RBAC and
// a private CI signing secret are both required; unsigned JSON cannot certify.
app.post('/:id/scorm-package-versions/:packageId/functional-attestation',
  requirePermission('lms', 'editar', 'admin'),
  requireOperacoesCurso('update'),
  async (c) => {
    const cursoId = Number(c.req.param('id'));
    if (!Number.isInteger(cursoId) || cursoId <= 0) throw new ApiError('Curso inválido', 400, 'UPLOAD_COURSE_INVALID');
    assertContentLengthWithinLimit(c.req.raw, 24_576, 'Atestação SCORM');
    const raw = await c.req.text();
    if (raw.length > 24_576) throw new ApiError('Atestação muito extensa', 413);
    let document: unknown;
    try { document = JSON.parse(raw); } catch {
      throw new ApiError('Atestação inválida', 400);
    }
    const candidate = await readCandidate(c.env.DB, getEmpresaIdSafe(c), cursoId, c.req.param('packageId'));
    if (candidate.certification_profile === FORMATIVE_PROFILE) {
      const data = await importFormativeAttestation({
        db: c.env.DB, empresaId: getEmpresaIdSafe(c), cursoId, packageId: candidate.id,
        userId: Number((c.get as (key: string) => unknown)('userId')) || null,
        attestation: document, attestationSecret: c.env.SCORM_QA_ATTESTATION_SECRET,
        runtimeSha: c.env.AIRTRUST_SOURCE_SHA,
      });
      return c.json({ success: true, data });
    }
    const data = await importScormFunctionalAttestation({
      db: c.env.DB, empresaId: getEmpresaIdSafe(c), cursoId,
      packageId: c.req.param('packageId'),
      userId: Number((c.get as (key: string) => unknown)('userId')) || null,
      attestation: document, attestationSecret: c.env.SCORM_QA_ATTESTATION_SECRET,
      runtimeSha: c.env.AIRTRUST_SOURCE_SHA,
    });
    return c.json({ success: true, data });
  });

app.post('/:id/scorm-package-versions/:packageId/conformance', requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
  const cursoId = Number(c.req.param('id'));
  if (!Number.isInteger(cursoId) || cursoId <= 0) throw new ApiError('Curso inválido', 400, 'UPLOAD_COURSE_INVALID');
  const data = await runScormPackageConformance({
    db: c.env.DB, bucket: c.env.BUCKET, browserBinding: c.env.SCORM_BROWSER, empresaId: getEmpresaIdSafe(c), cursoId,
    packageId: c.req.param('packageId'), userId: Number((c.get as (key: string) => unknown)('userId')) || null,
  });
  return c.json({ success: true, data });
});

app.post(
  '/:id/content-upload/file',
  requirePermission('lms', 'editar', 'admin', 'manager'),
  requireOperacoesCurso('update'),
  async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    const tipoConteudo = c.req.query('tipo_conteudo');
    if (tipoConteudo !== 'scorm' && tipoConteudo !== 'h5p') {
      throw new ApiError('Tipo de conteúdo inválido', 400);
    }
    const uploadId = c.req.query('upload_id')?.trim() ?? '';
    const path = c.req.query('path') ?? '';
    const contentLength = contentLengthWithinLimit(
      c.req.raw,
      LMS_PACKAGE_LIMITS.maxFileBytes,
      'Arquivo individual',
    );

    // A browser/HTTP2 request is not guaranteed to expose Content-Length to
    // the Worker. Never fall back to arrayBuffer() just because the header is
    // absent: R2 accepts the request ReadableStream directly. The real stored
    // size is verified below with HEAD before the response is accepted.
    const bufferedBody = !c.req.raw.body ? new Uint8Array(await c.req.arrayBuffer()) : null;
    const body = bufferedBody ?? c.req.raw.body!;
    const byteLength = contentLength ?? bufferedBody?.byteLength ?? 0;
    const empresaId = getEmpresaIdSafe(c);
    const cursoId = Number(c.req.param('id'));

    const data = await putLmsContentUploadFile({
      bucket: c.env.BUCKET,
      empresaId,
      cursoId,
      tipoConteudo,
      operationId: uploadId,
      path,
      body,
      byteLength,
    });

    const normalizedPath = normalizeLmsArchivePath(path);
    if (!normalizedPath) throw new ApiError('Caminho de arquivo inválido', 400);
    const storedKey = `lms/${tipoConteudo}/${empresaId}/${cursoId}/_versions/${uploadId}/${normalizedPath}`;
    const stored = await c.env.BUCKET.head(storedKey);
    if (!stored) {
      throw new ApiError('Arquivo não confirmado no storage', 500, 'UPLOAD_STORAGE_READBACK_FAILED');
    }
    if (stored.size > LMS_PACKAGE_LIMITS.maxFileBytes) {
      await c.env.BUCKET.delete(storedKey);
      throw new ApiError('Arquivo individual excede o limite de 32 MB', 413, 'UPLOAD_FILE_TOO_LARGE');
    }

    return c.json({ success: true, data: { ...data, bytes: stored.size } });
  },
);

app.post(
  '/:id/content-upload/complete',
  requirePermission('lms', 'editar', 'admin', 'manager'),
  requireOperacoesCurso('update'),
  async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500, 'UPLOAD_STORAGE_UNAVAILABLE');
    const parsed = CompleteSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
    }

    const data = await completeStructuredLmsContentUpload({
      db: c.env.DB,
      bucket: c.env.BUCKET,
      empresaId: getEmpresaIdSafe(c),
      cursoId: Number(c.req.param('id')),
      tipoConteudo: parsed.data.tipo_conteudo,
      operationId: parsed.data.upload_id,
      hasH5pConteudoIdColumn: hasH5pBindingColumn(c),
      arquivoNome: parsed.data.arquivo_nome ?? null,
    });
    return c.json({ success: true, data });
  },
);

app.post(
  '/:id/scorm-upload',
  requirePermission('lms', 'editar', 'admin', 'manager'),
  requireOperacoesCurso('update'),
  (c) => handleDirectPackageUpload(c, 'scorm'),
);

app.post(
  '/:id/upload/scorm',
  requirePermission('lms', 'editar', 'admin', 'manager'),
  requireOperacoesCurso('update'),
  (c) => handleDirectPackageUpload(c, 'scorm'),
);

app.post('/:id/upload/h5p', requirePermission('lms', 'editar', 'admin', 'manager'), requireOperacoesCurso('update'), (c) =>
  handleDirectPackageUpload(c, 'h5p'),
);

export default app;
