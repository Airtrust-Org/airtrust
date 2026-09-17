import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) return c.json({ success: false, error: 'unauthorized' }, 401);
    const empresaId = Number(c.req.header('x-test-empresa-id') || 1);
    c.set('userId', 10);
    c.set('empresaId', empresaId);
    c.set('userRole', 'admin');
    c.set('tenantContext', { empresaId, role: 'admin', permissions: ['read', 'write'] });
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return { ...actual, getEmpresaId: (c: any) => Number(c.get('empresaId') || 0), checkPermission: () => true };
});

vi.mock('../../utils/auditoria', () => ({ registrarAuditoria: vi.fn(), extrairUsuarioAuditoria: () => ({ usuario_id: '10' }) }));

import controleVoosRoutes from '../../routes/controle-voos';
const tempDirs: string[] = [];

function sqlValue(value: unknown) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function interpolate(sql: string, values: unknown[]) {
  let i = 0;
  return sql.replace(/\?/g, () => sqlValue(values[i++]));
}

function createDb(): D1Database {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-nav-route-'));
  tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  const schema = `CREATE TABLE cv_pontos_navegacao (
    id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT, codigo_icao TEXT, nome TEXT, tipo TEXT,
    latitude_dms TEXT, longitude_dms TEXT, latitude_decimal REAL, longitude_decimal REAL, elevacao_ft INTEGER,
    declinacao_magnetica_graus INTEGER, declinacao_magnetica_direcao TEXT, coordenada_valida INTEGER,
    permite_origem_destino INTEGER, revisao_pendente INTEGER, classificacao_origem TEXT, fonte TEXT,
    fonte_referencia TEXT, fonte_pagina INTEGER, ativo INTEGER, deleted_at TEXT
  );`;
  const created = spawnSync('sqlite3', [db], { input: schema, encoding: 'utf8' });
  expect(created.status, created.stderr).toBe(0);
  const seed = `INSERT INTO cv_pontos_navegacao
    (id,empresa_id,codigo,codigo_icao,nome,tipo,coordenada_valida,permite_origem_destino,revisao_pendente,classificacao_origem,ativo)
    VALUES
    (1,1,'SBME','SBME','Macaé','aeroporto',1,1,0,'INFERIDA_DESCRICAO',1),
    (2,1,'BIVUR',NULL,'Macaé / Fixo compulsório, RJ','waypoint',1,0,1,'INFERIDA_DESCRICAO',1),
    (3,1,'AGIL',NULL,'NAVIO / Agile PLSV - 9PEU','embarcacao',0,0,1,'INFERIDA_DESCRICAO',1),
    (4,2,'SBBR','SBBR','Brasília','aeroporto',1,1,0,'INFERIDA_DESCRICAO',1),
    (5,1,'FPAG','9PLG','ANITA GARIBALDI','plataforma',1,1,0,'INFERIDA_DESCRICAO',1);`;
  const seeded = spawnSync('sqlite3', [db], { input: seed, encoding: 'utf8' });
  expect(seeded.status, seeded.stderr).toBe(0);

  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { binds = values; return statement; },
        async all<T>() {
          const result = spawnSync('sqlite3', ['-json', db, interpolate(sql, binds)], { encoding: 'utf8' });
          if (result.status !== 0) throw new Error(result.stderr);
          return { results: result.stdout.trim() ? JSON.parse(result.stdout) as T[] : [] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}
function appFor(db: D1Database) {
  const app = new Hono();
  app.onError(errorHandler);
  app.route('/api/controle-voos', controleVoosRoutes);
  return { app, env: { DB: db } as any };
}

async function get(db: D1Database, path: string, empresaId = 1) {
  const { app, env } = appFor(db);
  return app.request(`http://local${path}`, {
    headers: { Authorization: 'Bearer test', 'x-test-empresa-id': String(empresaId) },
  }, env);
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('Controle de Voos navigation-point catalog', () => {
  it('filters by tenant, text, type and operational usage', async () => {
    const db = createDb();
    const searched = await get(db, '/api/controle-voos/catalogos/pontos-navegacao?q=ME&permite_origem_destino=true');
    expect(searched.status).toBe(200);
    const searchBody = await searched.json() as { data: Array<{ codigo:string }> };
    expect(searchBody.data.map((item) => item.codigo)).toEqual(['SBME']);

    const byIcao = await get(db, '/api/controle-voos/catalogos/pontos?q=9PLG&permite_origem_destino=true');
    const icaoBody = await byIcao.json() as { data: Array<{ codigo:string; codigo_icao:string }> };
    expect(icaoBody.data).toHaveLength(1);
    expect(icaoBody.data[0]).toMatchObject({ codigo: 'FPAG', codigo_icao: '9PLG' });

    const waypoints = await get(db, '/api/controle-voos/catalogos/waypoints?tipo=waypoint');
    const waypointBody = await waypoints.json() as { data: Array<{ codigo:string }> };
    expect(waypointBody.data.map((item) => item.codigo)).toEqual(['BIVUR']);
  });
  it('never leaks points from another tenant', async () => {
    const db = createDb();
    const response = await get(db, '/api/controle-voos/catalogos/pontos');
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ codigo:string }> };
    expect(body.data.map((item) => item.codigo).sort()).toEqual(['AGIL', 'BIVUR', 'FPAG', 'SBME']);
    expect(body.data.some((item) => item.codigo === 'SBBR')).toBe(false);
  });
});
