import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

// Controle Operacional FRMS / Gate de Despacho V1 — endpoint de leitura
// (`GET /operacional`) e o guard obrigatorio de `POST /voos/:id/status`
// para a transicao `planejado -> liberado_operacionalmente`.
//
// `listFrmsOperationalSnapshot` e mockado (o mesmo padrao usado em
// `__tests__/routes/frms-operational-snapshot.test.ts`): o gate reusa a
// funcao real de `lib/frms/operational-snapshot.ts` sem modifica-la, entao
// testar a logica de composicao aqui nao exige recriar o schema inteiro de
// FRMS (jornada/checkin/fatorizacao) — isso ja e coberto por
// `__tests__/services/frms-dispatch-gate.test.ts` (regra pura) e pelos
// testes existentes de `operational-snapshot.ts`.

const listSnapshotMock = vi.fn();

vi.mock('../../lib/frms/operational-snapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/operational-snapshot')>();
  return {
    ...actual,
    listFrmsOperationalSnapshot: (...args: unknown[]) => listSnapshotMock(...args),
  };
});

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) {
      return c.json({ success: false, error: 'Token de autenticacao nao fornecido' }, 401);
    }

    const empresaId = Number(c.req.header('x-test-empresa-id') || 1);
    const role = String(c.req.header('x-test-role') || 'manager').toLowerCase();
    const userId = Number(c.req.header('x-test-user-id') || 10);
    c.set('userId', userId);
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
import controleVoosDispatchGateRoutes, {
  controleVoosDispatchGateGuard,
} from '../../routes/controle-voos-frms-dispatch-gate';
import { auth } from '../../middleware/auth';
import type { FrmsOperationalSnapshotItem } from '../../lib/frms/operational-snapshot';

type SqliteD1 = D1Database & { databasePath: string; tempDir: string };

const tempDirs: string[] = [];
const testDir = dirname(fileURLToPath(import.meta.url));
const migrations = [
  join(testDir, '../../../migrations/0410_controle_voos_n1_schema.sql'),
  join(testDir, '../../../migrations/0411_controle_voos_sigvoos_integration_schema.sql'),
  join(testDir, '../../../migrations/0438_controle_voos_rdv_coordenacao_workflow.sql'),
  join(testDir, '../../../migrations/0444_controle_voos_versao.sql'),
].map((p) => readFileSync(p, 'utf8'));

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
  const result = spawnSync('sqlite3', [databasePath], { input: sql, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function queryJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', databasePath, sql], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function targetTableOf(sql: string): string | null {
  const match = sql.match(/INSERT INTO\s+(\w+)/i);
  return match ? match[1] : null;
}

function execWithChanges(databasePath: string, sql: string): number {
  const result = spawnSync('sqlite3', ['-json', databasePath], {
    input: `${sql};\nSELECT changes() AS n;`,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  const trimmed = result.stdout.trim();
  if (!trimmed) return 0;
  const rows = JSON.parse(trimmed) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

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
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-dispatch-gate-'));
  const databasePath = join(tempDir, 'routes.sqlite');
  tempDirs.push(tempDir);

  runSql(databasePath, 'PRAGMA foreign_keys = ON;');
  for (const migration of migrations) {
    runSql(databasePath, migration);
  }
  runSql(
    databasePath,
    `
      CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY,
        nome TEXT,
        codigo_anac TEXT,
        empresa_id INTEGER NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY,
        funcionario_id INTEGER,
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS empresas (
        id INTEGER PRIMARY KEY,
        razao_social TEXT
      );
      CREATE TABLE IF NOT EXISTS aeronaves (
        id INTEGER PRIMARY KEY,
        modelo TEXT
      );
      CREATE TABLE IF NOT EXISTS auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id TEXT, usuario_nome TEXT, acao TEXT, tabela_afetada TEXT,
        registro_id TEXT, dados_antes TEXT, dados_depois TEXT,
        ip_address TEXT, user_agent TEXT, created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS usuario_permissoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        permissao TEXT NOT NULL,
        tipo TEXT NOT NULL
      );
    `,
  );
  seed(databasePath);

  const db = {
    databasePath,
    tempDir,
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
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
          const changes = execWithChanges(databasePath, interpolate(sql, binds));
          const table = targetTableOf(sql);
          const lastId = table
            ? queryJson<{ id: number }>(
                databasePath,
                `SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`,
              )[0]?.id
            : 0;
          return { meta: { changes, last_row_id: lastId || 0 } };
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

/**
 * Tenant 1: voo 601 (status `planejado`, data 2026-06-14) com dois
 * tripulantes (1001 PIC, 1002 SIC). Tenant 2: voo 701 (status `planejado`)
 * com o tripulante 2001, para provar isolamento tenant.
 *
 * Usuarios: 10 = manager tenant 1 (Coordenacao, sem vinculo de
 * tripulacao — prova acesso via capability, nao crew-link); 13 = manager
 * tenant 1 com DENY explicito em `voos.rdv.visualizar_todos` (prova DENY >
 * default de role); 20 = manager tenant 2.
 */
function seed(databasePath: string) {
  runSql(
    databasePath,
    `
      INSERT INTO cv_aeroportos (id, empresa_id, codigo, codigo_icao, nome, tipo, ativo, ordem)
      VALUES (101, 1, 'SBRJ', 'SBRJ', 'Santos Dumont', 'aeroporto', 1, 1),
              (102, 1, 'SBSP', 'SBSP', 'Congonhas', 'aeroporto', 1, 2),
              (201, 2, 'SBBR', 'SBBR', 'Brasilia', 'aeroporto', 1, 1);

      INSERT INTO cv_tipos_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (301, 1, 'REG', 'Regular', 1, 1), (302, 2, 'REG', 'Regular B', 1, 1);

      INSERT INTO cv_naturezas_voo (id, empresa_id, codigo, nome, ativo, ordem)
      VALUES (401, 1, 'PAX', 'Passageiro', 1, 1), (402, 2, 'PAX', 'Passageiro B', 1, 1);

      INSERT INTO cv_voos (
        id, empresa_id, prefixo, data_programacao, origem_id, destino_id,
        tipo_voo_id, natureza_voo_id, horario_previsto_partida,
        horario_previsto_chegada, status, created_by, updated_by
      ) VALUES
        (601, 1, 'ATX-1001', '2026-06-14', 101, 102, 301, 401, '2026-06-14T10:00:00Z', '2026-06-14T11:00:00Z', 'planejado', 10, 10),
        (602, 1, 'ATX-1002', '2026-06-14', 101, 102, 301, 401, '2026-06-14T12:00:00Z', '2026-06-14T13:00:00Z', 'em_andamento', 10, 10),
        (701, 2, 'BTX-2001', '2026-06-14', 201, 201, 302, 402, '2026-06-14T12:00:00Z', '2026-06-14T13:00:00Z', 'planejado', 20, 20);

      INSERT INTO funcionarios (id, nome, codigo_anac, empresa_id, deleted_at)
      VALUES
        (1001, 'Piloto Ficticio A', 'ANAC-0001', 1, NULL),
        (1002, 'Copiloto Ficticio A', 'ANAC-0002', 1, NULL),
        (2001, 'Piloto Ficticio B', 'ANAC-1001', 2, NULL);

      INSERT INTO usuarios (id, funcionario_id, deleted_at) VALUES
        (10, NULL, NULL), (13, NULL, NULL), (20, NULL, NULL);

      -- Usuario 13: manager tenant 1 com DENY explicito na capability de
      -- Coordenacao — deve perder o default do role.
      INSERT INTO usuario_permissoes (usuario_id, permissao, tipo)
      VALUES (13, 'voos.rdv.visualizar_todos', 'DENY');

      INSERT INTO empresas (id, razao_social) VALUES (1, 'AirTrust Teste Ltda'), (2, 'Empresa B Ltda');

      INSERT INTO cv_voo_tripulantes (empresa_id, voo_id, funcionario_id, funcao, created_by, updated_by)
      VALUES (1, 601, 1001, 'PIC', 10, 10), (1, 601, 1002, 'SIC', 10, 10),
             (2, 701, 2001, 'PIC', 20, 20);
    `,
  );
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  // Espelha `index.ts`: o guard global de auth+tenant roda para todo
  // `/api/*` ANTES de qualquer mount de rota especifica — e por isso que
  // o guard do gate (que precisa de empresaId antes do handler real de
  // controle-voos.ts) consegue ler o tenant sem depender do `auth()`
  // proprio daquela rota, que so roda depois na cadeia.
  app.use('/api/*', auth());
  app.use('/api/controle-voos/voos/:id/status', controleVoosDispatchGateGuard());
  app.route('/api/controle-voos', controleVoosRoutes);
  app.route('/api/controle-voos', controleVoosDispatchGateRoutes);
  return app;
}

function createEnv(db: D1Database): Env {
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

async function request(
  db: D1Database,
  path: string,
  init: RequestInit = {},
  opts: { empresaId?: number; role?: string; userId?: number; noAuth?: boolean } = {},
) {
  const headers = new Headers(init.headers);
  if (!opts.noAuth) {
    headers.set('Authorization', 'Bearer test');
  }
  headers.set('x-test-empresa-id', String(opts.empresaId ?? 1));
  headers.set('x-test-role', opts.role ?? 'manager');
  headers.set('x-test-user-id', String(opts.userId ?? 10));
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return createApp().fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    createEnv(db),
    {} as ExecutionContext,
  );
}

function baseSnapshotItem(
  overrides: Partial<FrmsOperationalSnapshotItem> = {},
): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-06-14',
    funcionario_id: 1001,
    tripulante_id: 1001,
    nome: 'Piloto Ficticio A',
    nome_guerra: null,
    funcao: 'PIC',
    base: null,
    aeronave: null,
    escalado: true,
    escala_source: 'MANUAL',
    hora_apresentacao: '08:00',
    hora_termino: '16:00',
    horas_voo_minutos: 300,
    duracao_jornada_minutos: 480,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '07:30',
    kss_score: 3,
    horas_sono: 8,
    qualidade_sono: 4,
    hora_acordar: '06:00',
    fadiga_score: 10,
    status_operacional_checkin: 'NORMAL',
    effectiveness_pct: 95,
    nivel_fadiga_calculado: 'BAIXO',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: null,
    snapshot_status: 'OK',
    fortnight_indicator: null,
    alertas: [],
    natureza_dado: 'JORNADA_REALIZADA',
    causa: '',
    mitigacao_recomendada: 'SEM_ACAO',
    decisao: 'INFORMA',
    limite_referencia: null,
    estado_operacional: 'NORMAL',
    motivos_principais: [],
    acao_recomendada_texto: '',
    ...overrides,
  };
}

function mockSnapshot(items: FrmsOperationalSnapshotItem[]) {
  listSnapshotMock.mockResolvedValue({
    items,
    summary: {
      total_tripulantes: items.length,
      total_escalados: items.length,
      checkins_recebidos: 0,
      checkins_pendentes: 0,
      alertas_criticos: 0,
      alertas_atencao: 0,
      dados_estimados: 0,
      inconsistencias: 0,
      sem_fatorizacao: 0,
      quinzena_incompleta: 0,
      quinzena_atencao: 0,
      quinzena_critica: 0,
    },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  listSnapshotMock.mockReset();
});

describe('POST /voos/:id/status — guard do gate de despacho FRMS', () => {
  it('PATCH nao aceita transicao para liberado_operacionalmente e preserva o voo com pendencia FRMS', async () => {
    const db = createSqliteD1();
    mockSnapshot([
      baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'AUSENTE' }),
      baseSnapshotItem({ funcionario_id: 1002, nome: 'Copiloto Ficticio A', checkin_status: 'RECEBIDO' }),
    ]);

    const response = await request(db, '/api/controle-voos/voos/601', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CONTROLE_VOOS_FORBIDDEN_FIELD',
    });
    expect(queryJson<{ status: string; versao: number }>(
      db.databasePath,
      'SELECT status, versao FROM cv_voos WHERE id = 601',
    )).toEqual([{ status: 'planejado', versao: 1 }]);
    expect(listSnapshotMock).not.toHaveBeenCalled();
  });

  it('PATCH de outro tenant nao revela nem altera o voo alvo', async () => {
    const db = createSqliteD1();
    mockSnapshot([baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'AUSENTE' })]);

    const response = await request(db, '/api/controle-voos/voos/701', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }),
    });

    expect(response.status).toBe(404);
    expect(queryJson<{ status: string; versao: number }>(
      db.databasePath,
      'SELECT status, versao FROM cv_voos WHERE id = 701 AND empresa_id = 2',
    )).toEqual([{ status: 'planejado', versao: 1 }]);
    expect(listSnapshotMock).not.toHaveBeenCalled();
  });

  it('1/4) chamada direta de status com check-in ausente e bloqueada com 409 (nao contorna o gate)', async () => {
    const db = createSqliteD1();
    mockSnapshot([
      baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'AUSENTE' }),
      baseSnapshotItem({ funcionario_id: 1002, nome: 'Copiloto Ficticio A', checkin_status: 'RECEBIDO' }),
    ]);

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      success: boolean;
      code: string;
      data: { frms_status: string; tripulacao: Array<{ funcionario_id: number; reasons: string[] }> };
    };
    expect(body.success).toBe(false);
    expect(body.code).toBe('CONTROLE_VOOS_FRMS_RELEASE_BLOCKED');
    expect(body.data.frms_status).toBe('NAO_LIBERADO');
    expect(
      body.data.tripulacao.find((t) => t.funcionario_id === 1001)?.reasons,
    ).toContain('CHECKIN_DIARIO_PENDENTE');

    // Nao deve ter mudado o status no banco.
    const rows = queryJson<{ status: string }>(
      db.databasePath,
      'SELECT status FROM cv_voos WHERE id = 601',
    );
    expect(rows[0].status).toBe('planejado');
  });

  it('nenhum dado sensivel (KSS/sono) vaza no corpo do 409', async () => {
    const db = createSqliteD1();
    mockSnapshot([
      baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'AUSENTE', kss_score: 9, horas_sono: 2 }),
      baseSnapshotItem({ funcionario_id: 1002, checkin_status: 'RECEBIDO' }),
    ]);

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }),
    });

    expect(response.status).toBe(409);
    const text = await response.text();
    expect(text).not.toMatch(/kss|sono|medica|alcool/i);
  });

  it('check-in recebido + decisao NORMAL para toda a tripulacao => libera a transicao (200)', async () => {
    const db = createSqliteD1();
    mockSnapshot([
      baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'RECEBIDO' }),
      baseSnapshotItem({ funcionario_id: 1002, checkin_status: 'RECEBIDO' }),
    ]);

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }),
    });

    expect(response.status).toBe(200);
    const rows = queryJson<{ status: string }>(
      db.databasePath,
      'SELECT status FROM cv_voos WHERE id = 601',
    );
    expect(rows[0].status).toBe('liberado_operacionalmente');
  });

  it('5) CRITICO_VIOLACAO bloqueia mesmo com check-in RECEBIDO para todos', async () => {
    const db = createSqliteD1();
    mockSnapshot([
      baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'RECEBIDO', estado_operacional: 'CRITICO_VIOLACAO' }),
      baseSnapshotItem({ funcionario_id: 1002, checkin_status: 'RECEBIDO' }),
    ]);

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }),
    });

    expect(response.status).toBe(409);
  });

  it('13) transicao diferente de liberado_operacionalmente nao sofre bloqueio novo (em_andamento -> pousado)', async () => {
    const db = createSqliteD1();
    // Snapshot mockado de proposito para bloquear se o guard rodasse — nao
    // deve rodar, pois o voo 602 nao esta em 'planejado'.
    mockSnapshot([baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'AUSENTE' })]);

    const response = await request(db, '/api/controle-voos/voos/602/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'pousado', versao: 1 }),
    });

    expect(response.status).toBe(200);
    expect(listSnapshotMock).not.toHaveBeenCalled();
  });

  it('cancelamento (planejado -> cancelado) nao sofre bloqueio do gate FRMS', async () => {
    const db = createSqliteD1();
    mockSnapshot([baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'AUSENTE' })]);
    runSql(
      db.databasePath,
      `INSERT INTO cv_motivos_operacionais (id, empresa_id, codigo, nome, tipo, ativo, ordem)
       VALUES (901, 1, 'OP001', 'Motivo generico', 'cancelamento', 1, 1);`,
    );

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'cancelado', motivo_id: 901, versao: 1 }),
    });

    expect(response.status).toBe(200);
    expect(listSnapshotMock).not.toHaveBeenCalled();
  });

  it('9) tenant B nao e afetado pelo gate calculado para o voo do tenant A (isolamento)', async () => {
    const db = createSqliteD1();
    mockSnapshot([baseSnapshotItem({ funcionario_id: 2001, checkin_status: 'RECEBIDO', empresa_id: 2 })]);

    const response = await request(
      db,
      '/api/controle-voos/voos/701/status',
      { method: 'POST', body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1 }) },
      { empresaId: 2, userId: 20 },
    );

    expect(response.status).toBe(200);
  });

  it('empresa_id do payload e ignorado — gate usa somente o tenant autenticado', async () => {
    const db = createSqliteD1();
    // Tenant 1 (autenticado) tem check-in ausente; se o handler confiasse em
    // um empresa_id vindo do corpo da requisicao, um payload malicioso
    // poderia tentar escapar do tenant certo.
    mockSnapshot([baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'AUSENTE' })]);

    const response = await request(db, '/api/controle-voos/voos/601/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'liberado_operacionalmente', versao: 1, empresa_id: 999 }),
    });

    expect(response.status).toBe(409);
  });
});

describe('GET /api/controle-voos/operacional', () => {
  it('10/11) Coordenacao (manager, sem vinculo de tripulacao) acessa o painel', async () => {
    const db = createSqliteD1();
    mockSnapshot([
      baseSnapshotItem({ funcionario_id: 1001, checkin_status: 'RECEBIDO' }),
      baseSnapshotItem({ funcionario_id: 1002, checkin_status: 'PENDENTE' }),
    ]);

    const response = await request(db, '/api/controle-voos/operacional?data=2026-06-14', {}, {
      userId: 10,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { resumo: Record<string, number>; voos: Array<{ voo_id: number; frms_status: string }> };
    };
    const voo601 = body.data.voos.find((v) => v.voo_id === 601);
    expect(voo601?.frms_status).toBe('NAO_LIBERADO');
    expect(body.data.resumo.voos_nao_liberados).toBeGreaterThanOrEqual(1);
    expect(body.data.resumo.tripulantes_checkin_pendente).toBeGreaterThanOrEqual(1);
  });

  it('10) viewer/student sem capability recebe 403 no painel da Coordenacao', async () => {
    const db = createSqliteD1();
    mockSnapshot([]);

    const response = await request(
      db,
      '/api/controle-voos/operacional?data=2026-06-14',
      {},
      { role: 'student' },
    );

    expect(response.status).toBe(403);
  });

  it('12) DENY explicito vence default de role (manager 13 perde acesso mesmo sendo manager)', async () => {
    const db = createSqliteD1();
    mockSnapshot([]);

    const response = await request(
      db,
      '/api/controle-voos/operacional?data=2026-06-14',
      {},
      { userId: 13, role: 'manager' },
    );

    expect(response.status).toBe(403);
  });

  it('9) isolamento tenant: painel da empresa 2 nao retorna voo da empresa 1', async () => {
    const db = createSqliteD1();
    mockSnapshot([baseSnapshotItem({ funcionario_id: 2001, empresa_id: 2, checkin_status: 'RECEBIDO' })]);

    const response = await request(
      db,
      '/api/controle-voos/operacional?data=2026-06-14',
      {},
      { empresaId: 2, userId: 20 },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { voos: Array<{ voo_id: number }> } };
    expect(body.data.voos.map((v) => v.voo_id)).toEqual([701]);
    expect(body.data.voos.map((v) => v.voo_id)).not.toContain(601);
  });

  it('16) resposta do painel nao expoe dado sensivel de check-in', async () => {
    const db = createSqliteD1();
    mockSnapshot([
      baseSnapshotItem({
        funcionario_id: 1001,
        checkin_status: 'RECEBIDO',
        kss_score: 8,
        horas_sono: 3,
        qualidade_sono: 1,
      }),
    ]);

    const response = await request(db, '/api/controle-voos/operacional?data=2026-06-14', {}, {
      userId: 10,
    });

    const text = await response.text();
    expect(text).not.toMatch(/kss|qualidade_sono|horas_sono|medica|alcool/i);
  });

  it('exige autenticacao', async () => {
    const db = createSqliteD1();
    const response = await request(
      db,
      '/api/controle-voos/operacional?data=2026-06-14',
      {},
      { noAuth: true },
    );
    expect(response.status).toBe(401);
  });
});
