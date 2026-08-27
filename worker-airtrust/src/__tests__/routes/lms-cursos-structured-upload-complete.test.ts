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
  it('recusa o protocolo de upload estruturado por arquivo para SCORM e orienta o ZIP completo', async () => {
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

    expect(init.status).toBe(409);
    await expect(init.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/SCORM arquivo-a-arquivo.*ZIP completo/i),
    });
    expect(bucket.putValues).toHaveLength(0);
  });
});
