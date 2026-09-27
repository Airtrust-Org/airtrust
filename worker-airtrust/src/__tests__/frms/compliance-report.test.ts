import { describe, expect, it } from 'vitest';
import { aggregateCanonicalComplianceReport } from '../../lib/frms/db-service-relatorios';
import type { FrmsOperationalSnapshotItem } from '../../lib/frms/operational-snapshot';

function item(overrides: Partial<FrmsOperationalSnapshotItem>): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 6, data_operacional: '2026-09-01', funcionario_id: 7, tripulante_id: 7,
    nome: 'Piloto Sete', nome_guerra: 'SETE', funcao: 'COMANDANTE', base: null, aeronave: null,
    escalado: false, escala_source: 'AUSENTE', hora_apresentacao: null, hora_termino: null,
    horas_voo_minutos: 0, duracao_jornada_minutos: 0, teve_jornada: false,
    checkin_status: 'NAO_APLICAVEL', checkin_horario: null, kss_score: null, horas_sono: null,
    qualidade_sono: null, hora_acordar: null, fadiga_score: null, status_operacional_checkin: null,
    effectiveness_pct: null, nivel_fadiga_calculado: null, fatorizacao_status: 'AUSENTE',
    sleep_data_source: 'AUSENTE', wake_data_source: 'AUSENTE', jornada_data_source: 'AUSENTE',
    jornada_origem: null, snapshot_status: 'OK', fortnight_indicator: null, alertas: [],
    natureza_dado: 'SEM_DADO', causa: '', mitigacao_recomendada: 'NENHUMA', decisao: 'SEM_ACAO',
    limite_referencia: null, estado_operacional: 'NORMAL', motivos_principais: [],
    acao_recomendada_texto: 'Manter escala.', ...overrides,
  } as FrmsOperationalSnapshotItem;
}
describe('FRMS canonical compliance report', () => {
  it('agrega compliance real e nao reinterpreta alertas legados', () => {
    const rows = aggregateCanonicalComplianceReport([
      item({ compliance_status: 'COMPLIANT' }),
      item({ data_operacional: '2026-09-02', compliance_status: 'UNKNOWN', estado_operacional: 'NAO_AVALIADO' }),
      item({
        data_operacional: '2026-09-03', compliance_status: 'VIOLATION', estado_operacional: 'CRITICO_VIOLACAO',
        violacoes_normativas: [{
          code: 'LAW_HELI_FLIGHT_MONTH_90H', source: 'LAW', reference: 'Lei 13.475/2017 art. 33 IV',
          actualMin: 5401, limitMin: 5400, message: 'Horas de voo no mes acima do limite',
        }],
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ dias_avaliados: 3, dias_conformes: 1, dias_violacao: 1, dias_nao_avaliados: 1 }));
    expect(rows[0].violacoes_normativas[0]).toContain('LAW_HELI_FLIGHT_MONTH_90H');
    expect(rows[0].fontes_normativas[0]).toContain('Lei 13.475/2017');
  });
});
