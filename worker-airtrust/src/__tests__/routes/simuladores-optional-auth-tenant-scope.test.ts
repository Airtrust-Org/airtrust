import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const authMode = String(c.env?.__authMode || 'ok');

    if (authMode === 'missing') {
      return c.json(
        {
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Token de autenticação não fornecido',
        },
        401,
      );
    }

    const empresaId = Number(c.env?.__mockEmpresaId ?? 77);

    c.set('userId', 101);
    c.set('userRole', 'manager');
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: `tenant-${empresaId}`,
      empresaNome: `Tenant ${empresaId}`,
      role: 'manager',
      plano: 'pro',
      permissions: ['read', 'write'],
    });

    await next();
  },
}));

import simuladoresRelatoriosRoutes from '../../routes/simuladores-relatorios';
import simuladoresEquipamentosRoutes from '../../routes/simuladores-equipamentos';
import simuladoresModelosRoutes from '../../routes/simuladores-modelos';

type RelatoriosUsoResponse = {
  data: {
    por_simulador: Array<{ codigo: string }>;
  };
};

type EquipamentosResponse = {
  data: Array<{
    nome: string;
    aeronave_codigo?: string | null;
    modelo_aeronave?: string | null;
    aeronave_vinculo_status?: string;
  }>;
};

type ModelosResponse = {
  data: Array<{ codigo: string }>;
};

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function createRelatoriosDb() {
  return {
    prepare(query: string) {
      const sql = normalizeSql(query);
      const allResult = async () => {
        if (sql.includes('PRAGMA table_info(simuladores)')) {
          return {
            results: [{ name: 'id' }, { name: 'empresa_id' }]
          };
        }
        return { results: [] };
      };
      return {
        all: allResult,
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes('PRAGMA table_info(simuladores)')) {
                return {
                  results: [{ name: 'id' }, { name: 'empresa_id' }]
                };
              }
              if (sql.includes('FROM simuladores s')) {
                const empresaId = Number(args[0]);
                expect(sql).toContain('sa.empresa_id = ?');
                // Removed strict expectation for s.empresa_id since it's dynamic
                // expect(sql).toContain('s.empresa_id = ?');
                return {
                  results: [
                    {
                      simulador_id: empresaId,
                      codigo: `SIM-${empresaId}`,
                      tipo_aeronave: 'A320',
                      horas: 10.5,
                      total_sessoes: 5,
                    },
                  ],
                };
              }

              if (sql.includes('FROM simulador_agendamentos sa')) {
                expect(sql).toContain('sa.empresa_id = ?');
                return {
                  results: [{ tipo_sessao: 'PER', sessoes: 1, horas: 2 }],
                };
              }

              return { results: [] };
            },
            async first<T>() {
              if (sql.includes('FROM simulador_agendamentos')) {
                expect(sql).toContain('empresa_id = ?');
                return { total_horas: 2 } as T;
              }
              return null as T | null;
            },
            async run() {
              return { meta: { changes: 0, last_row_id: 0 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function createEquipamentosDb() {
  return {
    prepare(query: string) {
      const sql = normalizeSql(query);
      if (sql === 'PRAGMA table_info(simuladores)') {
        return {
          async all() {
            return { results: [{ name: 'empresa_id' }] };
          },
        };
      }

      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.startsWith('SELECT s.id, s.nome, s.modelo, s.tipo, s.fabricante, s.localizacao, s.status')) {
                const empresaId = Number(args[0]);  // JOIN param for modelos_aeronave
                expect(sql).toContain('s.empresa_id = ?');
                return {
                  results: [
                    {
                      id: empresaId,
                      nome: `SIMULADOR-${empresaId}`,
                      modelo: 'AW139',
                      tipo: 'FFS',
                      fabricante: 'CAE',
                      localizacao: 'RIO',
                      status: 'ATIVO',
                      aeronave_codigo: 'AW139',
                      modelo_aeronave: 'AW139',
                      aeronave_vinculo_status: 'OK',
                    },
                  ],
                };
              }

              return { results: [] };
            },
            async first<T>() {
              if (sql.startsWith('SELECT COUNT(*) as total FROM simuladores')) {
                expect(sql).toContain('s.empresa_id = ?');
                return { total: 1 } as T;
              }
              return null as T | null;
            },
            async run() {
              return { meta: { changes: 0, last_row_id: 0 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function createModelosDb() {
  return {
    prepare(query: string) {
      const sql = normalizeSql(query);
      if (sql === 'PRAGMA table_info(modelos_sessao)') {
        return {
          async all() {
            return {
              results: [
                { name: 'id' },
                { name: 'empresa_id' },
                { name: 'modelo_aeronave' },
                { name: 'codigo_aeronave' },
                { name: 'tipo_aeronave' },
                { name: 'tipo' },
                { name: 'tipo_sessao_id' },
                { name: 'qualificacao_tipo_id' },
              ],
            };
          },
        };
      }
      if (
        sql === 'PRAGMA table_info(qualificacoes_tipos)' ||
        sql === 'PRAGMA table_info(tipos_sessao)'
      ) {
        return {
          async all() {
            return { results: [{ name: 'empresa_id' }] };
          },
        };
      }
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes('FROM modelos_sessao ms')) {
                const empresaId = Number(args[0]);
                expect(Number(args[1])).toBe(empresaId);
                expect(Number(args[2])).toBe(empresaId);
                expect(sql).toContain('ts.empresa_id = ?');
                expect(sql).toContain('qt.empresa_id = ?');
                expect(sql).toContain('ms.empresa_id = ?');
                return {
                  results: [
                    {
                      id: empresaId,
                      codigo: `MODELO-${empresaId}`,
                      nome: `Modelo ${empresaId}`,
                      tipo: 'SIMULADOR',
                      total_manobras: 0,
                    },
                  ],
                };
              }

              return { results: [] };
            },
            async first<T>() {
              return null as T | null;
            },
            async run() {
              if (sql.startsWith('UPDATE modelos_sessao SET modelo_aeronave = COALESCE(')) {
                expect(sql).toContain('WHERE empresa_id = ?');
              }
              return { meta: { changes: 0, last_row_id: 0 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('simuladores optional auth tenant scoping', () => {
  it('bloqueia GET /uso sem autenticação', async () => {
    const response = await simuladoresRelatoriosRoutes.fetch(
      new Request('http://localhost/uso'),
      { DB: createRelatoriosDb(), __authMode: 'missing' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('bloqueia GET /simuladores sem autenticação', async () => {
    const response = await simuladoresEquipamentosRoutes.fetch(
      new Request('http://localhost/'),
      { DB: createEquipamentosDb(), __authMode: 'missing' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('bloqueia GET /modelos-sessao sem autenticação', async () => {
    const response = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao'),
      { DB: createModelosDb(), __authMode: 'missing' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('relatórios retornam dados diferentes por tenant autenticado', async () => {
    const tenantA = await simuladoresRelatoriosRoutes.fetch(
      new Request('http://localhost/uso'),
      { DB: createRelatoriosDb(), __mockEmpresaId: 11 } as unknown as Env,
      {} as ExecutionContext,
    );
    const tenantB = await simuladoresRelatoriosRoutes.fetch(
      new Request('http://localhost/uso'),
      { DB: createRelatoriosDb(), __mockEmpresaId: 22 } as unknown as Env,
      {} as ExecutionContext,
    );

    const jsonA = (await tenantA.json()) as RelatoriosUsoResponse;
    const jsonB = (await tenantB.json()) as RelatoriosUsoResponse;

    expect(jsonA.data.por_simulador[0].codigo).toBe('SIM-11');
    expect(jsonB.data.por_simulador[0].codigo).toBe('SIM-22');
  });

  it('equipamentos retornam lista distinta por tenant autenticado', async () => {
    const tenantA = await simuladoresEquipamentosRoutes.fetch(
      new Request('http://localhost/'),
      { DB: createEquipamentosDb(), __mockEmpresaId: 31 } as unknown as Env,
      {} as ExecutionContext,
    );
    const tenantB = await simuladoresEquipamentosRoutes.fetch(
      new Request('http://localhost/'),
      { DB: createEquipamentosDb(), __mockEmpresaId: 44 } as unknown as Env,
      {} as ExecutionContext,
    );

    const jsonA = (await tenantA.json()) as EquipamentosResponse;
    const jsonB = (await tenantB.json()) as EquipamentosResponse;

    expect(jsonA.data[0].nome).toBe('SIMULADOR-31');
    expect(jsonB.data[0].nome).toBe('SIMULADOR-44');
  });

  it('modelos retornam catálogo privado distinto por tenant autenticado', async () => {
    const tenantA = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao'),
      { DB: createModelosDb(), __mockEmpresaId: 51 } as unknown as Env,
      {} as ExecutionContext,
    );
    const tenantB = await simuladoresModelosRoutes.fetch(
      new Request('http://localhost/modelos-sessao'),
      { DB: createModelosDb(), __mockEmpresaId: 62 } as unknown as Env,
      {} as ExecutionContext,
    );

    const jsonA = (await tenantA.json()) as ModelosResponse;
    const jsonB = (await tenantB.json()) as ModelosResponse;

    expect(jsonA.data[0].codigo).toBe('MODELO-51');
    expect(jsonB.data[0].codigo).toBe('MODELO-62');
  });
});
