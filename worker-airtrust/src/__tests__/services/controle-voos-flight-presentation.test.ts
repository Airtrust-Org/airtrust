import { describe, expect, it, vi } from 'vitest';
import { getFlightPresentationMap } from '../../services/controle-voos/flight-presentation';

function fakeDb() {
  const prepare = vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn(() => statement),
      all: vi.fn(async () => {
        if (sql.includes('FROM cv_voo_etapas')) {
          return {
            results: [
              { voo_id: 11, numero_etapa: 1, origem_icao: 'SBME', destino_icao: '9PGF' },
              { voo_id: 11, numero_etapa: 2, origem_icao: '9PGF', destino_icao: 'SBME' },
            ],
          };
        }
        if (sql.includes('FROM cv_voo_eventos')) {
          return {
            results: [
              { voo_id: 11, metadata_json: JSON.stringify({ route_point_ids: [1, 125, 1] }) },
            ],
          };
        }
        if (sql.includes('FROM cv_rdv_operacional')) {
          return {
            results: [
              { voo_id: 11, status: 'preenchimento_finalizado', workflow_status: 'enviado', enviado_em: '2026-09-20T20:00:00Z' },
            ],
          };
        }
        if (sql.includes('id IN')) {
          return {
            results: [
              { id: 1, codigo: 'SBME', codigo_icao: 'SBME', nome: 'MACAÉ / Macaé, RJ', tipo: 'aeroporto' },
              { id: 125, codigo: 'NS41', codigo_icao: '9PGF', nome: 'NAVIO / ODN 1', tipo: 'plataforma' },
            ],
          };
        }
        if (sql.includes('UPPER(TRIM(codigo))')) {
          return {
            results: [
              { id: 1, codigo: 'SBME', codigo_icao: 'SBME', nome: 'MACAÉ / Macaé, RJ', tipo: 'aeroporto' },
              { id: 125, codigo: 'NS41', codigo_icao: '9PGF', nome: 'NAVIO / ODN 1', tipo: 'plataforma' },
              { id: 147, codigo: 'ODN1', codigo_icao: '9PGF', nome: 'NAVIO / ODIN I', tipo: 'plataforma' },
            ],
          };
        }
        return { results: [] };
      }),
    };
    return statement;
  });
  return { prepare } as unknown as D1Database;
}

describe('Controle de Voos flight presentation', () => {
  it('preserva o ponto aeronáutico exato da rota mesmo quando o ICAO é ambíguo', async () => {
    const result = await getFlightPresentationMap(fakeDb(), 6, [11]);
    const presentation = result.get(11);

    expect(presentation?.rota_codigos).toEqual(['SBME', '9PGF', 'SBME']);
    expect(presentation?.rota_pontos).toEqual([
      expect.objectContaining({ id: 1, codigo: 'SBME', codigo_icao: 'SBME' }),
      expect.objectContaining({ id: 125, codigo: 'NS41', codigo_icao: '9PGF', nome: 'NAVIO / ODN 1' }),
      expect.objectContaining({ id: 1, codigo: 'SBME', codigo_icao: 'SBME' }),
    ]);
    expect(presentation?.rdv_workflow_status).toBe('enviado');
    expect(presentation?.rdv_status).toBe('preenchimento_finalizado');
  });
});
