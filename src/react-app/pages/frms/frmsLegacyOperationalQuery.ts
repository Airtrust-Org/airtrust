/** Restore the exact operational day when old links still use range parameters.
 * FRMS Operação is a single-day view; a former interval opens at its first
 * valid day and must never silently fall back to today's crew.
 */
export function canonicalizeLegacyFrmsOperationalQuery(search: string): string {
  const params = new URLSearchParams(search);
  const legacyStart = params.get('data_inicio');
  if (!params.get('data') && legacyStart && /^\d{4}-\d{2}-\d{2}$/.test(legacyStart)) {
    params.set('data', legacyStart);
  }
  params.delete('data_inicio');
  params.delete('data_fim');
  params.set('origem', 'controle-operacional-legado');
  return params.toString();
}
