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
 * `qualificacoes_tipos.vencimento_fim_mes` é legada e ignorada. Os argumentos
 * são fragmentos SQL (aliases), nunca entrada de usuário.
 */
export function sqlEffectiveValidityMonths(
  historicoValidadeSql: string,
  tipoCodigoSql: string,
  tipoValidadeSql: string,
): string {
  return `CASE
    WHEN UPPER(TRIM(COALESCE(${tipoCodigoSql}, ''))) = 'CMA' THEN ${historicoValidadeSql}
    ELSE COALESCE(${historicoValidadeSql}, ${tipoValidadeSql})
  END`;
}
