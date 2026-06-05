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

type MockStatement = {
  bind: (...args: unknown[]) => MockStatement;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  first: <T = unknown>() => Promise<T | null>;
};

function createDbForJornadas(rows: Array<Record<string, unknown>>) {
  const db = {
    prepare: vi.fn((sql: string): MockStatement => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      let binds: unknown[] = [];
      const stmt: MockStatement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return stmt;
        },
        all: async <T = unknown>() => {
          if (normalized.includes('FROM frms_jornada j LEFT JOIN frms_fatorizacao_jornada f')) {
            return { results: rows as T[] };
          }
          throw new Error(`Unexpected query: ${normalized} :: ${JSON.stringify(binds)}`);
        },
        first: async <T = unknown>() => {
          if (normalized.includes('SELECT COUNT(*) as total FROM frms_jornada j')) {
            return { total: rows.length } as T;
          }
          throw new Error(`Unexpected query: ${normalized} :: ${JSON.stringify(binds)}`);
        },
      };
      return stmt;
    }),
  } as unknown as D1Database;

  return db;
}

describe('frms jornadas contract', () => {
  it('explicita percentuais diarios e mensais sem esconder a fatorizacao legada', async () => {
    const db = createDbForJornadas([
      {
        id: 'j2',
        data: '2026-06-03',
        duracao_jornada_minutos: 391,
        horas_voo_minutos: 282,
        hora_apresentacao: '10:09',
        hora_termino: '17:40',
        status: 'ES',
        origem: 'SIGVOOS',
        fat_id: 'f2',
        total_fatorizado_jornada: 0.2526,
        total_fatorizado_hv: 5.2222,
      },
      {
        id: 'j1',
        data: '2026-06-02',
        duracao_jornada_minutos: 315,
        horas_voo_minutos: 189,
        hora_apresentacao: '10:55',
        hora_termino: '17:10',
        status: 'ES',
        origem: 'SIGVOOS',
        fat_id: 'f1',
        total_fatorizado_jornada: 0.2677,
        total_fatorizado_hv: 3.5,
      },
    ]);

    const response = await frmsRoutes.fetch(
      new Request('http://localhost/jornadas/7?mes=2026-06'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: Array<{
        data: string;
        pct_jornada_diaria: number;
        pct_voo_diaria: number;
        pct_jornada_mes: number;
        pct_voo_mes: number;
        fatorizacao?: {
          total_fatorizado_hv: number;
        };
      }>;
    };

    expect(payload.success).toBe(true);
    expect(payload.data[0]).toMatchObject({
      data: '2026-06-03',
      pct_jornada_diaria: 59.242,
      pct_voo_diaria: 58.75,
      pct_jornada_mes: 6.686,
      pct_voo_mes: 8.722,
      fatorizacao: {
        total_fatorizado_hv: 5.2222,
      },
    });
    expect(payload.data[0].pct_voo_diaria).not.toBe(5.2222);
  });

  it('retorna codigo de integridade quando HV excede a jornada e nao trata a linha como normal', async () => {
    const db = createDbForJornadas([
      {
        id: 'j3',
        data: '2026-06-01',
        duracao_jornada_minutos: 595,
        horas_voo_minutos: 1537,
        hora_apresentacao: '06:30',
        hora_termino: '17:25',
        status: 'ES',
        origem: 'SIGVOOS',
        fat_id: 'f3',
        total_fatorizado_jornada: -0.4132,
        total_fatorizado_hv: 28.363,
      },
    ]);

    const response = await frmsRoutes.fetch(
      new Request('http://localhost/jornadas/7?mes=2026-06'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: Array<{
        pct_voo_diaria: number;
        integridade_status: string;
        integridade_codigo: string | null;
        integridade_codigos: string[];
      }>;
    };

    expect(payload.data[0]).toMatchObject({
      pct_voo_diaria: 320.208,
      integridade_status: 'INCONSISTENTE',
      integridade_codigo: 'HV_MAIOR_QUE_JORNADA',
    });
    expect(payload.data[0].integridade_codigos).toContain('HV_MAIOR_QUE_JORNADA');
  });
});
