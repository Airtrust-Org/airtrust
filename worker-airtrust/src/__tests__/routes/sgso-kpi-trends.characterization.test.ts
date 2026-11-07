import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

// Caracterização de GET /kpi/tendencias e GET /categorias-adrep: fixa o contrato
// atual antes de mover as consultas para um repositório.

const tenantMock = vi.hoisted(() => ({ id: 1 }));
vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => tenantMock.id,
}));

import sgsoKpi from '../../routes/sgso-kpi';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString().slice(0, 10);
}
const month = (n: number) => daysAgo(n).slice(0, 7);

function setup(sqlite: SqliteD1Database) {
  const db = sqlite.database;
  db.exec(`
    CREATE TABLE sgso_relatos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, tipo TEXT, anonimo INTEGER DEFAULT 0,
      data_ocorrencia TEXT, deleted_at TEXT, aeronave_matricula TEXT, aeronave_modelo TEXT, categoria_adrep TEXT
    );
    CREATE TABLE sgso_nao_conformidades (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, tipo TEXT, created_at TEXT, deleted_at TEXT
    );
    CREATE TABLE sgso_avaliacao_risco (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT, tipo_avaliacao TEXT,
      probabilidade INTEGER, severidade TEXT
    );
    CREATE TABLE sgso_categorias_adrep (
      id INTEGER PRIMARY KEY, codigo TEXT, nome_pt TEXT, nome_en TEXT, ativo INTEGER DEFAULT 1
    );
  `);
  const rel = db.prepare(
    `INSERT INTO sgso_relatos (empresa_id, tipo, anonimo, data_ocorrencia, deleted_at, aeronave_matricula, aeronave_modelo, categoria_adrep)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  rel.run(1, 'INCIDENTE', 1, daysAgo(5), null, 'PR-AAA', 'AW139', 'LOC-I');
  rel.run(1, 'ACIDENTE', 0, daysAgo(6), null, 'PR-AAA', 'AW139', 'LOC-I');
  rel.run(1, 'RELATO', 0, daysAgo(40), null, 'PR-BBB', 'H145', 'CFIT');
  rel.run(1, 'RELATO', 0, daysAgo(500), null, 'PR-AAA', 'AW139', 'LOC-I'); // fora de 12 meses (mas conta em top/categorias)
  rel.run(1, 'RELATO', 0, daysAgo(3), '2020-01-01', 'PR-CCC', 'S92', 'CFIT'); // apagado
  rel.run(1, 'RELATO', 0, daysAgo(2), null, null, null, null); // sem aeronave/categoria
  rel.run(2, 'INCIDENTE', 0, daysAgo(5), null, 'PR-ZZZ', 'B737', 'LOC-I'); // outro tenant
  for (let i = 0; i < 7; i++) rel.run(1, 'RELATO', 0, daysAgo(20), null, `PR-X${i}`, 'M', `CAT${i}`);

  const nc = db.prepare(`INSERT INTO sgso_nao_conformidades (empresa_id, tipo, created_at, deleted_at) VALUES (?, ?, ?, ?)`);
  nc.run(1, 'MAJOR', `${daysAgo(10)} 10:00:00`, null);
  nc.run(1, 'MINOR', `${daysAgo(11)} 10:00:00`, null);
  nc.run(1, 'MINOR', `${daysAgo(400)} 10:00:00`, null); // fora de 12 meses
  nc.run(2, 'MAJOR', `${daysAgo(10)} 10:00:00`, null);

  const av = db.prepare(
    `INSERT INTO sgso_avaliacao_risco (empresa_id, deleted_at, tipo_avaliacao, probabilidade, severidade) VALUES (?, ?, ?, ?, ?)`,
  );
  av.run(1, null, 'INICIAL', 3, 'B');
  av.run(1, null, 'INICIAL', 3, 'B');
  av.run(1, null, 'RESIDUAL', 3, 'B'); // não é INICIAL
  av.run(1, '2020-01-01', 'INICIAL', 2, 'C'); // apagada
  av.run(2, null, 'INICIAL', 3, 'B'); // outro tenant

  const cat = db.prepare(`INSERT INTO sgso_categorias_adrep (codigo, nome_pt, nome_en, ativo) VALUES (?, ?, ?, ?)`);
  cat.run('LOC-I', 'Perda de controle em voo', 'Loss of control', 1);
  cat.run('CFIT', 'Colisão com o solo', 'CFIT', 1);
  cat.run('OLD', 'Antiga', 'Old', 0);
}

describe('SGSO KPI — tendências e categorias ADREP (caracterização)', () => {
  let sqlite: SqliteD1Database;
  beforeEach(() => {
    tenantMock.id = 1;
    sqlite = new SqliteD1Database();
    setup(sqlite);
  });
  afterEach(() => sqlite.close());

  async function get(path: string) {
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', sgsoKpi);
    const res = await app.request(path, {}, { DB: sqlite.asD1() } as unknown as Env);
    return { status: res.status, body: (await res.json()) as any };
  }

  it('relatos_por_mes: agrega por mês dos últimos 12 meses, só do tenant, sem apagados', async () => {
    const { status, body } = await get('/kpi/tendencias');
    expect(status).toBe(200);
    const meses = new Map<string, { total: number; incidentes: number; acidentes: number; anonimos: number }>();
    const add = (m: string, tipo: string, anon: number) => {
      const cur = meses.get(m) ?? { total: 0, incidentes: 0, acidentes: 0, anonimos: 0 };
      cur.total += 1;
      if (tipo === 'INCIDENTE') cur.incidentes += 1;
      if (tipo === 'ACIDENTE') cur.acidentes += 1;
      cur.anonimos += anon;
      meses.set(m, cur);
    };
    add(month(5), 'INCIDENTE', 1);
    add(month(6), 'ACIDENTE', 0);
    add(month(40), 'RELATO', 0);
    add(month(2), 'RELATO', 0);
    for (let i = 0; i < 7; i++) add(month(20), 'RELATO', 0);
    const esperado = [...meses.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({ mes, ...v }));
    expect(body.data.relatos_por_mes).toEqual(esperado);
  });

  it('ncs_por_mes: major/minor por mês, ignora fora de 12 meses e outro tenant', async () => {
    const { body } = await get('/kpi/tendencias');
    const meses = new Map<string, { total: number; major: number; minor: number }>();
    for (const [n, tipo] of [[10, 'MAJOR'], [11, 'MINOR']] as const) {
      const cur = meses.get(month(n)) ?? { total: 0, major: 0, minor: 0 };
      cur.total += 1;
      if (tipo === 'MAJOR') cur.major += 1;
      else cur.minor += 1;
      meses.set(month(n), cur);
    }
    const esperado = [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v }));
    expect(body.data.ncs_por_mes).toEqual(esperado);
  });

  it('top_aeronaves: no máximo 5, ordenado por total desc, sem matrícula nula', async () => {
    const { body } = await get('/kpi/tendencias');
    const top = body.data.top_aeronaves as Array<{ aeronave_matricula: string; total: number }>;
    expect(top).toHaveLength(5);
    expect(top[0]).toMatchObject({ aeronave_matricula: 'PR-AAA', aeronave_modelo: 'AW139', total: 3 });
    expect(top.every((t) => t.aeronave_matricula !== null)).toBe(true);
    expect(top.map((t) => t.total)).toEqual([...top.map((t) => t.total)].sort((a, b) => b - a));
    expect(top.find((t) => t.aeronave_matricula === 'PR-ZZZ')).toBeUndefined();
    expect(top.find((t) => t.aeronave_matricula === 'PR-CCC')).toBeUndefined();
  });

  it('categorias_adrep: no máximo 10, ordenado por total desc, sem categoria nula', async () => {
    const { body } = await get('/kpi/tendencias');
    const cats = body.data.categorias_adrep as Array<{ categoria_adrep: string; total: number }>;
    expect(cats.length).toBeLessThanOrEqual(10);
    expect(cats[0]).toEqual({ categoria_adrep: 'LOC-I', total: 3 });
    expect(cats.find((c) => c.categoria_adrep === null)).toBeUndefined();
  });

  it('matriz_densidade: só avaliações INICIAL não apagadas do tenant', async () => {
    const { body } = await get('/kpi/tendencias');
    expect(body.data.matriz_densidade).toEqual([{ probabilidade: 3, severidade: 'B', total: 2 }]);
  });

  it('isola por tenant', async () => {
    tenantMock.id = 2;
    const { body } = await get('/kpi/tendencias');
    expect(body.data.matriz_densidade).toEqual([{ probabilidade: 3, severidade: 'B', total: 1 }]);
    expect(body.data.top_aeronaves.map((t: { aeronave_matricula: string }) => t.aeronave_matricula)).toEqual(['PR-ZZZ']);
  });

  it('falha de banco devolve 500 SGSO_TREND_CALC_ERROR', async () => {
    sqlite.database.exec('DROP TABLE sgso_avaliacao_risco');
    const { status, body } = await get('/kpi/tendencias');
    expect(status).toBe(500);
    expect(body).toMatchObject({ success: false, code: 'SGSO_TREND_CALC_ERROR' });
  });

  it('/categorias-adrep: só ativas, ordenadas por nome_pt', async () => {
    const { status, body } = await get('/categorias-adrep');
    expect(status).toBe(200);
    expect(body.data.map((c: { codigo: string }) => c.codigo)).toEqual(['CFIT', 'LOC-I']);
    expect(body.data[0]).toEqual({ id: 2, codigo: 'CFIT', nome_pt: 'Colisão com o solo', nome_en: 'CFIT' });
  });

  it('/categorias-adrep: falha de banco devolve 500 SGSO_CATEGORIAS_GET_ERROR', async () => {
    sqlite.database.exec('DROP TABLE sgso_categorias_adrep');
    const { status, body } = await get('/categorias-adrep');
    expect(status).toBe(500);
    expect(body).toMatchObject({ code: 'SGSO_CATEGORIAS_GET_ERROR' });
  });
});
