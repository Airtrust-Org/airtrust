import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  beginLmsContentUpload,
  completeStructuredLmsContentUpload,
  putLmsContentUploadFile,
  uploadLmsZipPackage,
} from '../../../lib/lms/lms-content-upload-service';

type Course = {
  id: number;
  empresa_id: number;
  titulo: string;
  version_tag: string | null;
  scorm_package_r2_prefix: string | null;
  tipo_conteudo: string | null;
  h5p_conteudo_id: number | null;
  scorm_launch_file?: string | null;
};

class MemoryBucket {
  objects = new Map<string, Uint8Array>();
  contentPutCount = 0;
  failOnContentPut: number | null = null;

  async put(key: string, value: ArrayBuffer | ArrayBufferView | string) {
    if (!key.endsWith('.airtrust-upload.json')) {
      const index = this.contentPutCount++;
      if (this.failOnContentPut === index) throw new Error(`r2 failure ${index}`);
    }
    const bytes = typeof value === 'string'
      ? strToU8(value)
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    this.objects.set(key, new Uint8Array(bytes));
    return {};
  }

  async get(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      size: bytes.byteLength,
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }

  async list({ prefix = '' }: { prefix?: string; cursor?: string; limit?: number }) {
    return {
      objects: [...this.objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, bytes]) => ({ key, size: bytes.byteLength })),
      truncated: false,
      cursor: undefined,
      delimitedPrefixes: [],
    };
  }

  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}

class MemoryDb {
  courses = new Map<string, Course>();
  h5pRows: Array<{ id: number; empresa_id: number; titulo: string; r2_key: string; ativo: number; deleted_at: string | null }> = [];
  queries: string[] = [];
  failCourseUpdate = false;
  nextH5pId = 100;

  addCourse(course: Course) {
    this.courses.set(`${course.empresa_id}:${course.id}`, { ...course });
  }

  prepare(query: string) {
    this.queries.push(query);
    const db = this;
    return {
      bind(...args: unknown[]) {
        return {
          async first() {
            if (query.includes('FROM lms_cursos')) {
              const cursoId = Number(args[0]);
              const empresaId = Number(args[1]);
              return db.courses.get(`${empresaId}:${cursoId}`) ?? null;
            }
            if (query.includes('FROM lms_h5p_conteudos')) {
              const empresaId = Number(args[0]);
              const prefix = String(args[1]);
              const row = [...db.h5pRows].reverse().find(
                (entry) => entry.empresa_id === empresaId && entry.r2_key === prefix && entry.ativo === 1 && !entry.deleted_at,
              );
              return row ? { id: row.id } : null;
            }
            return null;
          },
          async run() {
            if (query.includes('INSERT INTO lms_h5p_conteudos')) {
              const row = {
                id: db.nextH5pId++,
                empresa_id: Number(args[0]),
                titulo: String(args[1]),
                r2_key: String(args[3]),
                ativo: 1,
                deleted_at: null,
              };
              db.h5pRows.push(row);
              return { meta: { changes: 1, last_row_id: row.id } };
            }
            if (query.includes('UPDATE lms_h5p_conteudos')) {
              const h5pId = Number(args[0]);
              const empresaId = Number(args[1]);
              const row = db.h5pRows.find((entry) => entry.id === h5pId && entry.empresa_id === empresaId);
              if (row) {
                row.ativo = 0;
                row.deleted_at = 'deleted';
              }
              return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
            }
            if (query.includes('UPDATE lms_cursos')) {
              if (db.failCourseUpdate) throw new Error('d1 update failure');
              const hasBinding = query.includes('h5p_conteudo_id = ?');
              const whereStart = hasBinding ? 7 : 6;
              const cursoId = Number(args[whereStart]);
              const empresaId = Number(args[whereStart + 1]);
              const expectedVersion = args[whereStart + 2] == null ? null : String(args[whereStart + 2]);
              const expectedPrefix = args[whereStart + 3] == null ? null : String(args[whereStart + 3]);
              const course = db.courses.get(`${empresaId}:${cursoId}`);
              if (!course || (course.version_tag ?? '') !== (expectedVersion ?? '') || (course.scorm_package_r2_prefix ?? '') !== (expectedPrefix ?? '')) {
                return { meta: { changes: 0, last_row_id: 0 } };
              }
              course.tipo_conteudo = String(args[0]);
              course.scorm_package_r2_prefix = String(args[1]);
              course.scorm_launch_file = args[2] == null ? null : String(args[2]);
              course.version_tag = String(args[5]);
              if (hasBinding) course.h5p_conteudo_id = args[6] == null ? null : Number(args[6]);
              return { meta: { changes: 1, last_row_id: 0 } };
            }
            return { meta: { changes: 0, last_row_id: 0 } };
          },
        };
      },
    };
  }
}

function scormPackage(fileCount = 2) {
  const files: Record<string, Uint8Array> = {
    'imsmanifest.xml': strToU8('<manifest><resources><resource href="index.html" /></resources></manifest>'),
    'index.html': strToU8('<html>ok</html>'),
  };
  for (let i = 2; i < fileCount; i += 1) files[`asset-${i}.js`] = strToU8(`a${i}`);
  return zipSync(files, { level: 0 });
}

function h5pPackage() {
  return zipSync({
    'h5p.json': strToU8(JSON.stringify({ mainLibrary: 'H5P.Column 1.18' })),
    'content/content.json': strToU8('{}'),
  });
}

function fixture() {
  const db = new MemoryDb();
  db.addCourse({
    id: 12,
    empresa_id: 77,
    titulo: 'Curso compartilhado',
    version_tag: 'v1',
    scorm_package_r2_prefix: 'lms/scorm/77/12/_versions/old/',
    tipo_conteudo: 'scorm',
    h5p_conteudo_id: null,
  });
  const bucket = new MemoryBucket();
  bucket.objects.set('lms/scorm/77/12/_versions/old/index.html', strToU8('old'));
  return { db, bucket };
}

for (const [label, failIndex] of [['primeiro', 0], ['meio', 4], ['último', 8]] as const) {
  it(`compensa falha R2 no ${label} arquivo e preserva conteúdo anterior`, async () => {
    const { db, bucket } = fixture();
    bucket.failOnContentPut = failIndex;
    await expect(
      uploadLmsZipPackage({
        db: db as unknown as D1Database,
        bucket: bucket as unknown as R2Bucket,
        empresaId: 77,
        cursoId: 12,
        tipoConteudo: 'scorm',
        hasH5pConteudoIdColumn: true,
        bytes: scormPackage(9),
        arquivoNome: 'curso.zip',
      }),
    ).rejects.toThrow(/r2 failure/i);
    expect(db.courses.get('77:12')?.scorm_package_r2_prefix).toBe('lms/scorm/77/12/_versions/old/');
    expect(bucket.objects.has('lms/scorm/77/12/_versions/old/index.html')).toBe(true);
    expect([...bucket.objects.keys()].some((key) => key.includes('/_versions/') && !key.includes('/old/'))).toBe(false);
  });
}

describe('LMS content upload consistency', () => {
  it('compensa objetos e H5P quando a atualização D1 falha', async () => {
    const { db, bucket } = fixture();
    db.failCourseUpdate = true;
    await expect(
      uploadLmsZipPackage({
        db: db as unknown as D1Database,
        bucket: bucket as unknown as R2Bucket,
        empresaId: 77,
        cursoId: 12,
        tipoConteudo: 'h5p',
        hasH5pConteudoIdColumn: true,
        bytes: h5pPackage(),
        arquivoNome: 'curso.h5p',
      }),
    ).rejects.toThrow(/d1 update failure/i);
    expect(db.courses.get('77:12')?.scorm_package_r2_prefix).toContain('/old/');
    expect(db.h5pRows.every((row) => row.deleted_at === 'deleted')).toBe(true);
    expect([...bucket.objects.keys()].filter((key) => key.startsWith('lms/h5p/77/12/'))).toHaveLength(0);
  });

  it('associa H5P por id explícito sem consultar título, mesmo com títulos iguais em tenants distintos', async () => {
    const db = new MemoryDb();
    db.addCourse({ id: 1, empresa_id: 10, titulo: 'Mesmo título', version_tag: 'a', scorm_package_r2_prefix: null, tipo_conteudo: 'h5p', h5p_conteudo_id: null });
    db.addCourse({ id: 2, empresa_id: 20, titulo: 'Mesmo título', version_tag: 'b', scorm_package_r2_prefix: null, tipo_conteudo: 'h5p', h5p_conteudo_id: null });
    const bucket = new MemoryBucket();

    for (const [empresaId, cursoId] of [[10, 1], [20, 2]] as const) {
      await uploadLmsZipPackage({
        db: db as unknown as D1Database,
        bucket: bucket as unknown as R2Bucket,
        empresaId,
        cursoId,
        tipoConteudo: 'h5p',
        hasH5pConteudoIdColumn: true,
        bytes: h5pPackage(),
        arquivoNome: 'mesmo.h5p',
      });
    }

    expect(db.h5pRows).toHaveLength(2);
    expect(db.h5pRows.map((row) => row.empresa_id).sort()).toEqual([10, 20]);
    expect(db.courses.get('10:1')?.h5p_conteudo_id).not.toBe(db.courses.get('20:2')?.h5p_conteudo_id);
    expect(db.queries.some((query) => /WHERE\s+empresa_id\s*=\s*\?\s+AND\s+titulo\s*=\s*\?/i.test(query))).toBe(false);
  });

  it('substitui por nova versão e remove somente a versão anterior após o CAS', async () => {
    const { db, bucket } = fixture();
    const result = await uploadLmsZipPackage({
      db: db as unknown as D1Database,
      bucket: bucket as unknown as R2Bucket,
      empresaId: 77,
      cursoId: 12,
      tipoConteudo: 'scorm',
      hasH5pConteudoIdColumn: true,
      bytes: scormPackage(),
      arquivoNome: 'nova.zip',
    });
    expect(result.launch_file).toMatch(/^_versions\/.+\/index\.html$/);
    expect(db.courses.get('77:12')?.scorm_package_r2_prefix).toBe(result.prefix);
    expect(bucket.objects.has('lms/scorm/77/12/_versions/old/index.html')).toBe(false);
    expect(bucket.objects.has(`${result.prefix}index.html`)).toBe(true);
  });

  it('permite apenas um vencedor em uploads concorrentes do mesmo curso', async () => {
    const { db, bucket } = fixture();
    const common = {
      db: db as unknown as D1Database,
      bucket: bucket as unknown as R2Bucket,
      empresaId: 77,
      cursoId: 12,
      tipoConteudo: 'scorm' as const,
      hasH5pConteudoIdColumn: true,
    };
    const first = await beginLmsContentUpload(common);
    const second = await beginLmsContentUpload(common);
    for (const marker of [first, second]) {
      await putLmsContentUploadFile({ ...common, operationId: marker.operationId, path: 'imsmanifest.xml', bytes: strToU8('<manifest><resources><resource href="index.html" /></resources></manifest>') });
      await putLmsContentUploadFile({ ...common, operationId: marker.operationId, path: 'index.html', bytes: strToU8('ok') });
    }

    const winner = await completeStructuredLmsContentUpload({ ...common, operationId: first.operationId, arquivoNome: 'a.zip' });
    await expect(
      completeStructuredLmsContentUpload({ ...common, operationId: second.operationId, arquivoNome: 'b.zip' }),
    ).rejects.toThrow(/concorrente/i);
    expect(db.courses.get('77:12')?.scorm_package_r2_prefix).toBe(winner.prefix);
    expect([...bucket.objects.keys()].some((key) => key.includes(second.operationId))).toBe(false);
  });
});
