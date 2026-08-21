/**
 * AirTrust FRMS — Decisão Operacional Canônica V1
 *
 * Função pura que deriva o estado operacional consolidado de um tripulante
 * a partir dos campos já calculados pelo snapshot operacional existente.
 *
 * REGRAS FUNDAMENTAIS (não compensatórias):
 * 1. Violação legal/regulatória/contratual → CRITICO_VIOLACAO. Sem exceção.
 * 2. Risco crítico preventivo (biológico, check-in crítico) → MITIGACAO_NECESSARIA.
 * 3. Presença de alertas sem violação → ATENCAO.
 * 4. Todos os domínios avaliáveis normais → NORMAL.
 * 5. Dado obrigatório para decisão ausente → NAO_AVALIADO.
 *
 * DISTINÇÃO IMPORTANTE — dados ausentes:
 * - Dado OBRIGATÓRIO ausente (perfil regulatório não configurado) → NAO_AVALIADO.
 * - Dado COMPLEMENTAR ausente (REDEMET, telemetria granular SIGVOOS) → nota de detalhe,
 *   não altera automaticamente o estado consolidado.
 *
 * Alertas preventivos (80%/90%/95%/100%) são POLÍTICA INTERNA do operador,
 * nunca limites normativos ANAC/IOGP.
 *
 * FONTE CANÔNICA: este arquivo. O frontend apenas renderiza os campos produzidos aqui.
 * Não criar lógica de decisão paralela no frontend.
 */

import type { FrmsOperationalSnapshotAlertCode, FrmsOperationalSnapshotStatus } from './operational-snapshot';

// ── Tipos exportados ──────────────────────────────────────────────

export const FRMS_DECISAO_OPERACIONAL_ESTADOS = [
  'NORMAL',
  'ATENCAO',
  'MITIGACAO_NECESSARIA',
  'CRITICO_VIOLACAO',
  'NAO_AVALIADO',
] as const;

export type FrmsDecisaoOperacionalEstado = (typeof FRMS_DECISAO_OPERACIONAL_ESTADOS)[number];

export const FRMS_ACOES_RECOMENDADAS = [
  'MANTER_ESCALA',
  'REVISAR_CONDICAO_PRE_MISSAO',
  'AVALIAR_REPOUSO_DEMANDA_SUBSTITUICAO',
  'NAO_RECOMENDAR_OPERACAO_ESCALAR_GESTAO',
  'COMPLETAR_INFORMACAO_NECESSARIA',
] as const;

export type FrmsAcaoRecomendada = (typeof FRMS_ACOES_RECOMENDADAS)[number];

export interface FrmsDecisaoOperacionalResult {
  estado_operacional: FrmsDecisaoOperacionalEstado;
  /** Máximo 3 motivos, priorizados: violação > biológico > demanda > ambiente > dado ausente */
  motivos_principais: string[];
  acao_recomendada: FrmsAcaoRecomendada;
  /** Texto curto para exibição na fila de coordenação */
  acao_recomendada_texto: string;
  /** Dados complementares ausentes — registrar no detalhe, não altera o estado */
  dados_complementares_ausentes: string[];
}

// ── Input necessário para derivar decisão ────────────────────────

export interface FrmsDecisaoOperacionalInput {
  /** Estado biológico/operacional do snapshot existente */
  snapshot_status: FrmsOperationalSnapshotStatus;
  /** Alertas identificados pelo snapshot */
  alertas: FrmsOperationalSnapshotAlertCode[];
  /**
   * Houve violação normativa real de limite legal/regulatório/contratual?
   * Deve ser true SOMENTE quando um limite obrigatório foi ultrapassado
   * conforme o resolvedor regulatório do tenant.
   */
  tem_violacao_normativa: boolean;
  /**
   * O perfil regulatório obrigatório do tenant está configurado?
   * false → NAO_AVALIADO (dado obrigatório ausente para decisão de compliance).
   */
  perfil_regulatorio_configurado: boolean;
  /**
   * Dados complementares ausentes (REDEMET, telemetria granular SIGVOOS).
   * NÃO alteram o estado consolidado — registrados como nota de detalhe.
   */
  dados_complementares_ausentes?: string[];
}

// ── Prioridade de alertas para geração de motivos ────────────────

const ALERT_PRIORIDADE: FrmsOperationalSnapshotAlertCode[] = [
  'CHECKIN_CRITICO',       // violação biológica/operacional crítica
  'EFETIVIDADE_BAIXA',     // fadiga calculada crítica
  'SONO_INSUFICIENTE',     // risco biológico significativo
  'KSS_ALTO',              // sonolência auto-reportada elevada
  'CHECKIN_PENDENTE',      // dado operacional faltando antes de missão
  'DADO_INCONSISTENTE',    // dado comprometido
  'JORNADA_SEM_FATORIZACAO', // jornada sem cálculo FRMS
  'ESCALADO_SEM_JORNADA_FRMS', // escalado sem registro
  'JORNADA_FRMS_SEM_ESCALA',   // jornada sem escala vinculada
  'SONO_ESTIMADO',         // dado estimado, menor confiança
];

const MOTIVO_POR_ALERTA: Record<FrmsOperationalSnapshotAlertCode, string> = {
  CHECKIN_CRITICO: 'Check-in indica fadiga crítica',
  EFETIVIDADE_BAIXA: 'Efetividade cognitiva reduzida',
  SONO_INSUFICIENTE: 'Sono insuficiente (< 6h)',
  KSS_ALTO: 'Escala KSS elevada — sonolência reportada',
  CHECKIN_PENDENTE: 'Check-in pendente para operação escalada',
  DADO_INCONSISTENTE: 'Inconsistência nos dados de jornada',
  JORNADA_SEM_FATORIZACAO: 'Jornada sem cálculo de fatorização FRMS',
  ESCALADO_SEM_JORNADA_FRMS: 'Escalado sem registro de jornada FRMS',
  JORNADA_FRMS_SEM_ESCALA: 'Jornada FRMS sem vínculo de escala',
  SONO_ESTIMADO: 'Dado de sono estimado — check-in real ausente',
};

// ── Ação recomendada por estado ──────────────────────────────────

const ACAO_POR_ESTADO: Record<FrmsDecisaoOperacionalEstado, FrmsAcaoRecomendada> = {
  NORMAL: 'MANTER_ESCALA',
  ATENCAO: 'REVISAR_CONDICAO_PRE_MISSAO',
  MITIGACAO_NECESSARIA: 'AVALIAR_REPOUSO_DEMANDA_SUBSTITUICAO',
  CRITICO_VIOLACAO: 'NAO_RECOMENDAR_OPERACAO_ESCALAR_GESTAO',
  NAO_AVALIADO: 'COMPLETAR_INFORMACAO_NECESSARIA',
};

const ACAO_TEXTO_POR_ESTADO: Record<FrmsDecisaoOperacionalEstado, string> = {
  NORMAL: 'Manter escala.',
  ATENCAO: 'Revisar condição antes da próxima missão.',
  MITIGACAO_NECESSARIA: 'Avaliar ampliação de repouso, redução de demanda ou substituição.',
  CRITICO_VIOLACAO: 'Não recomendar operação até resolução/mitigação e escalar à gestão.',
  NAO_AVALIADO: 'Completar informação necessária antes da decisão.',
};

// ── Função pura principal ────────────────────────────────────────

/**
 * Deriva o estado operacional consolidado de um tripulante.
 *
 * Regra de estado (não compensatória — pior domínio vence):
 * 1. tem_violacao_normativa = true → CRITICO_VIOLACAO
 * 2. snapshot_status = CRITICO (biológico crítico, check-in crítico) → MITIGACAO_NECESSARIA
 * 3. snapshot_status = INCOMPLETO → NAO_AVALIADO (dados comprometidos)
 * 4. snapshot_status = ATENCAO → ATENCAO
 * 5. snapshot_status = OK → NORMAL
 * 6. perfil_regulatorio_configurado = false → NAO_AVALIADO
 *
 * Alertas CHECKIN_CRITICO e EFETIVIDADE_BAIXA elevam para MITIGACAO_NECESSARIA
 * mesmo sem violação normativa formal.
 */
export function deriveFrmsOperationalDecision(
  input: FrmsDecisaoOperacionalInput,
): FrmsDecisaoOperacionalResult {
  const complementaresAusentes = input.dados_complementares_ausentes ?? [];

  // 1. Violação normativa: força CRITICO_VIOLACAO imediatamente, sem compensação.
  if (input.tem_violacao_normativa) {
    return {
      estado_operacional: 'CRITICO_VIOLACAO',
      motivos_principais: buildMotivos(
        input.alertas,
        ['Limite legal/regulatório/contratual ultrapassado'],
      ),
      acao_recomendada: 'NAO_RECOMENDAR_OPERACAO_ESCALAR_GESTAO',
      acao_recomendada_texto: ACAO_TEXTO_POR_ESTADO.CRITICO_VIOLACAO,
      dados_complementares_ausentes: complementaresAusentes,
    };
  }

  // 2. Perfil regulatório obrigatório não configurado → NAO_AVALIADO.
  //    Isso é dado OBRIGATÓRIO, não complementar.
  if (!input.perfil_regulatorio_configurado) {
    return {
      estado_operacional: 'NAO_AVALIADO',
      motivos_principais: ['Perfil regulatório do tenant não configurado'],
      acao_recomendada: 'COMPLETAR_INFORMACAO_NECESSARIA',
      acao_recomendada_texto: ACAO_TEXTO_POR_ESTADO.NAO_AVALIADO,
      dados_complementares_ausentes: complementaresAusentes,
    };
  }

  // 3. Dados inconsistentes comprometem a decisão.
  if (input.snapshot_status === 'INCOMPLETO') {
    return {
      estado_operacional: 'NAO_AVALIADO',
      motivos_principais: buildMotivos(input.alertas, ['Dados inconsistentes — decisão indisponível']),
      acao_recomendada: 'COMPLETAR_INFORMACAO_NECESSARIA',
      acao_recomendada_texto: ACAO_TEXTO_POR_ESTADO.NAO_AVALIADO,
      dados_complementares_ausentes: complementaresAusentes,
    };
  }

  // 4. CRITICO biológico/operacional: check-in crítico ou efetividade baixa
  //    elevam a MITIGACAO_NECESSARIA mesmo sem violação normativa formal.
  if (
    input.snapshot_status === 'CRITICO' ||
    input.alertas.includes('CHECKIN_CRITICO') ||
    input.alertas.includes('EFETIVIDADE_BAIXA')
  ) {
    return {
      estado_operacional: 'MITIGACAO_NECESSARIA',
      motivos_principais: buildMotivos(input.alertas, []),
      acao_recomendada: 'AVALIAR_REPOUSO_DEMANDA_SUBSTITUICAO',
      acao_recomendada_texto: ACAO_TEXTO_POR_ESTADO.MITIGACAO_NECESSARIA,
      dados_complementares_ausentes: complementaresAusentes,
    };
  }

  // 5. ATENCAO: alertas presentes sem criticidade.
  if (input.snapshot_status === 'ATENCAO' || input.alertas.length > 0) {
    return {
      estado_operacional: 'ATENCAO',
      motivos_principais: buildMotivos(input.alertas, []),
      acao_recomendada: 'REVISAR_CONDICAO_PRE_MISSAO',
      acao_recomendada_texto: ACAO_TEXTO_POR_ESTADO.ATENCAO,
      dados_complementares_ausentes: complementaresAusentes,
    };
  }

  // 6. Todos os domínios avaliáveis normais.
  return {
    estado_operacional: 'NORMAL',
    motivos_principais: [],
    acao_recomendada: 'MANTER_ESCALA',
    acao_recomendada_texto: ACAO_TEXTO_POR_ESTADO.NORMAL,
    dados_complementares_ausentes: complementaresAusentes,
  };
}

// ── Helpers internos ─────────────────────────────────────────────

/**
 * Constrói lista de motivos priorizados, máximo 3.
 * Extra motivos adicionais surgem de alertas por prioridade.
 */
function buildMotivos(
  alertas: FrmsOperationalSnapshotAlertCode[],
  prefixMotivos: string[],
): string[] {
  const result = [...prefixMotivos];

  for (const code of ALERT_PRIORIDADE) {
    if (result.length >= 3) break;
    if (alertas.includes(code)) {
      const motivo = MOTIVO_POR_ALERTA[code];
      if (!result.includes(motivo)) {
        result.push(motivo);
      }
    }
  }

  return result.slice(0, 3);
}

// ── Export do mapa de ação por estado (para uso no frontend) ─────

export { ACAO_POR_ESTADO, ACAO_TEXTO_POR_ESTADO };
