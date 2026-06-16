import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticacao nao fornecido' }, 401);
      }

      const empresaId = Number(c.req.header('x-test-empresa-id') || 1);
      const role = String(c.req.header('x-test-role') || 'admin').toLowerCase();
      c.set('userId', 10);
      c.set('empresaId', empresaId);
      c.set('userRole', role);
      c.set('tenantContext', {
        empresaId,
        empresaCodigo: `empresa-${empresaId}`,
        empresaNome: `Empresa ${empresaId}`,
        role,
        plano: 'pro',
        permissions: role === 'viewer' ? ['read'] : ['read', 'write'],
      });
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

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(async () => undefined),
  extrairUsuarioAuditoria: () => ({ usuario_id: '10', usuario_nome: 'Teste' }),
}));

import controleVoosRoutes from '../../routes/controle-voos';

type SqliteD1 = D1Database & {
  databasePath: string;
  tempDir: string;
  queryJson: <T>(sql: string) => T[];
};

const tempDirs: string[] = [];
const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../migrations/0410_controle_voos_n1_schema.sql',
);
const sigvoosMigrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../migrations/0411_controle_voos_sigvoos_integration_schema.sql',
);
const routePath = join(dirname(fileURLToPath(import.meta.url)), '../../routes/controle-voos.ts');
const sigvoosRealPreviewServicePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../services/controle-voos/sigvoos-real-preview.ts',
);

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

function runSql(databasePath: string, sql: string) {
  const result = spawnSync('sqlite3', [databasePath], {
    input: sql,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function queryJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], {
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createSqliteD1(): SqliteD1 {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-routes-'));
  const databasePath = join(tempDir, 'routes.sqlite');
  tempDirs.push(tempDir);

  runSql(databasePath, 'PRAGMA foreign_keys = ON;');
  runSql(databasePath, readFileSync(migrationPath, 'utf8'));
  seed(databasePath);

  const db = {
    databasePath,
    tempDir,
    queryJson: <T>(sql: string) => queryJson<T>(databasePath, sql),
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async <T = unknown>() => {
          const rows = queryJson<T>(databasePath, interpolate(sql, binds));
          return rows[0] || null;
        },
        all: async <T = unknown>() => ({
          results: queryJson<T>(databasePath, interpolate(sql, binds)),
        }),
        run: async () => {
          runSql(databasePath, interpolate(sql, binds));
          const lastId = sql.includes('INSERT INTO cv_voos')
            ? queryJson<{ id: number }>(databasePath, 'SELECT id FROM cv_voos ORDER BY id DESC LIMIT 1')[0]?.id
            : sql.includes('INSERT INTO cv_rdv_operacional')
              ? queryJson<{ id: number }>(
                  databasePath,
                  'SELECT id FROM cv_rdv_operacional ORDER BY id DESC LIMIT 1',
                )[0]?.id
              : queryJson<{ id: number }>(
                  databasePath,
                  'SELECT id FROM cv_voo_eventos ORDER BY id DESC LIMIT 1',
                )[0]?.id;
          return { meta: { changes: 1, last_row_id: lastId || 0 } };
        },
      };
      return statement;
    },
  } as unknown as SqliteD1;

  return db;
}

function seed(databasePath: string) {
  runSql(
    databasePath,
    `
      INSERT INTO cv_aeroportos (id, empresa_id, codigo, codigo_icao, nome, tipo, ativo, ordem)
      VALUES
        (101, 1, 'SBRJ', 'SBRJ', 'Santos Dumont', 'aeroporto', 1, 1),
        (102, 1, 'SBSP', 'SBSP', 'Congonhas', 'aeroporto', 1, 2),
        (103, 1, 'SBPL01', 'SBPL01', 'Plataforma P-01', 'plataforma', 1, 3),
        (201, 2, 'SBBR', 'SBBR', 'Brasilia', 'aeroporto', 1, 1),
        (202, 2, 'SBCF', 'SBCF', 'Confins', 'aeroporto', 1, 2);

      INSERT INTO cv_tipos_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES
        (301, 1, 'REG', 'Regular', 1, 1),
        (302, 2, 'REG', 'Regular B', 1, 1);

      INSERT INTO cv_naturezas_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES
        (401, 1, 'PAX', 'Passageiro', 1, 1),
        (402, 2, 'PAX', 'Passageiro B', 1, 1);

      INSERT INTO cv_motivos_operacionais (id, empresa_id, codigo, nome, tipo, ativo, ordem)
      VALUES
        (501, 1, 'WX', 'Meteorologia', 'cancelamento', 1, 1),
        (502, 1, 'OPS', 'Ajuste operacional', 'geral', 1, 2),
        (503, 2, 'WX', 'Meteorologia B', 'cancelamento', 1, 1);

      INSERT INTO cv_voos (
        id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, horario_previsto_partida,
        horario_previsto_chegada, status, observacoes, created_by, updated_by
      ) VALUES
        (
          601, 1, 'ATX-1001', '2026-06-14', 101, 102,
          301, 401, '2026-06-14T10:00:00Z',
          '2026-06-14T11:00:00Z', 'planejado', 'Tenant A', 10, 10
        ),
        (
          602, 1, 'ATX-1002', '2026-06-15', 102, 103,
          301, 401, '2026-06-15T10:00:00Z',
          '2026-06-15T11:00:00Z', 'liberado_operacionalmente', 'Tenant A 2', 10, 10
        ),
        (
          701, 2, 'BTX-2001', '2026-06-14', 201, 202,
          302, 402, '2026-06-14T12:00:00Z',
          '2026-06-14T13:00:00Z', 'planejado', 'Tenant B', 20, 20
        );
    `,
  );
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/controle-voos', controleVoosRoutes);
  return app;
}

function createEnv(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    BUCKET: {} as R2Bucket,
    JWT_SECRET: 'test-secret',
    ENVIRONMENT: 'test' as Env['ENVIRONMENT'],
    API_URL: 'http://localhost',
    FRONTEND_URL: 'http://localhost:3000',
    DEBUG: 'false',
    LOG_LEVEL: 'error',
    ...overrides,
  };
}

async function request(
  db: D1Database,
  path: string,
  init: RequestInit = {},
  empresaId = 1,
  role = 'admin',
  envOverrides: Partial<Env> = {},
) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test');
  headers.set('x-test-empresa-id', String(empresaId));
  headers.set('x-test-role', role);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return createApp().fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    createEnv(db, envOverrides),
    {} as ExecutionContext,
  );
}

function applySigvoosSchema(databasePath: string) {
  runSql(databasePath, readFileSync(sigvoosMigrationPath, 'utf8'));
}

function seedSigvoosPreviewState(databasePath: string) {
  runSql(
    databasePath,
    `
      UPDATE cv_voos
      SET origem_importacao = 'SIGVOOS',
          sigvoos_importado_em = '2026-06-15T12:00:00Z',
          sigvoos_content_hash = 'hash-flight-601'
      WHERE id = 601;

      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number,
        origem_icao, destino_icao, origem_dados, sigvoos_importado_em
      ) VALUES
        (9001, 1, 601, 1, 1, 'SBRJ', 'SBSP', 'SIGVOOS', '2026-06-15T12:00:00Z'),
        (9002, 2, 701, 1, 1, 'SBBR', 'SBCF', 'SIGVOOS', '2026-06-15T12:00:00Z');

      INSERT INTO cv_voo_tripulantes (
        id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id
      ) VALUES
        (9101, 1, 601, 1001, 'PIC', 9001, 7001),
        (9102, 2, 701, 2001, 'PIC', 9002, 8001);

      INSERT INTO cv_sigvoos_staging (
        id, empresa_id, sigvoos_flight_report_id, sigvoos_leg_number,
        data_operacional, source_window_start, source_window_end,
        payload_hash, import_status, cv_voo_id, cv_etapa_id, cv_tripulante_id
      ) VALUES
        ('tenant-a-processed', 1, 700101, 1, '2026-06-15', '2026-06-15', '2026-06-15', 'hash-a-1', 'PROCESSED', 601, 9001, 9101),
        ('tenant-a-pending', 1, 700102, 1, '2026-06-15', '2026-06-15', '2026-06-15', 'hash-a-2', 'PENDING', NULL, NULL, NULL),
        ('tenant-b-processed', 2, 800101, 1, '2026-06-15', '2026-06-15', '2026-06-15', 'hash-b-1', 'PROCESSED', 701, 9002, 9102);

      INSERT INTO cv_conflitos_integracao (
        id, empresa_id, entidade_tipo, entidade_id, campo,
        valor_airtrust, valor_sigvoos, staging_id, severidade, status
      ) VALUES
        (9201, 1, 'voo', 601, 'prefixo', 'ATX-1001', 'ATX-EXT', 'tenant-a-processed', 'MEDIA', 'ABERTO');
    `,
  );
}

function validFlightPayload(overrides: Record<string, unknown> = {}) {
  return {
    prefixo: 'ATX-2099',
    data_programacao: '2026-06-16',
    origem_id: 101,
    destino_id: 102,
    tipo_voo_id: 301,
    natureza_voo_id: 401,
    horario_previsto_partida: '2026-06-16T10:00:00Z',
    horario_previsto_chegada: '2026-06-16T11:00:00Z',
    observacoes: 'Uso interno',
    ...overrides,
  };
}

function validRdvPayload(overrides: Record<string, unknown> = {}) {
  return {
    numero: 'RDV-20260614-001',
    data_voo: '2026-06-14',
    horario_decolagem_real: '2026-06-14T10:05:00Z',
    horario_pouso_real: '2026-06-14T11:10:00Z',
    horas_voadas: 1.08,
    numero_pousos: 1,
    ciclos: 1,
    combustivel_decolagem: 1200,
    combustivel_pouso: 700,
    combustivel_consumo: 500,
    pob: 4,
    carga_kg: 120.5,
    ocorrencias: 'Sem intercorrencias',
    divergencias: 'Nenhuma',
    ...overrides,
  };
}

function seedDashboardFixtures(databasePath: string) {
  runSql(
    databasePath,
    `
      INSERT INTO cv_voos (
        id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, aeronave_id,
        horario_previsto_partida, horario_previsto_chegada,
        horario_real_partida, horario_real_chegada,
        status, observacoes, cancelado_motivo_id, created_by, updated_by
      ) VALUES
        (
          603, 1, 'ATX-1003', '2026-06-14', 101, 102, 301, 401, 9101,
          '2026-06-14T14:00:00Z', '2026-06-14T15:10:00Z',
          '2026-06-14T14:12:00Z', '2026-06-14T15:18:00Z',
          'concluido_operacionalmente', 'Concluido sem RDV', NULL, 10, 10
        ),
        (
          604, 1, 'ATX-1004', '2026-06-15', 101, 103, 301, 401, 9102,
          '2026-06-15T08:00:00Z', '2026-06-15T09:30:00Z',
          NULL, NULL,
          'cancelado', 'Cancelado', 501, 10, 10
        ),
        (
          605, 1, 'ATX-1005', '2026-06-15', 103, 102, 301, 401, 9103,
          '2026-06-15T13:00:00Z', '2026-06-15T15:00:00Z',
          '2026-06-15T13:05:00Z', '2026-06-15T15:20:00Z',
          'alternado_divergido', 'Divergencia operacional', NULL, 10, 10
        ),
        (
          606, 1, 'ATX-1006', '2026-06-14', 102, 103, 301, 401, 9104,
          '2026-06-14T16:00:00Z', '2026-06-14T17:20:00Z',
          '2026-06-14T16:05:00Z', NULL,
          'em_andamento', 'Em andamento', NULL, 10, 10
        );

      INSERT INTO cv_voo_tripulantes (
        empresa_id, voo_id, funcionario_id, funcao, horario_apresentacao, created_by, updated_by
      ) VALUES
        (1, 603, 801, 'PIC', '2026-06-14T13:00:00Z', 10, 10),
        (1, 605, 802, 'PIC', '2026-06-15T12:00:00Z', 10, 10),
        (1, 606, 803, 'PIC', '2026-06-14T15:00:00Z', 10, 10);

      INSERT INTO cv_rdv_operacional (
        id, empresa_id, voo_id, numero, data_voo,
        horario_decolagem_real, horario_pouso_real,
        horas_voadas, numero_pousos, ciclos,
        combustivel_decolagem, combustivel_pouso, combustivel_consumo,
        pob, carga_kg, ocorrencias, divergencias,
        status, responsavel_preenchimento_id, preenchido_em,
        created_by, updated_by, finalizado_operacionalmente_por, finalizado_operacionalmente_em
      ) VALUES
        (
          901, 1, 602, 'RDV-20260615-602', '2026-06-15',
          '2026-06-15T10:10:00Z', '2026-06-15T11:22:00Z',
          1.2, 1, 1,
          1200, 700, 500,
          4, 100, 'Rascunho', '', 'rascunho', 10, '2026-06-15T11:30:00Z',
          10, 10, NULL, NULL
        ),
        (
          902, 1, 605, 'RDV-20260615-605', '2026-06-15',
          '2026-06-15T13:05:00Z', '2026-06-15T15:20:00Z',
          2.1, 2, 2,
          1800, 1100, 700,
          5, 180, 'Finalizado', 'Alternado por meteorologia', 'preenchimento_finalizado', 10, '2026-06-15T15:30:00Z',
          10, 10, 10, '2026-06-15T15:40:00Z'
        ),
        (
          903, 2, 701, 'RDV-20260614-701', '2026-06-14',
          '2026-06-14T12:10:00Z', '2026-06-14T13:00:00Z',
          0.8, 1, 1,
          900, 600, 300,
          3, 80, 'Tenant B', '', 'preenchimento_finalizado', 20, '2026-06-14T13:10:00Z',
          20, 20, 20, '2026-06-14T13:15:00Z'
        );
    `,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() || '', { recursive: true, force: true });
  }
});

describe('controle voos routes', () => {
  it('cria voo valido e registra evento operacional', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos', {
      method: 'POST',
      body: JSON.stringify(validFlightPayload()),
    });

    expect(response.status).toBe(201);
    const body = await response.json() as { data: { id: number; empresa_id: number; prefixo: string } };
    expect(body.data).toMatchObject({ empresa_id: 1, prefixo: 'ATX-2099' });

    const events = db.queryJson<{ tipo_evento: string; status_novo: string }>(
      `SELECT tipo_evento, status_novo FROM cv_voo_eventos WHERE voo_id = ${body.data.id}`,
    );
    expect(events).toEqual([{ tipo_evento: 'sistema', status_novo: 'planejado' }]);
  });

  it('lista somente voos do tenant atual com limite maximo', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos?limit=500');
    const body = await response.json() as {
      data: Array<{ empresa_id: number; prefixo: string }>;
      pagination: { limit: number; total: number };
    };

    expect(response.status).toBe(200);
    expect(body.pagination).toMatchObject({ limit: 100, total: 2 });
    expect(body.data.map((flight) => flight.empresa_id)).toEqual([1, 1]);
    expect(body.data.map((flight) => flight.prefixo)).not.toContain('BTX-2001');
  });

  it('retorna detalhe por id respeitando soft delete', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 601, empresa_id: 1, prefixo: 'ATX-1001' },
    });

    runSql(db.databasePath, "UPDATE cv_voos SET deleted_at = datetime('now') WHERE id = 601");
    const deletedResponse = await request(db, '/api/controle-voos/voos/601');
    expect(deletedResponse.status).toBe(404);
  });

  it('aplica patch basico e grava evento', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601', {
      method: 'PATCH',
      body: JSON.stringify({ observacoes: 'Revisao operacional' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 601, observacoes: 'Revisao operacional' },
    });
    expect(
      db.queryJson<{ total: number }>(
        "SELECT COUNT(*) AS total FROM cv_voo_eventos WHERE voo_id = 601 AND tipo_evento = 'observacao'",
      ),
    ).toEqual([{ total: 1 }]);
  });

  it('aceita transicao de status basica', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'liberado_operacionalmente' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 601, status: 'liberado_operacionalmente' },
    });
  });

  it('rejeita transicao de status nao permitida', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'pousado' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_INVALID_TRANSITION',
    });
  });

  it('rejeita cancelamento sem motivo operacional', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'cancelado' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_CANCEL_REASON_REQUIRED',
    });
  });

  it('lista catalogos permitidos por tenant', async () => {
    const db = createSqliteD1();

    for (const nome of ['aeroportos', 'tipos-voo', 'naturezas-voo', 'motivos-operacionais']) {
      const response = await request(db, `/api/controle-voos/catalogos/${nome}`);
      const body = await response.json() as { data: Array<{ id: number }>; meta: { count: number } };

      expect(response.status).toBe(200);
      expect(body.meta.count).toBeGreaterThan(0);
      expect(body.data.some((item) => item.id >= 200 && item.id < 300)).toBe(false);
    }
  });

  it('empresa A nao acessa voo da empresa B', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/701', {}, 1);
    expect(response.status).toBe(404);

    const updateResponse = await request(
      db,
      '/api/controle-voos/voos/701',
      { method: 'PATCH', body: JSON.stringify({ observacoes: 'Tentativa' }) },
      1,
    );
    expect(updateResponse.status).toBe(404);
  });

  it('viewer nao cria nem edita', async () => {
    const db = createSqliteD1();

    const createResponse = await request(
      db,
      '/api/controle-voos/voos',
      { method: 'POST', body: JSON.stringify(validFlightPayload()) },
      1,
      'viewer',
    );
    expect(createResponse.status).toBe(403);

    const patchResponse = await request(
      db,
      '/api/controle-voos/voos/601',
      { method: 'PATCH', body: JSON.stringify({ observacoes: 'x' }) },
      1,
      'viewer',
    );
    expect(patchResponse.status).toBe(403);
  });

  it('editor cria e edita', async () => {
    const db = createSqliteD1();

    const createResponse = await request(
      db,
      '/api/controle-voos/voos',
      { method: 'POST', body: JSON.stringify(validFlightPayload({ prefixo: 'ATX-3000' })) },
      1,
      'editor',
    );
    expect(createResponse.status).toBe(201);

    const patchResponse = await request(
      db,
      '/api/controle-voos/voos/601',
      { method: 'PATCH', body: JSON.stringify({ observacoes: 'Editor ok' }) },
      1,
      'editor',
    );
    expect(patchResponse.status).toBe(200);
  });

  it('cria RDV para voo existente', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        voo_id: 601,
        numero: 'RDV-20260614-001',
        status: 'rascunho',
        responsavel_preenchimento_id: 10,
      },
    });
  });

  it('consulta RDV existente', async () => {
    const db = createSqliteD1();

    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });

    const response = await request(db, '/api/controle-voos/voos/601/rdv');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { voo_id: 601, numero: 'RDV-20260614-001', status: 'rascunho' },
    });
  });

  it('atualiza RDV em rascunho', async () => {
    const db = createSqliteD1();

    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });

    const response = await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({
        horas_voadas: 1.25,
        numero_pousos: 2,
        combustivel_decolagem: 1400,
        combustivel_pouso: 800,
        combustivel_consumo: 600,
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { horas_voadas: 1.25, numero_pousos: 2, combustivel_consumo: 600, status: 'rascunho' },
    });
  });

  it('finaliza preenchimento', async () => {
    const db = createSqliteD1();

    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });

    const response = await request(db, '/api/controle-voos/voos/601/rdv/finalizar-preenchimento', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: { status: string; finalizado_operacionalmente_por: number; finalizado_operacionalmente_em: string | null };
    };
    expect(body.data.status).toBe('preenchimento_finalizado');
    expect(body.data.finalizado_operacionalmente_por).toBe(10);
    expect(body.data.finalizado_operacionalmente_em).toBeTruthy();
  });

  it('nao altera RDV ja finalizado', async () => {
    const db = createSqliteD1();

    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });
    await request(db, '/api/controle-voos/voos/601/rdv/finalizar-preenchimento', {
      method: 'POST',
    });

    const response = await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({ horas_voadas: 2 }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_RDV_LOCKED',
    });
  });

  it('nao cria RDV para voo de outra empresa', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/voos/701/rdv',
      { method: 'PUT', body: JSON.stringify(validRdvPayload()) },
      1,
    );

    expect(response.status).toBe(404);
  });

  it('nao cria RDV para voo inexistente', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/9999/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });

    expect(response.status).toBe(404);
  });

  it('nao cria RDV para voo com soft delete', async () => {
    const db = createSqliteD1();
    runSql(db.databasePath, "UPDATE cv_voos SET deleted_at = datetime('now') WHERE id = 601");

    const response = await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });

    expect(response.status).toBe(404);
  });

  it('rejeita horarios incoerentes no RDV', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(
        validRdvPayload({
          horario_decolagem_real: '2026-06-14T11:10:00Z',
          horario_pouso_real: '2026-06-14T10:05:00Z',
        }),
      ),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_INVALID_RDV_TIME',
    });
  });

  it('rejeita valores negativos e combustivel incoerente no RDV', async () => {
    const db = createSqliteD1();

    const negativeResponse = await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload({ horas_voadas: -1 })),
    });

    expect(negativeResponse.status).toBe(400);
    await expect(negativeResponse.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_INVALID_PAYLOAD',
    });

    const fuelResponse = await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(
        validRdvPayload({
          combustivel_decolagem: 1200,
          combustivel_pouso: 700,
          combustivel_consumo: 300,
        }),
      ),
    });

    expect(fuelResponse.status).toBe(400);
    await expect(fuelResponse.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_INVALID_RDV_FUEL',
    });
  });

  it('viewer nao cria, edita nem finaliza RDV', async () => {
    const db = createSqliteD1();

    const createResponse = await request(
      db,
      '/api/controle-voos/voos/601/rdv',
      { method: 'PUT', body: JSON.stringify(validRdvPayload()) },
      1,
      'viewer',
    );
    expect(createResponse.status).toBe(403);

    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });

    const updateResponse = await request(
      db,
      '/api/controle-voos/voos/601/rdv',
      { method: 'PUT', body: JSON.stringify({ horas_voadas: 1.5 }) },
      1,
      'viewer',
    );
    expect(updateResponse.status).toBe(403);

    const finalizeResponse = await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      1,
      'viewer',
    );
    expect(finalizeResponse.status).toBe(403);
  });

  it('editor cria, edita e finaliza RDV', async () => {
    const db = createSqliteD1();

    const createResponse = await request(
      db,
      '/api/controle-voos/voos/601/rdv',
      { method: 'PUT', body: JSON.stringify(validRdvPayload({ numero: 'RDV-20260614-EDT' })) },
      1,
      'editor',
    );
    expect(createResponse.status).toBe(201);

    const updateResponse = await request(
      db,
      '/api/controle-voos/voos/601/rdv',
      { method: 'PUT', body: JSON.stringify({ horas_voadas: 1.4, combustivel_consumo: 500 }) },
      1,
      'editor',
    );
    expect(updateResponse.status).toBe(200);

    const finalizeResponse = await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      1,
      'editor',
    );
    expect(finalizeResponse.status).toBe(200);
  });

  it('registra evento rdv em criacao, atualizacao e finalizacao', async () => {
    const db = createSqliteD1();

    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({ horas_voadas: 1.25, combustivel_consumo: 500 }),
    });
    await request(db, '/api/controle-voos/voos/601/rdv/finalizar-preenchimento', {
      method: 'POST',
    });

    const events = db.queryJson<{ tipo_evento: string; descricao: string; metadata_json: string }>(
      "SELECT tipo_evento, descricao, metadata_json FROM cv_voo_eventos WHERE voo_id = 601 AND tipo_evento = 'rdv' ORDER BY id",
    );

    expect(events).toHaveLength(3);
    expect(events.map((event) => event.tipo_evento)).toEqual(['rdv', 'rdv', 'rdv']);
    expect(events.map((event) => event.descricao)).toEqual([
      'RDV operacional criado',
      'RDV operacional atualizado',
      'RDV operacional com preenchimento finalizado',
    ]);
    expect(events[0].metadata_json).toContain('"action":"create"');
    expect(events[1].metadata_json).toContain('"action":"update"');
    expect(events[2].metadata_json).toContain('"action":"finalize"');
  });

  it('dashboard retorna totais corretos por tenant', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/dashboard?data_inicio=2026-06-14&data_fim=2026-06-15',
      {},
      1,
      'viewer',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        uso_operacional_interno: true,
        nao_regulado: true,
        totais: {
          voos: 6,
          voos_planejados: 1,
          voos_liberados_operacionalmente: 1,
          voos_em_andamento: 1,
          voos_concluidos_operacionalmente: 1,
          voos_cancelados: 1,
          voos_alternados_divergidos: 1,
        },
        voos_por_status: {
          planejado: 1,
          liberado_operacionalmente: 1,
          em_andamento: 1,
          concluido_operacionalmente: 1,
          cancelado: 1,
          alternado_divergido: 1,
        },
      },
    });
  });

  it('dashboard respeita filtro de data e periodo', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const singleDayResponse = await request(db, '/api/controle-voos/dashboard?data=2026-06-14');
    expect(singleDayResponse.status).toBe(200);
    await expect(singleDayResponse.json()).resolves.toMatchObject({
      data: {
        totais: {
          voos: 3,
          voos_planejados: 1,
          voos_em_andamento: 1,
          voos_concluidos_operacionalmente: 1,
        },
      },
    });

    const rangeResponse = await request(
      db,
      '/api/controle-voos/dashboard?data_inicio=2026-06-15&data_fim=2026-06-15',
    );
    expect(rangeResponse.status).toBe(200);
    await expect(rangeResponse.json()).resolves.toMatchObject({
      data: {
        totais: {
          voos: 3,
          voos_liberados_operacionalmente: 1,
          voos_cancelados: 1,
          voos_alternados_divergidos: 1,
        },
      },
    });
  });

  it('dashboard respeita filtro de status', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/dashboard?data_inicio=2026-06-14&data_fim=2026-06-15&status=cancelado',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        totais: {
          voos: 1,
          voos_cancelados: 1,
        },
        voos_por_status: {
          cancelado: 1,
        },
      },
    });
  });

  it('dashboard calcula voos sem RDV e RDVs por status', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/dashboard?data_inicio=2026-06-14&data_fim=2026-06-15',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        totais: {
          voos_sem_rdv: 4,
          rdvs_rascunho: 1,
          rdvs_preenchimento_finalizado: 1,
        },
      },
    });
  });

  it('dashboard cria alertas operacionais simples', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/dashboard?data_inicio=2026-06-14&data_fim=2026-06-15',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        alertas_operacionais: {
          voos_sem_tripulacao: 3,
          voos_sem_aeronave: 2,
          voos_concluidos_sem_rdv: 1,
        },
      },
    });
  });

  it('relatorio resumo retorna agregados por dia', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/relatorios/resumo-operacional?data_inicio=2026-06-14&data_fim=2026-06-15',
      {},
      1,
      'viewer',
    );

    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: {
        uso_operacional_interno: boolean;
        relatorio_interno: boolean;
        agregados_por_dia: Array<{ data: string; totais: { voos: number } }>;
      };
    };

    expect(body.data.uso_operacional_interno).toBe(true);
    expect(body.data.relatorio_interno).toBe(true);
    expect(body.data.agregados_por_dia).toHaveLength(2);
    expect(body.data.agregados_por_dia).toEqual([
      expect.objectContaining({ data: '2026-06-14', totais: expect.objectContaining({ voos: 3 }) }),
      expect.objectContaining({ data: '2026-06-15', totais: expect.objectContaining({ voos: 3 }) }),
    ]);
  });

  it('relatorio soma horas, pousos, ciclos e combustivel', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/relatorios/resumo-operacional?data_inicio=2026-06-14&data_fim=2026-06-15',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        totais: {
          horas_voadas: 3.3,
          numero_pousos: 3,
          ciclos: 3,
          combustivel_consumo: 1200,
        },
      },
    });
  });

  it('relatorio agrega cancelamentos por motivo', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/relatorios/resumo-operacional?data_inicio=2026-06-14&data_fim=2026-06-15',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        cancelamentos_por_motivo: [
          { motivo_id: 501, motivo_nome: 'Meteorologia', total: 1 },
        ],
      },
    });
  });

  it('empresa A nao ve dashboard e relatorio da empresa B', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const tenantAResponse = await request(
      db,
      '/api/controle-voos/dashboard?data_inicio=2026-06-14&data_fim=2026-06-15',
      {},
      1,
    );
    await expect(tenantAResponse.json()).resolves.toMatchObject({
      data: {
        totais: { voos: 6 },
      },
    });

    const tenantBResponse = await request(
      db,
      '/api/controle-voos/dashboard?data_inicio=2026-06-14&data_fim=2026-06-15',
      {},
      2,
    );
    await expect(tenantBResponse.json()).resolves.toMatchObject({
      data: {
        totais: {
          voos: 1,
          rdvs_preenchimento_finalizado: 1,
          voos_sem_rdv: 0,
        },
      },
    });

    const reportResponse = await request(
      db,
      '/api/controle-voos/relatorios/resumo-operacional?data_inicio=2026-06-14&data_fim=2026-06-15',
      {},
      2,
    );
    await expect(reportResponse.json()).resolves.toMatchObject({
      data: {
        totais: {
          voos: 1,
          horas_voadas: 0.8,
        },
      },
    });
  });

  it('viewer consegue ler dashboard e relatorio', async () => {
    const db = createSqliteD1();
    seedDashboardFixtures(db.databasePath);

    const dashboardResponse = await request(
      db,
      '/api/controle-voos/dashboard?data_inicio=2026-06-14&data_fim=2026-06-15',
      {},
      1,
      'viewer',
    );
    expect(dashboardResponse.status).toBe(200);

    const reportResponse = await request(
      db,
      '/api/controle-voos/relatorios/resumo-operacional?data_inicio=2026-06-14&data_fim=2026-06-15',
      {},
      1,
      'viewer',
    );
    expect(reportResponse.status).toBe(200);
  });

  it('retorna preview SIGVOOS sem chamada externa e sem gravacao quando flag esta ativa', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);
    seedSigvoosPreviewState(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/sync-preview',
      { method: 'POST', body: JSON.stringify({}) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        mode: 'preview',
        enabled: true,
        tenantScoped: true,
        writesEnabled: false,
        realApiCalled: false,
        empresaId: 1,
        counts: {
          stagingTotal: 2,
          stagingPending: 1,
          stagingProcessed: 1,
          openConflicts: 1,
          importedFlights: 1,
          importedStages: 1,
          importedCrew: 1,
        },
      },
    });

    const tenantBRows = db.queryJson<{ total: number }>(
      "SELECT COUNT(*) AS total FROM cv_sigvoos_staging WHERE empresa_id = 2 AND deleted_at IS NULL",
    );
    expect(tenantBRows[0]?.total).toBe(1);
  });

  it('mantem preview SIGVOOS sem gravacao quando flag esta desativada', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/sync-preview',
      { method: 'POST', body: JSON.stringify({}) },
      1,
      'manager',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        mode: 'preview',
        enabled: false,
        writesEnabled: false,
        realApiCalled: false,
        status: 'FEATURE_DISABLED',
      },
    });
  });

  it('bloqueia usuario comum no preview SIGVOOS', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/sync-preview',
      { method: 'POST', body: JSON.stringify({}) },
      1,
      'viewer',
      { CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_RBAC_FORBIDDEN',
    });
  });

  it('rejeita tenant arbitrario no body do preview SIGVOOS', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/sync-preview',
      { method: 'POST', body: JSON.stringify({ empresaId: 2 }) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_TENANT_OVERRIDE_FORBIDDEN',
    });
  });

  it('mantem preview real SIGVOOS sem chamada externa quando flag esta desativada', async () => {
    const db = createSqliteD1();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({}) },
      1,
      'manager',
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        mode: 'real-preview',
        enabled: false,
        writesEnabled: false,
        realApiCalled: false,
        status: 'FEATURE_DISABLED',
      },
    });
  });

  it('bloqueia usuario comum no preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({}) },
      1,
      'viewer',
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_RBAC_FORBIDDEN',
    });
  });

  it('rejeita empresaId arbitrario no body do preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({ empresaId: 2 }) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_TENANT_OVERRIDE_FORBIDDEN',
    });
  });

  it('rejeita tenantId arbitrario no body do preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({ tenantId: 2 }) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_TENANT_OVERRIDE_FORBIDDEN',
    });
  });

  it('aceita body seguro no preview real SIGVOOS', async () => {
    const db = createSqliteD1();
    const statements: string[] = [];
    const readOnlyDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'prepare') {
          return (sql: string) => {
            statements.push(sql);
            return target.prepare(sql);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as D1Database;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/get/token')) {
        return new Response(JSON.stringify({ accessToken: 'mock-token' }), { status: 200 });
      }
      if (url.endsWith('/relatorios/voos/tripulantes/etapas/pesquisa')) {
        const upstreamBody = JSON.parse(String(init?.body)) as {
          date_start: string;
          date_finish: string;
          page: number;
          page_size: number;
          limit: number;
        };
        expect(upstreamBody.page).toBe(1);
        expect(upstreamBody.page_size).toBe(10);
        expect(upstreamBody.limit).toBe(10);
        expect(upstreamBody.date_start).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        expect(upstreamBody.date_finish).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  date: '2026-06-15',
                  flight_report: { id: 5001, flight_number: 'AT-100' },
                  flight_report_leg: { number: 1 },
                  departure_location: { icao_code: 'SBRJ' },
                  arrival_location: { icao_code: 'SBSP' },
                  staff: { id: 9001, inscription: '12345', email: 'crew@example.test' },
                },
                {
                  date: '2026-06-15',
                  flight_report: { report_number: 'RPT-2' },
                  flight_report_leg: {},
                  departure_location: {},
                  arrival_location: { icao_code: 'SBSP' },
                  staff: { inscription: '54321' },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(
      readOnlyDb,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({ window: { days: 1 }, limit: 10 }) },
      77,
      'manager',
      {
        CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true',
        SIGVOOS_REAL_API_USERNAME: 'preview-user',
        SIGVOOS_REAL_API_PASSWORD: 'secret-pass',
        SIGVOOS_REAL_API_BASE_URL: 'https://sigvoos.test/api',
      },
    );

    expect(response.status).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).not.toContain('secret-pass');
    expect(bodyText).not.toContain('mock-token');
    expect(bodyText).not.toContain('crew@example.test');
    const body = JSON.parse(bodyText) as {
      data: {
        empresaId: number;
        realApiCalled: boolean;
        writesEnabled: boolean;
        summary: {
          recordsReceived: number;
          candidateFlights: number;
          sensitiveFieldsDetected: string[];
        };
      };
    };
    expect(body.data).toMatchObject({
      empresaId: 77,
      realApiCalled: true,
      writesEnabled: false,
      summary: {
        recordsReceived: 2,
        candidateFlights: 2,
      },
    });
    expect(body.data.summary.sensitiveFieldsDetected).toContain('email');
    expect(statements.join('\n')).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
  });

  it('rejeita janela grande no preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({ window: { days: 4 }, limit: 10 }) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_WINDOW_TOO_WIDE',
    });
  });

  it('rejeita limit alto no preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({ window: { days: 1 }, limit: 11 }) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_LIMIT_INVALID',
    });
  });

  it('rejeita campos legacy fora do contrato seguro no preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({ from: '2026-06-15', pageSize: 10 }) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_FIELD_FORBIDDEN',
    });
  });

  it('falha de forma segura se credenciais do preview real SIGVOOS nao estiverem disponiveis', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({ window: { days: 1 }, limit: 10 }) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_CREDENTIALS_MISSING',
    });
  });

  it('mantem preview real SIGVOOS isolado de FRMS e sem DML no servico', () => {
    const serviceSource = readFileSync(sigvoosRealPreviewServicePath, 'utf8');
    const routeSource = readFileSync(routePath, 'utf8');

    expect(serviceSource).not.toMatch(/\.\.\/lib\/frms|frms-source-policy/i);
    expect(routeSource).not.toMatch(/frms-source-policy/i);
    expect(serviceSource).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
  });

  it('rejeita campos e termos fora do escopo', async () => {
    const db = createSqliteD1();

    const fieldResponse = await request(db, '/api/controle-voos/voos', {
      method: 'POST',
      body: JSON.stringify(validFlightPayload({ empresa_id: 99 })),
    });
    expect(fieldResponse.status).toBe(400);
    await expect(fieldResponse.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_FORBIDDEN_FIELD',
    });

    const termResponse = await request(db, '/api/controle-voos/voos', {
      method: 'POST',
      body: JSON.stringify(validFlightPayload({ observacoes: 'sem ' + 'assi' + 'natura' })),
    });
    expect(termResponse.status).toBe(400);
    await expect(termResponse.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SCOPE_TERM',
    });
  });

  it('nao referencia dominios externos fora do escopo da fase', () => {
    const routeSource = readFileSync(routePath, 'utf8');
    const blocked = ['M' + 'RO', 'FR' + 'MS', 'Records' + ' Core', 'e' + 'DB', 'SDR' + 'Me'];

    for (const term of blocked) {
      expect(routeSource).not.toContain(term);
    }
  });
});
