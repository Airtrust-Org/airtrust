import { describe, expect, it } from 'vitest';
import {
  buildExplicitRegulatoryStageData,
  parseExplicitOccurrencesJson,
  validateExplicitRegulatoryStage,
  type ControleVoosEtapaRegulatoriaRow,
} from '../../services/edb/operational-regulatory-source';

function row(
  overrides: Partial<ControleVoosEtapaRegulatoriaRow> = {},
): ControleVoosEtapaRegulatoriaRow {
  return {
    id: 1,
    empresa_id: 10,
    voo_id: 20,
    etapa_id: 30,
    tempo_voo_diurno_minutos: 40,
    tempo_voo_noturno_minutos: 20,
    tempo_voo_total_minutos: 60,
    tempo_ifr_real_minutos: 10,
    tempo_ifr_simulado_minutos: 5,
    tempo_ifr_nao_classificado_minutos: 0,
    pousos_total: 1,
    ciclos: 1,
    combustivel_antes_partida_motor: 900,
    pessoas_a_bordo_total: 12,
    carga_regulatoria_kg: 80,
    ocorrencias_json: '[]',
    origem_dados: 'MANUAL',
    versao: 1,
    preenchido_por: 99,
    preenchido_em: '2026-08-28T12:00:00Z',
    ...overrides,
  };
}

describe('explicit Controle de Voos regulatory source', () => {
  it('preserves null versus explicit empty occurrence list', () => {
    expect(parseExplicitOccurrencesJson(null)).toBeNull();
    expect(parseExplicitOccurrencesJson('[]')).toEqual([]);
    expect(parseExplicitOccurrencesJson('["Bird strike report"]')).toEqual([
      'Bird strike report',
    ]);
  });

  it('rejects invalid occurrence JSON instead of silently guessing', () => {
    expect(() => parseExplicitOccurrencesJson('{"x":1}')).toThrow(
      'JSON array of strings',
    );
  });

  it('requires day plus night to equal the explicit total when all are present', () => {
    expect(() => validateExplicitRegulatoryStage(row())).not.toThrow();
    expect(() =>
      validateExplicitRegulatoryStage(row({ tempo_voo_total_minutos: 61 })),
    ).toThrow('day + night flight time must equal total flight time');
  });

  it('rejects IFR classifications that exceed total flight time', () => {
    expect(() =>
      validateExplicitRegulatoryStage(
        row({ tempo_ifr_real_minutos: 50, tempo_ifr_simulado_minutos: 20 }),
      ),
    ).toThrow('cannot exceed total flight time');
  });

  it('rejects invalid unclassified IFR evidence without promoting it', () => {
    expect(() =>
      validateExplicitRegulatoryStage(row({ tempo_ifr_nao_classificado_minutos: -1 })),
    ).toThrow('tempo_ifr_nao_classificado_minutos');
  });

  it('maps only explicit regulatory fields and preserves unclassified IFR as evidence', () => {
    const result = buildExplicitRegulatoryStageData({
      row: row({
        ocorrencias_json: '["Occurrence A"]',
        tempo_ifr_nao_classificado_minutos: 7,
      }),
      technicalDiscrepancies: [
        {
          description: 'Hydraulic leak indication',
          detectedBy: {
            employeeId: 7,
            fullName: 'Pilot Test',
            anacCode: '123456',
          },
        },
      ],
    });

    expect(result).toMatchObject({
      dayMinutes: 40,
      nightMinutes: 20,
      totalMinutes: 60,
      ifrActualMinutes: 10,
      ifrSimulatedMinutes: 5,
      ifrUnclassifiedMinutes: 7,
      landingsTotal: 1,
      cycles: 1,
      fuelBeforeEngineStart: 900,
      personsOnBoard: 12,
      cargoKg: 80,
      occurrences: ['Occurrence A'],
    });
    expect(result.technicalDiscrepancies?.[0].description).toBe(
      'Hydraulic leak indication',
    );
  });
});
