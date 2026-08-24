import type { D1Database } from '@cloudflare/workers-types';
import { describe, expect, it } from 'vitest';
import {
  resolveGlobalSimulatorForEquipment,
  validateInstructorAssignment,
} from '../../services/cae-planning-resource-assignment';

type Simulador = { id: number; nome: string; aeronave_codigo: string | null; codigo_aeronave: string | null };
type Funcionario = { id: number; empresa_id: number; ativo: number; is_instrutor: number };

function createSimuladorDb(simuladores: Simulador[]): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        bind(..._binds: unknown[]) {
          return statement;
        },
        async all() {
          if (sql.includes('FROM simuladores')) {
            return { results: simuladores };
          }
          return { results: [] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function createFuncionarioDb(funcionarios: Funcionario[], hasIsInstrutorColumn = true): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        bind(...binds: unknown[]) {
          return {
            async all() {
              return { results: [] };
            },
            async first() {
              if (sql.includes("table_info('funcionarios')")) return null;
              if (sql.includes('FROM funcionarios')) {
                const [id, empresaId] = binds as [number, number];
                return (
                  funcionarios.find((f) => f.id === id && f.empresa_id === empresaId) || null
                );
              }
              return null;
            },
          };
        },
        async all() {
          if (sql.includes("table_info('funcionarios')")) {
            return {
              results: hasIsInstrutorColumn ? [{ name: 'is_instrutor' }, { name: 'ativo' }] : [{ name: 'ativo' }],
            };
          }
          return { results: [] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe('resolveGlobalSimulatorForEquipment', () => {
  it('1 simulador global compatível: auto-resolve', async () => {
    const db = createSimuladorDb([
      { id: 501, nome: 'FFS AW139 #1', aeronave_codigo: 'AW139', codigo_aeronave: null },
    ]);
    const result = await resolveGlobalSimulatorForEquipment(db, 'AW139');
    expect(result).toEqual({ status: 'RESOLVED', simulator_id: 501 });
  });

  it('0 simuladores compatíveis: pending assignment', async () => {
    const db = createSimuladorDb([
      { id: 501, nome: 'FFS SK76 #1', aeronave_codigo: 'SK76', codigo_aeronave: null },
    ]);
    const result = await resolveGlobalSimulatorForEquipment(db, 'AW139');
    expect(result.status).toBe('NEEDS_ASSIGNMENT');
  });

  it('2+ simuladores compatíveis: pending human assignment, nao escolhe arbitrariamente', async () => {
    const db = createSimuladorDb([
      { id: 501, nome: 'FFS AW139 #1', aeronave_codigo: 'AW139', codigo_aeronave: null },
      { id: 502, nome: 'FFS AW139 #2', aeronave_codigo: 'AW139', codigo_aeronave: null },
    ]);
    const result = await resolveGlobalSimulatorForEquipment(db, 'AW139');
    expect(result.status).toBe('AMBIGUOUS');
    if (result.status === 'AMBIGUOUS') {
      expect(result.candidates.map((c) => c.id).sort()).toEqual([501, 502]);
    }
  });

  it('simulador sem empresa_id (catálogo global) funciona normalmente', async () => {
    // createSimuladorDb nunca inclui empresa_id nas linhas — a tabela real
    // tampouco tem essa coluna (decisão de produto confirmada). A resolução
    // não deve depender dela.
    const db = createSimuladorDb([
      { id: 777, nome: 'FFS Global', aeronave_codigo: null, codigo_aeronave: 'AW139' },
    ]);
    const result = await resolveGlobalSimulatorForEquipment(db, 'AW139');
    expect(result).toEqual({ status: 'RESOLVED', simulator_id: 777 });
  });
});

describe('validateInstructorAssignment', () => {
  it('instrutor de outro tenant: rejeitado', async () => {
    const db = createFuncionarioDb([{ id: 9, empresa_id: 999050, ativo: 1, is_instrutor: 1 }]);
    const result = await validateInstructorAssignment(db, 888888, 9);
    expect(result.eligible).toBe(false);
  });

  it('funcionário comum (sem flag is_instrutor) não elegível: rejeitado', async () => {
    const db = createFuncionarioDb([{ id: 9, empresa_id: 999050, ativo: 1, is_instrutor: 0 }]);
    const result = await validateInstructorAssignment(db, 999050, 9);
    expect(result.eligible).toBe(false);
  });

  it('instrutor válido (tenant certo, ativo, is_instrutor=1): aceito', async () => {
    const db = createFuncionarioDb([{ id: 9, empresa_id: 999050, ativo: 1, is_instrutor: 1 }]);
    const result = await validateInstructorAssignment(db, 999050, 9);
    expect(result.eligible).toBe(true);
  });

  it('instrutor inativo: rejeitado', async () => {
    const db = createFuncionarioDb([{ id: 9, empresa_id: 999050, ativo: 0, is_instrutor: 1 }]);
    const result = await validateInstructorAssignment(db, 999050, 9);
    expect(result.eligible).toBe(false);
  });
});
