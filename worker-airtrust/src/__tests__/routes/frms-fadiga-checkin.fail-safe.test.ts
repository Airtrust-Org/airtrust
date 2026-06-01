import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 9);
    c.set('userRole', 'admin');
    c.set('empresaId', 7);
    c.set('funcionarioId', 70);
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

import frmsFadigaCheckinRoutes from '../../routes/frms-fadiga-checkin';

type MockStatement = {
  bind: (...args: unknown[]) => MockStatement;
  first: <T = unknown>() => Promise<T | null>;
  run: () => Promise<{ meta: { changes: number } }>;
};

function createDbForValidation() {
  const statements: Array<{ sql: string; binds: unknown[] }> = [];

  const db = {
    prepare: vi.fn((sql: string): MockStatement => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      let binds: unknown[] = [];
      const stmt: MockStatement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return stmt;
        },
        first: async <T = unknown>() => {
          statements.push({ sql: normalized, binds });
          if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
            return { id: 70 } as T;
          }
          throw new Error(`Unexpected read query: ${normalized}`);
        },
        run: async () => {
          statements.push({ sql: normalized, binds });
          throw new Error(`Unexpected write query: ${normalized}`);
        },
      };
      return stmt;
    }),
  } as unknown as D1Database;

  return { db, statements };
}

describe('frms fadiga check-in fail-safe', () => {
  it('rejeita payload sem wake_time/hora_acordou e não persiste check-in', async () => {
    const { db, statements } = createDbForValidation();

    const response = await frmsFadigaCheckinRoutes.fetch(
      new Request('http://localhost/fadiga-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_checkin: '2026-06-01',
          horas_sono_24h: 7,
          fit_for_duty: true,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'wake_time_required',
    });

    expect(
      statements.some(
        (item) =>
          item.sql.includes('INSERT INTO frms_fadiga_checkin') ||
          item.sql.includes('UPDATE frms_fadiga_checkin'),
      ),
    ).toBe(false);
  });

  it('rejeita payload sem fit_for_duty/apto e não assume apto=1', async () => {
    const { db, statements } = createDbForValidation();

    const response = await frmsFadigaCheckinRoutes.fetch(
      new Request('http://localhost/fadiga-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_checkin: '2026-06-01',
          wake_time: '05:30',
          horas_sono_24h: 7,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      success: boolean;
      error: {
        fieldErrors?: Record<string, string[]>;
      };
    };
    expect(payload.success).toBe(false);
    expect(payload.error.fieldErrors?.fit_for_duty?.[0]).toContain('Informe fit_for_duty ou apto');

    expect(
      statements.some(
        (item) =>
          item.sql.includes('INSERT INTO frms_fadiga_checkin') ||
          item.sql.includes('UPDATE frms_fadiga_checkin'),
      ),
    ).toBe(false);
  });
});
