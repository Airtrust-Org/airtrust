/**
 * Expressão SQLite equivalente a `addCalendarMonthsClamped`
 * (src/shared/utils/validade-meses.ts).
 *
 * `date(x, '+N months')` do SQLite "rola" para o mês seguinte quando o dia não
 * existe no mês-alvo (31/01 + 1m => 03/03). Esta expressão preserva o dia e
 * limita ao último dia do mês-alvo (31/01 + 1m => 28/02), como a regra
 * canônica TS. Paridade coberta por
 * src/__tests__/utils/validade-meses-parity.sqlite.test.ts.
 *
 * Os argumentos são fragmentos SQL (colunas/expressões), nunca entrada de
 * usuário. `dateSql` é avaliado até três vezes; `monthsSql` até duas.
 */
export function sqlAddMonthsClamped(dateSql: string, monthsSql: string): string {
  const rolled = `date(${dateSql}, '+' || (${monthsSql}) || ' months')`;
  return `CASE
    WHEN strftime('%d', ${rolled}) = strftime('%d', ${dateSql}) THEN ${rolled}
    ELSE date(${dateSql}, 'start of month', '+' || ((${monthsSql}) + 1) || ' months', '-1 day')
  END`;
}

/**
 * Meses de validade efetivos para cálculo de vencimento em SQL (fallback quando
 * `data_vencimento` não está persistida).
 *
 * - Histórico com `validade_meses` persistido sempre vence por ele.
 * - CMA NÃO herda `qualificacoes_tipos.validade`: a validade do CMA depende da
 *   idade do tripulante na data de realização (src/shared/utils/cma-validity.ts)
 *   e o modelo não tem idade. Sem `validade_meses` persistido, o resultado é NULL
 *   (sem vencimento calculável) em vez de um valor fixo do modelo.
 * - Demais tipos: `validade_meses` -> `qualificacoes_tipos.validade`.
 *
 * `cmaMonthsSql` (opcional) substitui o ramo CMA, p.ex. `sqlCmaAgeValidityMonths`,
 * para chamadores que aplicam a regra de idade (listagem de histórico).
 *
 * `qualificacoes_tipos.vencimento_fim_mes` é legada e ignorada. Os argumentos
 * são fragmentos SQL (aliases), nunca entrada de usuário.
 */
export function sqlEffectiveValidityMonths(
  historicoValidadeSql: string,
  tipoCodigoSql: string,
  tipoValidadeSql: string,
  cmaMonthsSql?: string,
): string {
  const cmaBranch = cmaMonthsSql ?? historicoValidadeSql;
  return `CASE
    WHEN UPPER(TRIM(COALESCE(${tipoCodigoSql}, ''))) = 'CMA' THEN ${cmaBranch}
    ELSE COALESCE(${historicoValidadeSql}, ${tipoValidadeSql})
  END`;
}

/**
 * Espelho SQL de `resolveCmaValidity` (src/shared/utils/cma-validity.ts): 6 meses
 * a partir de 60 anos completos na data de realização; 12 meses caso contrário
 * (inclui nascimento ausente/inválido, como o padrão da regra TS).
 */
export function sqlCmaAgeValidityMonths(realizacaoSql: string, nascimentoSql: string): string {
  return `CASE
    WHEN date(${nascimentoSql}) IS NOT NULL AND date(${realizacaoSql}) IS NOT NULL
      AND (CAST(strftime('%Y', ${realizacaoSql}) AS INTEGER) - CAST(strftime('%Y', ${nascimentoSql}) AS INTEGER)
        - (strftime('%m-%d', ${realizacaoSql}) < strftime('%m-%d', ${nascimentoSql}))) >= 60
    THEN 6 ELSE 12
  END`;
}
