import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({
    empresaId: 42, empresaCodigo: 'tenant42', empresaNome: 'Tenant 42',
    role: 'admin', plano: 'pro', permissions: ['read'],
  }),
}));
vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'unrestricted', setorIds: [], funcionarioId: null })),
  buildFuncionarioScopeWhere: vi.fn(() => ({ clause: '1=1', bindings: [] })),
}));

import dashboardRoutes from '../../routes/dashboard';

type Scalar = string | number | null;
type NativeSqlite = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...args: Scalar[]): Record<string, unknown>[];
    get(...args: Scalar[]): Record<string, unknown> | undefined;
  };
  close(): void;
};
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as
  new (filename: string) => NativeSqlite;

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE empresas_config (empresa_id INTEGER, dias_alerta_vencimento INTEGER);
    CREATE TABLE funcionarios (
      id INTEGER, empresa_id INTEGER, nome TEXT, deleted_at TEXT, status TEXT
    );
    CREATE TABLE qualificacoes_tipos (
      id INTEGER, empresa_id INTEGER, codigo TEXT, categoria TEXT,
      nome TEXT, validade INTEGER, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER, funcionario_id INTEGER, empresa_id INTEGER,
      qualificacao_id INTEGER, qualificacao_codigo TEXT, tipo TEXT,
      data_conclusao TEXT, data_vencimento TEXT, validade_meses INTEGER,
      status TEXT, deleted_at TEXT, renovada INTEGER, renovacao_de INTEGER,
      updated_at TEXT, created_at TEXT
    );
    INSERT INTO empresas_config VALUES (42,30);
    INSERT INTO funcionarios VALUES
      (1,42,'PIC',NULL,'ATIVO'),(2,42,'SIC',NULL,'ATIVO'),
      (3,42,'PLANEJADA',NULL,'ATIVO'),(4,42,'CANCELADA',NULL,'ATIVO'),
      (5,43,'OUTRO_TENANT',NULL,'ATIVO');
    INSERT INTO qualificacoes_tipos VALUES
      (10,42,'CMA','CHECK','CMA',12,NULL),
      (10,43,'CMA','OUTRO_TENANT','CMA EXTERNO',12,NULL);
    INSERT INTO qualificacoes_historico VALUES
      (100,1,42,10,'CMA','CMA','2025-10-01','2026-10-01',12,'CONCLUIDA',NULL,1,NULL,NULL,NULL),
      (99,1,42,10,'CMA','CMA','2026-02-01','2026-11-14',12,'CONCLUIDA',NULL,0,100,NULL,NULL),
      (200,2,42,10,'CMA','CMA','2025-11-13','2026-11-13',12,'CONCLUIDA',NULL,0,NULL,NULL,NULL),
      (201,3,42,10,'CMA','CMA',NULL,'2026-11-13',12,'PLANEJADA',NULL,0,NULL,NULL,NULL),
      (202,4,42,10,'CMA','CMA','2025-11-13','2026-11-13',12,'CANCELADA',NULL,0,NULL,NULL,NULL),
      (203,5,43,10,'CMA','CMA','2025-11-13','2026-11-13',12,'CONCLUIDA',NULL,0,NULL,NULL,NULL),
      (204,5,42,10,'CMA','CMA','2025-11-13','2026-11-13',12,'CONCLUIDA',NULL,0,NULL,NULL,NULL);
  `);
  const wrap = (sql: string, args: Scalar[]) => ({
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: Scalar[]) => wrap(sql, args),
      ...wrap(sql, []),
    }),
  } as unknown as D1Database;
  const app = new Hono<{ Bindings: Env }>();
  app.route('/dashboard', dashboardRoutes);
  return { sqlite, db, app };
}

afterEach(() => vi.useRealTimers());

describe('F14-01/02 — paridade real Dashboard/Qualificações', () => {
  it('não conta predecessor renovado, CANCELADA, PLANEJADA ou registros cross-tenant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T02:30:00Z')); // 23h30 de 14/11 em São Paulo
    const { sqlite, db, app } = setup();
    try {
      const res = await app.fetch(
        new Request('http://localhost/dashboard/qualificacoes'),
        { DB: db } as Env,
        {} as ExecutionContext,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { success: boolean; data: Record<string, unknown> };
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        total_ativas: 2,
        validas: 0,
        a_vencer_30_dias: 1,
        vencidas: 1,
        renovadas: 1,
        planejadas: 1,
        por_categoria: [{ categoria: 'CHECK', total: 2 }],
      });
    } finally { sqlite.close(); }
  });

  it('muda classificação somente após meia-noite BRT, sem modificar o total corrente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T03:30:00Z'));
    const { sqlite, db, app } = setup();
    try {
      const res = await app.fetch(
        new Request('http://localhost/dashboard/qualificacoes'),
        { DB: db } as Env,
        {} as ExecutionContext,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { data: Record<string, unknown> };
      expect(body.data).toMatchObject({
        total_ativas: 2,
        a_vencer_30_dias: 0,
        vencidas: 2,
      });
    } finally { sqlite.close(); }
  });
});
