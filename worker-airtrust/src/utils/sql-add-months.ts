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
