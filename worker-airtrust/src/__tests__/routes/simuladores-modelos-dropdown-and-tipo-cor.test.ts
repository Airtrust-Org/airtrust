import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'admin');
    c.set('empresaId', 6);
    c.set('tenantContext', {
      empresaId: 6,
      empresaCodigo: 'tenant-6',
      empresaNome: 'Tenant 6',
      role: 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
}));

import simuladoresModelosRoutes from '../../routes/simuladores-modelos';

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function createDbMock() {
  const state = {
    lastModelosQuery: '',
    lastModelosBinds: [] as unknown[],
    lastTipoInsertBinds: [] as unknown[],
    lastTipoUpdateBinds: [] as unknown[],
  };

  const db = {
    prepare(query: string) {
      const sql = normalizeSql(query);

      if (sql === 'PRAGMA table_info(modelos_sessao)') {
        return {
          async all() {
            return {
              results: [
                { name: 'id' },
                { name: 'empresa_id' },
                { name: 'tipo' },
                { name: 'modelo_aeronave' },
                { name: 'codigo_aeronave' },
                { name: 'tipo_aeronave' },
                { name: 'tipo_sessao_id' },
                { name: 'qualificacao_tipo_id' },
                { name: 'deleted_at' },
              ],
            };
          },
        };
      }

      if (sql === 'PRAGMA table_info(qualificacoes_tipos)' || sql === 'PRAGMA table_info(tipos_sessao)') {
        return {
          async all() {
            return {
              results: [{ name: 'id' }, { name: 'empresa_id' }, { name: 'cor' }],
            };
          },
        };
      }

      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('SELECT id FROM tipos_sessao WHERE codigo = ? AND deleted_at IS NULL')) {
                return null as T | null;
              }
              if (sql.includes('SELECT * FROM tipos_sessao WHERE id = ?')) {
                return {
                  id: 9,
                  codigo: 'PER',
                  nome: 'Periódico',
                  descricao: 'Antes',
                  cor: '#111111',
                } as T;
              }
              if (sql.includes('SELECT id FROM tipos_sessao WHERE codigo = ? AND id != ?')) {
                return null as T | null;
              }
              return null as T | null;
            },
            async all() {
              if (sql.includes('FROM modelos_sessao ms')) {
                state.lastModelosQuery = sql;
                state.lastModelosBinds = args;
                const hasInvalidTipo = args.some(
                  (arg) => String(arg).toUpperCase() === 'TIPOINVALIDO',
                );
                const hasIniTipo = args.some(
                  (arg) => String(arg).toUpperCase() === 'INI',
                );
                if (hasInvalidTipo) {
                  return { results: [] };
                }
                return {
                  results: hasIniTipo
                    ? [
                        {
                          id: 2,
                          codigo: 'SK76-INI-01',
                          nome: 'SK76 Inicial',
                          tipo_sessao_id: 14,
                          tipo: 'INICIAL',
                          modelo_aeronave: 'SK76',
                          total_manobras: 2,
                        },
                      ]
                    : [
                        {
                          id: 1,
                          codigo: 'SK76-PER-01',
                          nome: 'SK76 Periódico',
                          tipo_sessao_id: 9,
                          tipo: 'PERIODICO',
                          modelo_aeronave: 'SK76',
                          total_manobras: 2,
                        },
                      ],
                };
              }
              return { results: [] };
            },
            async run() {
              if (sql.startsWith('INSERT INTO tipos_sessao')) {
                state.lastTipoInsertBinds = args;
                return { meta: { changes: 1, last_row_id: 99 } };
              }
              if (sql.startsWith('UPDATE tipos_sessao SET codigo = ?, nome = ?, descricao = ?, cor = ?')) {
                state.lastTipoUpdateBinds = args;
                return { meta: { changes: 1, last_row_id: 0 } };
              }
              return { meta: { changes: 1, last_row_id: 0 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, state };
}

describe('simuladores modelos dropdown + tipo cor', () => {
  it('aceita PER com fallback legado de ms.tipo sem relaxar empresa', async () => {
    const { db, state } = createDbMock();
    const response = await simuladoresModelosRoutes.fetch(
      new Request(
        'http://localhost/modelos-sessao?tipo_sessao_id=9&tipo_sessao_codigo=PER&tipo_sessao_nome=Peri%C3%B3dico&tipo=SIMULADOR&modelo_aeronave=SK76',
      ),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(state.lastModelosQuery).toContain('ms.empresa_id = ?');
    expect(state.lastModelosQuery).toContain("UPPER(TRIM(COALESCE(ms.tipo, ''))) LIKE ?");
    expect(state.lastModelosQuery).toContain("UPPER(TRIM(COALESCE(ts.nome, ''))) LIKE ?");
    expect(state.lastModelosBinds).toContain('RECORR%');
    expect(state.lastModelosBinds).toContain('PERIODICO');
    expect(state.lastModelosBinds).toContain('SK76');
  });

  it('retorna modelos para SK76 + INI com filtros canônicos', async () => {
    const { db, state } = createDbMock();
    const response = await simuladoresModelosRoutes.fetch(
      new Request(
        'http://localhost/modelos-sessao?tipo_sessao_id=14&tipo_sessao_codigo=INI&tipo_sessao_nome=Inicial&tipo=SIMULADOR&modelo_aeronave=SK76',
      ),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].codigo).toBe('SK76-INI-01');
    expect(state.lastModelosBinds).toContain('INI');
  });

  it('tipo inválido retorna vazio controlado sem erro HTTP', async () => {
    const { db } = createDbMock();
    const response = await simuladoresModelosRoutes.fetch(
      new Request(
        'http://localhost/modelos-sessao?tipo_sessao_codigo=TIPOINVALIDO&tipo=SIMULADOR&modelo_aeronave=SK76',
      ),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(0);
  });

  it('persist cor no POST e no PUT de tipos_sessao quando coluna existe', async () => {
    const { db, state } = createDbMock();
    const postResponse = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/tipos-sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: 'INS',
          nome: 'Instrutor',
          descricao: 'Novo tipo',
          cor: '#22AA88',
        }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    const postJson = await postResponse.json();
    expect(postResponse.status).toBe(200);
    expect(postJson.success).toBe(true);
    expect(postJson.data.cor).toBe('#22AA88');
    expect(state.lastTipoInsertBinds).toContain('#22AA88');

    const putResponse = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/tipos-sessao/9', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: 'PER',
          nome: 'Periódico',
          descricao: 'Atualizado',
          cor: '#3344AA',
        }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    const putJson = await putResponse.json();
    expect(putResponse.status).toBe(200);
    expect(putJson.success).toBe(true);
    expect(putJson.data.cor).toBe('#3344AA');
    expect(state.lastTipoUpdateBinds).toContain('#3344AA');
  });
});
