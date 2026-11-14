import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { syncTreinamentosPlanejadosForMonth } from '../../shared/syncEscalaEventosExternos';

let activeEmpresaId = 6;

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'admin');
    c.set('empresaId', activeEmpresaId);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
  requirePermission: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

import escalasCrud from '../../routes/escalas-crud';
import type { Env } from '../../types';

const opened: SqliteD1Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  activeEmpresaId = 6;
});

function createEscalasFixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE escalas_mensais (
      id TEXT PRIMARY KEY,
      mes INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      titulo TEXT,
      status TEXT NOT NULL DEFAULT 'rascunho',
      observacoes TEXT,
      periodo TEXT DEFAULT 'personalizada',
      empresa_id INTEGER,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE TABLE escala_eventos (
      id TEXT PRIMARY KEY,
      escala_id TEXT NOT NULL,
      tripulacao_id TEXT,
      funcionario_id TEXT NOT NULL,
      tipo_evento TEXT NOT NULL,
      data_inicio TEXT NOT NULL,
      data_fim TEXT NOT NULL,
      turno TEXT DEFAULT 'dia_todo',
      local TEXT,
      aeronave TEXT,
      simulador_id TEXT,
      certificacao_id TEXT,
      gerado_automaticamente INTEGER DEFAULT 0,
      motivo_automatico TEXT,
      status TEXT DEFAULT 'confirmado',
      observacoes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      origem TEXT DEFAULT 'manual',
      alocacao_id TEXT
    );
    CREATE TABLE funcionario_ferias (
      id TEXT PRIMARY KEY,
      funcionario_id INTEGER NOT NULL,
      data_inicio TEXT NOT NULL,
      data_fim TEXT NOT NULL,
      tipo TEXT,
      observacoes TEXT,
      criado_por TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS funcionarios (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE treinamentos_planejados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER NOT NULL,
      data_prevista TEXT NOT NULL,
      data_inicio TEXT,
      data_fim TEXT,
      status TEXT NOT NULL DEFAULT 'PLANEJADO',
      instrutor_id INTEGER,
      titulo TEXT,
      codigo_turma TEXT,
      created_by INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE treinamentos_participantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treinamento_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      status_participacao TEXT NOT NULL DEFAULT 'MATRICULADO'
    );
    CREATE TABLE treinamentos_dias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      treinamento_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ATIVO',
      deleted_at TEXT
    );
    CREATE TABLE treinamentos_instrutores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      treinamento_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabela TEXT,
      registro_id TEXT,
      acao TEXT,
      usuario_id TEXT,
      dados_anteriores TEXT,
      dados_novos TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function createApp(db: SqliteD1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db as unknown as D1Database, ENVIRONMENT: 'test' } as unknown as Env;
    await next();
  });
  app.route('/', escalasCrud);
  return app;
}

describe('Escalas CRUD — reconciliação idempotente de turmas planejadas (#2209)', () => {
  it('materializa dias efetivos e fallback range na criação da escala, isolando tenant e mantendo idempotência', async () => {
    const db = createEscalasFixture();
    // Tenant 6 training #30 with 2 effective days in 2027-04 and 1 canceled day
    db.database.exec(`
      INSERT INTO treinamentos_planejados (id, empresa_id, qualificacao_tipo_id, data_prevista, data_inicio, data_fim, status, instrutor_id, titulo, codigo_turma, created_by)
      VALUES
        (30, 6, 1, '2027-04-06', '2027-04-06', '2027-04-09', 'PLANEJADO', 90, 'Plano ANAC AW-S02', 'AW-S02', 1),
        (31, 6, 1, '2027-04-15', '2027-04-15', '2027-04-16', 'CONFIRMADO', NULL, 'Solo sem dias', 'SOLO-01', 1),
        (32, 6, 1, '2027-04-20', '2027-04-20', '2027-04-20', 'CANCELADO', NULL, 'Cancelada', 'CAN-01', 1),
        (99, 77, 1, '2027-04-06', '2027-04-06', '2027-04-07', 'PLANEJADO', NULL, 'Outro Tenant', 'EXT-01', 1);

      INSERT INTO treinamentos_participantes (treinamento_id, funcionario_id, status_participacao) VALUES
        (30, 10, 'MATRICULADO'),
        (30, 11, 'CANCELADO'),
        (31, 12, 'MATRICULADO'),
        (32, 13, 'MATRICULADO'),
        (99, 500, 'MATRICULADO');

      INSERT INTO treinamentos_instrutores (empresa_id, treinamento_id, funcionario_id) VALUES
        (6, 30, 91),
        (6, 30, 90);

      INSERT INTO treinamentos_dias (empresa_id, treinamento_id, data, status) VALUES
        (6, 30, '2027-04-06', 'ATIVO'),
        (6, 30, '2027-04-08', 'ATIVO'),
        (6, 30, '2027-04-09', 'CANCELADO');
    `);

    const app = createApp(db);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes: 4, ano: 2027, titulo: 'Abril 2027' }),
    });
    expect(res.status).toBe(201);

    const events = db.database
      .prepare('SELECT * FROM escala_eventos WHERE deleted_at IS NULL ORDER BY tripulacao_id, funcionario_id, data_inicio')
      .all() as Array<Record<string, unknown>>;

    // Training 30: participant 10 + instructors 90, 91 (3 people) × 2 active days = 6 events (status pendente)
    // Training 31: participant 12 × 1 segment (2027-04-15..16) = 1 event (status confirmado)
    // Training 32 (CANCELADO), participant 11 (CANCELADO), and tenant 77 (#99) MUST NOT appear.
    expect(events).toHaveLength(7);
    expect(events.filter((e) => e.tripulacao_id === 'treinamento:30')).toHaveLength(6);
    expect(events.every((e) => e.tripulacao_id !== 'treinamento:99')).toBe(true);
    expect(events.every((e) => e.tripulacao_id !== 'treinamento:32')).toBe(true);
    expect(events.every((e) => e.funcionario_id !== '11')).toBe(true);
    const confirmedRow = events.find((e) => e.tripulacao_id === 'treinamento:31');
    expect(confirmedRow).toMatchObject({
      funcionario_id: '12',
      data_inicio: '2027-04-15',
      data_fim: '2027-04-16',
      status: 'confirmado',
      origem: 'treinamento',
    });

    // Idempotent second call must insert 0 rows and leave all 7 rows intact
    const insertedAgain = await syncTreinamentosPlanejadosForMonth({
      db: db as unknown as D1Database,
      empresaId: 6,
      ano: 2027,
      mes: 4,
    });
    expect(insertedAgain).toBe(0);
    expect(
      (db.database.prepare('SELECT COUNT(*) AS c FROM escala_eventos WHERE deleted_at IS NULL').get() as { c: number }).c,
    ).toBe(7);
  });

  it('POST /gerar-ano reconcilia meses retroativos/futuros e repetição preserva eventos confirmados/editados e conflitos sem soft-delete', async () => {
    const db = createEscalasFixture();
    // Month 1 already exists with an edited/confirmed event for training 40 AND a pre-existing confirmed voo conflict
    db.database.exec(`
      INSERT INTO escalas_mensais (id, mes, ano, titulo, status, empresa_id, created_by)
      VALUES ('esc-jan-2027', 1, 2027, 'Janeiro 2027', 'aprovada', 6, '1');

      INSERT INTO escala_eventos (id, escala_id, tripulacao_id, funcionario_id, tipo_evento, data_inicio, data_fim, turno, status, observacoes, origem, created_by)
      VALUES
        ('evt-edited-keep', 'esc-jan-2027', 'treinamento:40', '20', 'treinamento_solo', '2027-01-20', '2027-01-20', 'manha', 'confirmado', 'Editado manualmente', 'treinamento', '1'),
        ('evt-conflict-voo', 'esc-jan-2027', NULL, '21', 'voo', '2027-01-20', '2027-01-20', 'dia_todo', 'confirmado', 'Voo offshore confirmado', 'manual', '1');

      INSERT INTO treinamentos_planejados (id, empresa_id, qualificacao_tipo_id, data_prevista, data_inicio, data_fim, status, titulo, codigo_turma, created_by)
      VALUES
        (40, 6, 1, '2027-01-20', '2027-01-20', '2027-01-21', 'PLANEJADO', 'Plano S76-S02', 'S76-S02', 1),
        (41, 6, 1, '2027-08-18', '2027-08-18', '2027-08-19', 'PLANEJADO', 'Plano S76-S07', 'S76-S07', 1);

      INSERT INTO treinamentos_participantes (treinamento_id, funcionario_id, status_participacao) VALUES
        (40, 20, 'MATRICULADO'),
        (40, 21, 'MATRICULADO'),
        (41, 20, 'MATRICULADO');

      INSERT INTO treinamentos_dias (empresa_id, treinamento_id, data, status) VALUES
        (6, 40, '2027-01-20', 'ATIVO'),
        (6, 40, '2027-01-21', 'ATIVO'),
        (6, 41, '2027-08-18', 'ATIVO');
    `);

    const app = createApp(db);
    const res1 = await app.request('/gerar-ano', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ano: 2027 }),
    });
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { success: boolean; data: { criados: number } };
    expect(body1.data.criados).toBe(11);

    // Repeating gerar-ano is strictly idempotent
    const res2 = await app.request('/gerar-ano', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ano: 2027 }),
    });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { success: boolean; data: { criados: number } };
    expect(body2.data.criados).toBe(0);

    // No soft-deletes were performed
    expect(
      (db.database.prepare('SELECT COUNT(*) AS c FROM escala_eventos WHERE deleted_at IS NOT NULL').get() as { c: number }).c,
    ).toBe(0);

    // Manually edited/confirmed training event was preserved verbatim
    const preserved = db.database
      .prepare('SELECT turno, status, observacoes FROM escala_eventos WHERE id = ?')
      .get('evt-edited-keep') as { turno: string; status: string; observacoes: string };
    expect(preserved).toEqual({
      turno: 'manha',
      status: 'confirmado',
      observacoes: 'Editado manualmente',
    });

    // Confirmed conflicting voo event preserved AND missing day/participant added (4 events total for Jan + 1 for Aug + 1 voo = 6 rows)
    const janTrainingRows = db.database
      .prepare("SELECT funcionario_id, data_inicio FROM escala_eventos WHERE escala_id = 'esc-jan-2027' AND origem = 'treinamento' AND deleted_at IS NULL")
      .all() as Array<{ funcionario_id: string; data_inicio: string }>;
    expect(janTrainingRows).toHaveLength(4); // (20 on 20th preserved + 21st added) + (21 on 20th & 21st added)

    const augTrainingRows = db.database
      .prepare("SELECT funcionario_id, data_inicio FROM escala_eventos WHERE tripulacao_id = 'treinamento:41' AND deleted_at IS NULL")
      .all() as Array<{ funcionario_id: string; data_inicio: string }>;
    expect(augTrainingRows).toHaveLength(1);
    expect(augTrainingRows[0]).toEqual({ funcionario_id: '20', data_inicio: '2027-08-18' });
  });
});
