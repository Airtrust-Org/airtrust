import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

vi.mock('../../middleware/frms-access', () => ({
  canSeeFrmsTeamScopeForContext: vi.fn(async () => true),
}));

vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all' })),
  buildFuncionarioScopeWhere: vi.fn(() => ({ clause: '1=1', bindings: [] })),
}));

import router from '../../routes/frms-fadiga-checkin-legacy';

const calls: Array<{ sql: string; bindings: unknown[] }> = [];

function env(extraRows: Record<string, unknown>[] = []): AppEnv['Bindings'] {
  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          calls.push({ sql, bindings });
          return this;
        },
        async all() {
          return {
            results: [
              {
                funcionario_id: 201,
                funcionario_nome: 'Tripulante Com Jornada',
                cargo: 'Piloto',
                quinzena_numero: 2,
                quinzena_inicio: '2026-09-16',
                quinzena_fim: '2026-09-30',
                jornada_id: 'j-201',
                checkin_id: null,
              },
              {
                funcionario_id: 202,
                funcionario_nome: 'Tripulante Sem Dados FRMS',
                cargo: 'Piloto',
                quinzena_numero: 2,
                quinzena_inicio: '2026-09-16',
                quinzena_fim: '2026-09-30',
                jornada_id: null,
                checkin_id: null,
              },
              ...extraRows,
            ],
          };
        },
      };
    },
  };
  return { DB: db } as unknown as AppEnv['Bindings'];
}

describe('GET /daily-fatigue?scope=team — roster da quinzena', () => {
  beforeEach(() => calls.splice(0));

  it('parte da quinzena ativa e preserva tripulante mesmo sem jornada/check-in FRMS', async () => {
    const response = await router.request(
      'http://localhost/daily-fatigue?date=2026-09-27&scope=team',
      { headers: { authorization: 'Bearer synthetic' } },
      env(),
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { items: Array<Record<string, unknown>> } };
    expect(payload.data.items).toHaveLength(2);
    expect(payload.data.items.find((item) => item.funcionario_id === 202)).toMatchObject({
      funcionario_nome: 'Tripulante Sem Dados FRMS',
      status: 'no_duty',
      data_source: 'not_applicable',
      calculation_available: false,
    });

    const query = calls.find((call) => call.sql.includes('WITH current_fortnight'));
    expect(query).toBeDefined();
    expect(query!.sql).toContain('JOIN current_fortnight cf');
    expect(query!.sql).toContain("LOWER(TRIM(COALESCE(f.quinzena, '')))");
    expect(query!.sql).toContain('LEFT JOIN frms_jornada fj');
    expect(query!.sql).toContain('LEFT JOIN frms_fadiga_checkin ch');
    expect(query!.bindings.slice(0, 5)).toEqual([6, '2026-09-27', '2026-09-27', '2026-09-27', 6]);
  });
  it('mantém 0 h de sono reportado como risco crítico, sem converter ausência em 0 h', async () => {
    const common = {
      cargo: 'Piloto',
      quinzena_numero: 2,
      jornada_id: 'j-test',
      checkin_id: 'c-test',
      checkin_apresentacao: '07:00',
      wake_time: '05:00',
      computed_risk_level: 'critical',
      kss_score: 9,
      kss_provenance: 'CREW_REPORTED',
      fit_for_duty: 1,
    };
    const response = await router.request(
      'http://localhost/daily-fatigue?date=2026-09-27&scope=team',
      { headers: { authorization: 'Bearer synthetic' } },
      env([
        { ...common, funcionario_id: 401, horas_sono: 0 },
        { ...common, funcionario_id: 402, horas_sono: null },
      ]),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { items: Array<Record<string, unknown>> } };
    expect(body.data.items.find((row) => row.funcionario_id === 401)).toMatchObject({
      status: 'critical', calculation_available: true, sleep_hours_24h: 0,
    });
    expect(body.data.items.find((row) => row.funcionario_id === 402)).toMatchObject({
      status: 'incomplete_checkin', calculation_available: false, sleep_hours_24h: null,
    });
  });

  it('escalona KSS 9 e não apresenta APTO/VERDE de classificação legada', async () => {
    const response = await router.request(
      'http://localhost/daily-fatigue?date=2026-09-27&scope=team',
      { headers: { authorization: 'Bearer synthetic' } },
      env([{
        funcionario_id: 450,
        funcionario_nome: 'Tripulante Dado Legado',
        cargo: 'Piloto',
        quinzena_numero: 2,
        jornada_id: 'j-450',
        checkin_id: 'c-450',
        checkin_apresentacao: '07:00',
        wake_time: '05:00',
        horas_sono: 8,
        kss_score: 9,
        kss_provenance: 'CREW_REPORTED',
        fit_for_duty: 1,
        computed_risk_level: 'normal',
        score_fadiga: 35,
        nivel_fadiga: 'VERDE',
        status_operacional: 'APTO',
      }]),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { items: Array<Record<string, unknown>> } };
    expect(payload.data.items.find((row) => row.funcionario_id === 450)).toMatchObject({
      status: 'critical', status_label: 'Crítica', requires_operational_review: 1,
      risk_reconciled_from_evidence: true, nivel_fadiga: null, status_operacional: null,
    });
  });

  it('não converte classificação ausente ou inválida em risco normal', async () => {
    const base = {
      cargo: 'Piloto',
      quinzena_numero: 2,
      jornada_id: 'j-synthetic',
      checkin_id: 'c-synthetic',
      checkin_apresentacao: '07:00',
      wake_time: '05:00',
      horas_sono: 7,
      kss_score: 4,
      kss_provenance: 'CREW_REPORTED',
      fit_for_duty: 1,
    };
    const response = await router.request(
      'http://localhost/daily-fatigue?date=2026-09-27&scope=team',
      { headers: { authorization: 'Bearer synthetic' } },
      env([
        { ...base, funcionario_id: 301, computed_risk_level: null },
        { ...base, funcionario_id: 302, computed_risk_level: 'unexpected' },
        { ...base, funcionario_id: 303, computed_risk_level: 'normal' },
        { ...base, funcionario_id: 304, computed_risk_level: 'attention' },
      ]),
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { items: Array<Record<string, unknown>> } };
    for (const id of [301, 302]) {
      expect(payload.data.items.find((item) => item.funcionario_id === id)).toMatchObject({
        status: 'incomplete_checkin',
        status_label: 'Check-in incompleto',
        calculation_available: false,
        requires_operational_review: 1,
        data_source: 'crew_reported',
      });
    }
    expect(payload.data.items.find((item) => item.funcionario_id === 303)).toMatchObject({
      status: 'normal', calculation_available: true, requires_operational_review: 0,
    });
    expect(payload.data.items.find((item) => item.funcionario_id === 304)).toMatchObject({
      status: 'attention', calculation_available: true, requires_operational_review: 1,
    });
  });

});
