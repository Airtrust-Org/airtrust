/**
 * Utilities para cálculos de vencimento de qualificações
 * Suporta dois modos: dia exato (0) ou fim do mês (1)
 *
 * @module utils/qualificacoes-expiration
 */

import { isValidDate } from './security';

/**
 * Modo de vencimento de qualificação
 * 0 = Vence no dia exato
 * 1 = Vence no último dia do mês
 */
export type VencimentoMode = 0 | 1;

/**
 * Resultado de cálculo de validade
 */
export interface ValidadeCalculo {
  data_conclusao: string; // ISO date YYYY-MM-DD
  data_vencimento: string; // ISO date YYYY-MM-DD (calculada)
  validade_meses: number;
  vencimento_fim_mes: VencimentoMode;
  dias_validade: number;
  status: 'vigente' | 'vencida' | 'expirando';
}

/**
 * Calcula data de vencimento baseada em data de conclusão
 * Suporta dois modos: dia exato ou fim do mês
 *
 * @param dataConclusao - Data de conclusão (ISO format: YYYY-MM-DD)
 * @param validadeMeses - Número de meses de validade
 * @param vencimentoFimMes - Modo de vencimento (0=dia exato, 1=fim do mês)
 * @returns Data de vencimento em formato ISO (YYYY-MM-DD)
 *
 * @example
 * // Qualificação médica (vence fim do mês)
 * calcularDataVencimento('2024-01-15', 12, 1) // 2025-01-31
 *
 * // Qualificação operacional (vence dia exato)
 * calcularDataVencimento('2024-01-15', 12, 0) // 2025-01-15
 */
export function calcularDataVencimento(
  dataConclusao: string,
  validadeMeses: number,
  vencimentoFimMes: VencimentoMode = 1,
): string {
  if (!isValidDate(dataConclusao)) {
    throw new Error(`Data de conclusão inválida: ${dataConclusao}`);
  }

  if (validadeMeses <= 0) {
    throw new Error(`Validade deve ser maior que 0: ${validadeMeses}`);
  }

  const data = new Date(dataConclusao + 'T00:00:00Z');
  const dataVencimento = new Date(data);

  // Adiciona meses
  dataVencimento.setMonth(dataVencimento.getMonth() + validadeMeses);

  // Se modo é "fim do mês", ajusta para último dia do mês
  if (vencimentoFimMes === 1) {
    // Vai para primeiro dia do mês seguinte e volta 1 dia
    dataVencimento.setMonth(dataVencimento.getMonth() + 1);
    dataVencimento.setDate(0); // 0 = último dia do mês anterior
  }

  // Retorna em formato ISO (YYYY-MM-DD)
  const ano = dataVencimento.getUTCFullYear();
  const mes = String(dataVencimento.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(dataVencimento.getUTCDate()).padStart(2, '0');

  return `${ano}-${mes}-${dia}`;
}

/**
 * Calcula o número de dias até vencimento
 *
 * @param dataVencimento - Data de vencimento (ISO format)
 * @param dataReferencia - Data de referência (default: hoje)
 * @returns Número de dias (positivo = futuro, negativo = passado)
 */
export function calcularDiasAteVencimento(dataVencimento: string, dataReferencia?: string): number {
  if (!isValidDate(dataVencimento)) {
    throw new Error(`Data de vencimento inválida: ${dataVencimento}`);
  }

  const vencimento = new Date(dataVencimento + 'T00:00:00Z');
  const referencia = dataReferencia ? new Date(dataReferencia + 'T00:00:00Z') : new Date();

  // Normaliza horário para UTC midnight
  referencia.setUTCHours(0, 0, 0, 0);
  vencimento.setUTCHours(0, 0, 0, 0);

  const diferenca = vencimento.getTime() - referencia.getTime();
  const dias = Math.ceil(diferenca / (1000 * 60 * 60 * 24));

  return dias;
}

/**
 * Determina status de uma qualificação baseado em data de vencimento
 *
 * @param dataVencimento - Data de vencimento (ISO format)
 * @param diasExpirando - Número de dias para considerar como "expirando" (default: 30)
 * @param dataReferencia - Data de referência (default: hoje)
 * @returns Status: 'vigente', 'expirando' ou 'vencida'
 */
export function determinarStatus(
  dataVencimento: string,
  diasExpirando: number = 30,
  dataReferencia?: string,
): 'vigente' | 'expirando' | 'vencida' {
  const dias = calcularDiasAteVencimento(dataVencimento, dataReferencia);

  if (dias < 0) {
    return 'vencida';
  }

  if (dias <= diasExpirando) {
    return 'expirando';
  }

  return 'vigente';
}

/**
 * Calcula validade completa com todos os detalhes
 *
 * @param dataConclusao - Data de conclusão (ISO format)
 * @param validadeMeses - Número de meses
 * @param vencimentoFimMes - Modo de vencimento
 * @param diasExpirando - Dias para alertar (default: 30)
 * @returns Objeto com cálculos completos
 */
export function calcularValidade(
  dataConclusao: string,
  validadeMeses: number,
  vencimentoFimMes: VencimentoMode = 1,
  diasExpirando: number = 30,
): ValidadeCalculo {
  if (!isValidDate(dataConclusao)) {
    throw new Error(`Data de conclusão inválida: ${dataConclusao}`);
  }

  const dataVencimento = calcularDataVencimento(dataConclusao, validadeMeses, vencimentoFimMes);
  const diasValidade = calcularDiasAteVencimento(dataVencimento, dataConclusao);
  const status = determinarStatus(dataVencimento, diasExpirando);

  return {
    data_conclusao: dataConclusao,
    data_vencimento: dataVencimento,
    validade_meses: validadeMeses,
    vencimento_fim_mes: vencimentoFimMes,
    dias_validade: diasValidade,
    status,
  };
}

/**
 * Valida se uma qualificação está dentro do período de validade
 *
 * @param dataVencimento - Data de vencimento
 * @param dataReferencia - Data a validar (default: hoje)
 * @returns true se ainda está válida, false se vencida
 */
export function estaVigente(dataVencimento: string, dataReferencia?: string): boolean {
  const dias = calcularDiasAteVencimento(dataVencimento, dataReferencia);
  return dias >= 0;
}

/**
 * Encontra qualificações que vencem em um período
 *
 * @param qualificacoes - Array de qualificações com data_vencimento
 * @param diasAteVencimento - Número de dias (default: 30)
 * @param dataReferencia - Data de referência (default: hoje)
 * @returns Array filtrado de qualificações expirando
 */
export function filtrarExpirando<T extends { data_vencimento: string }>(
  qualificacoes: T[],
  diasAteVencimento: number = 30,
  dataReferencia?: string,
): T[] {
  return qualificacoes.filter((q) => {
    const dias = calcularDiasAteVencimento(q.data_vencimento, dataReferencia);
    return dias >= 0 && dias <= diasAteVencimento;
  });
}

/**
 * Encontra qualificações vencidas
 *
 * @param qualificacoes - Array de qualificações
 * @param dataReferencia - Data de referência (default: hoje)
 * @returns Array filtrado de qualificações vencidas
 */
export function filtrarVencidas<T extends { data_vencimento: string }>(
  qualificacoes: T[],
  dataReferencia?: string,
): T[] {
  return qualificacoes.filter((q) => {
    const dias = calcularDiasAteVencimento(q.data_vencimento, dataReferencia);
    return dias < 0;
  });
}

/**
 * Agrupa qualificações por status
 *
 * @param qualificacoes - Array de qualificações
 * @param diasExpirando - Dias para alertar (default: 30)
 * @param dataReferencia - Data de referência
 * @returns Objeto com arrays agrupados por status
 */
export function agruparPorStatus<T extends { data_vencimento: string }>(
  qualificacoes: T[],
  diasExpirando: number = 30,
  dataReferencia?: string,
): {
  vigentes: T[];
  expirando: T[];
  vencidas: T[];
} {
  return {
    vigentes: qualificacoes.filter((q) => {
      const dias = calcularDiasAteVencimento(q.data_vencimento, dataReferencia);
      return dias > diasExpirando;
    }),
    expirando: qualificacoes.filter((q) => {
      const dias = calcularDiasAteVencimento(q.data_vencimento, dataReferencia);
      return dias >= 0 && dias <= diasExpirando;
    }),
    vencidas: qualificacoes.filter((q) => {
      const dias = calcularDiasAteVencimento(q.data_vencimento, dataReferencia);
      return dias < 0;
    }),
  };
}

/**
 * Determina urgência de alerta
 *
 * @param diasAteVencimento - Número de dias até vencimento
 * @returns 'low' | 'medium' | 'high' | 'critical'
 */
export function determinarUrgencia(
  diasAteVencimento: number,
): 'low' | 'medium' | 'high' | 'critical' {
  if (diasAteVencimento < 0) {
    return 'critical'; // Vencida
  }
  if (diasAteVencimento <= 7) {
    return 'critical';
  }
  if (diasAteVencimento <= 15) {
    return 'high';
  }
  if (diasAteVencimento <= 30) {
    return 'medium';
  }
  return 'low';
}
