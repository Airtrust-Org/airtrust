import { describe, expect, it } from 'vitest';
import { buildSpiReport } from '../../services/sgso/kpi-spi';
import type { SpiRawMetrics } from '../../repositories/sgso/spi-repository';

function emptyRaw(overrides: Partial<SpiRawMetrics> = {}): SpiRawMetrics {
  return {
    totalRelatos90d: null,
    ocorrenciasSerias: null,
    acoesPrazo: null,
    nc30d: null,
    auditorias: null,
    efetividade: null,
    anonimos: null,
    spiConfig: [],
    horasVoo: null,
    relatosSemTriagem24h: null,
    fratAltoSemAprovacao: null,
    barreirasDegradadas: null,
    relatosCognitivosBaixos28d: null,
    relatosCognitivosBaixos28dAnterior: null,
    sinaisTendencia28d: null,
    sinaisTendencia28dAnterior: null,
    relatos28d: null,
    relatos28dAnterior: null,
    horas28d: null,
    horas28dAnterior: null,
    ...overrides,
  };
}

const statusOf = (report: ReturnType<typeof buildSpiReport>, codigo: string) =>
  report.leading_indicators.find((i) => i.codigo === codigo)?.status;

describe('buildSpiReport', () => {
  it('sem dados: tudo "ok", tendências estáveis e resumo zerado', () => {
    const report = buildSpiReport(emptyRaw());
    expect(report.leading_indicators.every((i) => i.status === 'ok')).toBe(true);
    expect(report.tendencia_curta.every((t) => t.direcao === 'ESTAVEL')).toBe(true);
    expect(report.resumo).toEqual({
      total_relatos_90d: 0,
      horas_voo_90d: 0,
      ncs_abertas: 0,
      efetividade_media: null,
      backlog_triagem_24h: 0,
      frat_alto_sem_aprovacao: 0,
      barreiras_degradadas: 0,
    });
  });

  it('limites do semáforo: backlog de triagem 0 ok, 1-3 atenção, 4+ crítico', () => {
    const at = (total: number) =>
      statusOf(buildSpiReport(emptyRaw({ relatosSemTriagem24h: { total } })), 'RELATOS_SEM_TRIAGEM_24H');
    expect([at(0), at(1), at(3), at(4)]).toEqual(['ok', 'atencao', 'atencao', 'critico']);
  });

  it('limites do semáforo: FRAT/barreiras/cognitivo 0 ok, 1-2 atenção, 3+ crítico', () => {
    const at = (total: number) => {
      const r = buildSpiReport(
        emptyRaw({
          fratAltoSemAprovacao: { total },
          barreirasDegradadas: { total },
          relatosCognitivosBaixos28d: { total },
        }),
      );
      return [
        statusOf(r, 'FRAT_ALTO_SEM_APROVACAO'),
        statusOf(r, 'BARREIRAS_DEGRADADAS'),
        statusOf(r, 'COGNITIVO_ABAIXO_70_28D'),
      ];
    };
    expect(at(0)).toEqual(['ok', 'ok', 'ok']);
    expect(at(2)).toEqual(['atencao', 'atencao', 'atencao']);
    expect(at(3)).toEqual(['critico', 'critico', 'critico']);
  });

  it('sinais de tendência: até 1 ok, 2-3 atenção, 4+ crítico', () => {
    const at = (total: number) =>
      statusOf(buildSpiReport(emptyRaw({ sinaisTendencia28d: { total } })), 'SINAIS_TENDENCIA_28D');
    expect([at(1), at(2), at(3), at(4)]).toEqual(['ok', 'atencao', 'atencao', 'critico']);
  });

  it('SPI com valor nulo (sem horas de voo) fica "info"; meta atingida "ok"; alerta "critico"', () => {
    const cfg = (codigo: string, meta: number, alerta: number) => ({
      codigo, nome: codigo, descricao: '', unidade: '', meta_valor: meta, meta_operador: '>=',
      alerta_valor: alerta, alerta_operador: '<',
    });
    const report = buildSpiReport(
      emptyRaw({
        spiConfig: [cfg('TAXA_RELATOS', 1, 0), cfg('FECHAMENTO_ACOES', 80, 50), cfg('EXECUCAO_AUDITORIAS', 90, 60)],
        acoesPrazo: { total: 10, no_prazo: 9 }, // 90% -> meta atingida
        auditorias: { programadas: 10, concluidas: 4 }, // 40% -> abaixo do alerta
      }),
    );
    const byCode = Object.fromEntries(report.spis.map((s) => [s.codigo, s.status]));
    expect(byCode).toEqual({ TAXA_RELATOS: 'info', FECHAMENTO_ACOES: 'ok', EXECUCAO_AUDITORIAS: 'critico' });
  });
});
