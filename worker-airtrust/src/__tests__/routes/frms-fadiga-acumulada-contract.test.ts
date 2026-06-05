import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 7);
    c.set('userRole', 'admin');
    c.set('empresaId', 42);
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

import frmsFadigaAcumuladaRoutes from '../../routes/frms-fadiga-acumulada';

type MockStatement = {
  bind: (...args: unknown[]) => MockStatement;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  first: <T = unknown>() => Promise<T | null>;
};

function createDbForFadigaAcumulada(
  jornadaRows: Array<Record<string, unknown>> = [
    {
      data: '2026-06-02',
      hora_apresentacao: '07:00',
      hora_termino: '12:15',
      duracao_jornada_minutos: 315,
      horas_voo_minutos: 189,
      repouso_anterior_min: 720,
      hora_primeira_decolagem: '08:00',
      hora_ultimo_pouso: '11:45',
      status: 'OPERADO',
      dia_ciclo_embarcado: null,
    },
    {
      data: '2026-06-03',
      hora_apresentacao: '07:10',
      hora_termino: '13:41',
      duracao_jornada_minutos: 391,
      horas_voo_minutos: 282,
      repouso_anterior_min: 780,
      hora_primeira_decolagem: '08:15',
      hora_ultimo_pouso: '13:05',
      status: 'OPERADO',
      dia_ciclo_embarcado: null,
    },
  ],
) {
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
        all: async <T = unknown>() => {
          statements.push({ sql: normalized, binds });
          if (normalized.includes('FROM frms_jornada j')) {
            return {
              results: jornadaRows as T[],
            };
          }

          throw new Error(`Unexpected query: ${normalized}`);
        },
        first: async <T = unknown>() => {
          statements.push({ sql: normalized, binds });
          throw new Error(`Unexpected query: ${normalized}`);
        },
      };
      return stmt;
    }),
  } as unknown as D1Database;

  return { db, statements };
}

describe('frms fadiga acumulada contract', () => {
  it('explicita resumo diario e mensal sem perder compatibilidade mensal legacy', async () => {
    const { db, statements } = createDbForFadigaAcumulada();

    const response = await frmsFadigaAcumuladaRoutes.fetch(
      new Request('http://localhost/fadiga-acumulada?mes=2026-06&tripulante_id=7'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: {
        resumo: {
          jornada_horas: number;
          voo_horas: number;
          jornada_dia_horas: number;
          voo_dia_horas: number;
          jornada_mes_horas: number;
          voo_mes_horas: number;
          pct_jornada: number;
          pct_voo: number;
          pct_jornada_dia: number;
          pct_voo_dia: number;
          pct_jornada_mes: number;
          pct_voo_mes: number;
          integridade_status: 'OK' | 'INCONSISTENTE';
          integridade_codigo: string | null;
          integridade_codigos: string[];
          integridade_mensagem: string | null;
          valores_brutos: Record<string, unknown>;
        } | null;
      };
    };

    expect(payload.success).toBe(true);
    expect(payload.data.resumo).toMatchObject({
      jornada_horas: 11.8,
      voo_horas: 7.8,
      jornada_dia_horas: 6.5,
      voo_dia_horas: 4.7,
      jornada_mes_horas: 11.8,
      voo_mes_horas: 7.8,
      pct_jornada: 6.686,
      pct_voo: 8.722,
      pct_jornada_dia: 59.242,
      pct_voo_dia: 58.75,
      pct_jornada_mes: 6.686,
      pct_voo_mes: 8.722,
      integridade_status: 'OK',
      integridade_codigo: null,
    });

    expect(
      statements.some((item) => item.sql.includes('LEFT JOIN frms_acumulo_rolling ar')),
    ).toBe(true);
  });

  it('retorna campos de integridade quando jornada zerada tem HV positiva', async () => {
    const { db } = createDbForFadigaAcumulada([
      {
        data: '2026-05-23',
        hora_apresentacao: '09:50',
        hora_termino: '10:25',
        duracao_jornada_minutos: 0,
        horas_voo_minutos: 18,
        repouso_anterior_min: 720,
        hora_primeira_decolagem: null,
        hora_ultimo_pouso: null,
        status: 'OPERADO',
        dia_ciclo_embarcado: null,
      },
    ]);

    const response = await frmsFadigaAcumuladaRoutes.fetch(
      new Request('http://localhost/fadiga-acumulada?mes=2026-05&tripulante_id=7'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        resumo: {
          integridade_status: string;
          integridade_codigo: string | null;
          integridade_codigos: string[];
          integridade_mensagem: string | null;
        } | null;
        evolucao: Array<{
          integridade_status: string;
          integridade_codigo: string | null;
          integridade_codigos: string[];
          integridade_mensagem: string | null;
          valores_brutos: Record<string, unknown>;
        }>;
      };
    };

    expect(payload.data.evolucao[0]).toMatchObject({
      integridade_status: 'INCONSISTENTE',
      integridade_codigo: 'JORNADA_ZERO_COM_HV',
      integridade_codigos: ['JORNADA_ZERO_COM_HV', 'HV_MAIOR_QUE_JORNADA'],
    });
    expect(payload.data.evolucao[0].integridade_mensagem).toContain('jornada zerada');
    expect(payload.data.evolucao[0].valores_brutos).toMatchObject({
      duracao_jornada_minutos: 0,
      horas_voo_minutos: 18,
    });
    expect(payload.data.resumo?.integridade_codigo).toBe('JORNADA_ZERO_COM_HV');
  });
});
