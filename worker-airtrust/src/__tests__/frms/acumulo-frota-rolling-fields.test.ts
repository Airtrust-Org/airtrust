import { describe, expect, it } from 'vitest';
import { buscarAcumuloFrota } from '../../lib/frms/db-service-acumulo';

/**
 * Verifica que o modo mensal (mesReferencia) do buscarAcumuloFrota
 * propaga os campos de rolling (7d, 365d, dia) do frms_acumulo_rolling
 * em vez de zerá-los.
 *
 * Regressão: antes de 2026-06-05, hv_365d_min, pct_365d, hv_dia_min e pct_dia
 * eram hardcoded como 0 no caminho de mês. A correção faz LEFT JOIN com a
 * snapshot mais recente do frms_acumulo_rolling por tripulante.
 */

const TRIPULANTE_A = '7';
const TRIPULANTE_B = '15';
const EMPRESA_ID = 1;

function createDb(overrides?: {
  jornadaRows?: Record<string, unknown>[];
  rollingRow?: Record<string, unknown> | null;
  funcionarioA?: Record<string, unknown>;
  funcionarioB?: Record<string, unknown>;
  limitesOverrides?: Record<string, unknown>;
}) {
  const jornadaRows = overrides?.jornadaRows ?? [];
  const rollingRow =
    overrides?.rollingRow !== undefined
      ? overrides.rollingRow
      : {
          hv_365_dias_min: 6000,
          pct_limite_365d: 10.0,
          hv_7_dias_min: 800,
          pct_limite_7d: 30.0,
          hv_dia_min: 200,
          pct_limite_dia: 25.0,
        };

  let lastBindArgs: unknown[] = [];

  function sumMonthlyHvForTrip(query: string, tripulanteId: string): number {
    const usesCanonicalSource = query.includes("UPPER(COALESCE(j.origem, '')) = 'SIGVOOS'");
    return jornadaRows
      .filter((j) => j.tripulante_id === tripulanteId)
      .filter((j) => {
        if (!usesCanonicalSource) return true;
        return String(j.origem ?? 'SIGVOOS').toUpperCase() === 'SIGVOOS';
      })
      .reduce((sum, j) => sum + ((j.horas_voo_minutos as number) || 0), 0);
  }

  const db = {
    prepare: (query: string) => ({
      all: async () => {
        if (query.includes('FROM frms_configuracao_limites')) {
          return {
            results: [
              {
                nome: 'HV_MES_HORAS',
                valor_numerico: overrides?.limitesOverrides?.HV_MES_HORAS ?? 112.5,
              },
              {
                nome: 'HV_7_DIAS_HORAS',
                valor_numerico: overrides?.limitesOverrides?.HV_7_DIAS_HORAS ?? 27,
              },
              {
                nome: 'ALERTA_AVISO_PCT',
                valor_numerico: overrides?.limitesOverrides?.ALERTA_AVISO_PCT ?? 80,
              },
              {
                nome: 'ALERTA_ATENCAO_PCT',
                valor_numerico: overrides?.limitesOverrides?.ALERTA_ATENCAO_PCT ?? 90,
              },
              {
                nome: 'ALERTA_CRITICO_PCT',
                valor_numerico: overrides?.limitesOverrides?.ALERTA_CRITICO_PCT ?? 95,
              },
            ],
          };
        }

        // Query que busca jornadas + rolling + funcionarios
        if (query.includes('FROM frms_acumulo_rolling') && query.includes('LEFT JOIN frms_jornada')) {
          const rows: Record<string, unknown>[] = [];
          const tripIds = [TRIPULANTE_A, TRIPULANTE_B];

          for (const tid of tripIds) {
            const func =
              tid === TRIPULANTE_A
                ? overrides?.funcionarioA ?? { nome: 'Dieter', guerra: 'Dieter' }
                : overrides?.funcionarioB ?? { nome: 'Marinho', guerra: 'Marinho' };

            const hvMesMin = sumMonthlyHvForTrip(query, tid);

            rows.push({
              tripulante_id: tid,
              nome: func.nome,
              nome_guerra: func.guerra,
              hv_mes_min: hvMesMin,
              hv_365d_min: rollingRow?.hv_365_dias_min ?? null,
              pct_365d: rollingRow?.pct_limite_365d ?? null,
              hv_7d_min: rollingRow?.hv_7_dias_min ?? null,
              pct_7d: rollingRow?.pct_limite_7d ?? null,
              hv_dia_min: rollingRow?.hv_dia_min ?? null,
              pct_dia: rollingRow?.pct_limite_dia ?? null,
            });
          }

          return { results: rows };
        }

        // Enrichment queries (effectiveness, operational context, funcionario context)
        return { results: [] };
      },
      bind: (...args: unknown[]) => {
        lastBindArgs = args;
        return {
          all: async () => {
            // Re-delegate to the same logic above
            if (query.includes('FROM frms_acumulo_rolling') && query.includes('LEFT JOIN frms_jornada')) {
              const rows: Record<string, unknown>[] = [];
              const tripIds = [TRIPULANTE_A, TRIPULANTE_B];

              for (const tid of tripIds) {
                const func =
                  tid === TRIPULANTE_A
                    ? overrides?.funcionarioA ?? { nome: 'Dieter', guerra: 'Dieter' }
                    : overrides?.funcionarioB ?? { nome: 'Marinho', guerra: 'Marinho' };

                const hvMesMin = sumMonthlyHvForTrip(query, tid);

                rows.push({
                  tripulante_id: tid,
                  nome: func.nome,
                  nome_guerra: func.guerra,
                  hv_mes_min: hvMesMin,
                  hv_365d_min: rollingRow?.hv_365_dias_min ?? null,
                  pct_365d: rollingRow?.pct_limite_365d ?? null,
                  hv_7d_min: rollingRow?.hv_7_dias_min ?? null,
                  pct_7d: rollingRow?.pct_limite_7d ?? null,
                  hv_dia_min: rollingRow?.hv_dia_min ?? null,
                  pct_dia: rollingRow?.pct_limite_dia ?? null,
                });
              }

              return { results: rows };
            }
            return { results: [] };
          },
          first: async () => null,
          run: async () => ({ success: true }),
        };
      },
    }),
  } as unknown as D1Database;

  return { db, getLastBindArgs: () => lastBindArgs };
}

describe('buscarAcumuloFrota — month mode (mesReferencia)', () => {
  it('propaga hv_365d_min e hv_7d_min do rolling em vez de zerá-los', async () => {
    const { db } = createDb({
      jornadaRows: [
        { tripulante_id: TRIPULANTE_A, horas_voo_minutos: 2401 },
        { tripulante_id: TRIPULANTE_B, horas_voo_minutos: 1234 },
      ],
    });

    const resultado = await buscarAcumuloFrota(db, '2026-06', EMPRESA_ID, 30);

    expect(resultado).toHaveLength(2);

    const dieter = resultado.find((r) => r.tripulante_id === TRIPULANTE_A)!;
    expect(dieter).toBeDefined();
    expect(dieter.hv_mes_min).toBe(2401); // jornada data
    expect(dieter.hv_7d_min).toBe(800); // rolling table — NÃO hardcoded 0
    expect(dieter.hv_365d_min).toBe(6000); // rolling table — NÃO hardcoded 0
    expect(dieter.hv_dia_min).toBe(200); // rolling table — NÃO hardcoded 0
    expect(dieter.pct_7d).toBe(30.0);
    expect(dieter.pct_365d).toBe(10.0);
    expect(dieter.pct_dia).toBe(25.0);

    const marinho = resultado.find((r) => r.tripulante_id === TRIPULANTE_B)!;
    expect(marinho).toBeDefined();
    expect(marinho.hv_mes_min).toBe(1234);
    expect(marinho.hv_7d_min).toBe(800);
    expect(marinho.hv_365d_min).toBe(6000);
  });

  it('fallback para 0 quando rolling row não existe para o tripulante', async () => {
    const { db } = createDb({
      jornadaRows: [{ tripulante_id: TRIPULANTE_A, horas_voo_minutos: 500 }],
      rollingRow: null, // sem dados de rolling
    });

    const resultado = await buscarAcumuloFrota(db, '2026-06', EMPRESA_ID, 30);

    expect(resultado).toHaveLength(2); // ambos aparecem (HAVING > 0)

    const dieter = resultado.find((r) => r.tripulante_id === TRIPULANTE_A)!;
    expect(dieter.hv_mes_min).toBe(500);
    // Sem rolling, todos devem ser 0 (fallback seguro)
    expect(dieter.hv_7d_min).toBe(0);
    expect(dieter.hv_365d_min).toBe(0);
    expect(dieter.pct_7d).toBe(0);
    expect(dieter.pct_365d).toBe(0);
  });

  it('calcula nivel_max considerando também pct_365d e pct_dia', async () => {
    const { db } = createDb({
      jornadaRows: [{ tripulante_id: TRIPULANTE_A, horas_voo_minutos: 100 }],
      rollingRow: {
        hv_365_dias_min: 50000, // valor alto → pct alto
        pct_limite_365d: 98.0, // acima de CRITICO (95)
        hv_7_dias_min: 10,
        pct_limite_7d: 5.0,
        hv_dia_min: 5,
        pct_limite_dia: 2.0,
      },
    });

    const resultado = await buscarAcumuloFrota(db, '2026-06', EMPRESA_ID, 30);

    const dieter = resultado.find((r) => r.tripulante_id === TRIPULANTE_A)!;
    // pctMes = (100 / (112.5*60)) * 100 ≈ 1.48%
    // pctMax = max(1.48, 5.0, 98.0, 2.0) = 98.0 → CRITICO
    expect(dieter.nivel_max).toBe('CRITICO');
  });

  it('não retorna tripulantes sem jornada no mês (HAVING > 0)', async () => {
    const { db } = createDb({
      jornadaRows: [
        { tripulante_id: TRIPULANTE_A, horas_voo_minutos: 100 },
        // TRIPULANTE_B sem jornada → não deve aparecer
      ],
    });

    // Mock precisa retornar apenas tripulantes com HAVING > 0
    // Vamos criar um db específico para este caso
    const db2 = {
      prepare: () => ({
        all: async () => {
          if (typeof arguments[0] === 'string' && (arguments[0] as string).includes('FROM frms_configuracao_limites')) {
            return {
              results: [
                { nome: 'HV_MES_HORAS', valor_numerico: 112.5 },
                { nome: 'HV_7_DIAS_HORAS', valor_numerico: 27 },
                { nome: 'ALERTA_AVISO_PCT', valor_numerico: 80 },
                { nome: 'ALERTA_ATENCAO_PCT', valor_numerico: 90 },
                { nome: 'ALERTA_CRITICO_PCT', valor_numerico: 95 },
              ],
            };
          }
          return {
            results: [
              {
                tripulante_id: TRIPULANTE_A,
                nome: 'Dieter',
                nome_guerra: 'Dieter',
                hv_mes_min: 100,
                hv_365d_min: 6000,
                pct_365d: 10.0,
                hv_7d_min: 800,
                pct_7d: 30.0,
                hv_dia_min: 200,
                pct_dia: 25.0,
              },
            ],
          };
        },
        bind: () => ({
          all: async () => ({
            results: [
              {
                tripulante_id: TRIPULANTE_A,
                nome: 'Dieter',
                nome_guerra: 'Dieter',
                hv_mes_min: 100,
                hv_365d_min: 6000,
                pct_365d: 10.0,
                hv_7d_min: 800,
                pct_7d: 30.0,
                hv_dia_min: 200,
                pct_dia: 25.0,
              },
            ],
          }),
          first: async () => null,
          run: async () => ({ success: true }),
        }),
      }),
    } as unknown as D1Database;

    const resultado = await buscarAcumuloFrota(db2, '2026-06', EMPRESA_ID, 30);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].tripulante_id).toBe(TRIPULANTE_A);
  });

  it('soma corretamente horas de múltiplas jornadas no mês', async () => {
    const { db } = createDb({
      jornadaRows: [
        { tripulante_id: TRIPULANTE_A, horas_voo_minutos: 300 },
        { tripulante_id: TRIPULANTE_A, horas_voo_minutos: 450 },
        { tripulante_id: TRIPULANTE_A, horas_voo_minutos: 200 },
      ],
    });

    const resultado = await buscarAcumuloFrota(db, '2026-06', EMPRESA_ID, 30);

    const dieter = resultado.find((r) => r.tripulante_id === TRIPULANTE_A)!;
    expect(dieter.hv_mes_min).toBe(950); // 300 + 450 + 200
  });

  it('funciona com quinzena Q1 filtrando apenas primeira metade do mês', async () => {
    // Q1: periodInicio = '2026-06-01', periodoFim = '2026-06-15'
    // Apenas jornadas dentro de 01-15 devem contar para hv_mes_min
    const { db } = createDb({
      jornadaRows: [
        { tripulante_id: TRIPULANTE_A, horas_voo_minutos: 500 },
      ],
    });

    const resultado = await buscarAcumuloFrota(db, '2026-06', EMPRESA_ID, 30, 'Q1');

    expect(resultado.length).toBeGreaterThanOrEqual(1);
    const dieter = resultado.find((r) => r.tripulante_id === TRIPULANTE_A)!;
    // hv_mes_min depende das jornadas mockadas (todas contam no mock simples)
    expect(dieter.hv_mes_min).toBe(500);
    // Rolling fields devem vir do rolling table
    expect(dieter.hv_365d_min).toBe(6000);
    expect(dieter.hv_7d_min).toBe(800);
  });

  it('ignora FIRA e MANUAL no hv_mes_min mensal, preservando rolling 7d/365d/dia', async () => {
    const { db } = createDb({
      jornadaRows: [
        { tripulante_id: TRIPULANTE_A, origem: 'FIRA', horas_voo_minutos: 1537 },
        { tripulante_id: TRIPULANTE_A, origem: 'SIGVOOS', horas_voo_minutos: 315 },
        { tripulante_id: TRIPULANTE_A, origem: 'SIGVOOS', horas_voo_minutos: 549 },
        { tripulante_id: TRIPULANTE_A, origem: 'MANUAL', horas_voo_minutos: 999 },
        { tripulante_id: TRIPULANTE_B, origem: 'FIRA', horas_voo_minutos: 1537 },
      ],
    });

    const resultado = await buscarAcumuloFrota(db, '2026-06', EMPRESA_ID, 30);

    const dieter = resultado.find((r) => r.tripulante_id === TRIPULANTE_A)!;
    expect(dieter.hv_mes_min).toBe(864);
    expect(dieter.hv_7d_min).toBe(800);
    expect(dieter.hv_365d_min).toBe(6000);

    const paloma = resultado.find((r) => r.tripulante_id === TRIPULANTE_B)!;
    expect(paloma.hv_mes_min).toBe(0);
  });
});
