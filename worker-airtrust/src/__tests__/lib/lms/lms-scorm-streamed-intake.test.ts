import { strToU8, unzipSync, zipSync } from 'fflate';
import { createScormPackageCandidateFromR2Intake } from '../../../lib/lms/lms-scorm-package-version-service';
import {
  abortF5StreamedIntake, beginF5StreamedIntake, completeF5StreamedIntake, parseF5Grant,
  putF5StreamedIntakePart,
} from '../../../lib/lms/lms-scorm-streamed-intake';

const encode = (value: string) => strToU8(value);

function candidateZip() {
  const model = {
    schema: 'AIRTRUST_TRAINING_MODEL_M8', courseId: 'SYNTHETIC', title: 'Synthetic',
    navigationGate: 'module-assessment',
    auditClosure: { version: 'M8-FINAL-100-AUDIT', typographyMinPx: 14,
      semanticVisualCoverage: 'all-originally-unvisualized-slides', moduleGate: true,
      certifyingScoreChanged: false, storageScope: 'course+enrollment+active-cycle' },
    slides: [{ id: 's001', kind: 'concept_map', title: 'Synthetic slide',
      media: [{ src: 'assets/s001.svg', alt: 'Synthetic visual' }] }],
  };
  return zipSync({
    'imsmanifest.xml': encode('<?xml version="1.0"?><manifest><resources><resource identifier="R1" href="index.html" /></resources></manifest>'),
    'index.html': encode('<html><body>synthetic</body></html>'),
    'course-model.js': encode(`window.AIRTRUST_COURSE_MODEL = ${JSON.stringify(model)};`),
    'airtrust-completion-manifest.json': encode(JSON.stringify({
      schemaVersion: 1, diagnosticsVersion: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',
      scormVersion: '1.2', courseId: 'SYNTHETIC', packageVersion: 'v1',
      content: { requiredSlides: ['s001'] },
      assessment: { requiredInteractions: ['q1'], masteryScore: 70, successStatus: 'passed', failureStatus: 'failed' },
      completion: { strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1' },
      diagnostics: { currentSlide: true, slides: true, assessment: true, packageStatus: true, updatedAt: true },
    })),
    'airtrust-completion-diagnostics.json': encode('{}'),
    'app.js': encode("LMSGetLastError(); LMSGetErrorString('0'); LMSGetDiagnostic('0'); window.parent.postMessage({type:'AIRTRUST_COMPLETION_DIAGNOSTICS_V1'}, '*');"),
    'styles.css': encode('.body{font-size:14px}'),
    'assets/s001.svg': encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    'assets/figure.avif': encode('synthetic-avif'),
    'assets/speech.wav': encode('synthetic-wav'),
    'captions/pt-BR.vtt': encode('WEBVTT'),
  }, { level: 0 });
}

class MemoryBucket {
  objects = new Map<string, { bytes: Uint8Array; etag: string; customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string; cacheControl?: string } }>();
  failKey: string | null = null;
  failKeySuffix: string | null = null;
  puts: string[] = [];
  uploads = new Map<string, { key: string; customMetadata?: Record<string, string>; parts: Map<number, Uint8Array>; aborted: boolean }>();
  async put(key: string, value: ArrayBuffer | ArrayBufferView | string, options?: {
    sha256?: string; customMetadata?: Record<string, string>;
    httpMetadata?: { contentType?: string; cacheControl?: string };
    onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string };
  }) {
    if (key === this.failKey || (this.failKeySuffix !== null && key.endsWith(this.failKeySuffix))) {
      throw new Error('simulated member write interruption');
    }
    const bytes = typeof value === 'string' ? encode(value) : value instanceof ArrayBuffer
      ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const prior = this.objects.get(key);
    if (options?.onlyIf) {
      const condition = options.onlyIf;
      if (condition?.etagDoesNotMatch === '*' && prior) return null;
      if (condition?.etagMatches && prior?.etag !== condition.etagMatches) return null;
    }
    const etag = `"${this.objects.size + 1}"`;
    this.objects.set(key, { bytes: new Uint8Array(bytes), etag, customMetadata: options?.customMetadata, httpMetadata: options?.httpMetadata });
    this.puts.push(key);
    return { key, size: bytes.length, httpEtag: etag, etag };
  }
  async head(key: string) {
    const value = this.objects.get(key);
    return value ? { key, size: value.bytes.length, httpEtag: value.etag, etag: value.etag,
      customMetadata: value.customMetadata } : null;
  }
  async get(key: string, options?: { range?: { offset?: number; length?: number } }) {
    const value = this.objects.get(key);
    if (!value) return null;
    const offset = options?.range?.offset ?? 0;
    const end = options?.range?.length === undefined ? value.bytes.length : offset + options.range.length;
    const bytes = value.bytes.subarray(offset, end);
    return { key, size: value.bytes.length, httpEtag: value.etag, customMetadata: value.customMetadata,
      body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
      text: async () => new TextDecoder().decode(value.bytes),
      json: async <T>() => JSON.parse(new TextDecoder().decode(value.bytes)) as T,
      arrayBuffer: async () => value.bytes.buffer.slice(value.bytes.byteOffset, value.bytes.byteOffset + value.bytes.byteLength) };
  }
  async list({ prefix = '' }: { prefix?: string }) {
    return { objects: [...this.objects.entries()].filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({ key, size: value.bytes.length })), truncated: false };
  }
  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
  async createMultipartUpload(key: string, options?: { customMetadata?: Record<string, string> }) {
    const uploadId = `upload-${this.uploads.size + 1}`;
    this.uploads.set(uploadId, { key, customMetadata: options?.customMetadata, parts: new Map(), aborted: false });
    return this.resumeMultipartUpload(key, uploadId);
  }
  resumeMultipartUpload(key: string, uploadId: string) {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key || upload.aborted) throw new Error('multipart upload unavailable');
    return {
      key, uploadId,
      uploadPart: async (partNumber: number, body: ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string) => {
        const parts: Uint8Array[] = [];
        if (body instanceof ReadableStream) {
          const reader = body.getReader();
          while (true) { const next = await reader.read(); if (next.done) break; parts.push(new Uint8Array(next.value)); }
        } else parts.push(typeof body === 'string' ? encode(body) : body instanceof ArrayBuffer
          ? new Uint8Array(body) : new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
        const bytes = new Uint8Array(parts.reduce((sum, item) => sum + item.length, 0));
        let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
        upload.parts.set(partNumber, bytes);
        return { partNumber, etag: `part-${partNumber}` };
      },
      complete: async (parts: Array<{ partNumber: number; etag: string }>) => {
        const contents = parts.map((part) => upload.parts.get(part.partNumber)!);
        const bytes = new Uint8Array(contents.reduce((sum, item) => sum + item.length, 0));
        let offset = 0; for (const item of contents) { bytes.set(item, offset); offset += item.length; }
        const etag = `"multipart-${this.objects.size + 1}"`;
        this.objects.set(key, { bytes, etag, customMetadata: upload.customMetadata });
        return { key, size: bytes.length, httpEtag: etag, customMetadata: upload.customMetadata };
      },
      abort: async () => { upload.aborted = true; },
    };
  }
}

class MemoryDb {
  coursePresent = true;
  candidate: Record<string, unknown> | null = null;
  statements: string[] = [];
  prepare(query: string) {
    const db = this;
    return { bind(...args: unknown[]) {
      return {
        async first() {
          if (query.includes('FROM lms_scorm_package_versions')) return db.candidate;
          if (query.includes('FROM lms_cursos')) return db.coursePresent ? { id: Number(args[0]) } : null;
          return null;
        },
        query, args,
      };
    } };
  }
  async batch(statements: Array<{ query: string; args: unknown[] }>) {
    this.statements.push(...statements.map((item) => item.query));
    const insert = statements.find((item) => item.query.includes('INSERT INTO lms_scorm_package_versions'));
    if (insert) this.candidate = {
      id: insert.args[0], empresa_id: insert.args[1], curso_id: insert.args[2],
      package_sha256: insert.args[4], r2_prefix: insert.args[6], launch_file: insert.args[7],
      status: insert.args[10], validation_result_json: String(insert.args[12]),
    };
    return [];
  }
}

async function sha(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function intakeFixture() {
  const bytes = candidateZip(), operationId = '24e73ac1-2090-4b77-a5d6-783771195eef';
  const sha256 = '';
  const tenantId = 77, courseId = 12;
  const key = `lms/scorm/${tenantId}/${courseId}/_intake/${operationId}/package.zip`;
  const bucket = new MemoryBucket();
  const db = new MemoryDb();
  return { bytes, operationId, sha256, tenantId, courseId, key, bucket, db };
}

describe('F5 streamed SCORM candidate intake', () => {
  it('creates an inactive candidate after original ZIP SHA and member CRC validation', async () => {
    const f = intakeFixture();
    const packageSha256 = await sha(f.bytes);
    const runtimeSha = 'a'.repeat(40);
    const rawGrant = JSON.stringify({ grantId: 'synthetic-grant', runtimeSha,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      mutex: 'airtrust-staging-mutations-and-scorm-qa',
      courses: [{ tenantId: f.tenantId, courseId: f.courseId, packageSha256, zipBytes: f.bytes.length }] });
    const grant = parseF5Grant(rawGrant, { environment: 'staging', runtimeSha,
      tenantId: f.tenantId, courseId: f.courseId, packageSha256, zipBytes: f.bytes.length });
    const intake = await beginF5StreamedIntake({ bucket: f.bucket as unknown as R2Bucket,
      operationId: f.operationId,
      grantId: grant.grantId, runtimeSha, tenantId: f.tenantId, courseId: f.courseId,
      packageSha256, zipBytes: f.bytes.length, arquivoNome: 'synthetic.zip' });
    const resumed = await beginF5StreamedIntake({ bucket: f.bucket as unknown as R2Bucket,
      operationId: f.operationId,
      grantId: grant.grantId, runtimeSha, tenantId: f.tenantId, courseId: f.courseId,
      packageSha256, zipBytes: f.bytes.length, arquivoNome: 'synthetic.zip' });
    expect(resumed).toMatchObject({ operationId: intake.operationId, resumed: true });
    expect(f.bucket.uploads.size).toBe(1);
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(f.bytes); controller.close(); } });
    await putF5StreamedIntakePart({ bucket: f.bucket as unknown as R2Bucket,
      tenantId: f.tenantId, courseId: f.courseId, operationId: intake.operationId,
      partNumber: 1, contentLength: f.bytes.length, body });
    const completed = await completeF5StreamedIntake({ bucket: f.bucket as unknown as R2Bucket,
      tenantId: f.tenantId, courseId: f.courseId, operationId: intake.operationId });
    expect(completed.size).toBe(f.bytes.length);
    const result = await createScormPackageCandidateFromR2Intake({
      db: f.db as unknown as D1Database, bucket: f.bucket as unknown as R2Bucket,
      empresaId: f.tenantId, cursoId: f.courseId, userId: 99,
      operationId: intake.operationId, expectedSha256: packageSha256, arquivoNome: 'synthetic.zip',
    });
    expect(result).toMatchObject({ status: 'VALIDATED',
      packageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      packageSha256, active: false, createdByOperation: true, alreadyExisted: false,
      completionWritten: false, certificateIssued: false,
      r2Readback: { source: 'WORKER_R2_STREAMED_ZIP_READBACK', zipSha256: packageSha256,
        zipBytes: f.bytes.length, etagStable: true, memberIntegrityVerified: true,
        launchAssetSha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(result.packageId).not.toBe(f.operationId);
    expect(result.publishable).toBe(false);
    expect(result.conformance?.status).toBe('NOT_SUPPORTED');
    expect(f.db.candidate).toMatchObject({ empresa_id: 77, curso_id: 12, status: 'VALIDATED' });
    expect(f.db.statements.join('\n')).toContain('lms_scorm_package_audit_log');
    expect(f.db.statements.join('\n')).not.toMatch(/UPDATE lms_cursos|completion|certificate/i);
    const candidatePrefix = `lms/scorm/${f.tenantId}/${f.courseId}/_candidates/${result.packageId}/`;
    expect([...f.bucket.objects.keys()].some((key) => key.startsWith(candidatePrefix))).toBe(true);
    const originalMembers = unzipSync(f.bytes);
    for (const [path, original] of Object.entries(originalMembers)) {
      const stored = f.bucket.objects.get(`${candidatePrefix}${path}`)?.bytes;
      expect(stored).toEqual(original);
    }
    for (const [asset, contentType] of Object.entries({
      'assets/figure.avif': 'image/avif',
      'assets/speech.wav': 'audio/wav',
      'captions/pt-BR.vtt': 'text/vtt; charset=utf-8',
      'assets/s001.svg': 'image/svg+xml',
      'index.html': 'text/html; charset=utf-8',
    })) {
      expect(f.bucket.objects.get(`${candidatePrefix}${asset}`)?.httpMetadata?.contentType).toBe(contentType);
    }
    expect(f.bucket.objects.has(f.key)).toBe(false);
  });

  it('fails closed for a course outside the tenant and preserves an existing candidate', async () => {
    const f = intakeFixture();
    f.db.coursePresent = false;
    const packageSha256 = await sha(f.bytes);
    await f.bucket.put(f.key, f.bytes);
    await expect(createScormPackageCandidateFromR2Intake({
      db: f.db as unknown as D1Database, bucket: f.bucket as unknown as R2Bucket,
      empresaId: f.tenantId, cursoId: 999, userId: 99,
      operationId: f.operationId, expectedSha256: packageSha256, arquivoNome: null,
    })).rejects.toThrow(/Curso não encontrado/);
    expect([...f.bucket.objects.keys()].some((key) => key.includes('/_candidates/'))).toBe(false);
    expect(f.db.candidate).toBeNull();
  });

  it('removes partial candidate assets and does not register a row if extraction/write is interrupted', async () => {
    const f = intakeFixture();
    const packageSha256 = await sha(f.bytes);
    await f.bucket.put(f.key, f.bytes);
    // Package identity is server-generated; fail a candidate member by its suffix.
    f.bucket.failKeySuffix = '/app.js';
    await expect(createScormPackageCandidateFromR2Intake({
      db: f.db as unknown as D1Database, bucket: f.bucket as unknown as R2Bucket,
      empresaId: f.tenantId, cursoId: f.courseId, userId: 99,
      operationId: f.operationId, expectedSha256: packageSha256, arquivoNome: null,
    })).rejects.toThrow(/simulated member write interruption/);
    expect([...f.bucket.objects.keys()].some((key) => key.includes('/_candidates/'))).toBe(false);
    expect(f.db.candidate).toBeNull();
    expect(f.bucket.objects.has(f.key)).toBe(false);
  });

  it('aborts an interrupted multipart operation and releases its course mutex for recovery', async () => {
    const f = intakeFixture();
    const packageSha256 = await sha(f.bytes), runtimeSha = 'b'.repeat(40);
    const grant = parseF5Grant(JSON.stringify({ grantId: 'recovery-grant', runtimeSha,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      mutex: 'airtrust-staging-mutations-and-scorm-qa',
      courses: [{ tenantId: f.tenantId, courseId: f.courseId, packageSha256, zipBytes: f.bytes.length }] }), {
      environment: 'staging', runtimeSha, tenantId: f.tenantId, courseId: f.courseId,
      packageSha256, zipBytes: f.bytes.length,
    });
    const intake = await beginF5StreamedIntake({ bucket: f.bucket as unknown as R2Bucket,
      operationId: f.operationId,
      grantId: grant.grantId, runtimeSha, tenantId: f.tenantId, courseId: f.courseId,
      packageSha256, zipBytes: f.bytes.length, arquivoNome: 'synthetic.zip' });
    const truncated = f.bytes.subarray(0, f.bytes.length - 1);
    await expect(putF5StreamedIntakePart({ bucket: f.bucket as unknown as R2Bucket,
      tenantId: f.tenantId, courseId: f.courseId, operationId: intake.operationId,
      partNumber: 1, contentLength: f.bytes.length,
      body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(truncated); controller.close(); } }),
    })).rejects.toThrow(/truncada/);
    await abortF5StreamedIntake({ bucket: f.bucket as unknown as R2Bucket,
      tenantId: f.tenantId, courseId: f.courseId, operationId: intake.operationId });
    const lockKey = 'lms/scorm/_intake/.f5-staging-mutex';
    const releasedLock = await f.bucket.get(lockKey);
    expect(await releasedLock?.json<{ state: string }>()).toMatchObject({ state: 'released' });
    expect([...f.bucket.objects.keys()].some((key) => key.includes(`/_intake/${intake.operationId}/`))).toBe(false);
    const recovered = await beginF5StreamedIntake({ bucket: f.bucket as unknown as R2Bucket,
      operationId: crypto.randomUUID(),
      grantId: grant.grantId, runtimeSha, tenantId: f.tenantId, courseId: f.courseId,
      packageSha256, zipBytes: f.bytes.length, arquivoNome: 'synthetic.zip' });
    expect(recovered.operationId).not.toBe(intake.operationId);
    await abortF5StreamedIntake({ bucket: f.bucket as unknown as R2Bucket,
      tenantId: f.tenantId, courseId: f.courseId, operationId: recovered.operationId });
  });

  it('rejects production, tenant/course mismatch and expired upload grants', () => {
    const packageSha256 = 'c'.repeat(64), runtimeSha = 'd'.repeat(40);
    const raw = JSON.stringify({ grantId: 'g', runtimeSha,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      mutex: 'airtrust-staging-mutations-and-scorm-qa',
      courses: [{ tenantId: 77, courseId: 12, packageSha256, zipBytes: 100 }] });
    const exact = { runtimeSha, tenantId: 77, courseId: 12, packageSha256, zipBytes: 100 };
    expect(() => parseF5Grant(raw, { ...exact, environment: 'production' })).toThrow(/staging/);
    expect(() => parseF5Grant(raw, { ...exact, environment: 'staging', courseId: 13 })).toThrow(/fora do grant/);
    const expired = JSON.stringify({ grantId: 'g', runtimeSha,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      mutex: 'airtrust-staging-mutations-and-scorm-qa',
      courses: [{ tenantId: 77, courseId: 12, packageSha256, zipBytes: 100 }] });
    expect(() => parseF5Grant(expired, { ...exact, environment: 'staging' })).toThrow(/expirado/);
  });
});
