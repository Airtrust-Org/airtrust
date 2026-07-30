/**
 * Verifica de forma centralizada e robusta se um registro de qualificação é classificado como Check/FAP.
 * Trata as variações de payloads de API onde booleanos podem vir como inteiros, strings ou nulls.
 * 
 * Regras:
 * 1. is_check == 1 ou true ou "1"
 * 2. categoria == 'CHECK' (case-insensitive, com trim)
 */
export function isQualificationCheck(
  q: { is_check?: number | boolean | string | null; categoria?: string | null } | undefined | null,
): boolean {
  if (!q) return false;

  const isCheckFlag = q.is_check === 1 || q.is_check === true || q.is_check === '1';
  if (isCheckFlag) return true;

  if (typeof q.categoria === 'string') {
    const cat = q.categoria.trim().toUpperCase();
    if (cat === 'CHECK') return true;
  }

  return false;
}
