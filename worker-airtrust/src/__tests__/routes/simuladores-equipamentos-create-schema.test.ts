import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const { auditMock } = vi.hoisted(() => ({ auditMock: vi.fn() }));

type MockAuthContext = {
  env: Env & { __mockEmpresaId?: number };
  set: (key: string, value: unknown) => void;
};

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: MockAuthContext, next: () => Promise<void>) => {
    const empresaId = Number(c.env.__mockEmpresaId ?? 6);
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

vi.mock('../../routes/simuladores-shared', () => ({
  requireAdminForDelete: vi.fn(),
  audit: auditMock,
}));

import simuladoresEquipamentosRoutes from '../../routes/simuladores-equipamentos';

type DbCall = {
  sql: string;
  bindings: unknown[];
  operation: 'first' | 'run';
};

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createDb(schemaHasEmpresaId: boolean) {
  const calls: DbCall[] = [];
  const created = {
    id: 31,
    nome: 'FFS-AW139-TESTE',
    modelo: 'AW139',
    tipo: 'FFS',
    fabricante: null,
    localizacao: null,
    status: 'ATIVO',
    observacoes: null,
    deleted_at: null,
  };

  const db = {
    prepare(rawSql: string) {
      const sql = normalizeSql(rawSql);

      if (sql === 'PRAGMA table_info(simuladores)') {
        return {
          async all() {
            return {
              results: schemaHasEmpresaId
                ? [{ name: 'id' }, { name: 'empresa_id' }]
                : [{ name: 'id' }, { name: 'nome' }],
            };
          },
        };
      }

      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        async run() {
          calls.push({ sql, bindings, operation: 'run' });
          return { meta: { changes: 1, last_row_id: 31 } };
        },
        async first() {
          calls.push({ sql, bindings, operation: 'first' });
          return schemaHasEmpresaId ? { ...created, empresa_id: 6 } : created;
        },
      };

      return statement;
    },
  } as unknown as D1Database;

  return { db, calls };
}

async function createSimulator(db: D1Database) {
  return simuladoresEquipamentosRoutes.fetch(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'FFS-AW139-TESTE', tipo: 'FFS', modelo: 'AW139' }),
    }),
    { DB: db, __mockEmpresaId: 6 } as unknown as Env,
    {} as ExecutionContext,
  );
}

describe('POST /api/simuladores — compatibilidade de schema', () => {
  it('cria e relê o simulador no schema oficial sem empresa_id', async () => {
    auditMock.mockReset();
    auditMock.mockResolvedValue(undefined);
    const { db, calls } = createDb(false);

    const response = await createSimulator(db);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 31, nome: 'FFS-AW139-TESTE' },
    });

    const insert = calls.find((call) => call.operation === 'run');
    const readBack = calls.find((call) => call.operation === 'first');

    expect(insert?.sql).not.toContain('empresa_id');
    expect(readBack?.sql).toBe(
      'SELECT id,nome,modelo,tipo,fabricante,localizacao,status,observacoes,deleted_at FROM simuladores WHERE id=? AND deleted_at IS NULL',
    );
    expect(readBack?.bindings).toEqual([31]);
    expect(auditMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ tabela: 'simuladores', acao: 'INSERT', registro_id: 31 }),
    );
  });

  it('mantém tenant scope quando o schema possui empresa_id', async () => {
    auditMock.mockReset();
    auditMock.mockResolvedValue(undefined);
    const { db, calls } = createDb(true);

    const response = await createSimulator(db);

    expect(response.status).toBe(201);
    const insert = calls.find((call) => call.operation === 'run');
    const readBack = calls.find((call) => call.operation === 'first');

    expect(insert?.sql).toContain('empresa_id');
    expect(insert?.bindings.at(-1)).toBe(6);
    expect(readBack?.sql).toBe(
      'SELECT id,nome,modelo,tipo,fabricante,localizacao,status,observacoes,deleted_at,empresa_id FROM simuladores WHERE id=? AND deleted_at IS NULL AND empresa_id = ?',
    );
    expect(readBack?.bindings).toEqual([31, 6]);
  });
});
