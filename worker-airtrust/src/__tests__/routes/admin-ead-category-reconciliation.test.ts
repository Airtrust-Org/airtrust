import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: any, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({ empresaId: c.env.__tenant ?? 6 }),
}));

import routes from '../../routes/admin-ead-category-reconciliation';

const romulo = [5305, 5307, 5308, 5321, 5323, 5373, 5374, 5375, 5440];

function makeDb() {
  const batches: string[][] = [];
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) {
          args = bound;
          return statement;
        },
        async all() {
          if (sql.includes('sqlite_master'))
            return {
              results: [
                { name: 'qualificacoes_category_only_0450_rollback' },
                { name: 'ead_category_reconciliation_runs' },
              ],
            };
          if (sql.includes('FROM qualificacoes_categorias'))
            return {
              results: [{ id: 13, nome: 'EAD', cor: '#999999', ativo: 0, deleted_at: null }],
            };
          if (sql.includes('FROM qualificacoes_historico qh'))
            return {
              results: romulo.map((id) => ({
                id,
                qualificacao_id: 10,
                categoria_id: id === 5305 ? 3 : null,
                categoria: 'Treinamento Teórico',
                formato_id: 2,
                formato_codigo: 'EAD',
                deleted_at: null,
                tipo_id: 10,
                tipo_categoria: 'Treinamento Teórico',
              })),
            };
          if (sql.includes('FROM lms_cursos c'))
            return {
              results: [
                {
                  id: 20,
                  qualificacao_tipo_id: 10,
                  categoria: 'Treinamento Teórico',
                  formato_id: 2,
                  gerar_qualificacao_ao_concluir: 0,
                  deleted_at: null,
                  tipo_categoria: 'Treinamento Teórico',
                },
              ],
            };
          if (sql.includes('FROM qualificacoes_tipos qt'))
            return {
              results: [
                {
                  id: 10,
                  categoria_id: 3,
                  categoria: 'Treinamento Teórico',
                  formato_id: 2,
                  deleted_at: null,
                },
              ],
            };
          if (sql.includes('FROM qualificacoes_formatos')) return { results: [{ id: 2 }] };
          return { results: [] };
        },
        async first() {
          if (sql.includes('COUNT(*) AS count')) return { count: 1 };
          if (sql.includes('ead_category_reconciliation_runs')) return null;
          return null;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        _sql: sql,
        _args: () => args,
      };
      return statement;
    },
    async batch(statements: Array<{ _sql: string }>) {
      batches.push(statements.map((item) => item._sql));
      return [];
    },
  };
  return { db: db as unknown as D1Database, batches };
}

function makeBucket() {
  const data = new Map<string, string>();
  return {
    put: async (key: string, value: string) => {
      data.set(key, value);
    },
    get: async (key: string) => (data.has(key) ? { text: async () => data.get(key)! } : null),
    data,
  } as unknown as R2Bucket;
}

function app() {
  const value = new Hono<{ Bindings: Env }>();
  value.route('/x', routes);
  return value;
}

describe('EAD category reconciliation executor', () => {
  it('produces a strict plan for legacy format residues and applies only tenant 6 rows after R2 verification', async () => {
    const { db, batches } = makeDb();
    const bucket = makeBucket();
    const env = {
      DB: db,
      BUCKET: bucket,
      ENABLE_EAD_CATEGORY_RECONCILIATION_EXECUTOR: 'true',
      __tenant: 6,
    } as unknown as Env;
    const api = app();
    const dry = await api.request('/x/dry-run', { method: 'POST' }, env);
    expect(dry.status).toBe(200);
    const payload = (await dry.json()) as any;
    expect(payload.plan.romulo_history_ids).toEqual(romulo);
    expect(payload.plan.total_operations).toBe(12);
    expect(
      payload.plan.operations.some(
        (op: any) =>
          op.table === 'qualificacoes_historico' && op.id === 5305 && op.after.categoria_id === 13,
      ),
    ).toBe(true);
    const apply = await api.request(
      '/x/apply',
      {
        method: 'POST',
        body: JSON.stringify({
          run_uuid: 'ead-test-1',
          plan_sha256: payload.plan.plan_sha256,
          confirmation: 'APPLY_EAD_CATEGORY_RECONCILIATION',
          expected_source_sha: 'unknown',
          expected_worker_version: 'unknown',
        }),
      },
      env,
    );
    expect(apply.status).toBe(200);
    expect(batches).toHaveLength(1);
    expect(
      batches[0].every(
        (sql) =>
          !/UPDATE\s+(?!qualificacoes_categorias|qualificacoes_tipos|qualificacoes_historico|lms_cursos)/i.test(
            sql,
          ),
      ),
    ).toBe(true);
    expect((bucket as any).data.size).toBe(1);
  });

  it('rejects any tenant other than empresa 6', async () => {
    const { db } = makeDb();
    const env = {
      DB: db,
      BUCKET: makeBucket(),
      ENABLE_EAD_CATEGORY_RECONCILIATION_EXECUTOR: 'true',
      __tenant: 7,
    } as unknown as Env;
    const response = await app().request('/x/dry-run', { method: 'POST' }, env);
    expect(response.status).toBe(400);
    expect(((await response.json()) as any).error).toMatch(/somente para empresa 6/);
  });
});
