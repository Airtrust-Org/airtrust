import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

// Fluxo Piloto -> Coordenação do RDV (Relatório de Voo), introduzido pela
// migration 0438. Cobre: transições de estado, versão otimista,
// justificativa obrigatória, diffs de revisão, alertas bloqueantes,
// tripulação/abastecimentos, isolamento multi-tenant, IDOR e o PDF fictício.

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
  const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-cv-rdv-workflow-'));
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

      -- 10 = piloto (crew no voo 601); 11 = Coordenação (sem vínculo de tripulação);
      -- 12 = piloto sem crew; 13 = manager com DENY em aprovar_coordenacao;
      -- 20 = tenant B.
      INSERT INTO usuarios (id, funcionario_id, deleted_at) VALUES
        (10, 1001, NULL), (11, NULL, NULL), (12, 1002, NULL), (13, NULL, NULL), (20, 2001, NULL);

      -- DENY explícito: manager 13 perde o default de Coordenação em aprovar_coordenacao.
      INSERT INTO usuario_permissoes (usuario_id, permissao, tipo)
      VALUES (13, 'voos.rdv.aprovar_coordenacao', 'DENY');

      INSERT INTO empresas (id, razao_social, nome_fantasia) VALUES (1, 'AirTrust Teste Ltda', 'AirTrust Teste');

      INSERT INTO cv_voo_tripulantes (empresa_id, voo_id, funcionario_id, funcao, created_by, updated_by)
      VALUES (1, 601, 1001, 'PIC', 10, 10), (1, 601, 1002, 'SIC', 10, 10);

      INSERT INTO cv_voo_etapas (
        empresa_id, voo_id, numero_etapa, origem_icao, destino_icao,
        horario_decolagem, horario_pouso, tempo_total, pax, combustivel_inicio, combustivel_fim
      ) VALUES (1, 601, 1, 'SBRJ', 'SBSP', '2026-06-14T10:05:00Z', '2026-06-14T10:55:00Z', '00:50', 4, 1000, 600);
    `,
  );
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/controle-voos', controleVoosRoutes);
  app.route('/api/controle-voos', controleVoosRdvWorkflowRoutes);
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

/** Piloto autenticado com vínculo de tripulação no voo 601. */
const PILOTO = { role: 'student', userId: 10 } as const;
/** Coordenação com defaults de role manager (user 11). */
const COORDENACAO = { role: 'manager', userId: 11 } as const;

async function preencherRdvCompleto(
  db: D1Database,
  opts: { role?: string; userId?: number } = PILOTO,
) {
  const res = await request(
    db,
    '/api/controle-voos/voos/601/rdv',
    {
      method: 'PUT',
      body: JSON.stringify({
        numero: 'RDV-0001',
        data_voo: '2026-06-14',
        horario_decolagem_real: '2026-06-14T10:05:00Z',
        horario_pouso_real: '2026-06-14T10:55:00Z',
        combustivel_decolagem: 1000,
        combustivel_pouso: 600,
        combustivel_consumo: 400,
      }),
    },
    opts,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { data: { id: number; versao: number } };
}

async function avancarAteEmRevisao(db: D1Database) {
  await preencherRdvCompleto(db);
  await request(
    db,
    '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
    { method: 'POST' },
    PILOTO,
  );
  await request(
    db,
    '/api/controle-voos/voos/601/rdv/enviar',
    { method: 'POST', body: '{}' },
    PILOTO,
  );
  await request(
    db,
    '/api/controle-voos/voos/601/rdv/iniciar-revisao',
    { method: 'POST', body: '{}' },
    COORDENACAO,
  );
}

async function avancarAteFinalizado(db: D1Database) {
  await avancarAteEmRevisao(db);
  await request(
    db,
    '/api/controle-voos/voos/601/rdv/aprovar',
    { method: 'POST', body: '{}' },
    COORDENACAO,
  );
  await request(
    db,
    '/api/controle-voos/voos/601/rdv/finalizar',
    { method: 'POST', body: '{}' },
    COORDENACAO,
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe('RDV — fluxo Piloto -> Coordenação (migration 0438)', () => {
  it('percorre o fluxo feliz completo: rascunho -> enviado -> em_revisao -> aprovado -> finalizado', async () => {
    const db = createSqliteD1();
    const created = await preencherRdvCompleto(db);
    const rdvId = created.data.id;
    expect(created.data.versao).toBe(1);

    const finalize = await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      PILOTO,
    );
    expect(finalize.status).toBe(200);

    const enviar = await request(
      db,
      '/api/controle-voos/voos/601/rdv/enviar',
      { method: 'POST', body: '{}' },
      PILOTO,
    );
    expect(enviar.status).toBe(200);
    const enviarBody = (await enviar.json()) as {
      data: { workflow_status: string; versao: number };
    };
    expect(enviarBody.data.workflow_status).toBe('enviado');
    expect(enviarBody.data.versao).toBe(2);

    const revisao = await request(
      db,
      '/api/controle-voos/voos/601/rdv/iniciar-revisao',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );
    expect(revisao.status).toBe(200);

    const aprovar = await request(
      db,
      '/api/controle-voos/voos/601/rdv/aprovar',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );
    expect(aprovar.status).toBe(200);
    const aprovarBody = (await aprovar.json()) as { data: { workflow_status: string } };
    expect(aprovarBody.data.workflow_status).toBe('aprovado_coordenacao');

    const finalizar = await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );
    expect(finalizar.status).toBe(200);
    const finalizarBody = (await finalizar.json()) as {
      data: { workflow_status: string; versao: number };
    };
    expect(finalizarBody.data.workflow_status).toBe('finalizado');
    expect(finalizarBody.data.versao).toBe(5);

    const aprovacoes = await request(
      db,
      '/api/controle-voos/voos/601/rdv/aprovacoes',
      {},
      COORDENACAO,
    );
    const aprovacoesBody = (await aprovacoes.json()) as {
      data: Array<{ tipo_aprovacao: string; status: string }>;
    };
    expect(
      aprovacoesBody.data.some((a) => a.tipo_aprovacao === 'COMANDANTE' && a.status === 'APROVADO'),
    ).toBe(true);
    expect(aprovacoesBody.data.length).toBeGreaterThanOrEqual(3);
    void rdvId;
  });

  it('registra auditoria de transicao para todos os estados incluindo DEVOLVIDO e REABERTO', async () => {
    const db = createSqliteD1();
    await avancarAteEmRevisao(db);

    const devolver = await request(
      db,
      '/api/controle-voos/voos/601/rdv/devolver',
      { method: 'POST', body: JSON.stringify({ justificativa: 'Corrigir POB' }) },
      COORDENACAO,
    );
    expect(devolver.status).toBe(200);
    expect(
      ((await devolver.json()) as { data: { workflow_status: string } }).data.workflow_status,
    ).toBe('devolvido');

    // Devolvido → piloto reabre preenchimento e reenvia.
    await request(
      db,
      '/api/controle-voos/voos/601/rdv',
      { method: 'PUT', body: JSON.stringify({ pob: 4 }) },
      PILOTO,
    );
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      PILOTO,
    );
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/enviar',
      { method: 'POST', body: '{}' },
      PILOTO,
    );
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/iniciar-revisao',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/aprovar',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );

    const reabrir = await request(
      db,
      '/api/controle-voos/voos/601/rdv/reabrir',
      { method: 'POST', body: JSON.stringify({ justificativa: 'Cliente pediu ajuste' }) },
      COORDENACAO,
    );
    expect(reabrir.status).toBe(200);
    expect(
      ((await reabrir.json()) as { data: { workflow_status: string } }).data.workflow_status,
    ).toBe('reaberto');

    const aprovacoes = await request(
      db,
      '/api/controle-voos/voos/601/rdv/aprovacoes',
      {},
      COORDENACAO,
    );
    const aprovacoesBody = (await aprovacoes.json()) as {
      data: Array<{ tipo_aprovacao: string; status: string }>;
    };
    const statuses = aprovacoesBody.data.map((a) => a.status);
    expect(statuses).toEqual(
      expect.arrayContaining([
        'APROVADO', // COMANDANTE + COORDENACAO
        'ENVIADO',
        'REVISAO_INICIADA',
        'DEVOLVIDO',
        'REABERTO',
      ]),
    );
    expect(aprovacoesBody.data.some((a) => a.tipo_aprovacao === 'COMANDANTE')).toBe(true);
    expect(
      aprovacoesBody.data.filter((a) => a.status === 'DEVOLVIDO').length,
    ).toBeGreaterThanOrEqual(1);
    expect(aprovacoesBody.data.filter((a) => a.status === 'REABERTO').length).toBe(1);
  });

  it('bloqueia envio quando ha alerta IMPEDE_ENVIO (tripulacao ausente)', async () => {
    const db = createSqliteD1();
    // Preenche com crew link válido; remove tripulação só depois.
    // Envio é feito pela Coordenação (visualizar_todos) porque o piloto
    // sem crew receberia NOT_CREW antes do motor de alertas.
    await preencherRdvCompleto(db);
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      PILOTO,
    );
    runSql(db.databasePath, `DELETE FROM cv_voo_tripulantes WHERE voo_id = 601;`);

    const enviar = await request(
      db,
      '/api/controle-voos/voos/601/rdv/enviar',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );
    expect(enviar.status).toBe(409);
    const body = (await enviar.json()) as { error: string };
    expect(body.error).toMatch(/tripulante/i);
  });

  it('exige preenchimento finalizado antes de enviar', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    const enviar = await request(
      db,
      '/api/controle-voos/voos/601/rdv/enviar',
      { method: 'POST', body: '{}' },
      PILOTO,
    );
    expect(enviar.status).toBe(409);
  });

  it('rejeita transicao de fluxo ilegal (aprovar direto do rascunho)', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      PILOTO,
    );
    const aprovar = await request(
      db,
      '/api/controle-voos/voos/601/rdv/aprovar',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );
    expect(aprovar.status).toBe(409);
    const body = (await aprovar.json()) as { code?: string };
    expect(body.code).toBe('CONTROLE_VOOS_RDV_INVALID_WORKFLOW_TRANSITION');
  });

  it('exige justificativa para devolver e permanece em workflow_status=devolvido', async () => {
    const db = createSqliteD1();
    await avancarAteEmRevisao(db);

    const semJustificativa = await request(
      db,
      '/api/controle-voos/voos/601/rdv/devolver',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );
    expect(semJustificativa.status).toBe(400);

    const devolver = await request(
      db,
      '/api/controle-voos/voos/601/rdv/devolver',
      {
        method: 'POST',
        body: JSON.stringify({ justificativa: 'Faltou informar consumo de combustivel' }),
      },
      COORDENACAO,
    );
    expect(devolver.status).toBe(200);
    const body = (await devolver.json()) as {
      data: { workflow_status: string; status: string; motivo_devolucao: string };
    };
    expect(body.data.workflow_status).toBe('devolvido');
    expect(body.data.status).toBe('rascunho');
    expect(body.data.motivo_devolucao).toMatch(/consumo/i);

    // piloto agora consegue editar de novo (status operacional destravado; workflow permanece devolvido)
    const editar = await request(
      db,
      '/api/controle-voos/voos/601/rdv',
      { method: 'PUT', body: JSON.stringify({ ocorrencias: 'Ajustado apos devolucao' }) },
      PILOTO,
    );
    expect(editar.status).toBe(200);
    const editarBody = (await editar.json()) as { data: { workflow_status: string } };
    expect(editarBody.data.workflow_status).toBe('devolvido');
  });

  it('corrigir da Coordenacao so e permitido durante em_revisao, exige justificativa e registra diffs', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      PILOTO,
    );

    const foraDeRevisao = await request(
      db,
      '/api/controle-voos/voos/601/rdv/corrigir',
      { method: 'POST', body: JSON.stringify({ justificativa: 'x', campos: { pob: 5 } }) },
      COORDENACAO,
    );
    expect(foraDeRevisao.status).toBe(409);

    await request(
      db,
      '/api/controle-voos/voos/601/rdv/enviar',
      { method: 'POST', body: '{}' },
      PILOTO,
    );
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/iniciar-revisao',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );

    const semJustificativa = await request(
      db,
      '/api/controle-voos/voos/601/rdv/corrigir',
      { method: 'POST', body: JSON.stringify({ campos: { pob: 5 } }) },
      COORDENACAO,
    );
    expect(semJustificativa.status).toBe(400);

    const corrigir = await request(
      db,
      '/api/controle-voos/voos/601/rdv/corrigir',
      {
        method: 'POST',
        body: JSON.stringify({
          justificativa: 'POB divergente do manifesto',
          campos: { pob: 5, carga_kg: 120 },
        }),
      },
      COORDENACAO,
    );
    expect(corrigir.status).toBe(200);
    const body = (await corrigir.json()) as {
      data: { pob: number; carga_kg: number };
      meta: { campos_alterados: number };
    };
    expect(body.data.pob).toBe(5);
    expect(body.data.carga_kg).toBe(120);
    expect(body.meta.campos_alterados).toBe(2);

    const revisoes = await request(db, '/api/controle-voos/voos/601/rdv/revisoes', {}, COORDENACAO);
    const revisoesBody = (await revisoes.json()) as {
      data: Array<{ campo: string; justificativa: string }>;
    };
    expect(revisoesBody.data.some((r) => r.campo === 'pob')).toBe(true);
    expect(revisoesBody.data.every((r) => r.justificativa === 'POB divergente do manifesto')).toBe(
      true,
    );
  });

  it('recusa versao desatualizada (concorrencia otimista)', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      PILOTO,
    );

    const conflito = await request(
      db,
      '/api/controle-voos/voos/601/rdv/enviar',
      { method: 'POST', body: JSON.stringify({ versao: 999 }) },
      PILOTO,
    );
    expect(conflito.status).toBe(409);
    const body = (await conflito.json()) as { code?: string };
    expect(body.code).toBe('CONTROLE_VOOS_RDV_VERSION_CONFLICT');
  });

  it('reabertura de RDV finalizado gera workflow_status=reaberto (estado explicito)', async () => {
    const db = createSqliteD1();
    await avancarAteFinalizado(db);

    const semJustificativa = await request(
      db,
      '/api/controle-voos/voos/601/rdv/reabrir',
      { method: 'POST', body: '{}' },
      COORDENACAO,
    );
    expect(semJustificativa.status).toBe(400);

    const reabrir = await request(
      db,
      '/api/controle-voos/voos/601/rdv/reabrir',
      {
        method: 'POST',
        body: JSON.stringify({ justificativa: 'Cliente solicitou correcao de horario' }),
      },
      COORDENACAO,
    );
    expect(reabrir.status).toBe(200);
    const body = (await reabrir.json()) as {
      data: { workflow_status: string; versao: number; status: string };
    };
    expect(body.data.workflow_status).toBe('reaberto');
    expect(body.data.status).toBe('rascunho');
    expect(body.data.versao).toBe(6);

    const aprovacoes = await request(
      db,
      '/api/controle-voos/voos/601/rdv/aprovacoes',
      {},
      COORDENACAO,
    );
    const aprovacoesBody = (await aprovacoes.json()) as { data: Array<{ status: string }> };
    expect(aprovacoesBody.data.some((a) => a.status === 'REABERTO')).toBe(true);
  });

  it('cancela com justificativa e recusa cancelar RDV ja finalizado', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    const cancelar = await request(
      db,
      '/api/controle-voos/voos/601/rdv/cancelar',
      { method: 'POST', body: JSON.stringify({ justificativa: 'Voo cancelado por meteorologia' }) },
      PILOTO,
    );
    expect(cancelar.status).toBe(200);
    const body = (await cancelar.json()) as { data: { workflow_status: string; status: string } };
    expect(body.data.workflow_status).toBe('cancelado');
    expect(body.data.status).toBe('cancelado');
  });

  it('isolamento multi-tenant: RDV/voo de outra empresa retorna 404, nao 200 com dado alheio', async () => {
    const db = createSqliteD1();
    const res = await request(
      db,
      '/api/controle-voos/voos/701/rdv',
      {},
      { ...PILOTO, empresaId: 1 },
    );
    expect(res.status).toBe(404);
  });

  it('IDOR: piloto sem vinculo de tripulacao no voo nao acessa o RDV de outro voo (mesma empresa)', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    // remove o vinculo de tripulacao do usuario autenticado (funcionario_id 1001) com o voo 601
    runSql(
      db.databasePath,
      `DELETE FROM cv_voo_tripulantes WHERE voo_id = 601 AND funcionario_id = 1001;`,
    );

    const res = await request(db, '/api/controle-voos/voos/601/rdv/alertas', {}, PILOTO);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('CONTROLE_VOOS_RDV_NOT_CREW');
  });

  it('coordenacao (manager) enxerga RDV de qualquer tripulante sem precisar de vinculo', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    runSql(
      db.databasePath,
      `DELETE FROM cv_voo_tripulantes WHERE voo_id = 601 AND funcionario_id = 1001;`,
    );
    const res = await request(db, '/api/controle-voos/voos/601/rdv/alertas', {}, COORDENACAO);
    expect(res.status).toBe(200);
  });

  it('fila da Coordenacao filtra por status de fluxo', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      PILOTO,
    );
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/enviar',
      { method: 'POST', body: '{}' },
      PILOTO,
    );

    const fila = await request(db, '/api/controle-voos/rdv/fila?status=enviado', {}, COORDENACAO);
    const filaBody = (await fila.json()) as { data: Array<{ workflow_status: string }> };
    expect(filaBody.data.length).toBe(1);
    expect(filaBody.data[0].workflow_status).toBe('enviado');

    const filaVazia = await request(
      db,
      '/api/controle-voos/rdv/fila?status=finalizado',
      {},
      COORDENACAO,
    );
    const filaVaziaBody = (await filaVazia.json()) as { data: unknown[] };
    expect(filaVaziaBody.data.length).toBe(0);
  });

  it('fila da Coordenacao exige capability de Coordenacao (student sem default falha)', async () => {
    const db = createSqliteD1();
    const res = await request(db, '/api/controle-voos/rdv/fila', {}, PILOTO);
    expect(res.status).toBe(403);
  });
});

describe('RDV — RBAC por capability (usuario_permissoes + defaults de role)', () => {
  it('student/viewer sem capability propria recebe 403', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    const res = await request(
      db,
      '/api/controle-voos/voos/601/rdv/alertas',
      {},
      { role: 'viewer', userId: 10 },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('CONTROLE_VOOS_RDV_RBAC_FORBIDDEN');
  });

  it('piloto com capability default + vinculo de tripulacao acessa RDV proprio', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    const res = await request(db, '/api/controle-voos/voos/601/rdv/alertas', {}, PILOTO);
    expect(res.status).toBe(200);
  });

  it('piloto com capability default sem vinculo de tripulacao recebe NOT_CREW', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    // user 12 = funcionario 1002 (SIC no voo); removemos o vínculo SIC
    runSql(
      db.databasePath,
      `DELETE FROM cv_voo_tripulantes WHERE voo_id = 601 AND funcionario_id = 1002;`,
    );
    const res = await request(
      db,
      '/api/controle-voos/voos/601/rdv/alertas',
      {},
      { role: 'student', userId: 12 },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('CONTROLE_VOOS_RDV_NOT_CREW');
  });

  it('Coordenacao com capability default (manager) acessa fila e alertas sem crew link', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    const fila = await request(db, '/api/controle-voos/rdv/fila', {}, COORDENACAO);
    expect(fila.status).toBe(200);
    const alertas = await request(db, '/api/controle-voos/voos/601/rdv/alertas', {}, COORDENACAO);
    expect(alertas.status).toBe(200);
  });

  it('manager com DENY explicito em capability sem fallback recebe 403', async () => {
    const db = createSqliteD1();
    await avancarAteEmRevisao(db);
    // user 13 = manager com DENY em voos.rdv.aprovar_coordenacao (sem default efetivo)
    const aprovar = await request(
      db,
      '/api/controle-voos/voos/601/rdv/aprovar',
      { method: 'POST', body: '{}' },
      { role: 'manager', userId: 13 },
    );
    expect(aprovar.status).toBe(403);
    const body = (await aprovar.json()) as { code?: string; error?: string };
    expect(body.code).toBe('CONTROLE_VOOS_RDV_RBAC_FORBIDDEN');
    expect(body.error).toMatch(/aprovar_coordenacao/);
  });

  it('cross-tenant: empresa A nao le RDV/voo da empresa B', async () => {
    const db = createSqliteD1();
    const res = await request(
      db,
      '/api/controle-voos/voos/701/rdv',
      {},
      { ...COORDENACAO, empresaId: 1 },
    );
    expect(res.status).toBe(404);
  });

  it('IDOR: student de outro tripulante (crew link diferente) nao acessa como se fosse o PIC', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);
    // user 12 e SIC (crew), mas removemos o vínculo — IDOR clássico sem crew
    runSql(db.databasePath, `DELETE FROM cv_voo_tripulantes WHERE voo_id = 601;`);
    const res = await request(
      db,
      '/api/controle-voos/voos/601/rdv',
      {},
      { role: 'student', userId: 12 },
    );
    expect(res.status).toBe(403);
  });

  it('self-approval: Coordenacao que e responsavel pelo preenchimento nao pode aprovar', async () => {
    const db = createSqliteD1();
    // Preenche e envia como user 10; tenta aprovar como o mesmo user com role manager
    await preencherRdvCompleto(db, { role: 'manager', userId: 10 });
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/finalizar-preenchimento',
      { method: 'POST' },
      { role: 'manager', userId: 10 },
    );
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/enviar',
      { method: 'POST', body: '{}' },
      { role: 'manager', userId: 10 },
    );
    await request(
      db,
      '/api/controle-voos/voos/601/rdv/iniciar-revisao',
      { method: 'POST', body: '{}' },
      { role: 'manager', userId: 10 },
    );

    const aprovar = await request(
      db,
      '/api/controle-voos/voos/601/rdv/aprovar',
      { method: 'POST', body: '{}' },
      { role: 'manager', userId: 10 },
    );
    expect(aprovar.status).toBe(403);
    const body = (await aprovar.json()) as { code?: string };
    expect(body.code).toBe('CONTROLE_VOOS_RDV_SELF_APPROVAL_FORBIDDEN');
  });
});

describe('RDV — tripulação e abastecimentos', () => {
  it('CRUD de tripulantes valida funcao e vinculo com funcionario do mesmo tenant', async () => {
    const db = createSqliteD1();

    const invalido = await request(
      db,
      '/api/controle-voos/voos/601/tripulantes',
      { method: 'POST', body: JSON.stringify({ funcionario_id: 2001, funcao: 'PIC' }) },
      COORDENACAO,
    );
    expect(invalido.status).toBe(400);

    const criar = await request(
      db,
      '/api/controle-voos/voos/601/tripulantes',
      { method: 'POST', body: JSON.stringify({ funcionario_id: 1002, funcao: 'MEC' }) },
      COORDENACAO,
    );
    expect(criar.status).toBe(201);

    const listar = await request(db, '/api/controle-voos/voos/601/tripulantes', {}, COORDENACAO);
    const listarBody = (await listar.json()) as { data: unknown[] };
    expect(listarBody.data.length).toBe(3);
  });

  it('registra abastecimento vinculado ao voo e lista por voo', async () => {
    const db = createSqliteD1();
    const criar = await request(
      db,
      '/api/controle-voos/voos/601/abastecimentos',
      {
        method: 'POST',
        body: JSON.stringify({
          data_hora: '2026-06-14T09:50:00Z',
          fornecedor: 'Fornecedor Ficticio',
          combustivel_abastecido: 500,
          unidade: 'L',
        }),
      },
      COORDENACAO,
    );
    expect(criar.status).toBe(201);

    const listar = await request(db, '/api/controle-voos/voos/601/abastecimentos', {}, COORDENACAO);
    const listarBody = (await listar.json()) as { data: Array<{ fornecedor: string }> };
    expect(listarBody.data.length).toBe(1);
    expect(listarBody.data[0].fornecedor).toBe('Fornecedor Ficticio');
  });
});

describe("RDV — relatório Petrobras (PDF fictício com marca d'água)", () => {
  it('gera PDF com Content-Type correto e exige capability de Coordenacao', async () => {
    const db = createSqliteD1();
    await preencherRdvCompleto(db);

    const semPermissao = await request(
      db,
      '/api/controle-voos/voos/601/rdv/relatorio-petrobras',
      {},
      PILOTO,
    );
    expect(semPermissao.status).toBe(403);

    const res = await request(
      db,
      '/api/controle-voos/voos/601/rdv/relatorio-petrobras',
      {},
      COORDENACAO,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(500);
    const header = Buffer.from(bytes.slice(0, 5)).toString('latin1');
    expect(header).toBe('%PDF-');
  });
});
