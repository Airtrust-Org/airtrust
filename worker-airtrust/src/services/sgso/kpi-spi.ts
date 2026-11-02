/**
 * Regras puras dos SPIs/KPIs do SGSO: transforma os números brutos lidos pelo
 * repositório em valores de SPI, indicadores líderes (semáforo), tendência
 * curta (28d vs. 28d anteriores) e resumo. Sem I/O, sem dependência do Hono.
 */
import { calcTrend, evalOperador } from './kpi-calculations';
import type { SpiRawMetrics } from '../../repositories/sgso/spi-repository';

export function buildSpiReport(raw: SpiRawMetrics) {
  const {
    totalRelatos90d,
    ocorrenciasSerias,
    acoesPrazo,
    nc30d,
    auditorias,
    efetividade,
    anonimos,
    spiConfig,
    horasVoo,
    relatosSemTriagem24h,
    fratAltoSemAprovacao,
    barreirasDegradadas,
    relatosCognitivosBaixos28d,
    relatosCognitivosBaixos28dAnterior,
    sinaisTendencia28d,
    sinaisTendencia28dAnterior,
    relatos28d,
    relatos28dAnterior,
    horas28d,
    horas28dAnterior,
  } = raw;

  const horas100 = (horasVoo?.total ?? 0) / 100;
  const horas1000 = (horasVoo?.total ?? 0) / 1000;

  const spiValores: Record<string, number | null> = {
    TAXA_RELATOS: horas100 > 0 ? (totalRelatos90d?.n ?? 0) / horas100 : null,
    TAXA_OCORRENCIAS_SERIAS: horas1000 > 0 ? (ocorrenciasSerias?.n ?? 0) / horas1000 : null,
    FECHAMENTO_ACOES:
      (acoesPrazo?.total ?? 0) > 0
        ? ((acoesPrazo?.no_prazo ?? 0) / (acoesPrazo?.total ?? 1)) * 100
        : null,
    NCS_ABERTAS_30D: nc30d?.n ?? 0,
    EXECUCAO_AUDITORIAS:
      (auditorias?.programadas ?? 0) > 0
        ? ((auditorias?.concluidas ?? 0) / (auditorias?.programadas ?? 1)) * 100
        : null,
    EFETIVIDADE_COGNITIVA_MEDIA: efetividade?.media ?? null,
    RELATOS_ANONIMOS_PERC:
      (anonimos?.total ?? 0) > 0
        ? ((anonimos?.anonimos ?? 0) / (anonimos?.total ?? 1)) * 100
        : null,
  };

  const taxaRelatos28dAtual =
    (horas28d?.total ?? 0) > 0 ? (relatos28d?.total ?? 0) / ((horas28d?.total ?? 0) / 100) : 0;
  const taxaRelatos28dAnterior =
    (horas28dAnterior?.total ?? 0) > 0
      ? (relatos28dAnterior?.total ?? 0) / ((horas28dAnterior?.total ?? 0) / 100)
      : 0;
  const taxaSerias28dAtual =
    (horas28d?.total ?? 0) > 0 ? (relatos28d?.serios ?? 0) / ((horas28d?.total ?? 0) / 1000) : 0;
  const taxaSerias28dAnterior =
    (horas28dAnterior?.total ?? 0) > 0
      ? (relatos28dAnterior?.serios ?? 0) / ((horas28dAnterior?.total ?? 0) / 1000)
      : 0;
  const anonimato28dAtual =
    (relatos28d?.total ?? 0) > 0
      ? ((relatos28d?.anonimos ?? 0) / (relatos28d?.total ?? 1)) * 100
      : 0;
  const anonimato28dAnterior =
    (relatos28dAnterior?.total ?? 0) > 0
      ? ((relatos28dAnterior?.anonimos ?? 0) / (relatos28dAnterior?.total ?? 1)) * 100
      : 0;

  const leadingIndicators = [
    {
      codigo: 'RELATOS_SEM_TRIAGEM_24H',
      nome: 'Relatos sem triagem > 24h',
      valor_atual: relatosSemTriagem24h?.total ?? 0,
      unidade: 'quantidade',
      status:
        (relatosSemTriagem24h?.total ?? 0) === 0
          ? 'ok'
          : (relatosSemTriagem24h?.total ?? 0) <= 3
            ? 'atencao'
            : 'critico',
    },
    {
      codigo: 'FRAT_ALTO_SEM_APROVACAO',
      nome: 'FRAT alto sem aprovacao',
      valor_atual: fratAltoSemAprovacao?.total ?? 0,
      unidade: 'quantidade',
      status:
        (fratAltoSemAprovacao?.total ?? 0) === 0
          ? 'ok'
          : (fratAltoSemAprovacao?.total ?? 0) <= 2
            ? 'atencao'
            : 'critico',
    },
    {
      codigo: 'BARREIRAS_DEGRADADAS',
      nome: 'Barreiras Bowtie degradadas',
      valor_atual: barreirasDegradadas?.total ?? 0,
      unidade: 'quantidade',
      status:
        (barreirasDegradadas?.total ?? 0) === 0
          ? 'ok'
          : (barreirasDegradadas?.total ?? 0) <= 2
            ? 'atencao'
            : 'critico',
    },
    {
      codigo: 'COGNITIVO_ABAIXO_70_28D',
      nome: 'Relatos com índice FRMS estimado < 70%',
      valor_atual: relatosCognitivosBaixos28d?.total ?? 0,
      unidade: 'quantidade/28d',
      status:
        (relatosCognitivosBaixos28d?.total ?? 0) === 0
          ? 'ok'
          : (relatosCognitivosBaixos28d?.total ?? 0) <= 2
            ? 'atencao'
            : 'critico',
    },
    {
      codigo: 'SINAIS_TENDENCIA_28D',
      nome: 'Sinais de tendencia detectados pela triagem',
      valor_atual: sinaisTendencia28d?.total ?? 0,
      unidade: 'quantidade/28d',
      status:
        (sinaisTendencia28d?.total ?? 0) <= 1
          ? 'ok'
          : (sinaisTendencia28d?.total ?? 0) <= 3
            ? 'atencao'
            : 'critico',
    },
  ];

  const tendenciaCurta = [
    calcTrend(
      'TAXA_RELATOS_28D',
      'Taxa de relatos por 100h (28d)',
      taxaRelatos28dAtual,
      taxaRelatos28dAnterior,
      true,
    ),
    calcTrend(
      'TAXA_OCORRENCIAS_SERIAS_28D',
      'Taxa de ocorrencias serias por 1.000h (28d)',
      taxaSerias28dAtual,
      taxaSerias28dAnterior,
      false,
    ),
    calcTrend(
      'RELATOS_ANONIMOS_PERC_28D',
      'Relatos anonimos (%) em 28d',
      anonimato28dAtual,
      anonimato28dAnterior,
      true,
    ),
    calcTrend(
      'COGNITIVO_ABAIXO_70_28D',
      'Relatos com índice FRMS estimado < 70% (28d)',
      relatosCognitivosBaixos28d?.total ?? 0,
      relatosCognitivosBaixos28dAnterior?.total ?? 0,
      false,
    ),
    calcTrend(
      'SINAIS_TENDENCIA_28D',
      'Sinais de tendencia na triagem (28d)',
      sinaisTendencia28d?.total ?? 0,
      sinaisTendencia28dAnterior?.total ?? 0,
      false,
    ),
  ];

  // Calcular status de cada SPI
  const spis = spiConfig.map((cfg) => {
    const valor = spiValores[cfg.codigo];
    let statusSpi = 'info';
    if (valor !== null) {
      const atingeMeta = evalOperador(valor, cfg.meta_operador, cfg.meta_valor);
      const emAlerta = evalOperador(valor, cfg.alerta_operador, cfg.alerta_valor);
      statusSpi = atingeMeta ? 'ok' : emAlerta ? 'critico' : 'atencao';
    }
    return { ...cfg, valor_atual: valor, status: statusSpi };
  });

  return {
    spis,
    leading_indicators: leadingIndicators,
    tendencia_curta: tendenciaCurta,
    resumo: {
      total_relatos_90d: totalRelatos90d?.n ?? 0,
      horas_voo_90d: horasVoo?.total ?? 0,
      ncs_abertas: nc30d?.n ?? 0,
      efetividade_media: efetividade?.media ?? null,
      backlog_triagem_24h: relatosSemTriagem24h?.total ?? 0,
      frat_alto_sem_aprovacao: fratAltoSemAprovacao?.total ?? 0,
      barreiras_degradadas: barreirasDegradadas?.total ?? 0,
    },
  };
}
