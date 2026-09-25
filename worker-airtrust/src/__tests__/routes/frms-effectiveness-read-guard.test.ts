import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../routes/frms-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/frms-shared')>();
  return {
    ...actual,
    safe: (fn: (c: any) => Promise<Response>) => fn,
    getEmpresaIdSafe: () => 42,
    assertTripulanteEmpresa: async () => null,
    assertJornadaEmpresa: async () => null,
    assertAlertaEmpresa: async () => null,
    resolveFuncionarioId: async () => '7',
  };
});

import frmsRoutes from '../../routes/frms';

describe('FRMS effectiveness read guard', () => {
  it('mascara efetividade historica sem check-in completo na timeline', async () => {
    const preparedSql: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql.replace(/\s+/g, ' ').trim());
        const stmt = {
          bind: () => stmt,
          all: async () => ({
            results: [
              {
                id: 'f1',
                jornada_id: 'j1',
                data_apresentacao: '2026-09-20',
                data_liberacao: '2026-09-20',
                jornada_boundary_source: 'ESTIMADO',
                effectiveness_pct: null,
                effectiveness_nivel: null,
              },
            ],
          }),
          first: async () => null,
        };
        return stmt;
      }),
    } as unknown as D1Database;

    const response = await frmsRoutes.fetch(
      new Request('http://localhost/tripulante/7/jornadas?dias=30'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: Array<{ effectiveness_pct: number | null; effectiveness_nivel: string | null }>;
    };
    expect(payload.success).toBe(true);
    expect(payload.data[0]).toMatchObject({ effectiveness_pct: null, effectiveness_nivel: null });

    const timelineSql = preparedSql.find((sql) =>
      sql.includes('FROM frms_fatorizacao_jornada fj') && sql.includes('jornada_boundary_source'),
    );
    expect(timelineSql).toContain('FROM frms_fadiga_checkin ch');
    expect(timelineSql).toContain('ch.jornada_inicio_prevista IS NOT NULL');
    expect(timelineSql).toContain('ch.wake_time IS NOT NULL');
    expect(timelineSql).toContain('ch.horas_sono > 0');
    expect(timelineSql).toContain('THEN fj.effectiveness_pct ELSE NULL END AS effectiveness_pct');
  });
});
