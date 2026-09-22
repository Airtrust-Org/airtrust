import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPilotOfflineWorkspace } from '../../services/controle-voos/pilot-offline-workspace';

function createDb(): D1Database {
  return {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const statement: any = {
        bind() { return statement; },
        async all() {
          if (normalized.includes('FROM frms_location_catalog')) return { results: [] };
          if (normalized.includes('FROM cv_aeroportos')) {
            return {
              results: [
                { codigo: 'SBME', codigo_icao: 'SBME', nome: 'MACAÉ', tipo: 'aeroporto', updated_at: '2026-09-17 12:00:00' },
                { codigo: 'SBCB', codigo_icao: null, nome: 'CABO FRIO', tipo: 'aeroporto', updated_at: '2026-09-17 12:00:00' },
              ],
            };
          }
          return { results: [] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe('Pilot workspace aerodrome fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('usa cv_aeroportos tenant-scoped para resolver SBME/SBCB e consultar REDEMET quando catálogo FRMS está vazio', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
      status: true,
      message: 'ok',
      data: {
        data: [
          { id_localidade: 'SBME', validade_inicial: '2026-09-17 14:00:00', mens: 'METAR SBME 171400Z 09010KT 9999 FEW020 25/18 Q1015=' },
          { id_localidade: 'SBCB', validade_inicial: '2026-09-17 14:30:00', mens: 'METAR SBCB 171430Z 10012KT 9999 SCT020 24/19 Q1014=' },
        ],
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const workspace = await buildPilotOfflineWorkspace({
      db: createDb(),
      empresaId: 6,
      generatedAt: '2026-09-17T15:00:00.000Z',
      redemetApiKey: 'test-key',
      voo: {
        id: 42, prefixo: 'PS-CDU', data_programacao: '2026-09-17',
        horario_previsto_partida: '2026-09-17T14:00:00Z', horario_previsto_chegada: '2026-09-17T15:00:00Z',
        status: 'programado', observacoes: null, versao: 3, updated_at: '2026-09-17T12:00:00Z',
      },
      origem: { id: 1, codigo: 'SBME', codigo_icao: 'SBME', codigo_iata: null, nome: 'MACAÉ', cidade: 'Macaé', uf: 'RJ', tipo: 'aeroporto' },
      destino: { id: 2, codigo: 'SBCB', codigo_icao: null, codigo_iata: null, nome: 'CABO FRIO', cidade: 'Cabo Frio', uf: 'RJ', tipo: 'aeroporto' },
      alternado: null,
      aeronave: { id: 3, modelo: 'AW139' },
      tripulantes: [],
      etapas: [{
        id: 1, numero_etapa: 1, origem_icao: 'SBME', destino_icao: 'SBCB',
        combustivel_inicio: null, combustivel_fim: null, unidade_combustivel: null,
        peso_vazio: 9300, peso_passageiros: 1200, peso_bagagem: 150, peso_total: 13490,
        unidade_peso: 'LB', updated_at: null,
      }],
      abastecimentos: [],
      rdv: null,
    });

    expect(workspace.planning).toMatchObject({
      peso_vazio: 9300,
      peso_passageiros: 1200,
      peso_bagagem: 150,
      peso_total: 13490,
      peso_planejado: 13490,
      unidade_peso_planejado: 'LB',
    });
    expect(workspace.locations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SBME', source_reference: 'CV_AEROPORTOS_FALLBACK', weather_source_kind: 'REDEMET' }),
      expect.objectContaining({ code: 'SBCB', source_reference: 'CV_AEROPORTOS_FALLBACK', weather_source_kind: 'REDEMET' }),
    ]));
    expect(workspace.met_snapshot).toMatchObject({ status: 'AVAILABLE' });
    expect((workspace.met_snapshot as any).observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SBME', status: 'AVAILABLE', station_icao: 'SBME' }),
      expect.objectContaining({ code: 'SBCB', status: 'AVAILABLE', station_icao: 'SBCB' }),
    ]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/mensagens/metar/SBME,SBCB?');
  });
});
