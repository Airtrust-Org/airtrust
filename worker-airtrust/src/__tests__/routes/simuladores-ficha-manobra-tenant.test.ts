import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

vi.mock('../../services/operational-domain-access', () => ({
  requireOperationalAccess:
    () => async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
}));

const availabilitySpy = vi.hoisted(() => vi.fn());
vi.mock('../../utils/ficha-availability', () => ({
  getFichaAvailabilityFromDb: (...args: unknown[]) => availabilitySpy(...args),
}));

import routes from '../../routes/simuladores-fichas-simulador';

describe('simuladores ficha manoeuvre tenant boundary', () => {
  it('returns 404 before availability or mutation when ficha belongs to another tenant', async () => {
    const writes: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        const statement = {
          bind: (..._args: unknown[]) => statement,
          first: async () => {
            if (sql.includes('SELECT id FROM fichas_sessao') && sql.includes('empresa_id = ?')) {
              return null;
            }
            return null;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            writes.push(sql);
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      }),
    } as unknown as D1Database;

    availabilitySpy.mockClear();

    const response = await routes.fetch(
      new Request('http://localhost/fichas-simulador/999/manobras/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultado: 'SATISFATORIO' }),
      }),
      { DB: db } as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Ficha não encontrada',
    });
    expect(availabilitySpy).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
