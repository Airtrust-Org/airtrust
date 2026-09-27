import { describe, expect, it } from 'vitest';
import {
  resolvePreferredOperationalJourneys,
  type LegacySigvoosOperationalJourney,
} from '../../lib/frms/preferred-operational-source';
import type { ControleVoosOperationalRecord } from '../../lib/frms/controle-voos-source';

function cv(overrides: Partial<ControleVoosOperationalRecord> = {}): ControleVoosOperationalRecord {
  return {
    empresaId: 6, identificadorInterno: 'v1-e1-t1', identificadorExterno: null,
    identificadorExternoTripulante: null, origem: 'CONTROLE_VOOS', origemDados: 'manual_interno',
    tripulanteId: 7, funcao: 'PIC', horaApresentacao: '07:00', horaDispensa: '12:30',
    dataOperacional: '2026-09-20', horaMotorLigado: '07:30', horaDecolagem: '08:00',
    horaPouso: '10:00', horaMotorDesligado: '10:15', timezone: null,
    timezoneFonte: 'INDISPONIVEL', vooId: 1, etapaId: 1, aeronaveIdentificador: 'PS-CDV',
    origemIcao: 'SBME', destinoIcao: '9PGB', statusOperacional: 'REALIZADO',
    statusOperacionalRaw: 'concluido', cancelado: false, corrigido: false,
    minutosVoo: 120, minutosTotal: 165, pousos: 1, atualizadoEm: null,
    qualidadeDado: 'completo', estadoConflito: null, ...overrides,
  };
}

const sig: LegacySigvoosOperationalJourney = {
  data: '2026-09-20', tripulante_id: 7, hora_apresentacao: '06:45', hora_termino: '13:00',
  horas_voo_minutos: 150, duracao_jornada_minutos: 375,
  hora_primeiro_acionamento: '07:10', hora_primeira_decolagem: '07:20',
  hora_ultimo_pouso: '12:40', hora_corte_motor: '12:50',
};

describe('FRMS preferred operational source', () => {
  it('prefere Controle de Voos sem somar novamente SIGVOOS', () => {
    const [row] = resolvePreferredOperationalJourneys([cv()], [sig]);
    expect(row).toMatchObject({ operational_data_source: 'CONTROLE_VOOS', hora_apresentacao: '07:00', hora_termino: '12:30', horas_voo_minutos: 120, duracao_jornada_minutos: 330 });
  });

  it('usa SIGVOOS como fallback quando não há dado interno no Controle de Voos', () => {
    const [row] = resolvePreferredOperationalJourneys([], [sig]);
    expect(row).toMatchObject({ operational_data_source: 'SIGVOOS', horas_voo_minutos: 150 });
  });

  it('faz fallback por campo sem apagar valores já preenchidos no Controle de Voos', () => {
    const [row] = resolvePreferredOperationalJourneys([cv({ horaDispensa: null, horaMotorDesligado: null, horaPouso: null, minutosVoo: 0, minutosTotal: 0 })], [sig]);
    expect(row).toMatchObject({ operational_data_source: 'CONTROLE_VOOS_COM_FALLBACK_SIGVOOS', hora_apresentacao: '07:00', hora_termino: '13:00', horas_voo_minutos: 150 });
  });

  it('trata linha SIGVOOS importada no Controle de Voos como fallback, não como primária', () => {
    const [row] = resolvePreferredOperationalJourneys([cv({ origemDados: 'importado' })], []);
    expect(row.operational_data_source).toBe('SIGVOOS');
  });
});
