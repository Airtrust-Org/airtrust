import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import {
  computeEtapaTempos,
  computeFlightTotalsFromEtapas,
} from '../../services/controle-voos/rdv-etapas';

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
import controleVoosRdvWorkflowRoutes from '../../routes/controle-voos-rdv-workflow';
import controleVoosRdvEtapasRoutes from '../../routes/controle-voos-rdv-etapas';
import { registrarAuditoria } from '../../utils/auditoria';

type SqliteD1 = D1Database & { databasePath: string; tempDir: string };

const tempDirs: string[] = [];
const testDir = dirname(fileURLToPath(import.meta.url));
const migrations = [
  join(testDir, '../../../migrations/0410_controle_voos_n1_schema.sql'),
  join(testDir, '../../../migrations/0411_controle_voos_sigvoos_integration_schema.sql'),
  join(testDir, '../../../migrations/0438_controle_voos_rdv_coordenacao_workflow.sql'),
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

function createSqliteD1(): SqliteD1 {
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-rdv-etapas-'));
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
        razao_social TEXT,
        nome_fantasia TEXT
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
          const table = targetTableOf(sql);
          const lastId = table
            ? queryJson<{ id: number }>(
                databasePath,
                `SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`,
              )[0]?.id
            : 0;
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
        (601, 1, 'ATX-1001', '2026-06-14', 101, 102, 301, 401, '2026-06-14T10:00:00Z', '2026-06-14T11:00:00Z', 'concluido_operacionalmente', 10, 10),
        (701, 2, 'BTX-2001', '2026-06-14', 201, 201, 302, 402, '2026-06-14T12:00:00Z', '2026-06-14T13:00:00Z', 'concluido_operacionalmente', 20, 20);

      INSERT INTO funcionarios (id, nome, codigo_anac, empresa_id, deleted_at)
      VALUES (1001, 'Piloto Ficticio A', 'ANAC-0001', 1, NULL), (1002, 'Copiloto Ficticio A', 'ANAC-0002', 1, NULL),
             (2001, 'Piloto Ficticio B', 'ANAC-1001', 2, NULL);

      INSERT INTO usuarios (id, funcionario_id, deleted_at) VALUES
        (10, 1001, NULL), (11, NULL, NULL), (12, 1002, NULL), (20, 2001, NULL);

      INSERT INTO empresas (id, razao_social, nome_fantasia) VALUES (1, 'AirTrust Teste Ltda', 'AirTrust Teste');

      INSERT INTO cv_voo_tripulantes (empresa_id, voo_id, funcionario_id, funcao, created_by, updated_by)
      VALUES (1, 601, 1001, 'PIC', 10, 10), (1, 601, 1002, 'SIC', 10, 10);
    `,
  );
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/controle-voos', controleVoosRoutes);
  app.route('/api/controle-voos', controleVoosRdvWorkflowRoutes);
  app.route('/api/controle-voos', controleVoosRdvEtapasRoutes);
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
  opts: { empresaId?: number; role?: string; userId?: number } = {},
) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test');
  headers.set('x-test-empresa-id', String(opts.empresaId ?? 1));
  headers.set('x-test-role', opts.role ?? 'manager');
  headers.set('x-test-user-id', String(opts.userId ?? 10));
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return createApp().fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    createEnv(db),
    {} as ExecutionContext,
  );
}

const PILOTO = { role: 'student', userId: 10 } as const;
const COORDENACAO = { role: 'manager', userId: 11 } as const;

async function ensureRdv(db: D1Database) {
  const res = await request(
    db,
    '/api/controle-voos/voos/601/rdv',
    {
      method: 'PUT',
      body: JSON.stringify({
        numero: 'RDV-ETAPAS-1',
        data_voo: '2026-06-14',
        horario_decolagem_real: '2026-06-14T10:05:00Z',
        horario_pouso_real: '2026-06-14T10:55:00Z',
        combustivel_decolagem: 1000,
        combustivel_pouso: 600,
        combustivel_consumo: 400,
      }),
    },
    PILOTO,
  );
  expect(res.status).toBe(201);
  const json = (await res.json()) as { data: { id: number; versao: number } };
  return json.data;
}

async function getVersao(db: SqliteD1, vooId = 601): Promise<number> {
  const rows = queryJson<{ versao: number }>(
    db.databasePath,
    `SELECT versao FROM cv_rdv_operacional WHERE voo_id = ${vooId} AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`,
  );
  return rows[0]?.versao ?? 0;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe('rdv-etapas — compute helpers', () => {
  it('computeEtapaTempos cobre meia-noite (HH:MM)', () => {
    const tempos = computeEtapaTempos('23:30', '00:45', '23:20', '00:55');
    expect(tempos.tempo_decolagem_pouso).toBe('01:15');
    expect(tempos.tempo_total).toBe('01:35');
  });

  it('computeFlightTotalsFromEtapas agrega duas pernas', () => {
    const totals = computeFlightTotalsFromEtapas([
      {
        horario_decolagem: '2026-06-14T10:00:00Z',
        horario_pouso: '2026-06-14T10:40:00Z',
        tempo_decolagem_pouso: '00:40',
        pousos_diurnos: 1,
        pousos_noturnos: 0,
        pax: 4,
        payload: 100,
        combustivel_inicio: 1000,
        combustivel_fim: 800,
      },
      {
        horario_decolagem: '2026-06-14T11:00:00Z',
        horario_pouso: '2026-06-14T11:30:00Z',
        tempo_decolagem_pouso: '00:30',
        pousos_diurnos: 1,
        pousos_noturnos: 0,
        pax: 2,
        payload: 50,
        combustivel_inicio: 800,
        combustivel_fim: 650,
      },
    ]);
    expect(totals.horario_decolagem_real).toBe('2026-06-14T10:00:00Z');
    expect(totals.horario_pouso_real).toBe('2026-06-14T11:30:00Z');
    expect(totals.horas_voadas).toBe(1.17);
    expect(totals.numero_pousos).toBe(2);
    expect(totals.combustivel_decolagem).toBe(1000);
    expect(totals.combustivel_pouso).toBe(650);
    expect(totals.combustivel_consumo).toBe(350);
    expect(totals.pob).toBe(4);
  });
});

describe('RDV etapas — CRUD multi-tenant', () => {
  it('lista etapas com meta.programado do voo e cria/atualiza/duplica/reordena/soft-delete', async () => {
    const db = createSqliteD1();
    await ensureRdv(db);
    let versao = await getVersao(db);

    const listEmpty = await request(db, '/api/controle-voos/voos/601/etapas', {}, PILOTO);
    expect(listEmpty.status).toBe(200);
    const emptyJson = (await listEmpty.json()) as {
      data: unknown[];
      meta: {
        programado: { origem_icao: string; horario_previsto_partida: string };
        versao: number;
      };
    };
    expect(emptyJson.data).toEqual([]);
    expect(emptyJson.meta.programado.origem_icao).toBe('SBRJ');
    expect(emptyJson.meta.programado.horario_previsto_partida).toBe('2026-06-14T10:00:00Z');

    const create1 = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao,
          origem_icao: 'sbrj',
          destino_icao: 'sbsp',
          horario_motor_ligado: '2026-06-14T09:50:00Z',
          horario_decolagem: '2026-06-14T10:00:00Z',
          horario_pouso: '2026-06-14T10:40:00Z',
          horario_motor_desligado: '2026-06-14T10:50:00Z',
          combustivel_inicio: 1000,
          combustivel_fim: 800,
          pousos_diurnos: 1,
          pax: 4,
        }),
      },
      PILOTO,
    );
    expect(create1.status).toBe(201);
    const e1 = (await create1.json()) as {
      data: {
        id: number;
        numero_etapa: number;
        origem_dados: string;
        tempo_decolagem_pouso: string;
        tempo_total: string;
      };
      meta: { versao: number };
    };
    expect(e1.data.numero_etapa).toBe(1);
    expect(e1.data.origem_dados).toBe('MANUAL');
    expect(e1.data.tempo_decolagem_pouso).toBe('00:40');
    expect(e1.data.tempo_total).toBe('01:00');
    versao = e1.meta.versao;

    const create2 = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao,
          origem_icao: 'SBSP',
          destino_icao: 'SBRJ',
          horario_decolagem: '2026-06-14T11:00:00Z',
          horario_pouso: '2026-06-14T11:30:00Z',
          combustivel_inicio: 800,
          combustivel_fim: 650,
          pousos_diurnos: 1,
        }),
      },
      PILOTO,
    );
    expect(create2.status).toBe(201);
    const e2 = (await create2.json()) as { data: { id: number }; meta: { versao: number } };
    versao = e2.meta.versao;

    const rdvRows = queryJson<{
      horas_voadas: number;
      combustivel_consumo: number;
      numero_pousos: number;
    }>(
      db.databasePath,
      `SELECT horas_voadas, combustivel_consumo, numero_pousos FROM cv_rdv_operacional WHERE voo_id = 601`,
    );
    expect(rdvRows[0].numero_pousos).toBe(2);
    expect(rdvRows[0].combustivel_consumo).toBe(350);
    expect(rdvRows[0].horas_voadas).toBe(1.17);

    const reorder = await request(
      db,
      '/api/controle-voos/voos/601/etapas/ordem',
      {
        method: 'PUT',
        body: JSON.stringify({ versao, ordem: [e2.data.id, e1.data.id] }),
      },
      PILOTO,
    );
    expect(reorder.status).toBe(200);
    const reordered = (await reorder.json()) as {
      data: Array<{ id: number; numero_etapa: number }>;
      meta: { versao: number };
    };
    expect(reordered.data.map((e) => e.id)).toEqual([e2.data.id, e1.data.id]);
    expect(reordered.data.map((e) => e.numero_etapa)).toEqual([1, 2]);
    versao = reordered.meta.versao;

    const dup = await request(
      db,
      `/api/controle-voos/voos/601/etapas/${e1.data.id}/duplicar`,
      { method: 'POST', body: JSON.stringify({ versao }) },
      PILOTO,
    );
    expect(dup.status).toBe(201);
    const duplicated = (await dup.json()) as {
      data: { id: number; numero_etapa: number; origem_dados: string };
      meta: { versao: number };
    };
    expect(duplicated.data.numero_etapa).toBe(3);
    expect(duplicated.data.origem_dados).toBe('MANUAL');
    versao = duplicated.meta.versao;

    const patch = await request(
      db,
      `/api/controle-voos/voos/601/etapas/${e2.data.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ versao, pax: 6, combustivel_fim: 700 }),
      },
      PILOTO,
    );
    expect(patch.status).toBe(200);
    versao = ((await patch.json()) as { meta: { versao: number } }).meta.versao;

    const del = await request(
      db,
      `/api/controle-voos/voos/601/etapas/${duplicated.data.id}`,
      { method: 'DELETE', body: JSON.stringify({ versao }) },
      PILOTO,
    );
    expect(del.status).toBe(200);

    const list = await request(db, '/api/controle-voos/voos/601/etapas', {}, PILOTO);
    const listed = (await list.json()) as { data: Array<{ id: number }> };
    expect(listed.data.map((e) => e.id).sort()).toEqual([e1.data.id, e2.data.id].sort());

    const soft = queryJson<{ deleted_at: string | null }>(
      db.databasePath,
      `SELECT deleted_at FROM cv_voo_etapas WHERE id = ${duplicated.data.id}`,
    );
    expect(soft[0].deleted_at).toBeTruthy();
  });

  it('rejeita pouso < decolagem, combustivel incoerente e conflito de versao', async () => {
    const db = createSqliteD1();
    await ensureRdv(db);
    const versao = await getVersao(db);

    const badTime = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao,
          horario_decolagem: '2026-06-14T11:00:00Z',
          horario_pouso: '2026-06-14T10:00:00Z',
        }),
      },
      PILOTO,
    );
    expect(badTime.status).toBe(400);

    const badFuel = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao,
          horario_decolagem: '2026-06-14T10:00:00Z',
          horario_pouso: '2026-06-14T11:00:00Z',
          combustivel_inicio: 500,
          combustivel_fim: 600,
        }),
      },
      PILOTO,
    );
    expect(badFuel.status).toBe(400);

    const ok = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao,
          origem_icao: 'SBRJ',
          destino_icao: 'SBSP',
          horario_decolagem: '2026-06-14T10:00:00Z',
          horario_pouso: '2026-06-14T10:30:00Z',
        }),
      },
      PILOTO,
    );
    expect(ok.status).toBe(201);

    const stale = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao,
          origem_icao: 'SBSP',
          destino_icao: 'SBRJ',
          horario_decolagem: '2026-06-14T11:00:00Z',
          horario_pouso: '2026-06-14T11:30:00Z',
        }),
      },
      PILOTO,
    );
    expect(stale.status).toBe(409);
  });

  it('preserva origem_dados SIGVOOS em update operacional', async () => {
    const db = createSqliteD1();
    await ensureRdv(db);
    runSql(
      db.databasePath,
      `
      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, origem_icao, destino_icao,
        horario_decolagem, horario_pouso, combustivel_inicio, combustivel_fim, origem_dados
      ) VALUES (
        5001, 1, 601, 1, 'SBRJ', 'SBSP',
        '2026-06-14T10:00:00Z', '2026-06-14T10:30:00Z', 900, 700, 'SIGVOOS'
      );
    `,
    );
    const versao = await getVersao(db);
    const patch = await request(
      db,
      '/api/controle-voos/voos/601/etapas/5001',
      {
        method: 'PATCH',
        body: JSON.stringify({ versao, pax: 8, combustivel_fim: 680 }),
      },
      PILOTO,
    );
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { data: { origem_dados: string; pax: number } };
    expect(body.data.origem_dados).toBe('SIGVOOS');
    expect(body.data.pax).toBe(8);
  });

  it('bloqueia edicao do piloto apos envio; coordenacao corrige em em_revisao com justificativa', async () => {
    const db = createSqliteD1();
    await ensureRdv(db);
    let versao = await getVersao(db);

    const created = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao,
          origem_icao: 'SBRJ',
          destino_icao: 'SBSP',
          horario_decolagem: '2026-06-14T10:05:00Z',
          horario_pouso: '2026-06-14T10:55:00Z',
          combustivel_inicio: 1000,
          combustivel_fim: 600,
          pousos_diurnos: 1,
        }),
      },
      PILOTO,
    );
    const etapaId = ((await created.json()) as { data: { id: number }; meta: { versao: number } })
      .data.id;

    await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      PILOTO,
    );
    versao = await getVersao(db);
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/enviar',
      { method: 'POST', body: JSON.stringify({ versao }) },
      PILOTO,
    );

    versao = await getVersao(db);
    const blocked = await request(
      db,
      `/api/controle-voos/voos/601/etapas/${etapaId}`,
      { method: 'PATCH', body: JSON.stringify({ versao, pax: 9 }) },
      PILOTO,
    );
    expect(blocked.status).toBe(409);

    await request(
      db,
      '/api/controle-voos/voos/601/rdv/iniciar-revisao',
      { method: 'POST', body: JSON.stringify({ versao }) },
      COORDENACAO,
    );
    versao = await getVersao(db);

    const withoutJust = await request(
      db,
      `/api/controle-voos/voos/601/etapas/${etapaId}`,
      { method: 'PATCH', body: JSON.stringify({ versao, mode: 'coordenacao', pax: 9 }) },
      COORDENACAO,
    );
    expect(withoutJust.status).toBe(400);

    const corrected = await request(
      db,
      `/api/controle-voos/voos/601/etapas/${etapaId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          versao,
          mode: 'coordenacao',
          justificativa: 'Ajuste de PAX na revisao',
          pax: 9,
        }),
      },
      COORDENACAO,
    );
    expect(corrected.status).toBe(200);

    const revisoes = queryJson<{ entidade: string; campo: string; justificativa: string }>(
      db.databasePath,
      `SELECT entidade, campo, justificativa FROM cv_rdv_revisoes WHERE entidade = 'etapa'`,
    );
    expect(revisoes.some((r) => r.campo === 'pax' && r.justificativa.includes('PAX'))).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalled();
  });

  it('impede IDOR e acesso cross-tenant', async () => {
    const db = createSqliteD1();
    await ensureRdv(db);
    runSql(
      db.databasePath,
      `
      INSERT INTO cv_rdv_operacional (
        empresa_id, voo_id, numero, data_voo, status, workflow_status, versao, created_by, updated_by
      ) VALUES (2, 701, 'RDV-B', '2026-06-14', 'rascunho', 'rascunho', 1, 20, 20);

      INSERT INTO cv_voo_etapas (
        id, empresa_id, voo_id, numero_etapa, origem_icao, destino_icao, origem_dados
      ) VALUES (7001, 2, 701, 1, 'SBBR', 'SBBR', 'MANUAL');
    `,
    );

    const cross = await request(
      db,
      '/api/controle-voos/voos/701/etapas',
      {},
      { ...PILOTO, empresaId: 1 },
    );
    expect(cross.status).toBe(404);

    const idor = await request(
      db,
      '/api/controle-voos/voos/601/etapas/7001',
      {
        method: 'PATCH',
        body: JSON.stringify({ versao: 1, pax: 1 }),
      },
      PILOTO,
    );
    expect(idor.status).toBe(404);

    const viewer = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao: 1,
          origem_icao: 'SBRJ',
          destino_icao: 'SBSP',
          horario_decolagem: '2026-06-14T10:00:00Z',
          horario_pouso: '2026-06-14T10:30:00Z',
        }),
      },
      { role: 'viewer', userId: 12 },
    );
    expect(viewer.status).toBe(403);
  });

  it('gera alertas a partir de etapas persistidas (continuidade e ausencia de destino)', async () => {
    const db = createSqliteD1();
    await ensureRdv(db);
    let versao = await getVersao(db);

    const create1 = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao,
          origem_icao: 'SBRJ',
          destino_icao: 'SBSP',
          horario_decolagem: '2026-06-14T10:00:00Z',
          horario_pouso: '2026-06-14T10:40:00Z',
          combustivel_inicio: 1000,
          combustivel_fim: 800,
        }),
      },
      PILOTO,
    );
    expect(create1.status).toBe(201);
    versao = ((await create1.json()) as { meta: { versao: number } }).meta.versao;

    const create2 = await request(
      db,
      '/api/controle-voos/voos/601/etapas',
      {
        method: 'POST',
        body: JSON.stringify({
          versao,
          origem_icao: 'SBGR',
          destino_icao: null,
          horario_decolagem: '2026-06-14T11:00:00Z',
          horario_pouso: '2026-06-14T11:30:00Z',
          combustivel_inicio: 800,
          combustivel_fim: 700,
        }),
      },
      PILOTO,
    );
    expect(create2.status).toBe(201);

    const alertas = await request(db, '/api/controle-voos/voos/601/rdv/alertas', {}, PILOTO);
    expect(alertas.status).toBe(200);
    const body = (await alertas.json()) as {
      data: Array<{ tipo: string; mensagem: string }>;
    };
    const messages = body.data.map((a) => a.mensagem).join(' | ');
    expect(messages).toMatch(/destino/i);
    expect(messages).toMatch(/origem|destino do trecho|difere/i);
  });
});
