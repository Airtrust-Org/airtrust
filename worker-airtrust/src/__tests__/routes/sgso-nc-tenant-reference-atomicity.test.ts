/**
 * POST /sgso/nao-conformidades — tenant-owned foreign references and
 * atomicity for the MAJOR + barreira transition. Complements
 * sgso-auditorias-ncs-guards.test.ts, which doesn't exercise
 * auditoria_id/relato_id/barreira_id at all (those fields are optional and
 * simply unset in its payloads).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 55);
    c.set('userRole', String(c.env?.__mockRole || 'manager'));
    c.set('tenantContext', {
      empresaId: Number(c.env?.__mockEmpresaId ?? 77),
      empresaCodigo: 'acme',
      empresaNome: 'Acme Air',
      role: 'manager',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
}));

import sgsoRoutes from '../../routes/sgso';

type Ref = { id: string; empresaId: number; statusSaude?: string };
type MockOpts = {
  auditorias?: Ref[];
  relatos?: Ref[];
  barreiras?: Ref[];
};

function createMockDb(opts: MockOpts) {
  const calls: Array<{ query: string; args: unknown[] }> = [];
  const batchCalls: number[] = [];

  const findRef = (refs: Ref[] | undefined, id: unknown, empresaId: unknown) =>
    (refs || []).find((r) => r.id === id && r.empresaId === Number(empresaId));

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ query, args });

        if (query.includes('SELECT id FROM sgso_auditorias WHERE')) {
          const [id, empresaId] = args;
          const ref = findRef(opts.auditorias, id, empresaId);
          return { first: async () => (ref ? { id: ref.id } : null) };
        }

        if (query.includes('SELECT id FROM sgso_relatos WHERE')) {
          const [id, empresaId] = args;
          const ref = findRef(opts.relatos, id, empresaId);
          return { first: async () => (ref ? { id: ref.id } : null) };
        }

        if (query.includes('SELECT id, status_saude') && query.includes('sgso_bowtie_barreiras')) {
          const [id, empresaId] = args;
          const ref = findRef(opts.barreiras, id, empresaId);
          return {
            first: async () =>
              ref ? { id: ref.id, status_saude: ref.statusSaude ?? 'OPERANTE' } : null,
          };
        }

        if (query.includes('INSERT INTO sgso_nao_conformidades')) {
          return { run: async () => ({ meta: { changes: 1, last_row_id: 42 } }) };
        }

        if (
          query.includes('INSERT INTO sgso_bowtie_barreira_historico') ||
          query.includes('UPDATE sgso_bowtie_barreiras')
        ) {
          return { run: async () => ({ meta: { changes: 1 } }) };
        }

        return {
          first: async (): Promise<null> => null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 0 } }),
        };
      },
    })),
    batch: vi.fn(async (statements: Array<{ run: () => Promise<unknown> }>) => {
      batchCalls.push(statements.length);
      return Promise.all(statements.map((statement) => statement.run()));
    }),
  } as unknown as D1Database;

  return { db, calls, batchCalls };
}

function createSgsoApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/sgso', sgsoRoutes);
  return app;
}

function postNc(app: Hono<{ Bindings: Env }>, db: D1Database, body: Record<string, unknown>) {
  return app.request(
    '/sgso/nao-conformidades',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { DB: db, __mockEmpresaId: 77 } as unknown as Env,
  );
}

describe('POST /sgso/nao-conformidades — referências tenant-owned', () => {
  it('rejeita auditoria_id de outro tenant antes de gravar qualquer coisa', async () => {
    const app = createSgsoApp();
    const { db, calls } = createMockDb({ auditorias: [{ id: 'aud-1', empresaId: 999 }] });

    const res = await postNc(app, db, {
      tipo: 'MENOR',
      descricao: 'Achado de auditoria cross-tenant',
      auditoria_id: 'aud-1',
    });

    expect(res.status).toBe(400);
    expect(calls.some((c) => c.query.includes('INSERT INTO sgso_nao_conformidades'))).toBe(false);
  });

  it('rejeita relato_id de outro tenant antes de gravar qualquer coisa', async () => {
    const app = createSgsoApp();
    const { db, calls } = createMockDb({ relatos: [{ id: 'rel-1', empresaId: 999 }] });

    const res = await postNc(app, db, {
      tipo: 'MENOR',
      descricao: 'NC a partir de relato cross-tenant',
      relato_id: 'rel-1',
    });

    expect(res.status).toBe(400);
    expect(calls.some((c) => c.query.includes('INSERT INTO sgso_nao_conformidades'))).toBe(false);
  });

  it('rejeita barreira_id de outro tenant antes de gravar qualquer coisa', async () => {
    const app = createSgsoApp();
    const { db, calls } = createMockDb({ barreiras: [{ id: 'barr-1', empresaId: 999 }] });

    const res = await postNc(app, db, {
      tipo: 'MAJOR',
      descricao: 'NC MAJOR com barreira cross-tenant',
      barreira_id: 'barr-1',
    });

    expect(res.status).toBe(400);
    expect(calls.some((c) => c.query.includes('INSERT INTO sgso_nao_conformidades'))).toBe(false);
  });

  it('aceita referências do próprio tenant e grava NC + transição de barreira em um único db.batch atômico', async () => {
    const app = createSgsoApp();
    const { db, batchCalls } = createMockDb({
      barreiras: [{ id: 'barr-1', empresaId: 77, statusSaude: 'OPERANTE' }],
    });

    const res = await postNc(app, db, {
      tipo: 'MAJOR',
      descricao: 'NC MAJOR com barreira do próprio tenant',
      barreira_id: 'barr-1',
    });

    expect(res.status).toBe(201);
    // One db.batch call carrying all three statements (NC insert + barrier
    // history + barrier status update) — not three sequential awaits.
    expect(batchCalls).toEqual([3]);
  });

  it('não inclui statements de transição de barreira quando ela já está DEGRADADA (evita histórico duplicado)', async () => {
    const app = createSgsoApp();
    const { db, batchCalls } = createMockDb({
      barreiras: [{ id: 'barr-1', empresaId: 77, statusSaude: 'DEGRADADA' }],
    });

    const res = await postNc(app, db, {
      tipo: 'MAJOR',
      descricao: 'NC MAJOR com barreira já degradada',
      barreira_id: 'barr-1',
    });

    expect(res.status).toBe(201);
    // Only the NC insert — no redundant OPERANTE -> DEGRADADA transition.
    expect(batchCalls).toEqual([1]);
  });
});

describe('SGSO — GET auditorias/NCs exigem papel admin/manager', () => {
  it.each([['/sgso/auditorias'], ['/sgso/auditorias/aud-1'], ['/sgso/nao-conformidades']])(
    '%s retorna 403 para role sem privilégio',
    async (path) => {
      const app = createSgsoApp();
      const { db } = createMockDb({});

      const res = await app.request(path, { method: 'GET' }, {
        DB: db,
        __mockRole: 'student',
        __mockEmpresaId: 77,
      } as unknown as Env);
      expect(res.status).toBe(403);
    },
  );

  it('GET /sgso/auditorias permite admin', async () => {
    const app = createSgsoApp();
    const { db } = createMockDb({});

    const res = await app.request('/sgso/auditorias', { method: 'GET' }, {
      DB: db,
      __mockRole: 'admin',
      __mockEmpresaId: 77,
    } as unknown as Env);
    expect(res.status).toBe(200);
  });
});
