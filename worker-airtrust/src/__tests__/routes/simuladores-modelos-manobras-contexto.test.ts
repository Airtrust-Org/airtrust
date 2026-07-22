import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'admin');
    c.set('empresaId', 7);
    c.set('tenantContext', {
      empresaId: 7,
      empresaCodigo: 'tenant-7',
      empresaNome: 'Tenant 7',
      role: 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    audit: vi.fn(async () => undefined),
  };
});

import simuladoresModelosRoutes from '../../routes/simuladores-modelos';

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('GET /modelos-sessao/:id/manobras historical context', () => {
  it('normalizes contexto fields from version context and falls back for LEGACY', async () => {
    const db = {
      prepare(query: string) {
        const sql = normalizeSql(query);
        return {
          bind(..._args: unknown[]) {
            return {
              async first() {
                return null;
              },
              async all() {
                if (sql.includes('FROM modelos_sessao_manobras msm')) {
                  return {
                    results: [
                      {
                        id: 1,
                        ordem: 1,
                        obrigatoria: 1,
                        observacoes: null,
                        tripulante: 'A',
                        manobra_id: 10,
                        manobra_codigo: 'MAN-1',
                        manobra_nome: 'Decolagem',
                        manobra_descricao: 'Decolagem',
                        manobra_categoria: 'SOLO',
                        nivel_dificuldade: 1,
                        tempo_estimado: 5,
                        metadados_contextuais: JSON.stringify({
                          fase_voo: 'DECOLAGEM',
                          tipo_conteudo: 'NORMAL',
                          execucao_pf: 'PFA',
                          codigo_manobra: 'MAN-1',
                          nome: 'Decolagem PFA',
                        }),
                        contexto_fase_voo: 'DECOLAGEM',
                        contexto_tipo_conteudo: 'NORMAL',
                        contexto_execucao_pf: 'PFA',
                        contexto_codigo_manobra: 'MAN-1',
                        contexto_nome: 'Decolagem PFA',
                      },
                      {
                        id: 2,
                        ordem: 2,
                        obrigatoria: 1,
                        observacoes: null,
                        tripulante: 'B',
                        manobra_id: 11,
                        manobra_codigo: 'MAN-2',
                        manobra_nome: 'Pouso',
                        manobra_descricao: 'Pouso',
                        manobra_categoria: 'POUSO',
                        nivel_dificuldade: 1,
                        tempo_estimado: 5,
                        metadados_contextuais: null,
                        contexto_fase_voo: null,
                        contexto_tipo_conteudo: null,
                        contexto_execucao_pf: null,
                        contexto_codigo_manobra: null,
                        contexto_nome: null,
                      },
                    ],
                  };
                }
                if (sql.startsWith('SELECT name FROM sqlite_master') || sql.includes('sqlite_master')) {
                  return { results: [{ name: 'modelos_sessao_manobras_contexto' }] };
                }
                return { results: [] };
              },
              async run() {
                return { meta: { changes: 0 } };
              },
            };
          },
          async all() {
            if (sql.includes('sqlite_master') || sql.includes('PRAGMA table_info')) {
              return { results: [{ name: 'modelos_sessao_manobras_contexto' }] };
            }
            return { results: [] };
          },
        };
      },
    };

    const res = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao/1000/manobras', {
        headers: { Authorization: 'Bearer test' },
      }),
      { DB: db } as Env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].contexto).toMatchObject({
      fase_voo: 'DECOLAGEM',
      execucao_pf: 'PFA',
      fonte: 'CONTEXTO_VERSAO',
    });
    expect(body.data[1].contexto).toMatchObject({
      fase_voo: 'POUSO',
      execucao_pf: 'B',
      fonte: 'LEGACY_MANOBRA',
    });
  });

  it('returns 500 when schema introspection throws', async () => {
    const db = {
      prepare() {
        throw new Error('schema boom');
      },
    };
    const res = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao/1000/manobras', {
        headers: { Authorization: 'Bearer test' },
      }),
      { DB: db } as Env,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
