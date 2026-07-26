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
  auth: () => async (c: any, next: () => Promise<void>) => {
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
const rdvWorkflowMigrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../migrations/0438_controle_voos_rdv_coordenacao_workflow.sql',
);
const flightVersionMigrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../migrations/0444_controle_voos_versao.sql',
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

// Executa TODAS as instrucoes de um `db.batch([...])` em uma unica invocacao
// do `sqlite3` CLI (uma unica conexao/transacao) — ver comentario identico
// em controle-voos-rdv-workflow.test.ts, origem deste harness. Necessario
// aqui porque PATCH/status de cv_voos agora tambem usa
// `(SELECT changes()) > 0` para gatear o evento de auditoria dentro do
// mesmo `db.batch()` do UPDATE com CAS.
function execBatch(
  databasePath: string,
  statements: Array<{ sql: string; binds: unknown[] }>,
): Array<{ meta: { changes: number; last_row_id: number } }> {
  if (statements.length === 0) return [];
  const parts: string[] = ['.bail on', 'BEGIN IMMEDIATE;'];
  for (const stmt of statements) {
    const sql = interpolate(stmt.sql, stmt.binds).trim();
    parts.push(sql.endsWith(';') ? sql : `${sql};`);
    parts.push('SELECT changes() AS __n, last_insert_rowid() AS __lid;');
  }
  parts.push('COMMIT;');

  const result = spawnSync('sqlite3', ['-json', databasePath], {
    input: parts.join('\n'),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`D1_BATCH_FAILED: ${result.stderr || result.stdout}`);
  }

  const blocks = result.stdout
    .split(/(?<=\])\s*\n(?=\[)/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length !== statements.length) {
    throw new Error(
      `D1_BATCH_HARNESS_MISMATCH: esperava ${statements.length} blocos de resultado, recebeu ${blocks.length}`,
    );
  }
  return blocks.map((block) => {
    const rows = JSON.parse(block) as Array<{ __n: number; __lid: number }>;
    const row = rows[0] || { __n: 0, __lid: 0 };
    return { meta: { changes: row.__n ?? 0, last_row_id: row.__lid ?? 0 } };
  });
}

function createSqliteD1(): SqliteD1 {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-routes-'));
  const databasePath = join(tempDir, 'routes.sqlite');
  tempDirs.push(tempDir);

  runSql(databasePath, 'PRAGMA foreign_keys = ON;');
  runSql(databasePath, readFileSync(migrationPath, 'utf8'));
  // 0438 referencia cv_voo_etapas (0411) no índice único e nos FKs de abastecimentos.
  runSql(databasePath, readFileSync(sigvoosMigrationPath, 'utf8'));
  runSql(databasePath, readFileSync(rdvWorkflowMigrationPath, 'utf8'));
  runSql(databasePath, readFileSync(flightVersionMigrationPath, 'utf8'));
  runSql(
    databasePath,
    `
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY,
        funcionario_id INTEGER,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS aeronaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER,
        modelo TEXT NOT NULL,
        prefixo TEXT,
        status TEXT DEFAULT 'ATIVO',
        deleted_at TEXT
      );
    `,
  );
  seed(databasePath);

  const db = {
    databasePath,
    tempDir,
    queryJson: <T>(sql: string) => queryJson<T>(databasePath, sql),
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        // Nao-enumeraveis: expoem sql/binds so para `batch()` montar o
        // script de uma unica transacao — nao fazem parte da interface
        // publica de D1PreparedStatement.
        __sql: sql,
        __binds: () => binds,
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
            ? queryJson<{ id: number }>(
                databasePath,
                'SELECT id FROM cv_voos ORDER BY id DESC LIMIT 1',
              )[0]?.id
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
    batch: async (statements: Array<{ __sql: string; __binds: () => unknown[] }>) =>
      execBatch(
        databasePath,
        statements.map((stmt) => ({ sql: stmt.__sql, binds: stmt.__binds() })),
      ),
  } as unknown as SqliteD1;

  return db;
}

async function currentVersao(db: any) {
  const r = await db.prepare('SELECT versao FROM cv_rdv_operacional WHERE voo_id = 601 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1').first() as any;
  return r?.versao ?? 1;
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

      INSERT INTO aeronaves (id, empresa_id, modelo, prefixo, status)
      VALUES
        (901, 1, 'AW139', 'PT-AAA', 'ATIVO'),
        (902, 2, 'AW139', 'PT-BBB', 'ATIVO'),
        (903, 1, 'AW139', 'PT-INA', 'INATIVO');
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

async function requestWithoutAuth(
  db: D1Database,
  path: string,
  init: RequestInit = {},
  envOverrides: Partial<Env> = {},
) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return createApp().fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    createEnv(db, envOverrides),
    {} as ExecutionContext,
  );
}

function applySigvoosSchema(databasePath: string) {
  // createSqliteD1 já aplica 0411 (pré-requisito de 0438). Evitar ALTER TABLE
  // não-idempotente da mesma migration.
  const alreadyApplied = runSql(
    databasePath,
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='cv_voo_etapas' LIMIT 1;",
  );
  if (!alreadyApplied) {
    runSql(databasePath, readFileSync(sigvoosMigrationPath, 'utf8'));
  }
  runSql(
    databasePath,
    `
      CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );
    `,
  );
}

function applyShadowCompareFrmsSchema(databasePath: string) {
  runSql(
    databasePath,
    `
      CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        nome TEXT
      );

      CREATE TABLE IF NOT EXISTS frms_jornada (
        id TEXT PRIMARY KEY,
        tripulante_id INTEGER NOT NULL,
        empresa_id INTEGER,
        data TEXT NOT NULL,
        origem TEXT,
        local_base TEXT,
        matricula_aeronave TEXT,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS frms_alerta (
        id TEXT PRIMARY KEY,
        jornada_id TEXT,
        deleted_at TEXT
      );
    `,
  );
}

function applyShadowCompareFrmsSchemaWithoutEmpresaId(databasePath: string) {
  runSql(
    databasePath,
    `
      CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        nome TEXT
      );

      CREATE TABLE IF NOT EXISTS frms_jornada (
        id TEXT PRIMARY KEY,
        tripulante_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        origem TEXT,
        local_base TEXT,
        matricula_aeronave TEXT,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS frms_alerta (
        id TEXT PRIMARY KEY,
        jornada_id TEXT,
        deleted_at TEXT
      );
    `,
  );
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

function seedJornadasEndpointState(databasePath: string) {
  runSql(
    databasePath,
    `
      CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );

      INSERT INTO funcionarios (id, nome, empresa_id, deleted_at)
      VALUES (1001, 'Tripulante Tenant A', 1, NULL), (2001, 'Tripulante Tenant B', 2, NULL);

      UPDATE cv_voos
      SET origem_importacao = 'SIGVOOS',
          sigvoos_flight_report_id = 700101,
          sigvoos_importado_em = '2026-06-14T12:00:00Z'
      WHERE id = 601;

      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number,
        origem_icao, destino_icao, horario_motor_ligado, horario_decolagem,
        horario_pouso, horario_motor_desligado, tempo_total, tempo_navegacao,
        tempo_ifr, pousos_diurnos, starts, pax, combustivel_inicio, combustivel_fim,
        origem_dados, sigvoos_importado_em
      ) VALUES (
        9301, 1, 601, 1, 1, 'SBRJ', 'SBSP', '08:00', '08:12', '09:08', '09:14',
        '01:14', '00:56', '00:30', 1, 1, 10, 1086, 730, 'SIGVOOS', '2026-06-14T12:00:00Z'
      );

      INSERT INTO cv_voo_tripulantes (
        id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id, created_by, updated_by
      ) VALUES (9401, 1, 601, 1001, 'PIC', 9301, 7001, 10, 10);
    `,
  );
}

function seedShadowCompareFrmsState(databasePath: string) {
  runSql(
    databasePath,
    `
      INSERT INTO funcionarios (id, empresa_id, nome)
      VALUES (1001, 1, 'Trip A'), (1002, 1, 'Trip B'), (2001, 2, 'Trip C');

      INSERT INTO frms_jornada (id, tripulante_id, empresa_id, data, origem, local_base, matricula_aeronave)
      VALUES
        ('fj-a-1', 1001, 1, '2026-06-14', 'SIGVOOS', 'SBRJ', 'ATX-1001'),
        ('fj-a-2', 1002, 1, '2026-06-15', 'SIGVOOS', 'SBSP', 'ATX-1002'),
        ('fj-b-1', 2001, 2, '2026-06-14', 'SIGVOOS', 'SBBR', 'BTX-2001');

      INSERT INTO frms_alerta (id, jornada_id)
      VALUES ('fa-a-1', 'fj-a-1');
    `,
  );
}

function seedShadowCompareComparableJourneyState(databasePath: string) {
  runSql(
    databasePath,
    `
      UPDATE cv_voos
      SET origem_importacao = 'SIGVOOS',
          sigvoos_importado_em = '2026-06-15T12:00:00Z',
          sigvoos_content_hash = 'hash-shadow'
      WHERE id IN (601, 602);

      UPDATE cv_voos
      SET data_programacao = '2026-06-14',
          horario_previsto_partida = '2026-06-14T12:00:00Z',
          horario_previsto_chegada = '2026-06-14T13:00:00Z'
      WHERE id = 602;

      INSERT INTO cv_voos (
        id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, horario_previsto_partida,
        horario_previsto_chegada, status, observacoes, created_by, updated_by,
        origem_importacao, sigvoos_importado_em, sigvoos_content_hash
      ) VALUES (
        603, 1, 'ATX-1003', '2026-06-14', 103, 101,
        301, 401, '2026-06-14T14:00:00Z',
        '2026-06-14T15:00:00Z', 'planejado', 'Tenant A 3', 10, 10,
        'SIGVOOS', '2026-06-15T12:00:00Z', 'hash-shadow-603'
      );

      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number,
        origem_icao, destino_icao, origem_dados, sigvoos_importado_em
      ) VALUES
        (9011, 1, 601, 1, 1, 'SBRJ', 'SBSP', 'SIGVOOS', '2026-06-15T12:00:00Z'),
        (9012, 1, 602, 1, 1, 'SBSP', 'SBMI', 'SIGVOOS', '2026-06-15T12:00:00Z'),
        (9013, 1, 603, 1, 1, 'SBMI', 'SBRJ', 'SIGVOOS', '2026-06-15T12:00:00Z');

      INSERT INTO cv_voo_tripulantes (
        id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id, sigvoos_staff_inscription
      ) VALUES
        (9111, 1, 601, 1001, 'PIC', 9011, 7001, '01234'),
        (9112, 1, 602, 1001, 'PIC', 9012, 7002, '01234'),
        (9113, 1, 603, 1002, 'PIC', 9013, 7003, '04567');

      INSERT INTO cv_sigvoos_staging (
        id, empresa_id, sigvoos_flight_report_id, sigvoos_leg_number,
        data_operacional, source_window_start, source_window_end,
        payload_hash, import_status, cv_voo_id, cv_etapa_id, cv_tripulante_id
      ) VALUES
        ('cmp-601', 1, 760101, 1, '2026-06-14', '2026-06-14', '2026-06-14', 'cmp-hash-1', 'PROCESSED', 601, 9011, 9111),
        ('cmp-602', 1, 760102, 1, '2026-06-14', '2026-06-14', '2026-06-14', 'cmp-hash-2', 'PROCESSED', 602, 9012, 9112),
        ('cmp-603', 1, 760103, 1, '2026-06-14', '2026-06-14', '2026-06-14', 'cmp-hash-3', 'PROCESSED', 603, 9013, 9113);

      INSERT INTO funcionarios (id, empresa_id, nome)
      VALUES (1001, 1, 'Trip A'), (1002, 1, 'Trip B');

      INSERT INTO frms_jornada (id, tripulante_id, empresa_id, data, origem, local_base, matricula_aeronave)
      VALUES
        ('fj-cmp-1', 1001, 1, '2026-06-14', 'SIGVOOS', 'SBRJ', 'ATX-1001'),
        ('fj-cmp-2', 1002, 1, '2026-06-14', 'SIGVOOS', 'SBMI', 'ATX-1003');
    `,
  );
}

function seedShadowCompareFrmsStateWithoutEmpresaId(databasePath: string) {
  runSql(
    databasePath,
    `
      INSERT INTO funcionarios (id, empresa_id, nome)
      VALUES (1001, 1, 'Trip A'), (1002, 1, 'Trip B'), (2001, 2, 'Trip C');

      INSERT INTO frms_jornada (id, tripulante_id, data, origem, local_base, matricula_aeronave)
      VALUES
        ('fj-a-1', 1001, '2026-06-14', 'SIGVOOS', 'SBRJ', 'ATX-1001'),
        ('fj-a-2', 1002, '2026-06-15', 'SIGVOOS', 'SBSP', 'ATX-1002'),
        ('fj-b-1', 2001, '2026-06-14', 'SIGVOOS', 'SBBR', 'BTX-2001');

      INSERT INTO frms_alerta (id, jornada_id)
      VALUES ('fa-a-1', 'fj-a-1');
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
    const body = (await response.json()) as {
      data: { id: number; empresa_id: number; prefixo: string };
    };
    expect(body.data).toMatchObject({ empresa_id: 1, prefixo: 'ATX-2099' });

    const events = db.queryJson<{ tipo_evento: string; status_novo: string }>(
      `SELECT tipo_evento, status_novo FROM cv_voo_eventos WHERE voo_id = ${body.data.id}`,
    );
    expect(events).toEqual([{ tipo_evento: 'sistema', status_novo: 'planejado' }]);
  });

  it('cria voo com aeronave do proprio tenant', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos', {
      method: 'POST',
      body: JSON.stringify(validFlightPayload({ aeronave_id: 901 })),
    });

    expect(response.status).toBe(201);
  });

  it('rejeita criacao de voo com aeronave inativa', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos', {
      method: 'POST',
      body: JSON.stringify(validFlightPayload({ aeronave_id: 903 })),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('CONTROLE_VOOS_INVALID_CATALOG');
  });

  it('rejeita criacao de voo com aeronave de outro tenant', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos', {
      method: 'POST',
      body: JSON.stringify(validFlightPayload({ aeronave_id: 902 })),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('CONTROLE_VOOS_INVALID_CATALOG');
  });

  it('rejeita patch que vincula voo a aeronave de outro tenant', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601', {
      method: 'PATCH',
      body: JSON.stringify({ aeronave_id: 902, versao: 1 }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('CONTROLE_VOOS_INVALID_CATALOG');
  });

  it('lista somente voos do tenant atual com limite maximo', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos?limit=500');
    const body = (await response.json()) as {
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
      body: JSON.stringify({ observacoes: 'Revisao operacional', versao: 1 }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 601, observacoes: 'Revisao operacional', versao: 2 },
    });
    expect(
      db.queryJson<{ total: number }>(
        "SELECT COUNT(*) AS total FROM cv_voo_eventos WHERE voo_id = 601 AND tipo_evento = 'observacao'",
      ),
    ).toEqual([{ total: 1 }]);
  });

  it('PATCH exige versao do voo, aplica CAS e retorna 409 em versao desatualizada', async () => {
    const db = createSqliteD1();

    const semVersao = await request(db, '/api/controle-voos/voos/601', {
      method: 'PATCH',
      body: JSON.stringify({ observacoes: 'sem versao' }),
    });
    expect(semVersao.status).toBe(400);
    await expect(semVersao.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_FLIGHT_VERSION_REQUIRED',
    });

    const versaoDesatualizada = await request(db, '/api/controle-voos/voos/601', {
      method: 'PATCH',
      body: JSON.stringify({ observacoes: 'versao velha', versao: 99 }),
    });
    expect(versaoDesatualizada.status).toBe(409);
    await expect(versaoDesatualizada.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_FLIGHT_VERSION_CONFLICT',
    });
  });

  it('PATCH: duas chamadas concorrentes com a mesma versao — exatamente uma grava, a outra recebe 409, versao avanca uma unica vez', async () => {
    const db = createSqliteD1();

    const [primeira, segunda] = await Promise.all([
      request(db, '/api/controle-voos/voos/601', {
        method: 'PATCH',
        body: JSON.stringify({ observacoes: 'Concorrente A', versao: 1 }),
      }),
      request(db, '/api/controle-voos/voos/601', {
        method: 'PATCH',
        body: JSON.stringify({ observacoes: 'Concorrente B', versao: 1 }),
      }),
    ]);

    const statuses = [primeira.status, segunda.status].sort();
    expect(statuses).toEqual([200, 409]);

    const flight = db.queryJson<{ versao: number }>(
      'SELECT versao FROM cv_voos WHERE id = 601',
    )[0];
    expect(flight.versao).toBe(2);
  });

  it('aceita transicao de status basica', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: 601, status: 'liberado_operacionalmente', versao: 2 },
    });
  });

  it('rejeita transicao de status nao permitida', async () => {
    const db = createSqliteD1();

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'pousado', versao: 1 }),
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
      body: JSON.stringify({ status: 'cancelado', versao: 1 }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_CANCEL_REASON_REQUIRED',
    });
  });

  it('status: duas chamadas concorrentes com a mesma versao — exatamente uma grava, a outra recebe 409, versao avanca uma unica vez', async () => {
    const db = createSqliteD1();

    const [primeira, segunda] = await Promise.all([
      request(db, '/api/controle-voos/voos/601/status', {
        method: 'POST',
        body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }),
      }),
      request(db, '/api/controle-voos/voos/601/status', {
        method: 'POST',
        body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }),
      }),
    ]);

    const statuses = [primeira.status, segunda.status].sort();
    expect(statuses).toEqual([200, 409]);

    const flight = db.queryJson<{ versao: number }>(
      'SELECT versao FROM cv_voos WHERE id = 601',
    )[0];
    expect(flight.versao).toBe(2);
  });

  it('PATCH em voo sem RDV aplica CAS normalmente (compatibilidade explicita)', async () => {
    const db = createSqliteD1();
    const semRdv = db.queryJson<{ id: number }>(
      `SELECT id FROM cv_rdv_operacional WHERE voo_id = 601`,
    );
    expect(semRdv.length).toBe(0);

    const response = await request(db, '/api/controle-voos/voos/601', {
      method: 'PATCH',
      body: JSON.stringify({ observacoes: 'Voo sem RDV', versao: 1 }),
    });
    expect(response.status).toBe(200);
  });

  it('lista catalogos permitidos por tenant', async () => {
    const db = createSqliteD1();

    for (const nome of ['aeroportos', 'tipos-voo', 'naturezas-voo', 'motivos-operacionais']) {
      const response = await request(db, `/api/controle-voos/catalogos/${nome}`);
      const body = (await response.json()) as {
        data: Array<{ id: number }>;
        meta: { count: number };
      };

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
      { method: 'PATCH', body: JSON.stringify({ observacoes: 'Editor ok', versao: 1 }) },
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
        versao: await currentVersao(db),
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
      body: JSON.stringify({ versao: await currentVersao(db) }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        status: string;
        finalizado_operacionalmente_por: number;
        finalizado_operacionalmente_em: string | null;
      };
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
      body: JSON.stringify({ versao: await currentVersao(db) }),
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

  it('editor sem vinculo de tripulacao nao cria/edita/finaliza RDV (exige capability+crew ou Coordenacao)', async () => {
    const db = createSqliteD1();

    const createResponse = await request(
      db,
      '/api/controle-voos/voos/601/rdv',
      { method: 'PUT', body: JSON.stringify(validRdvPayload({ numero: 'RDV-20260614-EDT' })) },
      1,
      'editor',
    );
    expect(createResponse.status).toBe(403);

    // Admin (Coordenacao via visualizar_todos) cria o rascunho para isolar o caso do editor.
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload({ numero: 'RDV-20260614-EDT' })),
    });

    const updateResponse = await request(
      db,
      '/api/controle-voos/voos/601/rdv',
      { method: 'PUT', body: JSON.stringify({ horas_voadas: 1.4, combustivel_consumo: 500 }) },
      1,
      'editor',
    );
    expect(updateResponse.status).toBe(403);

    const finalizeResponse = await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      1,
      'editor',
    );
    expect(finalizeResponse.status).toBe(403);
  });


  it('garante que duas criacoes simultaneas de RDV para o mesmo voo geram apenas 1 RDV e a segunda retorna 409', async () => {
    const db = createSqliteD1();

    const payload = validRdvPayload();

    const responses = await Promise.all([
      request(db, '/api/controle-voos/voos/601/rdv', { method: 'PUT', body: JSON.stringify(payload) }),
      request(db, '/api/controle-voos/voos/601/rdv', { method: 'PUT', body: JSON.stringify(payload) })
    ]);

    const statuses = responses.map((r) => r.status);
    expect(statuses.sort()).toEqual([201, 409]);

    const eventos = await db
      .prepare(`SELECT * FROM cv_voo_eventos WHERE voo_id = 601 AND tipo_evento = 'rdv' AND json_extract(metadata_json, '$.action') = 'create'`)
      .all();
    expect(eventos.results).toHaveLength(1);
  });

  it('UPDATE concorrente do mesmo RDV sem alterar numero: exatamente 1 sucesso (versao 5) e 1 conflito 409, sem 500 e sem lost update', async () => {
    const db = createSqliteD1();

    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload({ numero: 'RDV-CONCORRENCIA-601' })),
    });
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({ versao: 1, ocorrencias: 'v2' }),
    });
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({ versao: 2, ocorrencias: 'v3' }),
    });
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({ versao: 3, ocorrencias: 'v4' }),
    });

    // Duas chamadas concorrentes, mesma versao (4), NENHUMA muda `numero`
    // (mesmo numero de destino: o que o RDV ja tem) — so `ocorrencias` diverge.
    const [r1, r2] = await Promise.all([
      request(db, '/api/controle-voos/voos/601/rdv', {
        method: 'PUT',
        body: JSON.stringify({ versao: 4, ocorrencias: 'tentativa-1' }),
      }),
      request(db, '/api/controle-voos/voos/601/rdv', {
        method: 'PUT',
        body: JSON.stringify({ versao: 4, ocorrencias: 'tentativa-2' }),
      }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(statuses).not.toContain(500);

    const winner = r1.status === 200 ? r1 : r2;
    const loser = r1.status === 200 ? r2 : r1;
    const winnerBody = (await winner.json()) as { data: { versao: number; ocorrencias: string } };
    expect(winnerBody.data.versao).toBe(5);

    const loserBody = (await loser.json()) as { code?: string };
    expect(loserBody.code).toBe('CONTROLE_VOOS_RDV_VERSION_CONFLICT');

    const row = await db
      .prepare('SELECT versao, ocorrencias FROM cv_rdv_operacional WHERE voo_id = 601')
      .first<{ versao: number; ocorrencias: string }>();
    expect(row?.versao).toBe(5);
    expect(row?.ocorrencias).toBe(winnerBody.data.ocorrencias);

    const eventos = await db
      .prepare(
        `SELECT * FROM cv_voo_eventos WHERE voo_id = 601 AND tipo_evento = 'rdv' AND json_extract(metadata_json, '$.action') = 'update' AND json_extract(metadata_json, '$.versaoNova') = 5`,
      )
      .all();
    expect(eventos.results).toHaveLength(1);
  });

  it('UPDATE de RDV para numero ja usado por outro RDV da mesma empresa retorna conflito de validacao, nunca 500 nem falso conflito de versao', async () => {
    const db = createSqliteD1();

    // RDV de outro voo (602) ja reivindica este numero.
    const outroNumero = 'RDV-JA-EXISTENTE-602';
    const outroCreate = await request(db, '/api/controle-voos/voos/602/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload({ numero: outroNumero })),
    });
    expect(outroCreate.status).toBe(201);

    // RDV sob teste (voo 601) avanca ate versao 4.
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload({ numero: 'RDV-601-V1' })),
    });
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({ versao: 1, ocorrencias: 'v2' }),
    });
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({ versao: 2, ocorrencias: 'v3' }),
    });
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({ versao: 3, ocorrencias: 'v4' }),
    });

    const before = await db
      .prepare('SELECT versao, numero, ocorrencias FROM cv_rdv_operacional WHERE voo_id = 601')
      .first<{ versao: number; numero: string; ocorrencias: string }>();
    expect(before?.versao).toBe(4);

    // Duas requisicoes concorrentes tentam mudar o numero do RDV 601 para o
    // MESMO numero ja usado pelo RDV do voo 602 — reproduz staging run
    // 30212619886 (residuo de execucao anterior do smoke reivindicando o
    // literal 'concorrencia' e nunca sendo limpo entre execucoes).
    const [r1, r2] = await Promise.all([
      request(db, '/api/controle-voos/voos/601/rdv', {
        method: 'PUT',
        body: JSON.stringify({ versao: 4, numero: outroNumero, ocorrencias: 'tentativa-1' }),
      }),
      request(db, '/api/controle-voos/voos/601/rdv', {
        method: 'PUT',
        body: JSON.stringify({ versao: 4, numero: outroNumero, ocorrencias: 'tentativa-2' }),
      }),
    ]);

    for (const res of [r1, r2]) {
      expect(res.status).not.toBe(500);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe('CONTROLE_VOOS_RDV_NUMERO_DUPLICADO');
      expect(body.code).not.toBe('CONTROLE_VOOS_RDV_VERSION_CONFLICT');
    }

    const after = await db
      .prepare('SELECT versao, numero, ocorrencias FROM cv_rdv_operacional WHERE voo_id = 601')
      .first<{ versao: number; numero: string; ocorrencias: string }>();
    expect(after?.versao).toBe(before?.versao);
    expect(after?.numero).toBe(before?.numero);
    expect(after?.ocorrencias).toBe(before?.ocorrencias);

    const eventos = await db
      .prepare(
        `SELECT * FROM cv_voo_eventos WHERE voo_id = 601 AND tipo_evento = 'rdv' AND json_extract(metadata_json, '$.action') = 'update' AND json_extract(metadata_json, '$.versaoAnterior') = 4`,
      )
      .all();
    expect(eventos.results).toHaveLength(0);

    const rowCount = await db
      .prepare('SELECT COUNT(*) as n FROM cv_rdv_operacional WHERE voo_id = 601')
      .first<{ n: number }>();
    expect(rowCount?.n).toBe(1);
  });

  it('garante atomicidade no update do RDV: se a transacao falhar, nao gera evento nem atualiza rdv', async () => {
    const db = createSqliteD1();
    
    await request(db, '/api/controle-voos/voos/601/rdv', { method: 'PUT', body: JSON.stringify(validRdvPayload()) });
    const rdv = await db.prepare('SELECT versao FROM cv_rdv_operacional WHERE voo_id = 601').first() as any;
    
    const originalBatch = db.batch;
    db.batch = async () => { throw new Error('Mock batch error'); };
    
    const response = await request(db, '/api/controle-voos/voos/601/rdv', { method: 'PUT', body: JSON.stringify({ ocorrencias: 'teste atomicidade', versao: rdv?.versao }) });
    expect(response.status).toBe(500);
    
    db.batch = originalBatch;
    
    const rdvPos = await db.prepare('SELECT versao, ocorrencias FROM cv_rdv_operacional WHERE voo_id = 601').first<{ versao: number, ocorrencias: string | null }>();
    expect(rdvPos?.versao).toBe(rdv?.versao);
    expect(rdvPos?.ocorrencias).toBe('Sem intercorrencias');
    
    const eventos = await db
      .prepare(`SELECT * FROM cv_voo_eventos WHERE voo_id = 601 AND tipo_evento = 'rdv' AND json_extract(metadata_json, '$.action') = 'update'`)
      .all();
    expect(eventos.results).toHaveLength(0);
  });

  it('registra evento rdv em criacao, atualizacao e finalizacao', async () => {
    const db = createSqliteD1();

    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify(validRdvPayload()),
    });
    await request(db, '/api/controle-voos/voos/601/rdv', {
      method: 'PUT',
      body: JSON.stringify({ horas_voadas: 1.25, combustivel_consumo: 500, versao: 1 }),
    });
    await request(db, '/api/controle-voos/voos/601/rdv/finalizar-preenchimento', {
      method: 'POST',
      body: JSON.stringify({ versao: await currentVersao(db) }),
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
    const body = (await response.json()) as {
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
        cancelamentos_por_motivo: [{ motivo_id: 501, motivo_nome: 'Meteorologia', total: 1 }],
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
      'SELECT COUNT(*) AS total FROM cv_sigvoos_staging WHERE empresa_id = 2 AND deleted_at IS NULL',
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

  it('bloqueia chamada anonima no preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await requestWithoutAuth(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      {
        method: 'POST',
        body: JSON.stringify({ from: '2026-06-01', to: '2026-06-16', limit: 10 }),
      },
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(401);
  });

  it('aceita janela explicita segura no preview real SIGVOOS', async () => {
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
        expect(upstreamBody.date_start).toBe('01/06/2026');
        expect(upstreamBody.date_finish).toBe('16/06/2026');
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
      { method: 'POST', body: JSON.stringify({ from: '2026-06-01', to: '2026-06-16', limit: 10 }) },
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

  it('rejeita to futuro no preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({ from: '2026-06-01', to: '2099-01-01', limit: 10 }) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_TO_FUTURE',
    });
  });

  it('rejeita janela maior que 31 dias no preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      { method: 'POST', body: JSON.stringify({ from: '2026-05-01', to: '2026-06-16', limit: 10 }) },
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
      { method: 'POST', body: JSON.stringify({ from: '2026-06-01', to: '2026-06-16', limit: 11 }) },
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED: 'true' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_LIMIT_INVALID',
    });
  });

  it('rejeita campos desconhecidos no preview real SIGVOOS', async () => {
    const db = createSqliteD1();

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/real-preview',
      {
        method: 'POST',
        body: JSON.stringify({ from: '2026-06-01', to: '2026-06-16', limit: 10, pageSize: 10 }),
      },
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
      { method: 'POST', body: JSON.stringify({ from: '2026-06-01', to: '2026-06-16', limit: 10 }) },
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

  it('bloqueia shadow compare SIGVOOS quando a flag estiver ausente', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/shadow-compare?from=2026-06-14&to=2026-06-15',
      {},
      1,
      'manager',
      { ENVIRONMENT: 'staging' },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_DISABLED',
    });
  });

  it('bloqueia shadow compare SIGVOOS em development mesmo com a flag ativa', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/shadow-compare?from=2026-06-14&to=2026-06-15',
      {},
      1,
      'manager',
      {
        CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED: 'true',
        ENVIRONMENT: 'development',
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_STAGING_ONLY',
    });
  });

  it('permite shadow compare SIGVOOS em production com a flag ativa', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);
    seedSigvoosPreviewState(db.databasePath);
    applyShadowCompareFrmsSchema(db.databasePath);
    seedShadowCompareFrmsState(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/shadow-compare?from=2026-06-14&to=2026-06-15',
      {},
      1,
      'manager',
      {
        CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED: 'true',
        ENVIRONMENT: 'production',
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        writesEnabled: boolean;
        tenantScoped: boolean;
        authContext: {
          empresaId: number;
          tenantScoped: boolean;
          role: string | null;
        };
      };
    };
    expect(body.data.writesEnabled).toBe(false);
    expect(body.data.tenantScoped).toBe(true);
    expect(body.data.authContext).toMatchObject({
      empresaId: 1,
      tenantScoped: true,
      role: 'manager',
    });
  });

  it('bloqueia usuario sem permissao no shadow compare SIGVOOS', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/shadow-compare?from=2026-06-14&to=2026-06-15',
      {},
      1,
      'viewer',
      { CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED: 'true' },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_RBAC_FORBIDDEN',
    });
  });

  it('retorna agregados read-only no shadow compare SIGVOOS sem expor PII', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);
    seedSigvoosPreviewState(db.databasePath);
    applyShadowCompareFrmsSchema(db.databasePath);
    seedShadowCompareFrmsState(db.databasePath);

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

    const response = await request(
      readOnlyDb,
      '/api/controle-voos/sigvoos/shadow-compare?from=2026-06-14&to=2026-06-15',
      {},
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED: 'true', ENVIRONMENT: 'staging' },
    );

    expect(response.status).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).not.toContain('Trip A');
    expect(bodyText).not.toContain('Trip B');

    const body = JSON.parse(bodyText) as {
      data: {
        authContext: {
          empresaId: number;
          tenantScoped: boolean;
          role: string | null;
        };
        writesEnabled: boolean;
        totals: {
          previewStagingRecords: number;
          cvFlights: number;
          cvStages: number;
          cvCrew: number;
          frmsJourneysSigvoos: number;
          frmsAlertsSigvoos: number;
          openIntegrationConflicts: number;
        };
        divergences: {
          byDate: Array<{ key: string; cvTotal: number; frmsTotal: number; delta: number }>;
          byBase: Array<{ key: string; cvTotal: number; frmsTotal: number; delta: number }>;
          byAircraft: Array<{ key: string; cvTotal: number; frmsTotal: number; delta: number }>;
          byFlightType: Array<{
            key: string;
            cvTotal: number;
            frmsTotal: number | null;
            delta: number | null;
          }>;
        };
        normalizationErrors: string[];
        missingFields: string[];
        recommendation: { status: string };
      };
    };

    expect(body.data.writesEnabled).toBe(false);
    expect(body.data.authContext).toMatchObject({
      empresaId: 1,
      tenantScoped: true,
      role: 'manager',
    });
    expect(body.data.totals).toMatchObject({
      previewStagingRecords: 2,
      cvFlights: 1,
      cvStages: 1,
      cvCrew: 1,
      frmsJourneysSigvoos: 2,
      frmsAlertsSigvoos: 1,
      openIntegrationConflicts: 1,
    });
    expect(body.data.divergences.byDate).toEqual([
      { key: '2026-06-14', cvTotal: 1, frmsTotal: 1, delta: 0, status: 'MATCH' },
      { key: '2026-06-15', cvTotal: 0, frmsTotal: 1, delta: -1, status: 'DIVERGENT' },
    ]);
    expect(body.data.divergences.byBase).toEqual([
      { key: 'SBRJ', cvTotal: 1, frmsTotal: 1, delta: 0, status: 'MATCH' },
      { key: 'SBSP', cvTotal: 0, frmsTotal: 1, delta: -1, status: 'DIVERGENT' },
    ]);
    expect(body.data.divergences.byAircraft).toEqual([
      { key: 'ATX-1001', cvTotal: 1, frmsTotal: 1, delta: 0, status: 'MATCH' },
      { key: 'ATX-1002', cvTotal: 0, frmsTotal: 1, delta: -1, status: 'DIVERGENT' },
    ]);
    expect(body.data.divergences.byFlightType).toEqual([
      { key: 'REG', cvTotal: 1, frmsTotal: null, delta: null, status: 'CV_ONLY_DIMENSION' },
    ]);
    expect(body.data.missingFields).not.toContain('frms_jornada.flight_type_dimension');
    expect(body.data.normalizationErrors).toContain('FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE');
    expect(body.data.recommendation.status).toBe('PARTIAL');
    expect(statements.join('\n')).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
  });

  it('compara jornadas equivalentes sem penalizar varios voos do mesmo tripulante no mesmo dia', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);
    applyShadowCompareFrmsSchema(db.databasePath);
    seedShadowCompareComparableJourneyState(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/shadow-compare?from=2026-06-14&to=2026-06-14',
      {},
      1,
      'manager',
      { CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED: 'true', ENVIRONMENT: 'staging' },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        totals: {
          cvFlights: number;
          frmsJourneysSigvoos: number;
        };
        divergences: {
          byDate: Array<{
            key: string;
            cvTotal: number;
            frmsTotal: number;
            delta: number;
            status: string;
          }>;
          byBase: Array<{
            key: string;
            cvTotal: number;
            frmsTotal: number;
            delta: number;
            status: string;
          }>;
          byAircraft: Array<{
            key: string;
            cvTotal: number;
            frmsTotal: number;
            delta: number;
            status: string;
          }>;
        };
        recommendation: { status: string; reasons: string[] };
      };
    };

    expect(body.data.totals.cvFlights).toBe(3);
    expect(body.data.totals.frmsJourneysSigvoos).toBe(2);
    expect(body.data.divergences.byDate).toEqual([
      { key: '2026-06-14', cvTotal: 2, frmsTotal: 2, delta: 0, status: 'MATCH' },
    ]);
    expect(body.data.divergences.byBase).toEqual([
      { key: 'SBMI', cvTotal: 1, frmsTotal: 1, delta: 0, status: 'MATCH' },
      { key: 'SBRJ', cvTotal: 1, frmsTotal: 1, delta: 0, status: 'MATCH' },
    ]);
    expect(body.data.divergences.byAircraft).toEqual([
      { key: 'ATX-1001', cvTotal: 1, frmsTotal: 1, delta: 0, status: 'MATCH' },
      { key: 'ATX-1003', cvTotal: 1, frmsTotal: 1, delta: 0, status: 'MATCH' },
    ]);
    expect(body.data.recommendation.status).toBe('READY');
    expect(body.data.recommendation.reasons).toEqual([]);
  });

  it('falha fechado para comparacao FRMS quando frms_jornada nao tem empresa_id', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);
    seedSigvoosPreviewState(db.databasePath);
    applyShadowCompareFrmsSchemaWithoutEmpresaId(db.databasePath);
    seedShadowCompareFrmsStateWithoutEmpresaId(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/shadow-compare?from=2026-06-14&to=2026-06-15',
      {},
      1,
      'manager',
      {
        CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED: 'true',
        ENVIRONMENT: 'staging',
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        totals: {
          frmsJourneysSigvoos: number;
          frmsAlertsSigvoos: number;
        };
        missingFields: string[];
        normalizationErrors: string[];
        recommendation: { status: string; reasons: string[] };
        divergences: {
          byDate: Array<{ key: string; frmsTotal: number | null; status: string }>;
        };
      };
    };

    expect(body.data.totals.frmsJourneysSigvoos).toBe(0);
    expect(body.data.totals.frmsAlertsSigvoos).toBe(0);
    expect(body.data.missingFields).toContain('frms_jornada.empresa_id');
    expect(body.data.normalizationErrors).toContain('FRMS_TENANT_SCOPE_UNAVAILABLE');
    expect(body.data.recommendation.status).toBe('BLOCKED');
    expect(body.data.recommendation.reasons).toContain('NO_FRMS_SIGVOOS_JOURNEYS');
    expect(body.data.divergences.byDate).toEqual([
      { key: '2026-06-14', cvTotal: 1, frmsTotal: 0, delta: 1, status: 'DIVERGENT' },
    ]);
  });

  it('retorna authContext sanitizado quando o usuario esta autenticado', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);
    seedSigvoosPreviewState(db.databasePath);
    applyShadowCompareFrmsSchema(db.databasePath);
    seedShadowCompareFrmsState(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/shadow-compare?from=2026-06-14&to=2026-06-15',
      {},
      77,
      'admin',
      { CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED: 'true', ENVIRONMENT: 'production' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        tenantScoped: true,
        empresaId: 77,
        authContext: {
          empresaId: 77,
          tenantScoped: true,
          role: 'admin',
        },
      },
    });
  });

  it('rejeita janela maior que 31 dias no shadow compare SIGVOOS', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);

    const response = await request(
      db,
      '/api/controle-voos/sigvoos/shadow-compare?from=2026-05-01&to=2026-06-15',
      {},
      1,
      'manager',
      {
        CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED: 'true',
        ENVIRONMENT: 'staging',
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_WINDOW_TOO_WIDE',
    });
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

  it('lista jornadas read-only a partir do modelo Controle de Voos sem usar FRMS', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);
    seedJornadasEndpointState(db.databasePath);

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

    const response = await request(readOnlyDb, '/api/controle-voos/jornadas?data=2026-06-14');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: {
        fonte: string;
        total: number;
        items: Array<{
          voo_id: number;
          tripulante_id: number;
          nome: string;
          origem_dados: string;
          qualidade_dado: string;
          external_id_sigvoos: number;
          sigvoos_leg_number: number;
        }>;
      };
    };

    expect(body.success).toBe(true);
    expect(body.data.fonte).toBe('controle_voos');
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]).toMatchObject({
      voo_id: 601,
      tripulante_id: 1001,
      nome: 'Tripulante Tenant A',
      origem_dados: 'importado',
      qualidade_dado: 'completo',
      external_id_sigvoos: 700101,
      sigvoos_leg_number: 1,
    });
    expect(statements.join('\n')).not.toMatch(/\bfrms_/i);
    expect(statements.join('\n')).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
  });

  it('isola jornadas por tenant no endpoint read-only', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);
    seedJornadasEndpointState(db.databasePath);

    runSql(
      db.databasePath,
      `
        UPDATE cv_voos
        SET origem_importacao = 'SIGVOOS',
            sigvoos_flight_report_id = 800101,
            sigvoos_importado_em = '2026-06-14T12:00:00Z'
        WHERE id = 701;

        INSERT INTO cv_voo_etapas (
          id, empresa_id, voo_id, numero_etapa, sigvoos_leg_number,
          origem_icao, destino_icao, horario_motor_ligado, horario_decolagem,
          horario_pouso, horario_motor_desligado, origem_dados
        ) VALUES (9302, 2, 701, 1, 1, 'SBBR', 'SBCF', '10:00', '10:15', '11:00', '11:05', 'SIGVOOS');

        INSERT INTO cv_voo_tripulantes (
          id, empresa_id, voo_id, funcionario_id, funcao, etapa_id, sigvoos_staff_id, created_by, updated_by
        ) VALUES (9402, 2, 701, 2001, 'PIC', 9302, 8001, 20, 20);
      `,
    );

    const tenantA = await request(db, '/api/controle-voos/jornadas?data=2026-06-14', {}, 1);
    const tenantB = await request(db, '/api/controle-voos/jornadas?data=2026-06-14', {}, 2);

    expect(((await tenantA.json()) as { data: { total: number } }).data.total).toBe(1);
    expect(((await tenantB.json()) as { data: { total: number } }).data.total).toBe(1);
  });

  it('retorna empty state no endpoint de jornadas quando nao ha dados', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);

    const response = await request(db, '/api/controle-voos/jornadas?data=2026-06-01');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        total: 0,
        items: [],
      },
    });
  });

  it('exige autenticacao no endpoint de jornadas', async () => {
    const db = createSqliteD1();
    applySigvoosSchema(db.databasePath);

    const response = await createApp().fetch(
      new Request('http://localhost/api/controle-voos/jornadas?data=2026-06-14'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
  });

  it('nao referencia dominios externos fora do escopo da fase', () => {
    const routeSource = readFileSync(routePath, 'utf8');
    const blocked = ['M' + 'RO', 'FR' + 'MS', 'Records' + ' Core', 'e' + 'DB', 'SDR' + 'Me'];

    for (const term of blocked) {
      expect(routeSource).not.toContain(term);
    }
  });
});
