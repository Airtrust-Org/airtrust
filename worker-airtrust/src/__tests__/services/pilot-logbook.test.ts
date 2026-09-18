import { describe, expect, it } from 'vitest';
import {
  buildPilotLogbookRoute,
  parsePilotLogbookDuration,
} from '../../services/controle-voos/pilot-logbook';

describe('pilot logbook projection', () => {
  it('normaliza duracoes de etapa HH:MM e horas decimais', () => {
    expect(parsePilotLogbookDuration('01:25')).toBe(85);
    expect(parsePilotLogbookDuration('00:09')).toBe(9);
    expect(parsePilotLogbookDuration(1.5)).toBe(90);
    expect(parsePilotLogbookDuration('1,25')).toBe(75);
  });

  it('falha fechado para duracoes invalidas', () => {
    expect(parsePilotLogbookDuration('01:75')).toBe(0);
    expect(parsePilotLogbookDuration('abc')).toBe(0);
    expect(parsePilotLogbookDuration(-1)).toBe(0);
  });

  it('monta a rota completa a partir das pernas do voo offshore', () => {
    expect(
      buildPilotLogbookRoute([
        { origem_icao: 'SBME', destino_icao: '9PAA' },
        { origem_icao: '9PAA', destino_icao: '9PBB' },
        { origem_icao: '9PBB', destino_icao: 'SBCB' },
      ]),
    ).toEqual(['SBME', '9PAA', '9PBB', 'SBCB']);
  });

  it('usa a rota planejada como fallback quando nao ha etapas', () => {
    expect(buildPilotLogbookRoute([], ['SBME', 'SBCB'])).toEqual(['SBME', 'SBCB']);
  });
});
