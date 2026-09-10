import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) return c.json({ success: false }, 401);
    const empresaId = Number(c.req.header('x-test-empresa-id') || 1);
    const role = String(c.req.header('x-test-role') || 'manager').toLowerCase();
    c.set('userId', 10);
    c.set('empresaId', empresaId);
    c.set('userRole', role);
    c.set('tenantContext', { empresaId, role, permissions: ['read', 'write'] });
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  const hierarchy: Record<string, number> = {
    admin: 100,
    manager: 80,
    instructor: 60,
    editor: 50,
    student: 20,
    viewer: 10,
  };
  return {
    ...actual,
    checkPermission: (c: any, minimumRole: string) => {
      const role = String(c.get('userRole') || 'viewer');
      return (hierarchy[role] || 0) >= (hierarchy[minimumRole] || 0);
    },
  };
});

vi.mock('../../repositories/controle-voos/rdv-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../repositories/controle-voos/rdv-repository')>();
  return {
    ...actual,
    maybeRecordSystemAudit: vi.fn(async () => undefined),
  };
});

import catalogManagement from '../../routes/controle-voos-catalog-management';

const tempDirs: string[] = [];
const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../migrations/0410_controle_voos_n1_schema.sql',
);

function sqlString(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function interpolate(sql: string, args: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => sqlString(args[index++]));
}

function exec(databasePath: string, sql: string) {
  const result = spawnSync('sqlite3', [databasePath], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'sqlite failure');
  return result.stdout.trim();
}

function query<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'sqlite failure');
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createDb(): D1Database & { path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-cv-catalog-'));
  const path = join(dir, 'catalog.sqlite');
  tempDirs.push(dir);
  exec(path, readFileSync(migrationPath, 'utf8'));

  const db = {
    path,
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async <T = unknown>() => query<T>(path, interpolate(sql, binds))[0] || null,
        all: async <T = unknown>() => ({ results: query<T>(path, interpolate(sql, binds)) }),
        run: async () => {
          const resolved = interpolate(sql, binds);
          exec(path, resolved);
          const last = query<{ id: number }>(path, 'SELECT last_insert_rowid() AS id')[0]?.id || 0;
          return { meta: { changes: 1, last_row_id: last } };
        },
      };
      return statement;
    },
  } as unknown as D1Database & { path: string };
  return db;
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/controle-voos', catalogManagement);
  return { app, env: { DB: db } as Env };
}

function request(app: Hono<{ Bindings: Env }>, env: Env, path: string, init: RequestInit, empresaId = 1, role = 'manager') {
  return app.request(
    `http://localhost${path}`,
    {
      ...init,
      headers: {
        Authorization: 'Bearer test',
        'Content-Type': 'application/json',
        'x-test-empresa-id': String(empresaId),
        'x-test-role': role,
        ...(init.headers || {}),
      },
    },
    env,
  );
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('Controle de Voos operational catalog management', () => {
  it('allows manager to create a tenant-scoped airport and normalizes codes', async () => {
    const db = createDb();
    const { app, env } = createApp(db);
    const response = await request(app, env, '/api/controle-voos/catalogos/aeroportos', {
      method: 'POST',
      body: JSON.stringify({
        codigo: 'sbrj',
        codigo_icao: 'sbrj',
        nome: 'Santos Dumont',
        cidade: 'Rio de Janeiro',
        uf: 'rj',
        tipo: 'aeroporto',
      }),
    });

    expect(response.status).toBe(201);
    const rows = query<{ empresa_id: number; codigo: string; codigo_icao: string; uf: string }>(
      db.path,
      'SELECT empresa_id, codigo, codigo_icao, uf FROM cv_aeroportos',
    );
    expect(rows).toEqual([{ empresa_id: 1, codigo: 'SBRJ', codigo_icao: 'SBRJ', uf: 'RJ' }]);
  });

  it('rejects catalog mutation below manager role', async () => {
    const db = createDb();
    const { app, env } = createApp(db);
    const response = await request(
      app,
      env,
      '/api/controle-voos/catalogos/tipos',
      { method: 'POST', body: JSON.stringify({ codigo: 'REG', nome: 'Regular' }) },
      1,
      'viewer',
    );
    expect(response.status).toBe(403);
    expect(query(db.path, 'SELECT id FROM cv_tipos_voo')).toHaveLength(0);
  });

  it('fails closed when another tenant tries to update a catalog item', async () => {
    const db = createDb();
    exec(
      db.path,
      "INSERT INTO cv_tipos_voo (empresa_id, codigo, nome, ativo) VALUES (1, 'REG', 'Regular', 1);",
    );
    const id = query<{ id: number }>(db.path, 'SELECT id FROM cv_tipos_voo LIMIT 1')[0].id;
    const { app, env } = createApp(db);
    const response = await request(
      app,
      env,
      `/api/controle-voos/catalogos/tipos/${id}`,
      { method: 'PATCH', body: JSON.stringify({ nome: 'Alterado indevidamente' }) },
      2,
      'manager',
    );
    expect(response.status).toBe(404);
    expect(query<{ nome: string }>(db.path, `SELECT nome FROM cv_tipos_voo WHERE id = ${id}`)[0].nome).toBe('Regular');
  });

  it('inactivates without deleting the historical catalog row', async () => {
    const db = createDb();
    exec(
      db.path,
      "INSERT INTO cv_naturezas_voo (empresa_id, codigo, nome, ativo) VALUES (1, 'PAX', 'Passageiros', 1);",
    );
    const id = query<{ id: number }>(db.path, 'SELECT id FROM cv_naturezas_voo LIMIT 1')[0].id;
    const { app, env } = createApp(db);
    const response = await request(app, env, `/api/controle-voos/catalogos/naturezas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: 0 }),
    });
    expect(response.status).toBe(200);
    const row = query<{ ativo: number; deleted_at: string | null }>(
      db.path,
      `SELECT ativo, deleted_at FROM cv_naturezas_voo WHERE id = ${id}`,
    )[0];
    expect(row.ativo).toBe(0);
    expect(row.deleted_at).toBeNull();
  });
});
