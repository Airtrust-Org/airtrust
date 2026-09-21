import { describe, expect, it } from 'vitest';

import {
  buildCompletedFlightLogMessage,
  buildDailyPlanningMessage,
  buildFlightProgramMessage,
  nextDateInSaoPaulo,
  type WhatsAppFlightContext,
} from '../services/controle-voos/flight-whatsapp-messages';

const context: WhatsAppFlightContext = {
  flight: {
    id: 88,
    prefixo: 'PS-CDV',
    numero_voo: null,
    data_programacao: '2026-09-21',
    horario_previsto_partida: '2026-09-21T20:41:00Z',
    horario_previsto_chegada: '2026-09-21T22:08:00Z',
    horario_real_partida: '2026-09-21T20:45:00Z',
    horario_real_chegada: '2026-09-21T22:03:00Z',
    status: 'concluido_operacionalmente',
    contrato_nome: 'PETROBRAS',
  },
  crew: [
    { funcao: 'PIC', nome_guerra: 'DAUMAS' },
    { funcao: 'SIC', nome_guerra: 'NARESSI' },
  ],
  stages: [
    {
      numero_etapa: 1,
      origem_icao: 'SBME',
      destino_icao: '9PGB',
      pax: 7,
      payload: null,
      peso_passageiros: 1190,
      peso_bagagem: 140,
      unidade_peso: 'LB',
      horario_motor_ligado: '06:45',
      horario_decolagem: '06:51',
      horario_pouso: '07:40',
      horario_motor_desligado: '07:43',
    },
    {
      numero_etapa: 2,
      origem_icao: '9PGB',
      destino_icao: 'SBME',
      pax: 6,
      payload: null,
      peso_passageiros: null,
      peso_bagagem: null,
      unidade_peso: 'LB',
      horario_motor_ligado: '07:55',
      horario_decolagem: '08:00',
      horario_pouso: '08:25',
      horario_motor_desligado: '08:29',
    },
  ],
  fuel: { combustivel_solicitado: 2300, unidade: 'LB' },
};

describe('Controle de Voos WhatsApp messages', () => {
  it('builds the flight program without unsupported emoji replacement characters', () => {
    const message = buildFlightProgramMessage(context);

    expect(message).toContain('*Programação de voo | Costa do Sol*');
    expect(message).toContain('*Cliente:* PETROBRAS');
    expect(message).toContain('*Rota:* SBME / 9PGB / SBME');
    expect(message).toContain('*Tripulação:* Cmte: DAUMAS / Cop: NARESSI');
    expect(message).toContain('*Combustível solicitado:* 2300 LB');
    expect(message).not.toContain('🚁');
    expect(message).not.toContain('�');
  });

  it('builds a daily planning summary with all flights', () => {
    const second: WhatsAppFlightContext = {
      ...context,
      flight: {
        ...context.flight,
        id: 89,
        prefixo: 'PS-CDA',
        horario_previsto_partida: '2026-09-21T23:30:00Z',
      },
      stages: [
        {
          ...context.stages[0],
          origem_icao: 'SBME',
          destino_icao: 'NS41',
        },
      ],
    };

    const message = buildDailyPlanningMessage('2026-09-21', [context, second]);

    expect(message).toContain('*Planejamento de voos | Costa do Sol*');
    expect(message).toContain('21/09/2026');
    expect(message).toContain('*Aeronave:* PS-CDV');
    expect(message).toContain('*Aeronave:* PS-CDA');
    expect(message).toContain('*Passageiros previstos:* 7');
  });

  it('builds a completed Flight Log from actual stage data', () => {
    const message = buildCompletedFlightLogMessage(context);

    expect(message).toContain('*Flight Log | Costa do Sol*');
    expect(message).toContain('*Etapa 1 — SBME / 9PGB*');
    expect(message).toContain('Acionamento SBME: 06:45 HS');
    expect(message).toContain('Decolagem SBME: 06:51 HS');
    expect(message).toContain('Pouso 9PGB: 07:40 HS');
    expect(message).toContain('POB: 9');
    expect(message).toContain('*Etapa 2 — 9PGB / SBME*');
  });

  it('resolves tomorrow using the Sao Paulo calendar date', () => {
    expect(nextDateInSaoPaulo(new Date('2026-09-22T01:30:00Z'))).toBe('2026-09-22');
  });
});
