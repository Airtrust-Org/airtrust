import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import type { Env } from '../../types';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => any;
};

const authState = vi.hoisted(() => ({
  userId: 101,
  empresaId: 6,
  userRole: 'GESTOR',
  canonicalTenantRole: 'gestor',
  funcionarioId: 1001,
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', authState.userId);
    c.set('empresaId', authState.empresaId);
    c.set('userRole', authState.userRole);
    c.set('canonicalTenantRole', authState.canonicalTenantRole);
    c.set('funcionarioId', authState.funcionarioId);
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

const { default: router } = await import('../../routes/me-operational-access');

function wrapSqliteAsD1(sqlite: any) {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          binds = args;
          return stmt;
        },
        async first<T = unknown>() {
          return (sqlite.prepare(sql).get(...binds) as T | undefined) ?? null;
        },
        async all<T = unknown>() {
          return { results: sqlite.prepare(sql).all(...binds) as T[] };
        },
        async run() {
          const info = sqlite.prepare(sql).run(...binds);
          return { success: true, meta: { changes: info.changes } };
        },
      };
      return stmt;
    },
  };
}

function createTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE empresas (
      id INTEGER PRIMARY KEY,
      nome TEXT,
      operational_domain_rbac_enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE setores (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      dominio_codigo TEXT,
      ativo INTEGER DEFAULT 1,
      deleted_at TEXT
    );
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      cargo TEXT,
      funcao TEXT,
      setor_id INTEGER,
      ativo INTEGER DEFAULT 1,
      status TEXT DEFAULT 'ATIVO',
      deleted_at TEXT
    );
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER,
      funcionario_id INTEGER,
      role TEXT,
      deleted_at TEXT
    );
    CREATE TABLE usuarios_empresas (
      usuario_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      ativo INTEGER DEFAULT 1
    );
    CREATE TABLE setores_gestores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      setor_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      ativo INTEGER DEFAULT 1,
      deleted_at TEXT
    );
    CREATE TABLE operational_domain_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      dominio_codigo TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      deleted_at TEXT
    );
    CREATE TABLE user_permission_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      permission_key TEXT NOT NULL,
      effect TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE frms_fadiga_checkin (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      data_checkin TEXT NOT NULL,
      hora_checkin TEXT,
      kss_score INTEGER,
      horas_sono REAL,
      qualidade_sono INTEGER,
      sintomas_json TEXT,
      observacoes TEXT,
      score_fadiga INTEGER,
      nivel_fadiga TEXT,
      status_operacional TEXT,
      recomendacao TEXT,
      apto INTEGER,
      requires_frat_review INTEGER,
      frat_sugerido_nivel TEXT,
      associado_frat_avaliacao_id TEXT,
      jornada_inicio_prevista TEXT,
      jornada_fim_prevista TEXT,
      horas_acordado REAL,
      meds_ult_12h INTEGER,
      alcool_ult_12h INTEGER,
      risco_autoavaliado INTEGER,
      horas_sono_48h REAL,
      wake_time TEXT,
      subjective_fatigue_level INTEGER,
      sleepiness_level INTEGER,
      fit_for_duty INTEGER,
      computed_risk_level TEXT,
      requires_operational_review INTEGER,
      report_source TEXT,
      regulatory_profile_id TEXT,
      profile_code TEXT,
      config_revision_id TEXT,
      model_version TEXT,
      submitted_at TEXT,
      origem_registro TEXT,
      created_by INTEGER,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE frms_readiness_assessment (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      reference_date TEXT NOT NULL,
      classification TEXT NOT NULL,
      baseline_sessions INTEGER,
      baseline_ready INTEGER,
      median_rt_delta_pct REAL,
      lapse_rate_delta REAL,
      created_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE frms_fadiga_evento (
      id TEXT PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      checkin_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT
    );
    CREATE TABLE notificacoes_sistema (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      prioridade TEXT,
      titulo TEXT,
      mensagem TEXT,
      grupo TEXT,
      dados TEXT,
      empresa_id INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE dominios_operacionais (
      codigo TEXT PRIMARY KEY,
      nome TEXT,
      ativo INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id TEXT,
      usuario_nome TEXT,
      acao TEXT,
      tabela_afetada TEXT,
      registro_id TEXT,
      dados_antes TEXT,
      dados_depois TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE auditoria_avancada_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabela TEXT,
      acao TEXT,
      registro_id TEXT,
      dados_anteriores TEXT,
      dados_novos TEXT,
      usuario_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      origem TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  sqlite.exec(`
    INSERT INTO dominios_operacionais (codigo, nome, ativo) VALUES
      ('MANUTENCAO', 'Manutenção', 1),
      ('OPERACOES', 'Operações', 1),
      ('FRMS', 'FRMS', 1);

    INSERT INTO empresas (id, nome, operational_domain_rbac_enabled) VALUES
      (6, 'Costa do Sol', 1),
      (8, 'Inativa', 1);

    INSERT INTO setores (id, empresa_id, nome, dominio_codigo, ativo) VALUES
      (11, 6, 'Manutenção Linha A', 'MANUTENCAO', 1),
      (12, 6, 'Manutenção Hangar B', 'MANUTENCAO', 1),
      (13, 6, 'Operações de Voo', 'OPERACOES', 1),
      (81, 8, 'Manutenção Tenant 8', 'MANUTENCAO', 1);

    INSERT INTO funcionarios (id, empresa_id, nome, cargo, funcao, setor_id, ativo, status) VALUES
      (1001, 6, 'Gestor Manutencao A', 'Supervisor de Manutenção', 'MANUTENCAO', 11, 1, 'ATIVO'),
      (1002, 6, 'Mecanico Carlos', 'Mecânico de Aeronaves', 'MECANICO', 11, 1, 'ATIVO'),
      (1003, 6, 'Piloto Joao', 'Piloto Comandante', 'COMANDANTE', 11, 1, 'ATIVO'),
      (1004, 6, 'Inspetor Hangar B', 'Inspetor de Manutenção', 'INSPETOR', 12, 1, 'ATIVO'),
      (1005, 6, 'Gestor Operacoes', 'Coordenador de Voo', 'OPERACOES', 13, 1, 'ATIVO'),
      (8001, 8, 'Mecanico Tenant 8', 'Mecânico', 'MECANICO', 81, 1, 'ATIVO');

    INSERT INTO usuarios (id, empresa_id, funcionario_id, role) VALUES
      (101, 6, 1001, 'GESTOR'),
      (102, 6, 1002, 'TRIPULANTE'),
      (105, 6, 1005, 'GESTOR');

    INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, ativo) VALUES
      (101, 6, 'GESTOR', 1),
      (102, 6, 'TRIPULANTE', 1),
      (105, 6, 'GESTOR', 1);

    INSERT INTO setores_gestores (empresa_id, setor_id, usuario_id, ativo) VALUES
      (6, 11, 101, 1),
      (6, 13, 105, 1);

    INSERT INTO operational_domain_access (empresa_id, usuario_id, dominio_codigo, ativo) VALUES
      (6, 101, 'MANUTENCAO', 1),
      (6, 105, 'OPERACOES', 1);
  `);

  return sqlite;
}

describe('FRMS maintenance access, RBAC, tenant isolation & check-in propagation (SQLite)', () => {
  let sqlite: any;
  let env: Env;

  beforeEach(() => {
    sqlite = createTestDb();
    env = {
      DB: wrapSqliteAsD1(sqlite) as unknown as D1Database,
      ENVIRONMENT: 'production',
    } as Env;
  });

  it('permite gestor de manutenção apenas no seu setor e exclui tripulantes e outros tenants', async () => {
    authState.userId = 101;
    authState.empresaId = 6;
    authState.userRole = 'GESTOR';
    authState.canonicalTenantRole = 'gestor';
    authState.funcionarioId = 1001;

    const res = await router.request('/frms-maintenance-team?date=2026-11-13', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.meta.scope).toBe('maintenance');
    expect(body.data.meta.setor_ids).toEqual([11]);
    const names = body.data.items.map((item: any) => item.funcionario_nome);
    expect(names).toEqual(['Mecanico Carlos']);
  });

  it('nega 403 a gestor apenas de operações e a usuário comum sem grant de manutenção', async () => {
    authState.userId = 105;
    authState.empresaId = 6;
    authState.userRole = 'GESTOR';
    authState.canonicalTenantRole = 'gestor';
    authState.funcionarioId = 1005;

    const opRes = await router.request('/frms-maintenance-team?date=2026-11-13', { method: 'GET' }, env);
    expect(opRes.status).toBe(403);
    const opBody = (await opRes.json()) as any;
    expect(opBody.code).toBe('FRMS_MAINTENANCE_MANAGER_REQUIRED');

    authState.userId = 102;
    authState.userRole = 'TRIPULANTE';
    authState.canonicalTenantRole = 'tripulante';
    authState.funcionarioId = 1002;

    const crewRes = await router.request('/frms-maintenance-team?date=2026-11-13', { method: 'GET' }, env);
    expect(crewRes.status).toBe(403);
  });

  it('mecânico envia check-in, piloto é bloqueado (403) e equipe deduplica múltiplos registros na mesma data', async () => {
    // Piloto tentando enviar check-in de manutenção -> 403
    authState.userId = 105;
    authState.empresaId = 6;
    authState.userRole = 'GESTOR';
    authState.canonicalTenantRole = 'gestor';
    authState.funcionarioId = 1003;

    const deniedPost = await router.request(
      '/frms-maintenance-checkin',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2026-11-13',
          wake_time: '06:00',
          sleep_hours_24h: 8,
          sleep_quality: 4,
          kss_score: 2,
          fit_for_duty: true,
        }),
      },
      env,
    );
    expect(deniedPost.status).toBe(403);
    expect(((await deniedPost.json()) as any).code).toBe('FRMS_MAINTENANCE_CARGO_REQUIRED');

    // Mecânico envia check-in válido
    authState.userId = 102;
    authState.userRole = 'TRIPULANTE';
    authState.canonicalTenantRole = 'tripulante';
    authState.funcionarioId = 1002;

    const okPost = await router.request(
      '/frms-maintenance-checkin',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2026-11-13',
          wake_time: '05:30',
          sleep_hours_24h: 8,
          sleep_quality: 5,
          kss_score: 2,
          fit_for_duty: true,
        }),
      },
      env,
    );
    expect(okPost.status).toBe(200);

    // Inserir segundo registro de readiness para simular múltiplas linhas no mesmo dia
    sqlite.exec(`
      INSERT INTO frms_readiness_assessment (id, empresa_id, funcionario_id, reference_date, classification, baseline_sessions, baseline_ready, created_at)
      VALUES
        ('r-old', 6, 1002, '2026-11-13', 'baseline_building', 2, 0, '2026-11-13T06:00:00Z'),
        ('r-new', 6, 1002, '2026-11-13', 'preserved', 5, 1, '2026-11-13T07:00:00Z');
    `);

    // Gestor de manutenção consulta a equipe e deve ver 1 única linha atualizada (r-new)
    authState.userId = 101;
    authState.userRole = 'GESTOR';
    authState.canonicalTenantRole = 'gestor';
    authState.funcionarioId = 1001;

    const teamRes = await router.request('/frms-maintenance-team?date=2026-11-13', { method: 'GET' }, env);
    expect(teamRes.status).toBe(200);
    const teamBody = (await teamRes.json()) as any;
    expect(teamBody.data.items).toHaveLength(1);
    expect(teamBody.data.items[0].funcionario_id).toBe(1002);
    expect(teamBody.data.items[0].readiness_id).toBe('r-new');
    expect(teamBody.data.items[0].computed_risk_level).toBe('normal');
  });
});
