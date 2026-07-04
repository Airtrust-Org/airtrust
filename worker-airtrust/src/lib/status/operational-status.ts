/**
 * Classificação operacional derivada de data de vencimento, compartilhada entre
 * rotas que precisam decidir se um registro já eleito como vigente está
 * VALIDA / VENCENDO_30 / VENCIDA. Não decide qual registro é o vigente —
 * essa eleição continua sendo feita por SQL específico de cada rota (ROW_NUMBER
 * por funcionario+tipo/codigo, excluindo apenas CANCELADA).
 */

export type StatusOperacionalVencimento = 'VALIDA' | 'VENCENDO_30' | 'VENCIDA' | 'SEM_VENCIMENTO';

function parseDateOnlyUtc(value: string): number {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
}

export function diasEntreDatas(dataAlvo: string, dataReferencia: string): number {
  const alvo = parseDateOnlyUtc(dataAlvo);
  const referencia = parseDateOnlyUtc(dataReferencia);
  return Math.round((alvo - referencia) / 86400000);
}

export function classificarStatusPorVencimento(
  dataVencimento: string | null | undefined,
  dataReferencia: string,
  thresholdDiasVencendo = 30,
): StatusOperacionalVencimento {
  if (!dataVencimento) return 'SEM_VENCIMENTO';
  const dias = diasEntreDatas(dataVencimento, dataReferencia);
  if (dias < 0) return 'VENCIDA';
  if (dias <= thresholdDiasVencendo) return 'VENCENDO_30';
  return 'VALIDA';
}
