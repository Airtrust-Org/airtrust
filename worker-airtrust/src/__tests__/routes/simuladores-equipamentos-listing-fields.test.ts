/**
 * Testa o contrato do endpoint GET /api/simuladores após a adição de
 * aeronave_codigo, modelo_aeronave e aeronave_vinculo_status.
 *
 * Regras verificadas:
 * 1. Payload inclui aeronave_codigo, modelo_aeronave, aeronave_vinculo_status.
 * 2. Simulador ativo NÃO é removido quando a aeronave vinculada está soft-deleted.
 * 3. Simulador com aeronave_codigo=NULL ainda aparece (UNLINKED).
 */

import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 6);
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

import simuladoresEquipamentosRoutes from '../../routes/simuladores-equipamentos';

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

/** Mock DB que retorna 2 simuladores: AW139 (vínculo OK) e SK76 (UNLINKED) */
function createDbWithLinkedSimulators() {
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
                return {
                  results: [
                    {
                      id: 11,
                      nome: 'FFS-A139-006',
                      modelo: 'AW139',
                      tipo: 'AW139',
                      fabricante: 'CAE Simuflight',
                      localizacao: null,
                      status: 'ATIVO',
                      aeronave_codigo: 'AW139',
                      modelo_aeronave: 'AW139',
                      aeronave_vinculo_status: 'OK',
                    },
                    {
                      id: 16,
                      nome: 'FFS-SK76-007',
                      modelo: 'SK76',
                      tipo: 'SK76',
                      fabricante: 'CAE Simuflight',
                      localizacao: null,
                      status: 'ATIVO',
                      aeronave_codigo: null,
                      modelo_aeronave: null,
                      aeronave_vinculo_status: 'UNLINKED',
                    },
                  ],
                };
              }
              return { results: [] };
            },
            async first<T>() {
              if (sql.startsWith('SELECT COUNT(*) as total FROM simuladores')) {
                return { total: 2 } as T;
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

/** Mock DB que retorna simulador AW139 com vínculo SOFT_DELETED */
function createDbWithSoftDeletedLink() {
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
                return {
                  results: [
                    {
                      id: 11,
                      nome: 'FFS-A139-006',
                      modelo: 'AW139',
                      tipo: 'AW139',
                      fabricante: 'CAE Simuflight',
                      localizacao: null,
                      status: 'ATIVO',
                      aeronave_codigo: 'AW139',
                      modelo_aeronave: null,
                      aeronave_vinculo_status: 'SOFT_DELETED',
                    },
                  ],
                };
              }
              return { results: [] };
            },
            async first<T>() {
              if (sql.startsWith('SELECT COUNT(*) as total FROM simuladores')) {
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

describe('GET /api/simuladores — listing payload contract', () => {
  it('retorna aeronave_codigo, modelo_aeronave e aeronave_vinculo_status no payload', async () => {
    const response = await simuladoresEquipamentosRoutes.fetch(
      new Request('http://localhost/'),
      { DB: createDbWithLinkedSimulators(), __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const json = await response.json() as any;
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);

    const aw139 = json.data.find((s: any) => s.id === 11);
    expect(aw139).toBeDefined();
    expect(aw139.aeronave_codigo).toBe('AW139');
    expect(aw139.modelo_aeronave).toBe('AW139');
    expect(aw139.aeronave_vinculo_status).toBe('OK');

    const sk76 = json.data.find((s: any) => s.id === 16);
    expect(sk76).toBeDefined();
    expect(sk76.aeronave_codigo).toBeNull();
    expect(sk76.modelo_aeronave).toBeNull();
    expect(sk76.aeronave_vinculo_status).toBe('UNLINKED');
  });

  it('NÃO remove simulador ativo quando a aeronave vinculada está soft-deleted', async () => {
    const response = await simuladoresEquipamentosRoutes.fetch(
      new Request('http://localhost/'),
      { DB: createDbWithSoftDeletedLink(), __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const json = await response.json() as any;
    expect(json.success).toBe(true);
    // O simulador DEVE aparecer mesmo com vínculo SOFT_DELETED
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(11);
    expect(json.data[0].aeronave_vinculo_status).toBe('SOFT_DELETED');
  });

  it('simulador com aeronave_codigo=NULL aparece com status UNLINKED', async () => {
    const response = await simuladoresEquipamentosRoutes.fetch(
      new Request('http://localhost/'),
      { DB: createDbWithLinkedSimulators(), __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    const json = await response.json() as any;
    const sk76 = json.data.find((s: any) => s.id === 16);
    expect(sk76).toBeDefined();
    expect(sk76.aeronave_codigo).toBeNull();
    expect(sk76.aeronave_vinculo_status).toBe('UNLINKED');
  });

  it('payload inclui campos legados modelo e tipo para compatibilidade', async () => {
    const response = await simuladoresEquipamentosRoutes.fetch(
      new Request('http://localhost/'),
      { DB: createDbWithLinkedSimulators(), __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    const json = await response.json() as any;
    const aw139 = json.data.find((s: any) => s.id === 11);
    expect(aw139.modelo).toBe('AW139');
    expect(aw139.tipo).toBe('AW139');
  });
});
