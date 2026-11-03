import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const state = vi.hoisted(() => ({ denyScope: false }));
const recalcularPipeline = vi.hoisted(() => vi.fn(async () => ({ bloqueado: false })));
const auditFrms = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/frms-shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../routes/frms-shared')>();
  return {
    ...original,
    safe: (fn: (c: never) => Promise<Response>) => fn,
    getEmpresaIdSafe: () => 42,
    assertJornadaEmpresa: async (c: { json: (body: unknown, status: number) => Response }) =>
      state.denyScope
        ? c.json({ success: false, code: 'FRMS_INDIVIDUAL_SCOPE_DENIED' }, 403)
        : null,
    auditFrms,
  };
});
vi.mock('../../lib/frms/db-service-jornadas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/frms/db-service-jornadas')>()),
  recalcularPipeline,
}));

import frmsRoutes from '../../routes/frms';

function database(changes = 1) {
  const calls: Array<{ sql: string; binds: unknown[]; action: string }> = [];
  const db = {
    prepare: (sql: string) => {
      let binds: unknown[] = [];
      const stmt = {
        bind: (...values: unknown[]) => {
          binds = values;
          return stmt;
        },
        first: async () => {
          calls.push({ sql, binds, action: 'first' });
          if (sql.includes('FROM frms_jornada')) {
            return { id: 'j-1', tripulante_id: '7', hora_dormiu: '22:00' };
          }
          if (sql.includes('FROM frms_fatorizacao_jornada')) return null;
          throw new Error('unexpected query');
        },
        run: async () => {
          calls.push({ sql, binds, action: 'run' });
          return { success: true, meta: { changes } };
        },
      };
      return stmt;
    },
  };
  return { db: db as unknown as D1Database, calls };
}

function request() {
  return new Request('http://localhost/jornada/j-1/sono', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ horaDormiu: '23:00' }),
  });
}

describe('AUD-014 sleep PATCH tenant and sector defense', () => {
  beforeEach(() => {
    state.denyScope = false;
    recalcularPipeline.mockClear();
    auditFrms.mockClear();
  });

  it('writes only through a SQL statement with tenant-scoped employee membership', async () => {
    const { db, calls } = database();
    const response = await frmsRoutes.fetch(request(), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    const update = calls.find(({ sql }) => sql.includes('UPDATE frms_jornada'));
    expect(update).toBeDefined();
    expect(update!.sql).toContain('f.empresa_id = ?');
    expect(update!.sql).toContain('f.id = CAST(frms_jornada.tripulante_id AS INTEGER)');
    expect(update!.binds).toEqual(['23:00', 'j-1', 42]);
    expect(recalcularPipeline).toHaveBeenCalledOnce();
  });

  it('does not recompute a journey when the scoped UPDATE affects zero rows', async () => {
    const { db } = database(0);
    const response = await frmsRoutes.fetch(request(), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'SLEEP_PATCH_SCOPE_OR_VERSION_CONFLICT' });
    expect(recalcularPipeline).not.toHaveBeenCalled();
  });

  it('denies other-sector access before reading or updating any journey', async () => {
    state.denyScope = true;
    const { db, calls } = database();
    const response = await frmsRoutes.fetch(request(), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(recalcularPipeline).not.toHaveBeenCalled();
  });
});
