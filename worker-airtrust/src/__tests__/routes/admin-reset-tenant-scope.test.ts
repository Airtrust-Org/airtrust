import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 1);
    c.set('userId', 101);
    c.set('userEmail', 'admin@tenant.local');
    c.set('userRole', 'admin');
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: `emp-${empresaId}`,
      empresaNome: `Empresa ${empresaId}`,
      role: 'admin',
      plano: 'pro',
      permissions: ['*'],
    });
    await next();
  },
}));

import adminRoutes from '../../routes/admin';

type MockStatement = {
  bind: (...args: unknown[]) => MockStatement;
  run: () => Promise<{ meta: { changes: number } }>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
};

function createTenantScopedDb() {
  const statements: Array<{ sql: string; binds: unknown[] }> = [];

  const db = {
    prepare: vi.fn((sql: string): MockStatement => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      let binds: unknown[] = [];

      const stmt: MockStatement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return stmt;
        },
        run: async () => {
          statements.push({ sql: normalized, binds });
          return { meta: { changes: 1 } };
        },
        all: async <T = unknown>() => {
          statements.push({ sql: normalized, binds });
          if (normalized.startsWith('PRAGMA table_info(funcionarios)')) {
            return { results: [{ name: 'id' }, { name: 'empresa_id' }] as T[] };
          }
          if (normalized.startsWith('PRAGMA table_info(qualificacoes_tipos)')) {
            return { results: [{ name: 'id' }, { name: 'empresa_id' }] as T[] };
          }
          return { results: [] as T[] };
        },
      };

      return stmt;
    }),
  } as unknown as D1Database;

  return { db, statements };
}

function createMissingTenantDb() {
  const db = {
    prepare: vi.fn((sql: string): MockStatement => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      let binds: unknown[] = [];
      const stmt: MockStatement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return stmt;
        },
        run: async () => {
          if (normalized.startsWith('INSERT INTO admin_actions')) {
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected write: ${normalized} (${JSON.stringify(binds)})`);
        },
        all: async <T = unknown>() => ({ results: [] as T[] }),
      };
      return stmt;
    }),
  } as unknown as D1Database;

  return { db };
}

describe('admin reset tenant scope', () => {
  it('aplica filtro de tenant nas operações destrutivas de reset/funcionarios', async () => {
    const { db, statements } = createTenantScopedDb();

    const response = await adminRoutes.fetch(
      new Request('http://localhost/reset/funcionarios', { method: 'DELETE' }),
      { DB: db, __mockEmpresaId: 44 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
    });

    const destructiveWrites = statements.filter(
      (item) =>
        item.sql.startsWith('UPDATE qualificacoes_historico') ||
        item.sql.startsWith('UPDATE funcionarios_aeronaves') ||
        item.sql.startsWith('UPDATE funcionario_documentos') ||
        item.sql.startsWith('UPDATE funcionarios '),
    );

    expect(destructiveWrites).toHaveLength(4);
    for (const write of destructiveWrites) {
      expect(write.sql).toContain('empresa_id = ?');
      expect(write.binds).toContain(44);
    }
  });

  it('escopa reset/qualificacoes-tipos ao tenant atual', async () => {
    const { db, statements } = createTenantScopedDb();

    const response = await adminRoutes.fetch(
      new Request('http://localhost/reset/qualificacoes-tipos', { method: 'DELETE' }),
      { DB: db, __mockEmpresaId: 55 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);

    const historicoUpdate = statements.find((item) =>
      item.sql.startsWith("UPDATE qualificacoes_historico SET deleted_at = datetime('now')"),
    );
    const tiposUpdate = statements.find((item) =>
      item.sql.startsWith("UPDATE qualificacoes_tipos SET deleted_at = datetime('now')"),
    );

    expect(historicoUpdate?.sql).toContain('empresa_id = ?');
    expect(historicoUpdate?.binds).toEqual([55, 55]);
    expect(tiposUpdate?.sql).toContain('empresa_id = ?');
    expect(tiposUpdate?.binds).toEqual([55]);
  });

  it('bloqueia reset quando contexto de tenant está ausente', async () => {
    const { db } = createMissingTenantDb();

    const response = await adminRoutes.fetch(
      new Request('http://localhost/reset/funcionarios', { method: 'DELETE' }),
      { DB: db, __mockEmpresaId: 0 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'tenant_scope_required',
    });
  });
});
