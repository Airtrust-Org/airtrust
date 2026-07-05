import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'admin');
    c.set('empresaId', 6);
    c.set('tenantContext', {
      empresaId: 6,
      empresaCodigo: 'tenant-6',
      empresaNome: 'Tenant 6',
      role: 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    audit: vi.fn(async () => undefined),
  };
});

import simuladoresModelosRoutes from '../../routes/simuladores-modelos';

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function createDbMock() {
  const runs: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare(query: string) {
      const sql = normalizeSql(query);

      if (sql === 'PRAGMA table_info(modelos_sessao)') {
        return {
          async all() {
            return {
              results: [
                { name: 'id' },
                { name: 'empresa_id' },
                { name: 'tipo' },
                { name: 'modelo_aeronave' },
                { name: 'codigo_aeronave' },
                { name: 'tipo_aeronave' },
                { name: 'tipo_sessao_id' },
                { name: 'qualificacao_tipo_id' },
                { name: 'deleted_at' },
              ],
            };
          },
        };
      }

      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (
                sql ===
                'SELECT id FROM modelos_sessao WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?'
              ) {
                return { id: 77 } as T;
              }
              return null as T | null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              runs.push({ query: sql, args });
              return { meta: { changes: 1, last_row_id: 77 } };
            },
          };
        },
        async all() {
          return { results: [] };
        },
      };
    },
  } as unknown as D1Database;

  return { db, runs };
}

describe('simuladores modelos observacoes guard', () => {
  it('POST /modelos-sessao rejeita observacoes com metadado interno antes de escrever', async () => {
    const { db, runs } = createDbMock();

    const response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: 'A139-REQ-01',
          nome: 'Reaquisição de Experiência Recente',
          tipo_sessao_id: 9,
          modelo_aeronave: 'AW139',
          manobras: [
            {
              manobra_id: 1,
              ordem: 1,
              observacoes: 'sourceNotes do loader',
            },
          ],
        }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('metadado interno'),
    });
    expect(runs.some((item) => item.query.startsWith('INSERT INTO modelos_sessao'))).toBe(false);
    expect(runs.some((item) => item.query.startsWith('INSERT INTO modelos_sessao_manobras'))).toBe(
      false,
    );
  });

  it('POST /modelos-sessao/:id/manobras rejeita batch com observacoes proibidas', async () => {
    const { db, runs } = createDbMock();

    const response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao/77/manobras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manobras: [
            {
              manobra_id: 1,
              ordem: 1,
              observacoes: '{"metadata":"internal"}',
            },
          ],
        }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('metadado interno'),
    });
    expect(runs.some((item) => item.query.startsWith('INSERT INTO modelos_sessao_manobras'))).toBe(
      false,
    );
  });
});
