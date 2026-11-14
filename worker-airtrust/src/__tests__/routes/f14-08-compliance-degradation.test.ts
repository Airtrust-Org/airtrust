import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 6,
  getEscalaVerificada: vi.fn(async () => ({ id: 77, empresa_id: 6 })),
}));

import conflitosRoute from '../../routes/escalas-conflitos';

function makeDb(failAt: 'qualifications' | 'crew' | 'none') {
  const queries: string[] = [];
  const writes: string[] = [];
  const db = {
    prepare: (sql: string) => {
      queries.push(sql);
      return {
        bind: (..._args: unknown[]) => ({
          all: async () => {
            if (sql.includes('FROM escala_tripulacoes et\n')) {
              if (failAt === 'crew') throw new Error('D1_ERROR: overload (synthetic)');
              return {
                results: [{ id: '1', pic_id: 11, sic_id: 12, aeronave: 'AW139',
                  pic_nome: 'Piloto A', sic_nome: 'Piloto B',
                  pic_nasc: null, sic_nasc: null, pic_funcao: 'COMANDANTE', sic_funcao: 'COPILOTO' }],
              };
            }
            if (sql.includes('FROM qualificacoes_historico qh')) {
              if (failAt === 'qualifications') throw new Error('D1_ERROR: overload (synthetic)');
              return { results: [] };
            }
            return { results: [] };
          },
          run: async () => { writes.push(sql); return { meta: { changes: 1 } }; },
        }),
      };
    },
  } as unknown as D1Database;
  return { db, queries, writes };
}

async function callRoute(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/escalas', conflitosRoute);
  const response = await app.fetch(new Request('http://localhost/escalas/77/conflitos'),
    { DB: db } as unknown as Env, {} as ExecutionContext);
  return { response, body: await response.json() as Record<string, unknown> };
}

describe('F14-08 — indisponibilidade não é regularidade operacional', () => {
  it.each(['qualifications', 'crew'] as const)(
    'responde 503 e não sinaliza ausência de conflitos quando falha %s',
    async (failAt) => {
      const { db, writes, queries } = makeDb(failAt);
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { response, body } = await callRoute(db);
        expect(response.status).toBe(503);
        expect(body).toMatchObject({
          success: false, code: 'COMPLIANCE_CHECK_UNAVAILABLE',
          verificacao_indisponivel: true,
        });
        expect(body).not.toHaveProperty('data.tem_conflitos', false);
        expect(queries.some((s) => s.includes('FROM escala_tripulacoes et\n'))).toBe(true);
        expect(writes).toEqual([]);
      } finally {
        spy.mockRestore();
      }
    },
  );

  it('retorna o contrato normal somente quando as verificações concluem', async () => {
    const { db, writes } = makeDb('none');
    const { response, body } = await callRoute(db);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true, data: { tem_conflitos: false, violacoes_compliance: [] },
    });
    expect(writes).toEqual([]);
  });
});
