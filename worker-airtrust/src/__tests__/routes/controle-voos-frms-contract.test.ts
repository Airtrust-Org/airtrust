import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) {
      return c.json({ success: false, error: 'Token de autenticacao nao fornecido' }, 401);
    }
    const empresaId = Number(c.req.header('x-test-empresa-id') || 1);
    const role = String(c.req.header('x-test-role') || 'admin').toLowerCase();
    c.set('userId', 10);
    c.set('empresaId', empresaId);
    c.set('userRole', role);
    c.set('tenantContext', { empresaId, role, plano: 'pro' });
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
    getEmpresaId: (c: any) => Number(c.get('tenantContext')?.empresaId || c.get('empresaId') || 0),
    checkPermission: (c: any, minimumRole: string) => {
      const role = String(c.get('tenantContext')?.role || c.get('userRole') || 'viewer');
      return (hierarchy[role] || 0) >= (hierarchy[minimumRole] || 0);
    },
  };
});

import controleVoosFrmsContractRoutes from '../../routes/controle-voos-frms-contract';

type SqliteD1 = D1Database & { databasePath: string; tempDir: string };

const tempDirs: string[] = [];
const testDir = dirname(fileURLToPath(import.meta.url));
const migration0410 = readFileSync(join(testDir, '../../../migrations/0410_controle_voos_n1_schema.sql'), 'utf8');
const migration0411 = readFileSync(
  join(testDir, '../../../migrations/0411_controle_voos_sigvoos_integration_schema.sql'),
  'utf8',
);

function runSql(databasePath: string, sql: string) {
  const result = spawnSync('sqlite3', [databasePath], { input: sql, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
}

function createSqliteD1(): SqliteD1 {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-frms-contract-route-'));
  const databasePath = join(tempDir, 'routes.sqlite');
  tempDirs.push(tempDir);

  runSql(databasePath, 'PRAGMA foreign_keys = ON;');
  runSql(databasePath, migration0410);
  runSql(databasePath, migration0411);
  runSql(
    databasePath,
    `
      CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, nome TEXT, empresa_id INTEGER NOT NULL, deleted_at TEXT);
    `,
  );

  return { databasePath, tempDir } as unknown as SqliteD1;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/controle-voos', controleVoosFrmsContractRoutes);
  return app;
}

function createEnv(dbPath: string): Env {
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async <T = unknown>() => {
          const interpolated = interpolate(sql, binds);
          const result = spawnSync('sqlite3', ['-json', dbPath, interpolated], { encoding: 'utf8' });
          expect(result.status, result.stderr).toBe(0);
          const rows = result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
          return rows[0] || null;
        },
        all: async <T = unknown>() => {
          const interpolated = interpolate(sql, binds);
          const result = spawnSync('sqlite3', ['-json', dbPath, interpolated], { encoding: 'utf8' });
          expect(result.status, result.stderr).toBe(0);
          const results = result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
          return { results };
        },
        run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
      };
      return statement;
    },
  } as unknown as D1Database;

  return {
    DB: db,
    BUCKET: {} as R2Bucket,
    JWT_SECRET: 'test-secret',
    ENVIRONMENT: 'test' as Env['ENVIRONMENT'],
    API_URL: 'http://localhost',
    FRONTEND_URL: 'http://localhost:3000',
    DEBUG: 'false',
    LOG_LEVEL: 'error',
  };
}

function sqlString(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function interpolate(sql: string, args: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => sqlString(args[index++]));
}

async function request(
  db: SqliteD1,
  path: string,
  empresaId = 1,
  role = 'manager',
): Promise<Response> {
  const headers = new Headers();
  headers.set('Authorization', 'Bearer test');
  headers.set('x-test-empresa-id', String(empresaId));
  headers.set('x-test-role', role);

  return createApp().fetch(
    new Request(`http://localhost${path}`, { headers }),
    createEnv(db.databasePath),
    {} as ExecutionContext,
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() || '', { recursive: true, force: true });
  }
});

describe('GET /api/controle-voos/frms/contract-preview (dry-run)', () => {
  it('bloqueia sem permissao de manager', async () => {
    const db = createSqliteD1();
    const response = await request(
      db,
      '/api/controle-voos/frms/contract-preview?from=2026-06-14&to=2026-06-14',
      1,
      'viewer',
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_RBAC_FORBIDDEN',
    });
  });

  it('retorna dry-run vazio com flags explicitas de nao-escrita e nao-promocao', async () => {
    const db = createSqliteD1();
    const response = await request(
      db,
      '/api/controle-voos/frms/contract-preview?from=2026-06-14&to=2026-06-14',
      1,
      'manager',
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        mode: string;
        writesEnabled: boolean;
        frmsPromotedToPrimary: boolean;
        contractVersion: string;
        total: number;
        items: unknown[];
        knownGaps: string[];
      };
    };
    expect(body.data.mode).toBe('dry_run');
    expect(body.data.writesEnabled).toBe(false);
    expect(body.data.frmsPromotedToPrimary).toBe(false);
    expect(body.data.total).toBe(0);
    expect(body.data.items).toEqual([]);
    expect(body.data.knownGaps.length).toBeGreaterThan(0);
  });

  it('rejeita janela maior que 31 dias', async () => {
    const db = createSqliteD1();
    const response = await request(
      db,
      '/api/controle-voos/frms/contract-preview?from=2026-05-01&to=2026-06-15',
      1,
      'manager',
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_WINDOW_TOO_WIDE',
    });
  });

  it('rejeita janela invalida (to < from)', async () => {
    const db = createSqliteD1();
    const response = await request(
      db,
      '/api/controle-voos/frms/contract-preview?from=2026-06-15&to=2026-06-01',
      1,
      'manager',
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_INVALID_WINDOW',
    });
  });
});
