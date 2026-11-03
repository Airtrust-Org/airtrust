import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { createSessoesUpdateSchema } from '../helpers/simuladores-sessoes-update-fixture';

// Caracterização da fase "dispositivo + horário + conflito + modelo + UPDATE" do
// PUT /sessoes/:id (SQLite real). Depois do UPDATE o handler segue para o planejamento
// de qualificações e outras fases fora desta fixture, então nos casos de sucesso vale o
// estado do banco; as respostas antecipadas (400/409) são asserdas por completo.

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 'user-1');
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));
vi.mock('../../middleware/operational-domain-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/operational-domain-access')>()),
  requireOperationalAccess: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

import sessoesUpdateApp from '../../routes/simuladores-sessoes-update';

let sqlite: SqliteD1Database;
let app: Hono<AppEnv>;

async function put(id: number, body: Record<string, unknown>) {
  const res = await app.request(
    `/sessoes/${id}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { DB: sqlite.asD1() } as unknown as Env,
  );
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

function rows<T = Record<string, any>>(sql: string, ...args: unknown[]): T[] {
  return sqlite.database.prepare(sql).all(...(args as never[])) as T[];
}

const sessao = (id: number) => rows('SELECT * FROM simulador_agendamentos WHERE id = ?', id)[0];

beforeEach(() => {
  sqlite = new SqliteD1Database();
  createSessoesUpdateSchema(sqlite);
  // outra sessão do mesmo simulador/dia (para conflitos) e uma sem horário
  sqlite.database.exec(`
    INSERT INTO simulador_agendamentos (id, empresa_id, simulador_id, data, hora_inicio, hora_fim, status, nome, tipo_sessao)
    VALUES (40, 1, 1, '2026-05-10', '10:00', '12:00', 'AGENDADA', 'Vizinha', 'PERIODICO'),
           (41, 1, 1, '2026-05-13', NULL, NULL, 'AGENDADA', 'Sem horário', 'PERIODICO');
  `);
  app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('tenantContext', {
      empresaId: 1,
      role: 'admin',
      empresaCodigo: 'T',
      empresaNome: 'T',
      plano: 'pro',
      permissions: [],
    });
    await next();
  });
  app.route('/', sessoesUpdateApp);
});

afterEach(() => sqlite.close());

describe('PUT /sessoes/:id — validação de horário', () => {
  it('400 quando início ou fim faltam (na sessão e no corpo)', async () => {
    const r = await put(41, {});
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ success: false, error: 'Horário de início e fim são obrigatórios' });
    const soInicio = await put(41, { horario_inicio: '08:00' });
    expect(soInicio.status).toBe(400);
    expect(soInicio.json.error).toBe('Horário de início e fim são obrigatórios');
    expect(sessao(41).hora_inicio).toBeNull();
  });

  it('400 para horário fora do formato HH:MM ou inexistente', async () => {
    for (const horario_inicio of ['xx:yy', '8:00', '25:00', '08:60']) {
      const r = await put(10, { horario_inicio });
      expect(r.status).toBe(400);
      expect(r.json).toEqual({ success: false, error: 'Horários inválidos (use HH:MM)' });
    }
    expect(sessao(10)).toMatchObject({ hora_inicio: '08:00', hora_fim: '10:00' });
  });

  it('400 quando início e fim são iguais', async () => {
    const r = await put(10, { horario_inicio: '09:00', horario_fim: '09:00' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({
      success: false,
      error: 'Horário final deve ser diferente do horário inicial',
    });
    expect(sessao(10).hora_inicio).toBe('08:00');
  });
});

describe('PUT /sessoes/:id — conflito de agendamento', () => {
  it('409 SCHEDULE_CONFLICT quando sobrepõe outra sessão do mesmo simulador e dia', async () => {
    const r = await put(10, { horario_inicio: '09:00', horario_fim: '11:00' });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({
      success: false,
      code: 'SCHEDULE_CONFLICT',
      error: 'Conflito de agendamento: já existe uma sessão neste simulador de 10:00 a 12:00. Escolha outro horário.',
    });
    expect(sessao(10)).toMatchObject({ hora_inicio: '08:00', hora_fim: '10:00' });
  });

  it('não conflita com horário adjacente, nem com a própria sessão, nem em outro dia/simulador', async () => {
    // adjacente: 10:00 termina quando a vizinha (10:00) começa? 08:00-10:00 vs 10:00-12:00
    for (const body of [
      { horario_inicio: '08:00', horario_fim: '10:00' }, // a própria sessão (excludeId)
      { horario_inicio: '07:00', horario_fim: '10:00' }, // termina exatamente quando a vizinha começa
      { data: '2026-05-20' }, // outro dia
    ]) {
      const r = await put(10, body);
      expect(r.status).not.toBe(409);
    }
    expect(sessao(10).data).toBe('2026-05-20');
  });

  it('dispositivo AERONAVE não passa pela checagem de conflito', async () => {
    const r = await put(10, {
      tipo_dispositivo: 'AERONAVE',
      aeronave_id: 5,
      horario_inicio: '09:00',
      horario_fim: '11:00',
    });
    expect(r.status).not.toBe(409);
    expect(sessao(10)).toMatchObject({
      tipo_dispositivo: 'AERONAVE',
      aeronave_id: 5,
      hora_inicio: '09:00',
      hora_fim: '11:00',
    });
  });

  it('uma sessão já AERONAVE continua AERONAVE mesmo sem o campo no corpo', async () => {
    sqlite.database.exec(`UPDATE simulador_agendamentos SET tipo_dispositivo = 'AERONAVE' WHERE id = 10`);
    const r = await put(10, { horario_inicio: '09:00', horario_fim: '11:00' });
    expect(r.status).not.toBe(409);
    expect(sessao(10).tipo_dispositivo).toBe('AERONAVE');
  });
});

describe('PUT /sessoes/:id — UPDATE da sessão', () => {
  it('mantém o que não veio no corpo e grava updated_at', async () => {
    await put(10, { observacoes: 'novo' });
    expect(sessao(10)).toMatchObject({
      simulador_id: 1,
      aeronave_id: null,
      tipo_dispositivo: 'SIMULADOR',
      data: '2026-05-10',
      hora_inicio: '08:00',
      hora_fim: '10:00',
      instrutor_id: 100,
      tipo_sessao: 'PERIODICO',
      status: 'AGENDADA',
      nome: 'Sessão A',
      observacoes: 'novo',
    });
    expect(sessao(10).updated_at).not.toBeNull();
  });

  it('aplica os campos enviados (data/tipo/status por "||", demais por "!== undefined")', async () => {
    await put(10, {
      data: '2026-06-01',
      tipo_sessao: 'INICIAL',
      status: 'CONFIRMADA',
      tema_sessao: 'Novo tema',
      duracao_minutos: 120,
      horario_inicio: '13:00',
      horario_fim: '15:00',
    });
    expect(sessao(10)).toMatchObject({
      data: '2026-06-01',
      tipo_sessao: 'INICIAL',
      status: 'CONFIRMADA',
      nome: 'Novo tema',
      duracao_minutos: 120,
      hora_inicio: '13:00',
      hora_fim: '15:00',
    });
  });

  it('valores vazios em data/tipo/status voltam ao anterior; observacoes aceita null/vazio', async () => {
    sqlite.database.exec(`UPDATE simulador_agendamentos SET observacoes = 'antiga' WHERE id = 10`);
    await put(10, { data: '', tipo_sessao: '', status: '', observacoes: null });
    expect(sessao(10)).toMatchObject({
      data: '2026-05-10',
      tipo_sessao: 'PERIODICO',
      status: 'AGENDADA',
      observacoes: null,
    });
  });

  it('resolve o modelo: template_id/modelo_sessao_id do tenant, ou pelo nome do tema', async () => {
    // a resolução por nome exige o mesmo código de tipo de sessão e o modelo de aeronave do simulador
    sqlite.database.exec(`
      INSERT INTO tipos_sessao (id, empresa_id, codigo) VALUES (1, 1, 'PERIODICO');
      INSERT INTO modelos_sessao (id, empresa_id, codigo, nome, tipo_sessao_id, modelo_aeronave)
      VALUES (90, 1, 'M90', 'Tema Conhecido', 1, 'AW139');
    `);

    await put(10, { template_id: 77 });
    expect(sessao(10).template_id).toBe(77);

    await put(10, { modelo_sessao_id: 90 });
    expect(sessao(10).template_id).toBe(90);

    // id de outro tenant cai para a resolução por nome; sem nome conhecido vira null
    await put(10, { template_id: 88, tema_sessao: 'Sem modelo com esse nome' });
    expect(sessao(10).template_id).toBeNull();

    await put(10, { template_id: 88, tema_sessao: 'Tema Conhecido' });
    expect(sessao(10).template_id).toBe(90);

    // sem template no corpo, a sessão herda o template atual (se ainda válido no tenant)
    sqlite.database.exec(`UPDATE simulador_agendamentos SET template_id = 77 WHERE id = 10`);
    await put(10, { observacoes: 'x' });
    expect(sessao(10).template_id).toBe(77);
  });

  it('sem as colunas tipo_dispositivo/aeronave_id usa o UPDATE legado (simulador_id com "||")', async () => {
    sqlite.database.exec(`
      ALTER TABLE simulador_agendamentos DROP COLUMN tipo_dispositivo;
      ALTER TABLE simulador_agendamentos DROP COLUMN aeronave_id;
    `);
    await put(10, { simulador_id: 0, observacoes: 'legado', horario_inicio: '13:00', horario_fim: '14:00' });
    expect(sessao(10)).toMatchObject({ simulador_id: 1, observacoes: 'legado', hora_inicio: '13:00' });
    expect('tipo_dispositivo' in sessao(10)).toBe(false);
  });

  it('não altera sessão de outro tenant', async () => {
    const r = await put(20, { observacoes: 'invasao' });
    expect(r.status).toBe(404);
    expect(sessao(20).observacoes).toBeNull();
  });
});

describe('PUT /sessoes/:id — data das qualificações planejadas', () => {
  function seedHistorico() {
    sqlite.database.exec(`
      INSERT INTO qualificacoes_historico (id, funcionario_id, status, data_conclusao, empresa_id, sessao_id)
      VALUES (1, 1000, 'PLANEJADA', '2026-05-10', 1, 10),
             (2, 1000, 'VALIDA', '2026-05-10', 1, 10),
             (3, 1000, 'PLANEJADA', '2026-05-10', 1, 11),
             (4, 1000, 'PLANEJADA', '2026-05-10', 1, 10);
      UPDATE qualificacoes_historico SET deleted_at = '2026-01-01' WHERE id = 4;
    `);
  }
  const data = (id: number) =>
    rows<{ data_conclusao: string }>('SELECT data_conclusao FROM qualificacoes_historico WHERE id = ?', id)[0]
      .data_conclusao;

  it('quando a data muda, só as PLANEJADAS vivas da sessão acompanham', async () => {
    seedHistorico();
    await put(10, { data: '2026-06-02' });
    expect(data(1)).toBe('2026-06-02');
    expect(data(2)).toBe('2026-05-10'); // já concluída
    expect(data(3)).toBe('2026-05-10'); // outra sessão
    expect(data(4)).toBe('2026-05-10'); // apagada
  });

  it('quando a data não muda (ou não vem), não toca no histórico', async () => {
    seedHistorico();
    await put(10, { data: '2026-05-10' });
    await put(10, { observacoes: 'x' });
    expect(data(1)).toBe('2026-05-10');
  });
});
