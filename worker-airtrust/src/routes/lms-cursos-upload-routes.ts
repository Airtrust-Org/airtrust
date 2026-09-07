import { Hono } from 'hono';
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
import { requireRole } from '../middleware/rbac';
import type { Env } from '../types';
import { getEmpresaIdSafe } from './escalas-shared';
import { requireOperacoesCurso } from './lms-cursos-rbac';
import {
  activateScormPackageVersion,
  createScormPackageCandidate,
  listScormPackageVersions,
  runScormPackageConformance,
} from '../lib/lms/lms-scorm-package-version-service';

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
    throw new ApiError('Envie um arquivo .zip válido para o conteúdo SCORM', 400);
  }
  if (tipoConteudo === 'h5p' && !name.endsWith('.h5p') && !name.endsWith('.zip')) {
    throw new ApiError('Envie um arquivo .h5p ou .zip válido para o conteúdo H5P', 400);
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
    if (!file) throw new ApiError('Campo de arquivo não encontrado', 400);
    validateExtension(file, tipoConteudo);
    if (file.size > LMS_PACKAGE_LIMITS.maxCompressedBytes) {
      throw new ApiError('Pacote excede o limite comprimido de 32 MB', 413);
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
  if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('id'));
  if (!Number.isInteger(cursoId) || cursoId <= 0) {
    throw new ApiError('Curso inválido', 400);
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
    );
  }
  return next();
});

app.post(
  '/:id/content-upload/init',
  requireRole('admin', 'manager'),
  requireOperacoesCurso('update'),
  async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);
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

app.get('/:id/scorm-package-versions', requireRole('admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
  const cursoId = Number(c.req.param('id'));
  if (!Number.isInteger(cursoId) || cursoId <= 0) throw new ApiError('Curso inválido', 400);
  return c.json({ success: true, data: await listScormPackageVersions(c.env.DB, getEmpresaIdSafe(c), cursoId) });
});

app.post('/:id/scorm-package-versions/:packageId/activate', requireRole('admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
  const cursoId = Number(c.req.param('id'));
  if (!Number.isInteger(cursoId) || cursoId <= 0) throw new ApiError('Curso inválido', 400);
  const data = await activateScormPackageVersion({
    db: c.env.DB, empresaId: getEmpresaIdSafe(c), cursoId, packageId: c.req.param('packageId'), userId: Number((c.get as (key: string) => unknown)('userId')) || null,
  });
  return c.json({ success: true, data });
});

app.post('/:id/scorm-package-versions/:packageId/conformance', requireRole('admin', 'manager'), requireOperacoesCurso('update'), async (c) => {
  const cursoId = Number(c.req.param('id'));
  if (!Number.isInteger(cursoId) || cursoId <= 0) throw new ApiError('Curso inválido', 400);
  const data = await runScormPackageConformance({
    db: c.env.DB, bucket: c.env.BUCKET, browserBinding: c.env.SCORM_BROWSER, empresaId: getEmpresaIdSafe(c), cursoId,
    packageId: c.req.param('packageId'), userId: Number((c.get as (key: string) => unknown)('userId')) || null,
  });
  return c.json({ success: true, data });
});

app.post(
  '/:id/content-upload/file',
  requireRole('admin', 'manager'),
  requireOperacoesCurso('update'),
  async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);
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
      throw new ApiError('Arquivo não confirmado no storage', 500);
    }
    if (stored.size > LMS_PACKAGE_LIMITS.maxFileBytes) {
      await c.env.BUCKET.delete(storedKey);
      throw new ApiError('Arquivo individual excede o limite de 32 MB', 413);
    }

    return c.json({ success: true, data: { ...data, bytes: stored.size } });
  },
);

app.post(
  '/:id/content-upload/complete',
  requireRole('admin', 'manager'),
  requireOperacoesCurso('update'),
  async (c) => {
    if (!c.env.BUCKET) throw new ApiError('Storage não configurado', 500);
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
  requireRole('admin', 'manager'),
  requireOperacoesCurso('update'),
  (c) => handleDirectPackageUpload(c, 'scorm'),
);

app.post(
  '/:id/upload/scorm',
  requireRole('admin', 'manager'),
  requireOperacoesCurso('update'),
  (c) => handleDirectPackageUpload(c, 'scorm'),
);

app.post('/:id/upload/h5p', requireRole('admin', 'manager'), requireOperacoesCurso('update'), (c) =>
  handleDirectPackageUpload(c, 'h5p'),
);

export default app;
