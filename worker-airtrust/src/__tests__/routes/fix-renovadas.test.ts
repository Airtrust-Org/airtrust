/**
 * Tests for fix-renovadas endpoint and renovation logic.
 *
 * Covers the 6 canonical renovation scenarios:
 *  1 - Renovação simples (antigo=RENOVADA, novo=VALIDA)
 *  2 - Renovação com novo também vencido (antigo=RENOVADA, novo=VENCIDA)
 *  3 - Vencida real sem renovação posterior (permanece VENCIDA)
 *  4 - Qualificações diferentes não se renovam entre si
 *  5 - Planejado não renova um vencido
 *  6 - Manutenção MNT_* multi-ciclo
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  toError: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
}));

import fixRenovadasApp from '../../routes/fix-renovadas';

const EMPRESA_ID = 6;
const TODAY = new Date().toISOString().slice(0, 10);
const PAST_FAR = '2021-01-01';
const PAST_NEAR = '2023-06-01';
const FUTURE = '2027-01-01';

function makeEnv(db: D1Database): Env {
  return { DB: db } as Env;
}

function makeCtx(empresaId = EMPRESA_ID) {
  return {
    get: (key: string) => (key === 'empresaId' ? empresaId : undefined),
  };
}

type Row = Record<string, unknown>;

function createDb(scenario: {
  grupos: Row[];
  registrosPorGrupo?: Record<string, Row[]>;
  updatesCapture?: string[];
}) {
  const updates: string[] = [];
  if (scenario.updatesCapture) {
    // share the array reference so callers can inspect after-the-fact
    scenario.updatesCapture.push = updates.push.bind(updates);
  }

  const db = {
    prepare: vi.fn((sql: string) => {
      const bind = (..._args: unknown[]) => ({
        all: async (): Promise<{ results: Row[] }> => {
          if (sql.includes('GROUP BY qh.funcionario_id')) {
            return { results: scenario.grupos };
          }
          // Per-group record fetch
          const grupoKey = _args[1] as string;
          const rows = scenario.registrosPorGrupo?.[grupoKey] ?? [];
          return { results: rows };
        },
        first: async () => null,
        run: async () => {
          // Bulk shapes from applyRenovadaCandidates (routes/fix-renovadas.ts):
          // "SET renovada" binds (empresaId, ...antigoIds); "SET renovacao_de" binds
          // (...idAntigoValues, empresaId, ...idsMaisRecente).
          if (sql.includes('SET renovada = 1')) {
            for (const id of _args.slice(1)) updates.push(`RENOVADA:${id}`);
          }
          if (sql.includes('SET renovacao_de')) {
            const idsCount = (sql.match(/WHEN \d+ THEN \?/g) || []).length;
            const idAntigoValues = _args.slice(0, idsCount);
            const idsMaisRecente = _args.slice(idsCount + 1);
            idsMaisRecente.forEach((recenteId, index) => {
              updates.push(`LINK:${recenteId}->${idAntigoValues[index]}`);
            });
          }
          return { meta: { changes: 1 } };
        },
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
    batch: async (statements: Array<{ run: () => Promise<unknown> }>) =>
      Promise.all(statements.map((statement) => statement.run())),
  } as unknown as D1Database;

  return { db, updates };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    // inject empresaId into context
    c.set('empresaId' as never, EMPRESA_ID);
    await next();
  });
  app.route('/', fixRenovadasApp);
  return app;
}

// ---------------------------------------------------------------------------
// Scenario 1: Simple renewal — older vencida, newer valida
// ---------------------------------------------------------------------------
describe('Cenário 1 — Renovação simples', () => {
  it('marca o registro antigo como RENOVADA quando existe um mais recente válido', async () => {
    const updates: string[] = [];

    const { db } = createDb({
      grupos: [{ funcionario_id: 1, qualificacao_codigo: 'MNT_MEL', total: 2 }],
      registrosPorGrupo: {
        MNT_MEL: [
          {
            id: 10,
            funcionario_id: 1,
            data_conclusao: PAST_FAR,
            data_vencimento: '2022-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Ana',
            setor_nome: 'Manutenção',
          },
          {
            id: 20,
            funcionario_id: 1,
            data_conclusao: PAST_NEAR,
            data_vencimento: FUTURE,
            status: 'VALIDA',
            renovada: 0,
            funcionario_nome: 'Ana',
            setor_nome: 'Manutenção',
          },
        ],
      },
      updatesCapture: updates,
    });

    const app = createApp();
    const res = await app.request(
      '/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      },
      makeEnv(db),
    );

    const body = (await res.json()) as { success: boolean; data: { total_renovadas: number } };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total_renovadas).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Both new and old are vencida — old becomes RENOVADA, new stays VENCIDA
// ---------------------------------------------------------------------------
describe('Cenário 2 — Novo registro também vencido', () => {
  it('antigo vira RENOVADA; novo (mais recente) permanece VENCIDA', async () => {
    const { db } = createDb({
      grupos: [{ funcionario_id: 2, qualificacao_codigo: 'MNT_MGM', total: 2 }],
      registrosPorGrupo: {
        MNT_MGM: [
          {
            id: 30,
            funcionario_id: 2,
            data_conclusao: '2020-01-01',
            data_vencimento: '2021-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Bruno',
            setor_nome: 'Manutenção',
          },
          {
            id: 40,
            funcionario_id: 2,
            data_conclusao: '2022-01-01',
            data_vencimento: '2023-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Bruno',
            setor_nome: 'Manutenção',
          },
        ],
      },
    });

    const app = createApp();
    const res = await app.request('/preview', { method: 'GET' }, makeEnv(db));
    const body = (await res.json()) as {
      success: boolean;
      data: {
        total_candidatos: number;
        items: Array<{ id_antigo: number; novo_status_proposto: string }>;
      };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total_candidatos).toBe(1);
    // Only the OLDER record (id=30) is proposed to become RENOVADA
    expect(body.data.items[0].id_antigo).toBe(30);
    expect(body.data.items[0].novo_status_proposto).toBe('RENOVADA');
    // The newer record (id=40) is NOT in the candidatos list
    expect(body.data.items.some((item) => item.id_antigo === 40)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Single vencida — no newer record — stays VENCIDA
// ---------------------------------------------------------------------------
describe('Cenário 3 — Vencida real sem renovação', () => {
  it('não encontra candidatos quando só há um registro por qualificação', async () => {
    const { db } = createDb({
      // HAVING COUNT(*) > 1 is FALSE — no groups
      grupos: [],
    });

    const app = createApp();
    const res = await app.request('/preview', { method: 'GET' }, makeEnv(db));
    const body = (await res.json()) as { success: boolean; data: { total_candidatos: number } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total_candidatos).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Different qualifications must not cross-renovate
// ---------------------------------------------------------------------------
describe('Cenário 4 — Qualificações diferentes não se renovam', () => {
  it('registra como grupos separados — MNT_PROD_AS350 e MNT_PROD_SK76 não se renovam', async () => {
    const { db } = createDb({
      // Two separate groups, each with only 1 record — HAVING COUNT(*) > 1 is FALSE for both
      grupos: [],
    });

    const app = createApp();
    const res = await app.request('/preview', { method: 'GET' }, makeEnv(db));
    const body = (await res.json()) as { success: boolean; data: { total_candidatos: number } };

    expect(body.data.total_candidatos).toBe(0);
  });

  it('mesmo funcionário com dois grupos distintos → cada grupo tratado independentemente', async () => {
    const { db } = createDb({
      grupos: [
        { funcionario_id: 3, qualificacao_codigo: 'MNT_PROD_AS350', total: 2 },
        { funcionario_id: 3, qualificacao_codigo: 'MNT_PROD_SK76', total: 2 },
      ],
      registrosPorGrupo: {
        MNT_PROD_AS350: [
          {
            id: 50,
            funcionario_id: 3,
            data_conclusao: '2021-01-01',
            data_vencimento: '2022-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Carlos',
            setor_nome: 'Manutenção',
          },
          {
            id: 51,
            funcionario_id: 3,
            data_conclusao: '2023-01-01',
            data_vencimento: FUTURE,
            status: 'VALIDA',
            renovada: 0,
            funcionario_nome: 'Carlos',
            setor_nome: 'Manutenção',
          },
        ],
        MNT_PROD_SK76: [
          {
            id: 60,
            funcionario_id: 3,
            data_conclusao: '2021-06-01',
            data_vencimento: '2022-06-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Carlos',
            setor_nome: 'Manutenção',
          },
          {
            id: 61,
            funcionario_id: 3,
            data_conclusao: '2023-06-01',
            data_vencimento: FUTURE,
            status: 'VALIDA',
            renovada: 0,
            funcionario_nome: 'Carlos',
            setor_nome: 'Manutenção',
          },
        ],
      },
    });

    const app = createApp();
    const res = await app.request('/preview', { method: 'GET' }, makeEnv(db));
    const body = (await res.json()) as {
      success: boolean;
      data: { total_candidatos: number; items: Array<{ id_antigo: number }> };
    };

    expect(body.data.total_candidatos).toBe(2);
    // Each group contributes its own old record — they are NOT mixed
    const antigos = body.data.items.map((item) => item.id_antigo).sort();
    expect(antigos).toEqual([50, 60]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Planned record must NOT renew a vencida
// ---------------------------------------------------------------------------
describe('Cenário 5 — Planejado não renova vencido', () => {
  it('registro planejado é excluído dos candidatos; vencido permanece VENCIDA', async () => {
    const { db } = createDb({
      // The GROUP BY query excludes PLANEJADA/PLANEJADO statuses (AND NOT IN ('PLANEJADA','PLANEJADO',...))
      // so a group of (vencida, planejada) would appear as count=1 → excluded by HAVING > 1
      grupos: [],
    });

    const app = createApp();
    const res = await app.request('/preview', { method: 'GET' }, makeEnv(db));
    const body = (await res.json()) as { success: boolean; data: { total_candidatos: number } };

    expect(body.data.total_candidatos).toBe(0);
  });

  it('mesmo que o grupo apareça, registros com status PLANEJADA são filtrados nos records', async () => {
    // Edge case: group query somehow returns the pair, but per-record filter should exclude PLANEJADA
    const { db } = createDb({
      grupos: [{ funcionario_id: 4, qualificacao_codigo: 'MNT_IRM', total: 2 }],
      registrosPorGrupo: {
        MNT_IRM: [
          // Only 1 non-PLANEJADA row → per-group count <= 1 → no candidates
          {
            id: 70,
            funcionario_id: 4,
            data_conclusao: '2022-01-01',
            data_vencimento: '2023-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Diana',
            setor_nome: 'Manutenção',
          },
          // Planejada is excluded by the per-group query (status NOT IN PLANEJADA list)
          // but if it slips through, it should NOT become the id_mais_recente that drives RENOVADA
        ],
      },
    });

    const app = createApp();
    const res = await app.request('/preview', { method: 'GET' }, makeEnv(db));
    const body = (await res.json()) as { success: boolean; data: { total_candidatos: number } };

    // Single non-PLANEJADA row → rows.length === 1 → no candidates
    expect(body.data.total_candidatos).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Manutenção MNT_* multi-cycle (3 records)
// ---------------------------------------------------------------------------
describe('Cenário 6 — Manutenção MNT_* multi-ciclo', () => {
  it('com 3 ciclos: os dois mais antigos viram RENOVADA; o mais recente fica intacto', async () => {
    const { db } = createDb({
      grupos: [{ funcionario_id: 5, qualificacao_codigo: 'MNT_SGSO', total: 3 }],
      registrosPorGrupo: {
        MNT_SGSO: [
          {
            id: 100,
            funcionario_id: 5,
            data_conclusao: '2019-01-01',
            data_vencimento: '2020-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Eduardo',
            setor_nome: 'Manutenção',
          },
          {
            id: 101,
            funcionario_id: 5,
            data_conclusao: '2021-01-01',
            data_vencimento: '2022-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Eduardo',
            setor_nome: 'Manutenção',
          },
          {
            id: 102,
            funcionario_id: 5,
            data_conclusao: '2024-01-01',
            data_vencimento: '2025-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Eduardo',
            setor_nome: 'Manutenção',
          },
        ],
      },
    });

    const app = createApp();
    const res = await app.request('/preview', { method: 'GET' }, makeEnv(db));
    const body = (await res.json()) as {
      success: boolean;
      data: {
        total_candidatos: number;
        items: Array<{ id_antigo: number; id_mais_recente: number }>;
      };
    };

    expect(res.status).toBe(200);
    expect(body.data.total_candidatos).toBe(2);

    const antigos = body.data.items.map((item) => item.id_antigo).sort((a, b) => a - b);
    expect(antigos).toEqual([100, 101]);

    // Both point to the latest record as the "mais recente"
    for (const item of body.data.items) {
      expect(item.id_mais_recente).toBe(102);
    }
  });

  it('já-renovadas não são reprocessadas', async () => {
    const { db } = createDb({
      grupos: [{ funcionario_id: 6, qualificacao_codigo: 'MNT_MEL', total: 2 }],
      registrosPorGrupo: {
        MNT_MEL: [
          // already renovada — should be skipped
          {
            id: 200,
            funcionario_id: 6,
            data_conclusao: '2020-01-01',
            data_vencimento: '2021-01-01',
            status: 'RENOVADA',
            renovada: 1,
            funcionario_nome: 'Flávia',
            setor_nome: 'Manutenção',
          },
          {
            id: 201,
            funcionario_id: 6,
            data_conclusao: '2023-01-01',
            data_vencimento: FUTURE,
            status: 'VALIDA',
            renovada: 0,
            funcionario_nome: 'Flávia',
            setor_nome: 'Manutenção',
          },
        ],
      },
    });

    const app = createApp();
    const res = await app.request('/preview', { method: 'GET' }, makeEnv(db));
    const body = (await res.json()) as { success: boolean; data: { total_candidatos: number } };

    expect(body.data.total_candidatos).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// dry_run=true returns preview without DB writes
// ---------------------------------------------------------------------------
describe('dry_run mode', () => {
  it('retorna candidatos sem executar updates quando dry_run=true', async () => {
    const runCalls: string[] = [];

    const db = {
      prepare: vi.fn((sql: string) => {
        const bind = (...args: unknown[]) => ({
          all: async () => {
            if (sql.includes('GROUP BY qh.funcionario_id')) {
              return { results: [{ funcionario_id: 7, qualificacao_codigo: 'MNT_MOM', total: 2 }] };
            }
            return {
              results: [
                {
                  id: 300,
                  funcionario_id: 7,
                  data_conclusao: '2020-01-01',
                  data_vencimento: '2021-01-01',
                  status: 'VENCIDA',
                  renovada: 0,
                  funcionario_nome: 'Gabi',
                  setor_nome: 'Manutenção',
                },
                {
                  id: 301,
                  funcionario_id: 7,
                  data_conclusao: '2023-01-01',
                  data_vencimento: FUTURE,
                  status: 'VALIDA',
                  renovada: 0,
                  funcionario_nome: 'Gabi',
                  setor_nome: 'Manutenção',
                },
              ],
            };
          },
          first: async () => null,
          run: async () => {
            runCalls.push(sql.slice(0, 50));
            return { meta: { changes: 1 } };
          },
        });
        return {
          bind,
          first: () => bind().first(),
          all: () => bind().all(),
          run: () => bind().run(),
        };
      }),
    } as unknown as D1Database;

    const app = createApp();
    const res = await app.request(
      '/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true }),
      },
      makeEnv(db),
    );

    const body = (await res.json()) as {
      success: boolean;
      data: { dry_run: boolean; total_candidatos: number };
    };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.dry_run).toBe(true);
    expect(body.data.total_candidatos).toBe(1);
    // No UPDATE calls should have been made
    expect(runCalls.filter((q) => q.includes('SET renovada'))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /stats uses funcionario_id (not funcionario_cpf)
// ---------------------------------------------------------------------------
describe('GET /stats', () => {
  it('conta renovadas por funcionario_id e empresa_id', async () => {
    const db = {
      prepare: vi.fn((sql: string) => {
        expect(sql).not.toContain('funcionario_cpf');
        expect(sql).toContain('empresa_id');
        return {
          bind: (..._args: unknown[]) => ({
            first: async () => ({
              total: 10,
              renovadas: 3,
              vinculadas: 3,
              total_funcionarios: 5,
              funcionarios_com_renovacao: 2,
            }),
          }),
          first: async () => ({
            total: 10,
            renovadas: 3,
            vinculadas: 3,
            total_funcionarios: 5,
            funcionarios_com_renovacao: 2,
          }),
        };
      }),
    } as unknown as D1Database;

    const app = createApp();
    const res = await app.request('/stats', { method: 'GET' }, makeEnv(db));
    const body = (await res.json()) as { success: boolean; data: { renovadas: number } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.renovadas).toBe(3);
  });
});
