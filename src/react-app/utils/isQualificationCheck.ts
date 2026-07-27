/**
 * Normaliza o campo `is_check` de uma qualificação, aceitando:
 * - booleano `true`
 * - número `1`
 * - string `"1"` (compatibilidade com payloads legados)
 * - categoria normalizada igual a `CHECK` (trim + uppercase)
 *
 * Garante que uma qualificação cadastrada como Check seja reconhecida
 * independentemente do formato retornado pela API.
 */
export function isQualificationCheck(q: {
  is_check?: number | boolean | string | null;
  categoria?: string | null;
}): boolean {
  const flag = q.is_check === true || Number(q.is_check) === 1;
  const cat = String(q.categoria ?? '').trim().toUpperCase() === 'CHECK';
  return flag || cat;
}
