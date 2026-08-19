/**
 * POST /deduplicate?apply=true — não deixa renovacao_de órfão.
 *
 * Fase 4 do Writer Convergence audit. Provado em SQLite real: soft-deletar
 * um duplicado que é o predecessor (renovacao_de) de outra linha ativa
 * deixava um ponteiro semanticamente órfão (aponta para deleted_at != NULL).
 * Corrigido repointando para o sobrevivente do grupo (manter_id) no mesmo
 * batch atômico do delete.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 900);
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));
vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: (c: any) => Number(c.get('empresaId') ?? 0),
}));

import deduplicateRoutes from '../../routes/deduplicate';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

type SqliteValue = string | number | bigint | Uint8Array | null;
function normalize(value: unknown): SqliteValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value as SqliteValue;
}

class FakeD1 {
  constructor(private readonly db: DatabaseSync) {}
  prepare(sql: string) {
    const db = this.db;
    return {
      bind(...values: unknown[]) {
        return {
          async first<T = Record<string, unknown>>(): Promise<T | null> {
            const row = db.prepare(sql).get(...values.map(normalize)) as
              | Record<string, unknown>
              | undefined;
            return (row as T) ?? null;
          },
          async all<T = Record<string, unknown>>() {
            return { results: db.prepare(sql).all(...values.map(normalize)) as T[] };
          },
          async run() {
            const result = db.prepare(sql).run(...values.map(normalize));
            return { meta: { changes: Number(result.changes || 0) } };
          },
        };
      },
    };
  }
  async batch(statements: { run: () => Promise<unknown> }[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

const SCHEMA = `
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  funcionario_cpf TEXT,
  qualificacao_codigo TEXT,
  data_conclusao TEXT,
  data_vencimento TEXT,
  renovacao_de INTEGER,
  renovada INTEGER DEFAULT 0,
  status TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);
`;

let sqlite: DatabaseSync;
let db: FakeD1;

function buildApp() {
  const app = new Hono();
  app.route('/deduplicate', deduplicateRoutes);
  return app;
}

async function applyDedup() {
  const app = buildApp();
  return app.request(
    'http://localhost/deduplicate?apply=true',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    { DB: db } as unknown as Env,
  );
}

beforeEach(() => {
  sqlite = new NodeDatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  db = new FakeD1(sqlite);
});

afterEach(() => {
  sqlite.close();
});

describe('POST /deduplicate — não deixa renovacao_de órfão ao remover duplicatas', () => {
  it('A<-B (B duplicado): sucessor externo que aponta para B é repontado para o sobrevivente do grupo', async () => {
    // Grupo de duplicatas: dois registros CMA para o mesmo funcionário com
    // o MESMO data_vencimento (near-duplicate real) — o mais recente
    // (id 2, data_conclusao mais nova) sobrevive; o mais antigo (id 1) é
    // removido.
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento)
         VALUES (1, 1, '111', 'CMA', '2025-01-01', '2026-01-01')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento)
         VALUES (2, 1, '111', 'CMA', '2025-01-02', '2026-01-01')`,
      )
      .run();
    // Um registro externo (a renovação seguinte) que aponta para o
    // duplicado mais antigo (id 1) como seu predecessor.
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento, renovacao_de, status)
         VALUES (3, 1, '111', 'CMA', '2026-06-01', '2027-06-01', 1, 'CONCLUIDA')`,
      )
      .run();

    const response = await applyDedup();
    expect(response.status).toBe(200);

    const survivor = sqlite.prepare('SELECT deleted_at FROM qualificacoes_historico WHERE id = 2').get() as Record<string, unknown>;
    expect(survivor.deleted_at).toBeNull();

    const removed = sqlite.prepare('SELECT deleted_at FROM qualificacoes_historico WHERE id = 1').get() as Record<string, unknown>;
    expect(removed.deleted_at).not.toBeNull();

    // O sucessor externo agora aponta para o sobrevivente (id 2), não mais
    // para o registro deletado (id 1) — sem ponteiro órfão.
    const successor = sqlite.prepare('SELECT renovacao_de, deleted_at FROM qualificacoes_historico WHERE id = 3').get() as Record<string, unknown>;
    expect(successor.deleted_at).toBeNull();
    expect(successor.renovacao_de).toBe(2);
  });

  it('sobrevivente do grupo apontava para um duplicado do próprio grupo: renovacao_de é zerado, não deixado órfão', async () => {
    // id 1 e id 2 são duplicatas do mesmo grupo; o sobrevivente (id 2)
    // acidentalmente tinha renovacao_de apontando para id 1 (o outro
    // duplicado do mesmo grupo, não um predecessor real externo).
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento)
         VALUES (1, 1, '111', 'CMA', '2025-01-01', '2026-01-01')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento, renovacao_de)
         VALUES (2, 1, '111', 'CMA', '2025-01-02', '2026-01-01', 1)`,
      )
      .run();

    const response = await applyDedup();
    expect(response.status).toBe(200);

    const survivor = sqlite.prepare('SELECT renovacao_de, deleted_at FROM qualificacoes_historico WHERE id = 2').get() as Record<string, unknown>;
    expect(survivor.deleted_at).toBeNull();
    expect(survivor.renovacao_de).toBeNull(); // zerado, nunca deixado apontando para id 1 (deletado)
  });

  it('A<-B<-C (B duplicado de A): remover B repontam C para o sobrevivente, cadeia permanece íntegra', async () => {
    // A = id 10 (predecessor real, grupo diferente). B = ids 20/21 são
    // duplicatas entre si (mesmo vencimento); 21 sobrevive. C = id 30
    // aponta para 20 (o duplicado que será removido).
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento, status)
         VALUES (10, 1, '222', 'CMA', '2023-01-01', '2024-01-01', 'RENOVADA')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento, renovacao_de, status)
         VALUES (20, 1, '222', 'CMA', '2024-06-01', '2025-06-01', 10, 'RENOVADA')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento, renovacao_de, status)
         VALUES (21, 1, '222', 'CMA', '2024-06-02', '2025-06-01', 10, 'RENOVADA')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento, renovacao_de, status)
         VALUES (30, 1, '222', 'CMA', '2026-01-01', '2027-01-01', 20, 'CONCLUIDA')`,
      )
      .run();

    const response = await applyDedup();
    expect(response.status).toBe(200);

    // 20 é o mais antigo do grupo (20/21), removido; 21 sobrevive.
    const removed = sqlite.prepare('SELECT deleted_at FROM qualificacoes_historico WHERE id = 20').get() as Record<string, unknown>;
    expect(removed.deleted_at).not.toBeNull();

    const c = sqlite.prepare('SELECT renovacao_de FROM qualificacoes_historico WHERE id = 30').get() as Record<string, unknown>;
    expect(c.renovacao_de).toBe(21); // repontado para o sobrevivente, não órfão

    // A (id 10) nunca foi tocado.
    const a = sqlite.prepare('SELECT deleted_at, status FROM qualificacoes_historico WHERE id = 10').get() as Record<string, unknown>;
    expect(a.deleted_at).toBeNull();
    expect(a.status).toBe('RENOVADA');
  });

  it('tenant A/B: repoint nunca cruza tenants mesmo com cpf/código idênticos', async () => {
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento)
         VALUES (1, 1, '111', 'CMA', '2025-01-01', '2026-01-01')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento)
         VALUES (2, 1, '111', 'CMA', '2025-01-02', '2026-01-01')`,
      )
      .run();
    // Mesmo cpf/código, tenant 2 — nunca deve ser tocado nem usado como
    // fonte de repoint.
    sqlite
      .prepare(
        `INSERT INTO qualificacoes_historico (id, empresa_id, funcionario_cpf, qualificacao_codigo, data_conclusao, data_vencimento, renovacao_de)
         VALUES (3, 2, '111', 'CMA', '2026-01-01', '2027-01-01', 1)`,
      )
      .run();

    const response = await applyDedup();
    expect(response.status).toBe(200);

    const otherTenantRow = sqlite.prepare('SELECT renovacao_de, deleted_at FROM qualificacoes_historico WHERE id = 3').get() as Record<string, unknown>;
    expect(otherTenantRow.deleted_at).toBeNull(); // não tocado (outro tenant)
    expect(otherTenantRow.renovacao_de).toBe(1); // mantém o valor original — o repoint do tenant 1 nunca deveria alcançá-lo, mas provamos que não altera cross-tenant mesmo que o id "1" exista lá coincidentemente
  });
});
