import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const { state } = vi.hoisted(() => ({
  state: {
    checkin: null as Record<string, unknown> | null,
  },
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 11);
    c.set('userRole', 'tripulante');
    c.set('empresaId', 7);
    c.set('funcionarioId', 70);
    await next();
  },
}));
vi.mock('../../middleware/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/tenant')>()),
  getEmpresaId: () => 7,
}));
vi.mock('../../middleware/frms-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/frms-access')>()),
  canSeeFrmsTeamScopeForContext: async () => false,
}));

import router from '../../routes/frms-fadiga-checkin-legacy';

function dbForOwnCheckin() {
  const statements: Array<{ sql: string; binds: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          binds = values;
          return this;
        },
        async first() {
          statements.push({ sql, binds });
          if (sql.includes('FROM funcionarios') && sql.includes('WHERE id = ?')) return { id: 70 };
          if (sql.includes('FROM frms_fadiga_checkin')) return state.checkin;
          if (sql.includes('FROM frms_jornada')) return { id: 'j-70' };
          throw new Error('Unexpected daily fatigue query: ' + sql);
        },
      };
    },
  } as unknown as D1Database;
  return { db, statements };
}

describe('FRMS daily fatigue self: zero sleep and absent evidence', () => {
  beforeEach(() => {
    state.checkin = {
      id: 'c-70',
      jornada_inicio_prevista: '07:00',
      wake_time: '05:00',
      horas_sono: 0,
      horas_sono_48h: 0,
      fit_for_duty: 1,
      kss_score: 9,
      score_fadiga: 80,
      nivel_fadiga: 'VERMELHO',
      status_operacional: 'RESTRITO',
      computed_risk_level: 'critical',
      requires_operational_review: 1,
    };
  });

  it('reconhece 0 horas informadas como evidência de sono crítico, não ausência', async () => {
    const { db, statements } = dbForOwnCheckin();
    const response = await router.fetch(
      new Request('http://localhost/daily-fatigue?date=2026-11-03'),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        date: '2026-11-03', funcionario_id: 70, status: 'critical',
        calculation_available: true, sleep_hours_24h: 0,
        requires_operational_review: true,
      },
    });
    expect(statements.some((q) => q.sql.includes('FROM frms_fadiga_checkin') &&
      q.binds.join(',') === '7,70,2026-11-03')).toBe(true);
  });

  it('escalona KSS 9 legado classificado NORMAL, sem mostrar rótulo APTO ou VERDE', async () => {
    state.checkin = {
      ...state.checkin,
      horas_sono: 8,
      kss_score: 9,
      score_fadiga: 30,
      nivel_fadiga: 'VERDE',
      status_operacional: 'APTO',
      computed_risk_level: 'normal',
      requires_operational_review: 0,
    };
    const { db } = dbForOwnCheckin();
    const response = await router.fetch(
      new Request('http://localhost/daily-fatigue?date=2026-11-03'),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        status: 'critical', risk_reconciled_from_evidence: true,
        requires_operational_review: true, nivel_fadiga: null, status_operacional: null,
      },
    });
  });

  it('não converte horas_sono NULL do banco em zero informado', async () => {
    state.checkin = { ...state.checkin, horas_sono: null };
    const { db } = dbForOwnCheckin();
    const response = await router.fetch(
      new Request('http://localhost/daily-fatigue?date=2026-11-03'),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        status: 'incomplete_checkin', calculation_available: false,
        sleep_hours_24h: null, requires_operational_review: true,
      },
    });
  });
});
