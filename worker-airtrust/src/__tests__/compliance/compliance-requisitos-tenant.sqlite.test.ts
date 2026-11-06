/**
 * Auditoria de Compliance (2ª rodada) — CRUD de requisitos legados com SQL real (SQLite).
 *
 * As releituras pós-escrita de POST/PUT consultavam `requisitos_compliance` apenas por `id`.
 * Não havia vazamento (o `id` já passou por checagem de tenant), mas toda consulta tenant-owned
 * deve carregar `empresa_id`. O teste prova: (a) a resposta devolve a linha do próprio tenant,
 * (b) uma requisição do tenant 1 nunca lê nem altera a linha do tenant 2, (c) toda SQL executada
 * pelo roteador carrega `empresa_id`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/tenant', () => ({ getEmpresaId: () => 1 }));

import requisitos from '../../routes/compliance-requisitos';

let sqlite: SqliteD1Database;
const executed: string[] = [];

beforeEach(() => {
  executed.length = 0;
  sqlite = new SqliteD1Database();
  sqlite.database.exec(`
    DROP TABLE IF EXISTS requisitos_compliance;
    CREATE TABLE requisitos_compliance (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, funcao TEXT NOT NULL,
      tipo_recurso TEXT NOT NULL, referencia TEXT NOT NULL, descricao TEXT, obrigatorio INTEGER DEFAULT 1,
      deleted_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT
    );
    INSERT INTO requisitos_compliance (id, empresa_id, funcao, tipo_recurso, referencia)
      VALUES (10, 1, 'Piloto', 'qualificacao', 'NR35'), (20, 2, 'Piloto', 'qualificacao', 'NR35');
  `);
});
afterEach(() => sqlite.close());

function envWithSpy(): Env {
  const real = sqlite.asD1();
  return {
    DB: {
      ...real,
      prepare: (sql: string) => {
        executed.push(sql);
        return real.prepare(sql);
      },
    },
  } as unknown as Env;
}

async function call(method: string, path: string, body?: unknown) {
  const app = new Hono<{ Bindings: Env }>();
  // Equivale ao handler global do index.ts: ApiError vira o status HTTP declarado.
  app.onError((err, c) =>
    c.json({ error: err.message }, ((err as { statusCode?: number }).statusCode ?? 500) as 404 | 500),
  );
  app.route('/api/compliance', requisitos);
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
    envWithSpy(),
    {} as ExecutionContext,
  );
}

const payload = { funcao: 'Mecânico', tipo_recurso: 'qualificacao', referencia: 'NR10', obrigatorio: 1 };

describe('requisitos legados: isolamento por empresa (SQL real)', () => {
  it('POST cria e devolve a linha do próprio tenant', async () => {
    const res = await call('POST', '/api/compliance/requisitos', payload);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { id: number; empresa_id: number; referencia: string } };
    expect(json.data.empresa_id).toBe(1);
    expect(json.data.referencia).toBe('NR10');
  });

  it('PUT altera e devolve a linha do próprio tenant', async () => {
    const res = await call('PUT', '/api/compliance/requisitos/10', { ...payload, referencia: 'NR33' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; empresa_id: number; referencia: string } };
    expect(json.data).toMatchObject({ id: 10, empresa_id: 1, referencia: 'NR33' });
  });

  it('PUT/DELETE em requisito de outro tenant → 404 e a linha alheia fica intacta', async () => {
    expect((await call('PUT', '/api/compliance/requisitos/20', { ...payload, referencia: 'HACK' })).status).toBe(404);
    expect((await call('DELETE', '/api/compliance/requisitos/20')).status).toBe(404);
    const other = sqlite.database
      .prepare('SELECT referencia, deleted_at FROM requisitos_compliance WHERE id = 20')
      .get() as { referencia: string; deleted_at: string | null };
    expect(other).toEqual({ referencia: 'NR35', deleted_at: null });
  });

  it('toda SQL de requisitos executada pelo roteador carrega empresa_id', async () => {
    await call('POST', '/api/compliance/requisitos', payload);
    await call('PUT', '/api/compliance/requisitos/10', { ...payload, referencia: 'NR33' });
    await call('DELETE', '/api/compliance/requisitos/10');
    const onRequisitos = executed.filter((sql) => /requisitos_compliance/.test(sql) && !/PRAGMA|sqlite_master/i.test(sql));
    expect(onRequisitos.length).toBeGreaterThanOrEqual(6);
    for (const sql of onRequisitos) expect(sql).toMatch(/empresa_id/);
  });
});
