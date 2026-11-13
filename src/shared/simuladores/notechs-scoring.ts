/** Escala NOTECHS da seção 2.3 / 4.2 do PTO Rev.10 V18.
 * As faixas qualitativas 1–2, 3–5, 6–7, 8–9, 10 são notas inteiras.
 * NR é marcador permitido no rascunho, mas não satisfaz aprovação.
 */
export const NOTECHS_SCORE_OPTIONS = [
  'NR',
  ...Array.from({ length: 10 }, (_, index) => (index + 1).toFixed(1)),
] as const;

const NOTECHS_ALLOWED_DRAFT_SENTINELS = new Set(['', 'NR', 'NAO_REALIZADA', 'NÃO_REALIZADA']);

export function isNotechsDraftScoreAllowed(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim().toUpperCase();
  return NOTECHS_ALLOWED_DRAFT_SENTINELS.has(normalized) ||
    /^(?:10|[1-9])(?:\.0+)?$/.test(normalized);
}

/** Cache identity includes both the ficha and the evaluated employee.
 * Switching employee in the same ficha invalidates previous responses.
 */
export function notechsHistoryIdentity(
  fichaId: string | undefined,
  employeeId: number | null | undefined,
): string {
  return `${fichaId ?? ''}:${employeeId ?? ''}`;
}
