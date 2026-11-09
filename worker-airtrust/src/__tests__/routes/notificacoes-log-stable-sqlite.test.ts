import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('empresaId', Number(c.req.header('x-test-empresa-id')));
    c.set('userRole', 'admin');
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId')),
  isPlatformAdminContext: () => false,
}));
vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: async () => ({ mode: 'all', setorIds: [], funcionarioId: null }),
  appendEmployeeSectorFilter: () => undefined,
}));

import notificacoesRoutes from '../../routes/notificacoes';

const Database = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE notificacoes_log (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, config_id INTEGER, qualificacao_historico_id INTEGER,
      funcionario_cpf TEXT, tipo TEXT, destinatario TEXT, assunto TEXT, corpo TEXT,
      status TEXT, erro_mensagem TEXT, enviado_em TEXT, created_at TEXT
    );
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, cpf TEXT, nome TEXT, deleted_at TEXT);
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER,
      qualificacao_codigo TEXT, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, nome TEXT, categoria TEXT, deleted_at TEXT
    );
    INSERT INTO funcionarios VALUES
       (1,6,'111','Primeiro duplicado',NULL),
       (2,6,'111','Segundo duplicado',NULL),
       (4,6,'444','Funcionaria correta',NULL),
       (7,7,'777','Outro tenant',NULL);
    INSERT INTO qualificacoes_historico VALUES
       (10,6,4,'CRM',NULL),
       (20,7,7,'CRM',NULL);
    INSERT INTO qualificacoes_tipos VALUES
       (100,6,'CRM','CRM antigo','TREINAMENTO',NULL),
       (101,6,'CRM','CRM vigente','TREINAMENTO',NULL),
       (200,7,'CRM','CRM empresa 7','TREINAMENTO',NULL);
    INSERT INTO notificacoes_log VALUES
       (1,6,NULL,NULL,'111','EMAIL','dest','one','body','enviada',NULL,'2026-11-09','2026-11-09 12:00:00'),
       (2,6,NULL,NULL,'111','EMAIL','dest','two','body','erro',NULL,'2026-11-09','2026-11-09 12:00:00'),
       (3,6,NULL,10,'444','EMAIL','dest','three','body','enviada',NULL,'2026-11-09','2026-11-09 12:00:00'),
       (4,6,NULL,20,'111','EMAIL','dest','four','body','pendente',NULL,'2026-11-09','2026-11-09 12:00:00'),
       (5,7,NULL,20,'777','EMAIL','dest','other','body','enviada',NULL,'2026-11-09','2026-11-09 12:00:00');
  `);
  return db;
}

function createEnv(db: DatabaseSync) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: any[]) {
            return { async all() { return { results: db.prepare(sql).all(...args) }; } };
          },
        };
      },
    },
  } as unknown as Env;
}

async function request(env: Env, empresaId: number, limit = 50, offset = 0) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/notificacoes', notificacoesRoutes);
  return app.request(`/api/notificacoes/log?limit=${limit}&offset=${offset}`, {
    headers: { authorization: 'Bearer synthetic', 'x-test-empresa-id': String(empresaId) },
  }, env);
}

describe('P04-07 real SQLite notification log stable pagination and tenant-safe joins', () => {
  it('returns each notification once, despite duplicate CPF and model code', async () => {
    const db = createDb();
    try {
      const response = await request(createEnv(db), 6);
      expect(response.status).toBe(200);
      const result = await response.json() as any;
      expect(result.data.map((r: any) => r.id)).toEqual([4, 3, 2, 1]);
      expect(result.meta.stats).toMatchObject({ total: 4, enviadas: 2, erros: 1, pendentes: 1 });
      const realHistory = result.data.find((r: any) => r.id === 3);
      expect(realHistory.funcionario_nome).toBe('Funcionaria correta');
      expect(realHistory.qualificacao_nome).toBe('CRM vigente');
      expect(result.data.find((r: any) => r.id === 4).funcionario_nome).toBeNull();
      expect(result.data.find((r: any) => r.id === 1).funcionario_nome).toBeNull();
    } finally { db.close(); }
  });
  it('pages deterministic ties without duplication or cross-company disclosure', async () => {
    const db = createDb();
    try {
      const env = createEnv(db);
      const first = await (await request(env, 6, 2, 0)).json() as any;
      const second = await (await request(env, 6, 2, 2)).json() as any;
      const other = await (await request(env, 7)).json() as any;
      expect(first.data.map((r: any) => r.id)).toEqual([4, 3]);
      expect(second.data.map((r: any) => r.id)).toEqual([2, 1]);
      expect(other.data.map((r: any) => r.id)).toEqual([5]);
      expect(other.meta.stats.total).toBe(1);
    } finally { db.close(); }
  });
});
