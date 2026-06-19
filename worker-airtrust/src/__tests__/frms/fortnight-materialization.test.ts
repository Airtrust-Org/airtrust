import { describe, expect, it } from 'vitest';

import {
  applyFortnightBaseMaterialization,
  previewFortnightBaseMaterialization,
} from '../../lib/frms/fortnight-materialization';

type MutableRow = Record<string, unknown>;

function createDb(seedRows: MutableRow[]) {
  const rows = seedRows.map((row) => ({ ...row }));
  const writes: Array<{ id: string; dia: number; total: number }> = [];

  return {
    writes,
    db: {
      prepare(query: string) {
        if (query.includes('FROM frms_fatorizacao_jornada fj')) {
          return {
            bind: () => ({
              all: async () => ({ results: rows.map((row) => ({ ...row })) }),
            }),
          };
        }

        if (query.includes('UPDATE frms_fatorizacao_jornada')) {
          return {
            bind:
              (
                dia: number,
                total: number,
                _updatedAt: string,
                fatorizacaoId: string,
                jornadaId: string,
                _empresaId: number,
                _dataInicio: string,
                _dataFim: string,
              ) => ({
                run: async () => {
                  const target = rows.find(
                    (row) =>
                      row.fatorizacao_id === fatorizacaoId &&
                      row.jornada_id === jornadaId &&
                      row.dia_periodo_embarcado == null,
                  );
                  if (!target) {
                    return { meta: { changes: 0 } };
                  }
                  target.dia_periodo_embarcado = dia;
                  target.total_dias_periodo = total;
                  writes.push({ id: fatorizacaoId, dia, total });
                  return { meta: { changes: 1 } };
                },
              }),
          };
        }

        throw new Error(`Unhandled query: ${query}`);
      },
    } as unknown as D1Database,
  };
}

function createScopeRows(): MutableRow[] {
  return [
    {
      fatorizacao_id: 'fat-ready',
      jornada_id: 'jor-ready',
      data_operacional: '2026-06-12',
      funcionario_id: 101,
      origem: 'SIGVOOS',
      status_jornada: 'ES',
      hora_apresentacao: '06:00',
      hora_termino: '12:00',
      duracao_jornada_minutos: 360,
      horas_voo_minutos: 180,
      dia_periodo_embarcado: 2,
      total_dias_periodo: 14,
      has_frms_escala_quinzenal: 0,
      has_escala_alocacoes: 0,
      has_quinzena_base_ativa: 1,
      has_ausencia_bloqueante: 0,
      dia_calculado_quinzena_base: 2,
      total_calculado_quinzena_base: 14,
    },
    {
      fatorizacao_id: 'fat-apply',
      jornada_id: 'jor-apply',
      data_operacional: '2026-06-13',
      funcionario_id: 102,
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
      dia_calculado_quinzena_base: 3,
      total_calculado_quinzena_base: 14,
    },
    {
      fatorizacao_id: 'fat-blocked',
      jornada_id: 'jor-blocked',
      data_operacional: '2026-06-14',
      funcionario_id: 103,
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
      dia_calculado_quinzena_base: 4,
      total_calculado_quinzena_base: 14,
    },
    {
      fatorizacao_id: 'fat-other-source',
      jornada_id: 'jor-other-source',
      data_operacional: '2026-06-15',
      funcionario_id: 104,
      origem: 'SIGVOOS',
      status_jornada: 'ES',
      hora_apresentacao: '06:00',
      hora_termino: '12:00',
      duracao_jornada_minutos: 360,
      horas_voo_minutos: 180,
      dia_periodo_embarcado: null,
      total_dias_periodo: null,
      has_frms_escala_quinzenal: 0,
      has_escala_alocacoes: 1,
      has_quinzena_base_ativa: 0,
      has_ausencia_bloqueante: 0,
      dia_calculado_quinzena_base: null,
      total_calculado_quinzena_base: null,
    },
    {
      fatorizacao_id: 'fat-no-scale',
      jornada_id: 'jor-no-scale',
      data_operacional: '2026-06-16',
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
      has_quinzena_base_ativa: 0,
      has_ausencia_bloqueante: 0,
      dia_calculado_quinzena_base: null,
      total_calculado_quinzena_base: null,
    },
  ];
}

describe('fortnight base materialization', () => {
  it('preview permanece read-only e classifica candidatos/bloqueios', async () => {
    const { db, writes } = createDb(createScopeRows());

    const result = await previewFortnightBaseMaterialization(db, {
      empresaId: 6,
      dataInicio: '2026-06-12',
      dataFim: '2026-06-18',
      origem: ['SIGVOOS'],
      status: ['ES'],
    });

    expect(writes).toEqual([]);
    expect(result.atualizaveis).toBe(1);
    expect(result.resumo).toEqual({
      total_fatorizacoes_escopo: 5,
      ja_materializadas: 1,
      pendentes_materializacao: 4,
      candidatos_quinzena_base: 1,
      bloqueados_por_ausencia: 1,
      fora_escopo_outras_fontes: 1,
      sem_escala_detectada: 1,
    });
    expect(result.coverage.resumo.total_fatorizacoes).toBe(5);
  });

  it('apply escreve apenas candidatos permitidos e fica idempotente na segunda execução', async () => {
    const { db, writes } = createDb(createScopeRows());

    const first = await applyFortnightBaseMaterialization(db, {
      empresaId: 6,
      dataInicio: '2026-06-12',
      dataFim: '2026-06-18',
      origem: ['SIGVOOS'],
      status: ['ES'],
    });

    expect(first.updated).toBe(1);
    expect(first.unchanged_after_guard).toBe(0);
    expect(writes).toEqual([{ id: 'fat-apply', dia: 3, total: 14 }]);

    const second = await applyFortnightBaseMaterialization(db, {
      empresaId: 6,
      dataInicio: '2026-06-12',
      dataFim: '2026-06-18',
      origem: ['SIGVOOS'],
      status: ['ES'],
    });

    expect(second.updated).toBe(0);
    expect(second.unchanged_after_guard).toBe(0);
    expect(writes).toHaveLength(1);
  });
});
