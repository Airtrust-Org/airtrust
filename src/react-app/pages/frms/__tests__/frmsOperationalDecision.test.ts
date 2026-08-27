import { describe, expect, it } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import {
  classifyOperationalItem,
  operationalConfidence,
  trustedEffectiveness,
} from '../frmsOperationalDecision';

function item(overrides: Partial<FrmsOperationalSnapshotItem> = {}): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-08-27',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Tripulante Teste',
    nome_guerra: 'Teste',
    funcao: 'PIC',
    base: 'SBJR',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'SIGVOOS',
    hora_apresentacao: '08:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 540,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '06:30',
    kss_score: 3,
    horas_sono: 7.5,
    qualidade_sono: 4,
    hora_acordar: '05:30',
    fadiga_score: 20,
    status_operacional_checkin: 'APTO',
    effectiveness_pct: 92,
    nivel_fadiga_calculado: 'BAIXO',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: 'SIGVOOS',
    snapshot_status: 'OK',
    fortnight_indicator: null,
    alertas: [],
    estado_operacional: 'NORMAL',
    motivos_principais: [],
    acao_recomendada_texto: 'Nenhuma ação imediata.',
    ...overrides,
  };
}

describe('frmsOperationalDecision', () => {
  it('nunca classifica snapshot incompleto como normal', () => {
    expect(
      classifyOperationalItem(
        item({
          snapshot_status: 'INCOMPLETO',
          estado_operacional: 'NAO_AVALIADO',
          effectiveness_pct: 0,
        }),
      ),
    ).toBe('CONFIRMAR');
  });

  it('manda ausência de fatorização para confirmação', () => {
    expect(
      classifyOperationalItem(
        item({
          fatorizacao_status: 'AUSENTE',
          effectiveness_pct: 0,
        }),
      ),
    ).toBe('CONFIRMAR');
  });

  it('prioriza violação crítica como bloqueio', () => {
    expect(
      classifyOperationalItem(
        item({
          estado_operacional: 'CRITICO_VIOLACAO',
          snapshot_status: 'CRITICO',
        }),
      ),
    ).toBe('BLOQUEIO');
  });

  it('classifica atenção ou mitigação como decisão', () => {
    expect(
      classifyOperationalItem(
        item({
          estado_operacional: 'MITIGACAO_NECESSARIA',
          snapshot_status: 'ATENCAO',
        }),
      ),
    ).toBe('DECISAO');
  });

  it('não apresenta efetividade numérica quando o dado não é confiável', () => {
    expect(
      trustedEffectiveness(
        item({
          fatorizacao_status: 'AUSENTE',
          effectiveness_pct: 0,
        }),
      ),
    ).toBeNull();
  });

  it('preserva zero legítimo quando houve cálculo com dados completos', () => {
    expect(trustedEffectiveness(item({ effectiveness_pct: 0 }))).toBe(0);
  });

  it('expõe confiança alta, média e baixa conforme a procedência dos dados', () => {
    expect(operationalConfidence(item())).toBe('ALTA');
    expect(operationalConfidence(item({ sleep_data_source: 'ESTIMADO' }))).toBe('MEDIA');
    expect(
      operationalConfidence(
        item({
          jornada_data_source: 'AUSENTE',
          fatorizacao_status: 'AUSENTE',
        }),
      ),
    ).toBe('BAIXA');
  });
});
