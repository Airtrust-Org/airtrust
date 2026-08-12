import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';

const authState = vi.hoisted(() => ({ role: 'admin', userId: 42, empresaId: 77 }));
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', authState.userId);
    c.set('userRole', authState.role);
    c.set('empresaId', authState.empresaId);
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/escalas-shared', () => ({ getEmpresaIdSafe: () => authState.empresaId }));

import lmsCursosRoutes from '../../routes/lms-cursos';

function app() {
  const testApp = new Hono<{ Bindings: Env }>();
  testApp.onError((error, c) => {
    const status =
      typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode) || 500
        : 500;
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno' },
      status as 400 | 500,
    );
  });
  testApp.route('/cursos', lmsCursosRoutes);
  return testApp;
}

function db() {
  return {
    prepare: vi.fn((query: string) => {
      if (query.includes('FROM sqlite_master')) {
        return { bind: () => ({ first: async () => ({ ok: 1 }) }) };
      }
      if (/PRAGMA\s+table_info\s*\(\s*lms_cursos\s*\)/i.test(query)) {
        return {
          all: async () => ({
            results: [
              { name: 'id' },
              { name: 'h5p_conteudo_id' },
              { name: 'formato_id' },
              { name: 'dominio_codigo' },
            ],
          }),
        };
      }
      if (query.includes('FROM lms_cursos')) {
        return {
          bind: () => ({
            first: async () => ({
              id: 12,
              empresa_id: 77,
              titulo: 'Offshore',
              version_tag: 'v1',
              scorm_package_r2_prefix: 'lms/scorm/77/12/',
              tipo_conteudo: 'scorm',
              h5p_conteudo_id: null,
            }),
          }),
        };
      }
      if (query.includes('operational_domain_rbac_enabled')) {
        return { bind: () => ({ first: async () => ({ operational_domain_rbac_enabled: 0 }) }) };
      }
      if (query.includes('UPDATE lms_cursos')) {
        return { bind: () => ({ run: async () => ({ meta: { changes: 1, last_row_id: 0 } }) }) };
      }
      throw new Error(`Unhandled query: ${query}`);
    }),
  } as unknown as D1Database;
}

class Bucket {
  objects = new Map<string, Uint8Array>([
    ['lms/scorm/77/12/index.html', new TextEncoder().encode('legacy')],
  ]);
  putValues: unknown[] = [];
  async put(key: string, value: string | ArrayBufferView | ReadableStream<Uint8Array>) {
    this.putValues.push(value);
    const isStream = typeof value === 'object' && value !== null && 'getReader' in value;
    const bytes =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : isStream
          ? new Uint8Array(await new Response(value).arrayBuffer())
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    this.objects.set(key, new Uint8Array(bytes));
    return { key, size: bytes.byteLength };
  }
  async get(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      size: bytes.byteLength,
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }
  async head(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return { key, size: bytes.byteLength };
  }
  async list({ prefix = '' }: { prefix?: string }) {
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

describe('lms cursos structured upload complete', () => {
  it('encaminha arquivos com Content-Length diretamente ao R2 como stream', async () => {
    const bucket = new Bucket();
    const env = { DB: db(), BUCKET: bucket as unknown as R2Bucket } as Env;
    const init = await app().request(
      '/cursos/12/content-upload/init',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo_conteudo: 'scorm' }),
      },
      env,
    );
    const initJson = (await init.json()) as { data: { upload_id: string } };
    const body = new TextEncoder().encode('<manifest />');
    const response = await app().request(
      `/cursos/12/content-upload/file?tipo_conteudo=scorm&upload_id=${initJson.data.upload_id}&path=imsmanifest.xml`,
      {
        method: 'POST',
        headers: { 'Content-Length': String(body.byteLength) },
        body,
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(bucket.putValues.at(-1)).toBeInstanceOf(ReadableStream);
  });

  it('encaminha arquivos sem Content-Length diretamente ao R2 sem bufferizar o body', async () => {
    const bucket = new Bucket();
    const env = { DB: db(), BUCKET: bucket as unknown as R2Bucket } as Env;
    const init = await app().request(
      '/cursos/12/content-upload/init',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo_conteudo: 'scorm' }),
      },
      env,
    );
    const initJson = (await init.json()) as { data: { upload_id: string } };
    const body = new TextEncoder().encode('media-heavy-payload');
    const response = await app().request(
      `/cursos/12/content-upload/file?tipo_conteudo=scorm&upload_id=${initJson.data.upload_id}&path=media/pcm_sensors.webp`,
      {
        method: 'POST',
        body,
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(bucket.putValues.at(-1)).toBeInstanceOf(ReadableStream);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { bytes: body.byteLength },
    });
  });

  it('retorna os arquivos já presentes quando a mesma operação idempotente é retomada', async () => {
    const bucket = new Bucket();
    const env = { DB: db(), BUCKET: bucket as unknown as R2Bucket } as Env;
    const idempotencyKey = 'scorm:resume-test';
    const firstInit = await app().request(
      '/cursos/12/content-upload/init',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ tipo_conteudo: 'scorm', idempotency_key: idempotencyKey }),
      },
      env,
    );
    const firstJson = (await firstInit.json()) as { data: { upload_id: string } };
    const body = new TextEncoder().encode('already-stored');
    const stored = await app().request(
      `/cursos/12/content-upload/file?tipo_conteudo=scorm&upload_id=${firstJson.data.upload_id}&path=media/cap08/pcm_connectors.webp`,
      { method: 'POST', body },
      env,
    );
    expect(stored.status).toBe(200);

    const resumedInit = await app().request(
      '/cursos/12/content-upload/init',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ tipo_conteudo: 'scorm', idempotency_key: idempotencyKey }),
      },
      env,
    );

    expect(resumedInit.status).toBe(200);
    await expect(resumedInit.json()).resolves.toMatchObject({
      success: true,
      data: {
        upload_id: firstJson.data.upload_id,
        status: 'uploading',
        uploaded_files: [{ path: 'media/cap08/pcm_connectors.webp', size: body.byteLength }],
      },
    });
  });

  it('não aceita arquivo legado fora da versão para mascarar launch ausente', async () => {
    const bucket = new Bucket();
    const env = { DB: db(), BUCKET: bucket as unknown as R2Bucket } as Env;
    const init = await app().request(
      '/cursos/12/content-upload/init',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo_conteudo: 'scorm' }),
      },
      env,
    );
    const initJson = (await init.json()) as { data: { upload_id: string } };
    const uploadId = initJson.data.upload_id;

    await app().request(
      `/cursos/12/content-upload/file?tipo_conteudo=scorm&upload_id=${uploadId}&path=imsmanifest.xml`,
      {
        method: 'POST',
        body: '<manifest><resources><resource href="index.html" /></resources></manifest>',
      },
      env,
    );

    const response = await app().request(
      '/cursos/12/content-upload/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_conteudo: 'scorm',
          upload_id: uploadId,
          arquivo_nome: 'novo.zip',
        }),
      },
      env,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/launch file .* não existe/i),
    });
    expect(bucket.objects.has('lms/scorm/77/12/index.html')).toBe(true);
  });
});
