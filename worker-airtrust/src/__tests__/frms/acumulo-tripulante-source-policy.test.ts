import { describe, expect, it } from 'vitest';
import { buscarAcumuloTripulante } from '../../lib/frms/db-service-acumulo';

const TRIPULANTE_ID = '7';

type JornadaRow = {
  tripulante_id: string;
  data: string;
  status: string;
  duracao_jornada_minutos: number;
  horas_voo_minutos: number;
  origem?: string;
};

type FatorizacaoRow = {
  data: string;
  origem?: string;
  total_fatorizado_jornada: number;
  total_fatorizado_hv: number;
};

function createDbFixture(input: {
  jornadaRows: JornadaRow[];
  fatorizacaoRows: FatorizacaoRow[];
}) {
  const statements: string[] = [];

  function isCanonicalRow(query: string, origem?: string): boolean {
    if (
      !query.includes("UPPER(COALESCE(origem, '')) = 'SIGVOOS'") &&
      !query.includes("UPPER(COALESCE(j.origem, '')) = 'SIGVOOS'")
    ) {
      return true;
    }
    return String(origem ?? 'SIGVOOS').toUpperCase() === 'SIGVOOS';
  }

  const db = {
    prepare: (query: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => {
          statements.push(query);

          if (query.includes('FROM frms_configuracao_limites')) {
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

          if (query.includes('SELECT status, duracao_jornada_minutos, horas_voo_minutos')) {
            const mes = String(args[1] ?? '');
            return {
              results: input.jornadaRows.filter(
                (row) =>
                  row.tripulante_id === String(args[0]) &&
                  row.data.startsWith(`${mes}-`) &&
                  isCanonicalRow(query, row.origem),
              ),
            };
          }

          if (query.includes('SELECT f.total_fatorizado_jornada, f.total_fatorizado_hv')) {
            const mes = String(args[1] ?? '');
            return {
              results: input.fatorizacaoRows
                .filter(
                  (row) => row.data.startsWith(`${mes}-`) && isCanonicalRow(query, row.origem),
                )
                .map((row) => ({
                  total_fatorizado_jornada: row.total_fatorizado_jornada,
                  total_fatorizado_hv: row.total_fatorizado_hv,
                })),
            };
          }

          return { results: [] };
        },
        first: async () => {
          statements.push(query);

          if (query.includes("COALESCE(p.nome, 'Tripulante #'")) {
            return { nome: 'Dieter' };
          }

          if (query.includes('SELECT ar.* FROM frms_acumulo_rolling ar')) {
            return {
              tripulante_id: TRIPULANTE_ID,
              data_referencia: '2026-06-05',
              hv_7_dias_min: 800,
              pct_limite_7d: 30,
              hv_365_dias_min: 6000,
              pct_limite_365d: 10,
              hv_dia_min: 200,
              pct_limite_dia: 25,
            };
          }

          if (query.includes("SELECT strftime('%Y-%m', data) as mes FROM frms_jornada")) {
            const eligible = input.jornadaRows
              .filter((row) => row.tripulante_id === String(args[0]))
              .filter((row) => isCanonicalRow(query, row.origem))
              .sort((left, right) => right.data.localeCompare(left.data));
            const mes = eligible[0]?.data.slice(0, 7);
            return mes ? { mes } : null;
          }

          if (query.includes('SELECT f.effectiveness_pct')) {
            return null;
          }

          return null;
        },
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database;

  return { db, statements };
}

describe('buscarAcumuloTripulante source policy', () => {
  it('ignora FIRA e MANUAL no bloco mensal, preservando apenas SIGVOOS operacional', async () => {
    const { db, statements } = createDbFixture({
      jornadaRows: [
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-01',
          status: 'ES',
          duracao_jornada_minutos: 595,
          horas_voo_minutos: 1537,
          origem: 'FIRA',
        },
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-02',
          status: 'ES',
          duracao_jornada_minutos: 315,
          horas_voo_minutos: 189,
          origem: 'SIGVOOS',
        },
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-03',
          status: 'TS',
          duracao_jornada_minutos: 391,
          horas_voo_minutos: 282,
          origem: 'SIGVOOS',
        },
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-04',
          status: 'RE',
          duracao_jornada_minutos: 123,
          horas_voo_minutos: 222,
          origem: 'MANUAL',
        },
      ],
      fatorizacaoRows: [
        {
          data: '2026-06-01',
          origem: 'FIRA',
          total_fatorizado_jornada: 9.9,
          total_fatorizado_hv: 9.9,
        },
        {
          data: '2026-06-02',
          origem: 'SIGVOOS',
          total_fatorizado_jornada: 0.3,
          total_fatorizado_hv: 0.2,
        },
        {
          data: '2026-06-03',
          origem: 'SIGVOOS',
          total_fatorizado_jornada: 0.4,
          total_fatorizado_hv: 0.3,
        },
      ],
    });

    const resultado = await buscarAcumuloTripulante(db, TRIPULANTE_ID, '2026-06');

    expect(resultado.mensal).toMatchObject({
      jornada_realizada_min: 706,
      hv_realizada_min: 471,
      jornada_fatorizada_pct: 0.7,
      hv_fatorizada_pct: 0.5,
      dias_embarcado: 2,
    });
    expect(
      statements.some((sql) => sql.includes("UPPER(COALESCE(origem, '')) = 'SIGVOOS'")),
    ).toBe(true);
    expect(resultado.rolling?.hv_7_dias_min).toBe(800);
    expect(resultado.rolling?.hv_365_dias_min).toBe(6000);
    expect(resultado.rolling?.hv_dia_min).toBe(200);
  });

  it('sem mes explicito usa o ultimo mes com SIGVOOS operacional em vez de um mes apenas FIRA', async () => {
    const { db } = createDbFixture({
      jornadaRows: [
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-07-01',
          status: 'ES',
          duracao_jornada_minutos: 595,
          horas_voo_minutos: 1537,
          origem: 'FIRA',
        },
        {
          tripulante_id: TRIPULANTE_ID,
          data: '2026-06-05',
          status: 'ES',
          duracao_jornada_minutos: 315,
          horas_voo_minutos: 189,
          origem: 'SIGVOOS',
        },
      ],
      fatorizacaoRows: [
        {
          data: '2026-06-05',
          origem: 'SIGVOOS',
          total_fatorizado_jornada: 0.2,
          total_fatorizado_hv: 0.1,
        },
      ],
    });

    const resultado = await buscarAcumuloTripulante(db, TRIPULANTE_ID);

    expect(resultado.mensal).toMatchObject({
      jornada_realizada_min: 315,
      hv_realizada_min: 189,
    });
  });
});
