import { describe, expect, it } from 'vitest';
import { projectFlightFatigue } from '../../routes/controle-voos-fatigue';
import type { FrmsOperationalSnapshotItem } from '../../lib/frms/operational-snapshot';

const crew = [
  { funcionario_id: 10, nome: 'PIC Teste', funcao: 'PIC' },
  { funcionario_id: 20, nome: 'SIC Teste', funcao: 'SIC' },
];

describe('Controle de Voos — leitura FRMS por tripulação', () => {
  it('não converte ausência de fadiga diária em aptidão', () => {
    const result = projectFlightFatigue(crew, []);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      funcionario_id: 10, checkin: 'AUSENTE', estado: 'NAO_AVALIADO',
      fonte: 'AUSENTE', dados_disponiveis: false, efetividade_pct: null,
    });
  });

  it('filtra o snapshot aos tripulantes do voo e omite informações clínicas privadas', () => {
    const snapshot = [
      { funcionario_id: 10, checkin_status: 'RECEBIDO',
        estado_operacional: 'ATENCAO', jornada_data_source: 'REAL',
        fadiga_score: 38, effectiveness_pct: 82, alertas: ['KSS_ALTO'],
        acao_recomendada_texto: 'Acompanhar e avaliar mitigação.',
        fortnight_indicator: { status_quinzena: 'ATENCAO', tendencia: 'CRESCENTE', decisao: 'ALERTA' },
        horas_sono: 4, kss_score: 8, qualidade_sono: 2, hora_acordar: '04:00',
      },
      { funcionario_id: 999, checkin_status: 'RECEBIDO', estado_operacional: 'NORMAL',
        jornada_data_source: 'REAL', fadiga_score: 0, effectiveness_pct: 100, alertas: [] },
    ] as unknown as FrmsOperationalSnapshotItem[];
    const result = projectFlightFatigue(crew, snapshot);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      funcionario_id: 10, checkin: 'RECEBIDO', estado: 'ATENCAO',
      status_quinzena: 'ATENCAO', tendencia: 'CRESCENTE', decisao: 'ALERTA',
      efetividade_pct: 82, dados_disponiveis: true,
    });
    expect(result[1].dados_disponiveis).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/horas_sono|kss_score|qualidade_sono|hora_acordar|999/);
  });

  it('registra fadiga diária pendente mesmo se condição agregada parecer normal', () => {
    const snapshot = [{
      funcionario_id: 10, checkin_status: 'PENDENTE', estado_operacional: 'NORMAL',
      jornada_data_source: 'ESTIMADO', fadiga_score: null, effectiveness_pct: null,
      alertas: ['CHECKIN_PENDENTE'], fortnight_indicator: null,
    }] as unknown as FrmsOperationalSnapshotItem[];
    expect(projectFlightFatigue(crew, snapshot)[0]).toMatchObject({
      checkin: 'PENDENTE', fonte: 'ESTIMADO', alertas: ['CHECKIN_PENDENTE'],
    });
  });
});
