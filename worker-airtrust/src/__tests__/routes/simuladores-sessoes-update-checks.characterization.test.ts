import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

// Caracterização da fase "examinador + checks + fichas especiais" do PUT /sessoes/:id,
// com SQLite real e dois tenants. O handler continua depois dessa fase (horário,
// conflito, participantes, notificações); aqui só interessa o que é gravado por ela,
// então o corpo da requisição evita as fases seguintes e a resposta final não é
// asserida por status: o que vale é o estado do banco e o que a fase respondeu antes.

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

// O guard de domínio operacional tem testes próprios; aqui só a regra do handler importa.
vi.mock('../../middleware/operational-domain-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/operational-domain-access')>()),
  requireOperationalAccess: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

import sessoesUpdateApp from '../../routes/simuladores-sessoes-update';

let sqlite: SqliteD1Database;
let app: Hono<AppEnv>;

function createSchema() {
  sqlite.database.exec(`
    UPDATE empresas SET operational_domain_rbac_enabled = 0;
    INSERT OR IGNORE INTO empresas (id, operational_domain_rbac_enabled) VALUES (1, 0), (2, 0);

    CREATE TABLE simuladores (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, aeronave_codigo TEXT, codigo_aeronave TEXT,
      tipo TEXT, modelo TEXT, deleted_at TEXT
    );
    INSERT INTO simuladores (id, empresa_id, aeronave_codigo) VALUES (1, 1, 'AW139');

    CREATE TABLE simulador_agendamentos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, simulador_id INTEGER, data TEXT,
      hora_inicio TEXT, hora_fim TEXT, status TEXT, nome TEXT, tipo_sessao TEXT, observacoes TEXT,
      instrutor_id INTEGER, examinador_id INTEGER, is_check INTEGER DEFAULT 0, template_id INTEGER,
      modo_compartilhado INTEGER DEFAULT 0, tipo_dispositivo TEXT, aeronave_id INTEGER,
      updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO simulador_agendamentos
      (id, empresa_id, simulador_id, data, hora_inicio, hora_fim, status, nome, tipo_sessao, instrutor_id)
    VALUES
      (10, 1, 1, '2026-05-10', '08:00', '10:00', 'AGENDADA', 'Sessão A', 'PERIODICO', 100),
      (20, 2, 1, '2026-05-10', '12:00', '14:00', 'AGENDADA', 'Outra empresa', 'PERIODICO', NULL),
      (30, 1, 1, '2026-05-11', '08:00', '10:00', 'AGENDADA', 'Compartilhada', 'PERIODICO', NULL),
      (11, 1, 1, '2026-05-12', '08:00', '10:00', 'AGENDADA', 'Sem instrutor', 'PERIODICO', NULL);
    UPDATE simulador_agendamentos SET modo_compartilhado = 1 WHERE id = 30;

    ALTER TABLE funcionarios ADD COLUMN is_instrutor INTEGER DEFAULT 0;
    ALTER TABLE funcionarios ADD COLUMN is_examinador INTEGER DEFAULT 0;
    ALTER TABLE funcionarios ADD COLUMN is_checador INTEGER DEFAULT 0;
    INSERT INTO funcionarios (id, empresa_id, nome, is_instrutor, is_examinador, is_checador) VALUES
      (100, 1, 'Instrutor', 1, 0, 0),
      (200, 1, 'Examinador', 0, 1, 0),
      (201, 1, 'Checador', 0, 0, 1),
      (202, 1, 'Sem flag', 0, 0, 0),
      (300, 2, 'Examinador outra empresa', 0, 1, 0);

    ALTER TABLE qualificacoes_categorias ADD COLUMN codigo TEXT;
    ALTER TABLE qualificacoes_categorias ADD COLUMN ativo INTEGER DEFAULT 1;
    INSERT INTO qualificacoes_categorias (id, empresa_id, codigo, ativo) VALUES (91, 1, 'CHECK', 1), (92, 2, 'CHECK', 1);
    ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN descricao TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN ativo INTEGER DEFAULT 1;
    INSERT INTO qualificacoes_tipos (id, empresa_id, codigo, nome, categoria_id) VALUES
      (501, 1, 'IFR-139', 'IFR AW139', 91),
      (502, 1, 'VFR-76', 'VFR SK76', 91),
      (503, 1, 'GERAL', 'Geral', 91),
      (504, 1, 'FAP13-EXA', 'FAP13', 91),
      (601, 2, 'OUTRA', 'Outra empresa', 92);

    CREATE TABLE sessoes_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER NOT NULL,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE sessoes_checks_resultados (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_check_id INTEGER NOT NULL, created_at TEXT,
      updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE tipos_sessao (id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, deleted_at TEXT);
    CREATE TABLE modelos_sessao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT, nome TEXT, tipo_sessao_id INTEGER,
      modelo_aeronave TEXT, deleted_at TEXT
    );
    INSERT INTO modelos_sessao (id, empresa_id, codigo) VALUES (77, 1, 'CRED-EXA'), (88, 2, 'CRED-EXA');
    CREATE TABLE fichas_sessao (
      id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, agendamento_slot_id INTEGER, colaborador_id_aluno INTEGER,
      instrutor_id INTEGER, tipo_sessao TEXT, tipo_aeronave TEXT, data_sessao TEXT, status TEXT,
      template_id INTEGER, empresa_id INTEGER NOT NULL, assinatura_aluno_timestamp TEXT,
      assinatura_instrutor_timestamp TEXT, assinatura_aluno_imagem TEXT, assinatura_instrutor_imagem TEXT,
      data_conclusao TEXT, deleted_at TEXT
    );
    CREATE TABLE fichas_sessao_manobras (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ficha_id INTEGER NOT NULL, deleted_at TEXT
    );
    CREATE TABLE auditoria_avancada_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tabela TEXT, acao TEXT, registro_id TEXT,
      dados_anteriores TEXT, dados_novos TEXT
    );
  `);
}

async function put(id: number, body: Record<string, unknown>) {
  const res = await app.request(
    `/sessoes/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: sqlite.asD1() } as unknown as Env,
  );
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

function rows<T = Record<string, unknown>>(sql: string, ...args: unknown[]): T[] {
  return sqlite.database.prepare(sql).all(...(args as never[])) as T[];
}

beforeEach(() => {
  sqlite = new SqliteD1Database();
  createSchema();
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

// A fase de examinador/checks/fichas especiais grava no banco e só então o handler segue para
// tabelas fora desta fixture (planejamento de qualificações, escala, notificações), devolvendo
// 500. O contrato desta fase é o estado do banco; as respostas antecipadas (400/404/409) são
// asserdas por completo.
const sessao = (id: number) =>
  rows<{ examinador_id: number | null; is_check: number }>(
    'SELECT examinador_id, is_check FROM simulador_agendamentos WHERE id = ?',
    id,
  )[0];
const vinculos = (id: number) =>
  rows<{ id: number; qualificacao_tipo_id: number; deleted_at: string | null }>(
    'SELECT id, qualificacao_tipo_id, deleted_at FROM sessoes_checks WHERE sessao_id = ? ORDER BY id',
    id,
  );
const auditoria = () =>
  rows<{ acao: string; registro_id: string; dados_anteriores: string; dados_novos: string }>(
    'SELECT acao, registro_id, dados_anteriores, dados_novos FROM auditoria_avancada_v2 ORDER BY id',
  );
const fichas = (slot: number) =>
  rows<Record<string, any>>(
    'SELECT * FROM fichas_sessao WHERE agendamento_slot_id = ? AND deleted_at IS NULL ORDER BY id',
    slot,
  );

function seedVinculoAntigo(sessaoId = 10, tipoId = 503) {
  sqlite.database.exec(`
    INSERT INTO sessoes_checks (id, sessao_id, qualificacao_tipo_id) VALUES (900, ${sessaoId}, ${tipoId});
    INSERT INTO sessoes_checks_resultados (id, sessao_check_id) VALUES (901, 900);
    UPDATE simulador_agendamentos SET examinador_id = 200, is_check = 1 WHERE id = ${sessaoId};
  `);
}

describe('PUT /sessoes/:id — respostas antecipadas', () => {
  it('404 para sessão inexistente ou de outro tenant e 409 para compartilhada, sem gravar nada', async () => {
    for (const id of [999, 20]) {
      const r = await put(id, { examinador_id: 200, checks: [501] });
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ success: false, error: 'Não encontrada' });
    }
    const compart = await put(30, { examinador_id: 200, checks: [501] });
    expect(compart.status).toBe(409);
    expect(compart.json.error).toBe('Sessão compartilhada deve ser editada pela rota de sessões compartilhadas');
    expect(rows('SELECT * FROM sessoes_checks')).toEqual([]);
    expect(auditoria()).toEqual([]);
    expect(sessao(20)).toMatchObject({ examinador_id: null, is_check: 0 });
  });

  it('400 "Checks inválidos" para id de outro tenant ou inexistente, sem gravar nada', async () => {
    for (const checks of [[601], [501, 999]]) {
      const r = await put(10, { examinador_id: 200, checks });
      expect(r.status).toBe(400);
      expect(r.json).toEqual({ success: false, error: 'Checks inválidos' });
    }
    expect(sessao(10)).toMatchObject({ examinador_id: null, is_check: 0 });
    expect(rows('SELECT * FROM sessoes_checks')).toEqual([]);
  });

  it('400 quando há examinador mas nenhum check (ausente, vazio ou só incompatível)', async () => {
    for (const body of [{ examinador_id: 200 }, { examinador_id: 200, checks: [] }]) {
      const r = await put(10, body);
      expect(r.status).toBe(400);
      expect(r.json.error).toBe('Selecione pelo menos 1 check ao informar examinador');
    }
    // 502 (-76) é incompatível com AW139 e é descartado, deixando zero checks
    const incompat = await put(10, { examinador_id: 200, checks: [502] });
    expect(incompat.status).toBe(400);
    expect(incompat.json.error).toBe('Selecione pelo menos 1 check ao informar examinador');
    expect(sessao(10)).toMatchObject({ examinador_id: null, is_check: 0 });
    expect(auditoria()).toEqual([]);
  });

  it('400 "Examinador inválido" sem flag, de outro tenant ou inexistente', async () => {
    for (const examinador_id of [202, 300, 999, 100]) {
      const r = await put(10, { examinador_id, checks: [501] });
      expect(r.status).toBe(400);
      expect(r.json).toEqual({ success: false, error: 'Examinador inválido' });
    }
    expect(sessao(10)).toMatchObject({ examinador_id: null, is_check: 0 });
    expect(rows('SELECT * FROM sessoes_checks')).toEqual([]);
  });
});

describe('PUT /sessoes/:id — examinador e checks gravados', () => {
  it('grava examinador, is_check=1, vínculos compatíveis com o modelo e a auditoria', async () => {
    const r = await put(10, { examinador_id: 200, checks: [501, 502, 503, 501] });
    expect(r.status).not.toBe(400);

    expect(sessao(10)).toEqual({ examinador_id: 200, is_check: 1 });
    expect(vinculos(10).map((v) => [v.qualificacao_tipo_id, v.deleted_at])).toEqual([
      [501, null],
      [503, null], // 502 (VFR-76) é descartado: incompatível com AW139
    ]);
    const [aud] = auditoria();
    expect(aud).toMatchObject({ acao: 'UPDATE_CHECK_FIELDS', registro_id: '10' });
    expect(JSON.parse(aud.dados_anteriores)).toEqual({ examinador_id: null, is_check: 0 });
    expect(JSON.parse(aud.dados_novos)).toEqual({ examinador_id: 200, is_check: 1, checks: [501, 503] });
    expect(sessao(20)).toEqual({ examinador_id: null, is_check: 0 }); // outro tenant intocado
  });

  it('aceita checador (flag is_checador) como examinador', async () => {
    const r = await put(10, { examinador_id: 201, checks: [503] });
    expect(r.status).not.toBe(400);
    expect(sessao(10)).toEqual({ examinador_id: 201, is_check: 1 });
  });

  it('reenviar os checks apaga (soft delete) vínculos e resultados antigos e cria os novos', async () => {
    seedVinculoAntigo();
    const r = await put(10, { examinador_id: 200, checks: [501] });
    expect(r.status).not.toBe(400);

    const v = vinculos(10);
    expect(v.find((x) => x.id === 900)!.deleted_at).not.toBeNull();
    expect(v.filter((x) => x.deleted_at === null).map((x) => x.qualificacao_tipo_id)).toEqual([501]);
    expect(
      rows<{ deleted_at: string | null }>('SELECT deleted_at FROM sessoes_checks_resultados WHERE id = 901')[0]
        .deleted_at,
    ).not.toBeNull();
  });

  it('examinador_id null desmarca o check, apaga vínculos/resultados e não cria novos', async () => {
    seedVinculoAntigo();
    const r = await put(10, { examinador_id: null });
    expect(r.status).not.toBe(400);

    expect(sessao(10)).toEqual({ examinador_id: null, is_check: 0 });
    expect(vinculos(10).filter((v) => v.deleted_at === null)).toEqual([]);
    expect(
      rows<{ deleted_at: string | null }>('SELECT deleted_at FROM sessoes_checks_resultados WHERE id = 901')[0]
        .deleted_at,
    ).not.toBeNull();
    const [aud] = auditoria();
    expect(JSON.parse(aud.dados_anteriores)).toEqual({ examinador_id: 200, is_check: 1 });
    expect(JSON.parse(aud.dados_novos)).toEqual({ examinador_id: null, is_check: 0, checks: [] });
  });

  it('enviar só "checks" (sem examinador_id) zera examinador e is_check — comportamento atual', async () => {
    seedVinculoAntigo();
    const r = await put(10, { checks: [501] });
    expect(r.status).not.toBe(400);

    expect(sessao(10)).toEqual({ examinador_id: null, is_check: 0 });
    expect(vinculos(10).filter((v) => v.deleted_at === null)).toEqual([]);
  });

  it('sem examinador_id nem checks no corpo, não mexe em nada desta fase', async () => {
    seedVinculoAntigo();
    await put(10, { tema_sessao: 'x' });

    expect(sessao(10)).toEqual({ examinador_id: 200, is_check: 1 });
    expect(vinculos(10).filter((v) => v.deleted_at === null).map((v) => v.id)).toEqual([900]);
    expect(auditoria().filter((a) => a.acao === 'UPDATE_CHECK_FIELDS')).toEqual([]);
  });
});

describe('PUT /sessoes/:id — fichas especiais CRED-EXA', () => {
  it('gerar_ficha_examinador cria a ficha do instrutor com o modelo do próprio tenant', async () => {
    await put(10, { gerar_ficha_examinador: true, examinador_id: 200, checks: [503], tipo_aeronave: 'AW139' });

    const [f] = fichas(10);
    expect(f).toMatchObject({
      agendamento_slot_id: 10,
      colaborador_id_aluno: 100,
      instrutor_id: 200,
      tipo_sessao: 'CRED-EXA',
      tipo_aeronave: 'AW139',
      data_sessao: '2026-05-10',
      status: 'AVALIACAO_PENDENTE',
      template_id: 77,
      empresa_id: 1,
    });
    expect(typeof f.uuid).toBe('string');
  });

  it('sem examinador na requisição, o próprio instrutor fica como instrutor da ficha', async () => {
    await put(10, { gerar_ficha_examinador: true });

    const [f] = fichas(10);
    expect(f.colaborador_id_aluno).toBe(100);
    expect(f.instrutor_id).toBe(100);
    expect(f.tipo_aeronave).toBeNull();
  });

  it('infere o tipo de aeronave de outra ficha da sessão quando o corpo não informa', async () => {
    sqlite.database.exec(`
      INSERT INTO fichas_sessao (agendamento_slot_id, colaborador_id_aluno, tipo_sessao, tipo_aeronave, empresa_id)
      VALUES (10, 555, 'PERIODICO', 'SK76', 1);
    `);
    await put(10, { gerar_ficha_examinador: true });

    const cred = fichas(10).find((f) => f.tipo_sessao === 'CRED-EXA')!;
    expect(cred.tipo_aeronave).toBe('SK76');
  });

  it('não duplica a ficha em um segundo PUT', async () => {
    await put(10, { gerar_ficha_examinador: true });
    await put(10, { gerar_ficha_examinador: true });
    expect(fichas(10).filter((f) => f.tipo_sessao === 'CRED-EXA')).toHaveLength(1);
  });

  it('um check com código FAP13* ativa a ficha mesmo sem a flag', async () => {
    await put(10, { examinador_id: 200, checks: [504] });
    expect(fichas(10).filter((f) => f.tipo_sessao === 'CRED-EXA')).toHaveLength(1);
  });

  it('sem instrutor na sessão (nem no corpo) a fase de fichas especiais não roda', async () => {
    await put(11, { gerar_ficha_examinador: true });
    expect(fichas(11)).toEqual([]);
  });

  it('desativada: apaga a ficha ainda não utilizada e preserva a já assinada/avançada', async () => {
    sqlite.database.exec(`
      INSERT INTO fichas_sessao (id, agendamento_slot_id, colaborador_id_aluno, tipo_sessao, status, empresa_id)
      VALUES (500, 10, 100, 'CRED-EXA', 'AVALIACAO_PENDENTE', 1);
      INSERT INTO fichas_sessao_manobras (ficha_id) VALUES (500);
    `);
    await put(10, { tema_sessao: 'x' });
    expect(fichas(10)).toEqual([]);
    expect(
      rows<{ deleted_at: string | null }>('SELECT deleted_at FROM fichas_sessao_manobras WHERE ficha_id = 500')[0]
        .deleted_at,
    ).not.toBeNull();

    // já utilizada: status diferente de AVALIACAO_PENDENTE (ou assinatura/conclusão) é preservada
    sqlite.database.exec(`
      INSERT INTO fichas_sessao (id, agendamento_slot_id, colaborador_id_aluno, tipo_sessao, status, empresa_id)
      VALUES (501, 11, 100, 'CRED-EXA', 'CONCLUIDA', 1);
      UPDATE simulador_agendamentos SET instrutor_id = 100 WHERE id = 11;
    `);
    await put(11, { tema_sessao: 'x' });
    expect(fichas(11).map((f) => f.id)).toEqual([501]);
  });
});
