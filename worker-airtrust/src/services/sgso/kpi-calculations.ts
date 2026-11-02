/**
 * Cálculos puros dos KPIs/SPIs do SGSO (sem I/O). Extraídos de routes/sgso-kpi
 * para serem testáveis sem montar request nem banco.
 */

export function evalOperador(valor: number, op: string, meta: number): boolean {
  switch (op) {
    case '>=':
      return valor >= meta;
    case '<=':
      return valor <= meta;
    case '>':
      return valor > meta;
    case '<':
      return valor < meta;
    case '=':
      return valor === meta;
    default:
      return false;
  }
}

export function calcTrend(
  codigo: string,
  nome: string,
  atual: number,
  anterior: number,
  higherIsBetter: boolean,
) {
  const deltaAbsoluto = atual - anterior;
  const deltaPercentual = anterior === 0 ? null : (deltaAbsoluto / anterior) * 100;
  const direcao = deltaAbsoluto > 0 ? 'SUBIU' : deltaAbsoluto < 0 ? 'CAIU' : 'ESTAVEL';
  const favoravel =
    deltaAbsoluto === 0 ? true : higherIsBetter ? deltaAbsoluto > 0 : deltaAbsoluto < 0;

  return {
    codigo,
    nome,
    valor_atual: atual,
    valor_periodo_anterior: anterior,
    delta_absoluto: deltaAbsoluto,
    delta_percentual: deltaPercentual,
    direcao,
    favoravel,
  };
}
