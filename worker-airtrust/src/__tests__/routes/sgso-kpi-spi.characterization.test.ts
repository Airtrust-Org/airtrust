import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

// Teste de caracterização de GET /kpi/spi: fixa o contrato atual antes de
// extrair consultas/regras do handler. Banco SQLite real; datas relativas a hoje.

const tenantMock = vi.hoisted(() => ({ id: 1 }));
vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => tenantMock.id,
}));

import sgsoKpi from '../../routes/sgso-kpi';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString().slice(0, 10);
}
const at = (n: number) => `${daysAgo(n)} 12:00:00`;

function createSchema(sqlite: SqliteD1Database) {
  sqlite.database.exec(`
    CREATE TABLE sgso_relatos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, tipo TEXT, anonimo INTEGER DEFAULT 0,
      data_ocorrencia TEXT, created_at TEXT, deleted_at TEXT, efetividade_cognitiva REAL,
      aeronave_matricula TEXT, aeronave_modelo TEXT
    );
    CREATE TABLE sgso_relato_ia_triagem (relato_id INTEGER, sinal_tendencia TEXT);
    CREATE TABLE sgso_acoes_mitigacao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, status TEXT, prazo TEXT,
      data_conclusao TEXT, deleted_at TEXT
    );
    CREATE TABLE sgso_nao_conformidades (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, status TEXT, tipo TEXT,
      created_at TEXT, deleted_at TEXT
    );
    CREATE TABLE sgso_auditorias (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, status TEXT, created_at TEXT, deleted_at TEXT
    );
    CREATE TABLE frms_jornada (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, data_inicio TEXT, horas_voo REAL,
      effectiveness_pct REAL, deleted_at TEXT
    );
    CREATE TABLE sgso_spi_config (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, ativo INTEGER DEFAULT 1, codigo TEXT, nome TEXT,
      descricao TEXT, unidade TEXT, meta_valor REAL, meta_operador TEXT, alerta_valor REAL, alerta_operador TEXT
    );
    CREATE TABLE sgso_frat_avaliacoes (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT, exige_aprovacao INTEGER,
      despacho_bloqueado INTEGER, status TEXT
    );
    CREATE TABLE sgso_bowtie_barreiras (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, status_saude TEXT);
  `);
}

function seed(sqlite: SqliteD1Database) {
  const db = sqlite.database;
  const rel = db.prepare(
    `INSERT INTO sgso_relatos (id, empresa_id, tipo, anonimo, data_ocorrencia, created_at, deleted_at, efetividade_cognitiva)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  rel.run(1, 1, 'RELATO', 1, daysAgo(5), at(5), null, null);
  rel.run(2, 1, 'INCIDENTE', 0, daysAgo(10), at(10), null, 60);
  rel.run(3, 1, 'ACIDENTE', 0, daysAgo(40), at(40), null, 50);
  rel.run(4, 1, 'RELATO', 0, daysAgo(7), at(7), '2020-01-01', null); // excluído (soft delete)
  rel.run(5, 2, 'INCIDENTE', 1, daysAgo(5), at(5), null, 10); // outro tenant
  rel.run(6, 1, 'RELATO', 0, daysAgo(200), at(200), null, null);
  rel.run(7, 1, 'INCIDENTE', 0, daysAgo(200), at(200), null, null);
  db.prepare(`INSERT INTO sgso_relato_ia_triagem (relato_id, sinal_tendencia) VALUES (?, ?)`).run(1, 'TENDENCIA');

  const jr = db.prepare(
    `INSERT INTO frms_jornada (empresa_id, data_inicio, horas_voo, effectiveness_pct, deleted_at) VALUES (?, ?, ?, ?, ?)`,
  );
  jr.run(1, daysAgo(3), 100, 80, null);
  jr.run(1, daysAgo(40), 100, 60, null);
  jr.run(2, daysAgo(3), 999, 10, null); // outro tenant

  const ac = db.prepare(
    `INSERT INTO sgso_acoes_mitigacao (empresa_id, status, prazo, data_conclusao, deleted_at) VALUES (?, ?, ?, ?, ?)`,
  );
  ac.run(1, 'CONCLUIDA', '2030-01-10', '2030-01-05', null);
  ac.run(1, 'CONCLUIDA', '2030-01-10', null, null);
  ac.run(1, 'CONCLUIDA', '2030-01-10', '2030-02-01', null); // atrasada
  ac.run(1, 'PENDENTE', '2030-01-10', null, null);
  ac.run(1, 'CANCELADA', '2030-01-10', null, null); // fora do filtro de status

  const nc = db.prepare(`INSERT INTO sgso_nao_conformidades (empresa_id, status, tipo, created_at, deleted_at) VALUES (?, ?, ?, ?, ?)`);
  nc.run(1, 'ABERTA', 'MAJOR', at(45), null);
  nc.run(1, 'EM_RESOLUCAO', 'MINOR', at(60), null);
  nc.run(1, 'ABERTA', 'MINOR', at(5), null); // < 30 dias
  nc.run(1, 'FECHADA', 'MINOR', at(60), null);
  nc.run(2, 'ABERTA', 'MAJOR', at(60), null); // outro tenant

  const au = db.prepare(`INSERT INTO sgso_auditorias (empresa_id, status, created_at, deleted_at) VALUES (?, ?, ?, ?)`);
  au.run(1, 'CONCLUIDA', at(30), null);
  au.run(1, 'PROGRAMADA', at(20), null);
  au.run(1, 'CONCLUIDA', at(400), null); // fora de 365d

  const cfg = db.prepare(
    `INSERT INTO sgso_spi_config (empresa_id, ativo, codigo, nome, descricao, unidade, meta_valor, meta_operador, alerta_valor, alerta_operador)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  cfg.run(1, 1, 'FECHAMENTO_ACOES', 'Fechamento de ações', 'd', '%', 80, '>=', 50, '<');
  cfg.run(1, 1, 'NCS_ABERTAS_30D', 'NCs abertas', 'd', 'qtd', 1, '<=', 3, '>');
  cfg.run(1, 1, 'EXECUCAO_AUDITORIAS', 'Auditorias', 'd', '%', 50, '>=', 20, '<');
  cfg.run(1, 1, 'SPI_SEM_VALOR', 'Sem valor calculável', 'd', 'x', 1, '>=', 0, '<');
  cfg.run(1, 0, 'INATIVO', 'Inativo', 'd', 'x', 1, '>=', 0, '<');
  cfg.run(2, 1, 'OUTRO_TENANT', 'Outro', 'd', 'x', 1, '>=', 0, '<');

  db.prepare(
    `INSERT INTO sgso_frat_avaliacoes (empresa_id, deleted_at, exige_aprovacao, despacho_bloqueado, status) VALUES (?, ?, ?, ?, ?)`,
  ).run(1, null, 1, 1, 'SUBMETIDO');
  const bw = db.prepare(`INSERT INTO sgso_bowtie_barreiras (empresa_id, status_saude) VALUES (?, ?)`);
  bw.run(1, 'DEGRADADA');
  bw.run(1, 'OPERANTE');
}

describe('GET /kpi/spi — caracterização do contrato atual', () => {
  let sqlite: SqliteD1Database;

  beforeEach(() => {
    tenantMock.id = 1;
    sqlite = new SqliteD1Database();
    createSchema(sqlite);
    seed(sqlite);
  });
  afterEach(() => sqlite.close());

  async function call() {
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', sgsoKpi);
    const res = await app.request('/kpi/spi', {}, { DB: sqlite.asD1() } as unknown as Env);
    return { status: res.status, body: (await res.json()) as any };
  }

  it('calcula SPIs, indicadores líderes, tendência curta e resumo apenas do tenant', async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchSnapshot();
  });

  it('isola por tenant: outro tenant não vê os dados da empresa 1', async () => {
    tenantMock.id = 2;
    const { body } = await call();
    expect(body.data.resumo.total_relatos_90d).toBe(1);
    expect(body.data.spis.map((s: { codigo: string }) => s.codigo)).toEqual(['OUTRO_TENANT']);
  });

  it('sem coluna de horas em frms_jornada: taxas ficam nulas e status "info"', async () => {
    sqlite.database.exec(`DROP TABLE frms_jornada; CREATE TABLE frms_jornada (id INTEGER PRIMARY KEY, empresa_id INTEGER);`);
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.data.resumo.horas_voo_90d).toBe(0);
    expect(body.data.resumo.efetividade_media).toBeNull();
  });

  it('falha de banco devolve 500 com código SGSO_SPI_CALC_ERROR', async () => {
    sqlite.database.exec('DROP TABLE sgso_relatos');
    const { status, body } = await call();
    expect(status).toBe(500);
    expect(body).toMatchObject({ success: false, code: 'SGSO_SPI_CALC_ERROR' });
  });
});
