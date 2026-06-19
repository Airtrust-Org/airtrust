import { describe, expect, it, vi } from 'vitest';
import { getFrmsFortnightCoverage } from '../../lib/frms/fortnight-coverage';

function createDb(rows: Array<Record<string, unknown>>) {
  const run = vi.fn();
  const all = vi.fn().mockResolvedValue({ results: rows });
  const bind = vi.fn(() => ({ all, run }));
  const prepare = vi.fn((query: string) => {
    if (query.includes('FROM frms_fatorizacao_jornada fj')) {
      return { bind };
    }
    throw new Error(`Unhandled query: ${query}`);
  });

  return {
    db: { prepare } as unknown as D1Database,
    prepare,
    bind,
    all,
    run,
  };
}

describe('getFrmsFortnightCoverage', () => {
  it('calcula cobertura, agrega por origem e estima recuperabilidade sem writes', async () => {
    const fixtureRows = [
      {
        fatorizacao_id: 'fat-1',
        jornada_id: 'jor-1',
        data_operacional: '2026-06-10',
        funcionario_id: 101,
        origem: 'SIGVOOS',
        status_jornada: 'ES',
        hora_apresentacao: '06:00',
        hora_termino: '12:00',
        duracao_jornada_minutos: 360,
        horas_voo_minutos: 180,
        dia_periodo_embarcado: 3,
        total_dias_periodo: 14,
        has_frms_escala_quinzenal: 1,
        has_escala_alocacoes: 1,
        has_quinzena_base_ativa: 0,
        has_ausencia_bloqueante: 0,
      },
      {
        fatorizacao_id: 'fat-2',
        jornada_id: 'jor-2',
        data_operacional: '2026-06-11',
        funcionario_id: 102,
        origem: 'SIGVOOS',
        status_jornada: 'FE',
        hora_apresentacao: '07:00',
        hora_termino: '13:00',
        duracao_jornada_minutos: 360,
        horas_voo_minutos: 120,
        dia_periodo_embarcado: null,
        total_dias_periodo: null,
        has_frms_escala_quinzenal: 1,
        has_escala_alocacoes: 1,
        has_quinzena_base_ativa: 0,
        has_ausencia_bloqueante: 0,
      },
      {
        fatorizacao_id: 'fat-3',
        jornada_id: 'jor-3',
        data_operacional: '2026-06-12',
        funcionario_id: 103,
        origem: 'FIRA',
        status_jornada: 'ES',
        hora_apresentacao: '08:00',
        hora_termino: '14:00',
        duracao_jornada_minutos: 360,
        horas_voo_minutos: 90,
        dia_periodo_embarcado: null,
        total_dias_periodo: null,
        has_frms_escala_quinzenal: 0,
        has_escala_alocacoes: 1,
        has_quinzena_base_ativa: 0,
        has_ausencia_bloqueante: 0,
      },
      {
        fatorizacao_id: 'fat-4',
        jornada_id: 'jor-4',
        data_operacional: '2026-06-13',
        funcionario_id: 104,
        origem: 'MANUAL',
        status_jornada: 'TRAINING',
        hora_apresentacao: '09:00',
        hora_termino: '11:00',
        duracao_jornada_minutos: 120,
        horas_voo_minutos: 0,
        dia_periodo_embarcado: null,
        total_dias_periodo: null,
        has_frms_escala_quinzenal: 0,
        has_escala_alocacoes: 0,
        has_quinzena_base_ativa: 0,
        has_ausencia_bloqueante: 0,
      },
    ];
    const { db, run, prepare } = createDb(fixtureRows);

    const result = await getFrmsFortnightCoverage(db, {
      empresaId: 6,
      dataInicio: '2026-06-01',
      dataFim: '2026-06-30',
    });

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();

    expect(result.resumo).toEqual({
      total_fatorizacoes: 4,
      com_dia_periodo: 1,
      sem_dia_periodo: 3,
      pct_cobertura: 25,
      com_total_dias: 1,
      sem_total_dias: 3,
    });

    expect(result.por_origem).toEqual([
      {
        origem: 'SIGVOOS',
        total: 2,
        com_dia_periodo: 1,
        sem_dia_periodo: 1,
        pct_cobertura: 50,
      },
      {
        origem: 'FIRA',
        total: 1,
        com_dia_periodo: 0,
        sem_dia_periodo: 1,
        pct_cobertura: 0,
      },
      {
        origem: 'MANUAL',
        total: 1,
        com_dia_periodo: 0,
        sem_dia_periodo: 1,
        pct_cobertura: 0,
      },
    ]);

    expect(result.por_status_jornada).toEqual([
      {
        status_jornada: 'ES',
        total: 2,
        com_dia_periodo: 1,
        sem_dia_periodo: 1,
        pct_cobertura: 50,
      },
      {
        status_jornada: 'FE',
        total: 1,
        com_dia_periodo: 0,
        sem_dia_periodo: 1,
        pct_cobertura: 0,
      },
      {
        status_jornada: 'TRAINING',
        total: 1,
        com_dia_periodo: 0,
        sem_dia_periodo: 1,
        pct_cobertura: 0,
      },
    ]);

    expect(result.por_fonte_periodo).toEqual([
      {
        fonte_periodo: 'AUSENTE',
        total: 3,
        com_dia_periodo: 0,
        sem_dia_periodo: 3,
        pct_cobertura: 0,
      },
      {
        fonte_periodo: 'DERIVADO',
        total: 1,
        com_dia_periodo: 1,
        sem_dia_periodo: 0,
        pct_cobertura: 100,
      },
    ]);

    expect(result.recuperaveis_estimados).toEqual({
      com_escala_alocacoes: 2,
      com_frms_escala_quinzenal: 0,
      com_quinzena_base_ativa: 0,
      sem_escala_detectada: 1,
    });

    expect(result.cobertura_estimada_quinzena_base).toEqual({
      recuperaveis: 0,
      pct_potencial: 75,
    });

    expect(result.notas).toContain('Indicador operacional descritivo; nao e compliance regulatorio.');
    expect(result.notas).toContain('Endpoint read-only; nao executa reprocessamento.');
  });

  it('classifica recuperaveis pela quinzena base ativa sem ausencia bloqueante', async () => {
    const fixtureRows = [
      {
        fatorizacao_id: 'fat-5',
        jornada_id: 'jor-5',
        data_operacional: '2026-06-18',
        funcionario_id: 105,
        origem: 'SIGVOOS',
        status_jornada: 'ES',
        hora_apresentacao: '06:00',
        hora_termino: '12:00',
        duracao_jornada_minutos: 360,
        horas_voo_minutos: 180,
        dia_periodo_embarcado: null,
        total_dias_periodo: null,
        has_frms_escala_quinzenal: 0,
        has_escala_alocacoes: 0,
        has_quinzena_base_ativa: 1,
        has_ausencia_bloqueante: 0,
      },
      {
        fatorizacao_id: 'fat-6',
        jornada_id: 'jor-6',
        data_operacional: '2026-06-18',
        funcionario_id: 106,
        origem: 'SIGVOOS',
        status_jornada: 'ES',
        hora_apresentacao: '06:00',
        hora_termino: '12:00',
        duracao_jornada_minutos: 360,
        horas_voo_minutos: 180,
        dia_periodo_embarcado: null,
        total_dias_periodo: null,
        has_frms_escala_quinzenal: 0,
        has_escala_alocacoes: 0,
        has_quinzena_base_ativa: 1,
        has_ausencia_bloqueante: 1,
      },
    ];
    const { db } = createDb(fixtureRows);

    const result = await getFrmsFortnightCoverage(db, {
      empresaId: 6,
      dataInicio: '2026-06-12',
      dataFim: '2026-06-18',
    });

    expect(result.recuperaveis_estimados).toEqual({
      com_escala_alocacoes: 0,
      com_frms_escala_quinzenal: 0,
      com_quinzena_base_ativa: 1,
      sem_escala_detectada: 1,
    });

    expect(result.cobertura_estimada_quinzena_base).toEqual({
      recuperaveis: 1,
      pct_potencial: 50,
    });
  });
});
