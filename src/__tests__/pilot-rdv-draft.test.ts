import { describe, expect, it } from 'vitest';
// @ts-expect-error public Pilot App module is plain JS by design.
import {
  applySafeStageAggregates,
  calcClockDurationHhMm,
  payloadToKg,
  toDurationInput,
  validateStageDrafts,
} from '../../public/pilot/pilot-rdv-draft.js';

describe('Pilot RDV operational calculations', () => {
  it('calcula tempo de voo e total em HH:MM inclusive cruzando meia-noite', () => {
    expect(calcClockDurationHhMm('08:10', '09:45')).toBe('01:35');
    expect(calcClockDurationHhMm('23:50', '00:20')).toBe('00:30');
  });

  it('normaliza durações legadas decimais para HH:MM', () => {
    expect(toDurationInput('1.5')).toBe('01:30');
    expect(toDurationInput('00:45')).toBe('00:45');
  });

  it('converte payload em lb para o campo canônico de kg', () => {
    expect(payloadToKg('220.46226218', 'LB')).toBe(100);
    expect(payloadToKg('100', 'KG')).toBe(100);
  });

  it('agrega horas, pousos, POB e carga das pernas sem derivar ciclos', () => {
    const form = { ciclos: '3', horas_voadas: '', numero_pousos: '', pob: '', carga_kg: '' };
    const next = applySafeStageAggregates(form, [
      {
        horario_decolagem: '23:30', horario_pouso: '00:15',
        pousos_diurnos: '0', pousos_noturnos: '1', pax: '8', payload: '220.46226218', unidade_payload: 'LB',
        combustivel_inicio: '', combustivel_fim: '',
      },
      {
        horario_decolagem: '01:00', horario_pouso: '01:45',
        pousos_diurnos: '1', pousos_noturnos: '0', pax: '7', payload: '90', unidade_payload: 'KG',
        combustivel_inicio: '', combustivel_fim: '',
      },
    ]);
    expect(next.horas_voadas).toBe('1.5');
    expect(next.numero_pousos).toBe('2');
    expect(next.pob).toBe('7');
    expect(next.carga_kg).toBe('90');
    expect(next.ciclos).toBe('3');
  });

  it('mostra validações específicas para duração e unidade de combustível', () => {
    const errors = validateStageDrafts([{
      origem_icao: 'SBME', destino_icao: 'SBCB',
      tempo_ifr: '1.5', tempo_noturno: '00:20',
      combustivel_inicio: '1200', combustivel_fim: '1100', unidade_combustivel: '',
    }]);
    expect(errors).toContain('Etapa 1: IFR deve estar em HH:MM.');
    expect(errors).toContain('Etapa 1: selecione a unidade do combustível.');
  });
});
