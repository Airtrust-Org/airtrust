export interface CheckLike {
  id: number;
  codigo?: string | null;
}

export function normalizeAircraftModel(modeloAeronave?: string | null): string {
  return String(modeloAeronave || '')
    .trim()
    .toUpperCase();
}

/**
 * Recognizes if a string explicitly names the AW139 family.
 */
function isAw139(str: string): boolean {
  return /\b(AW139|A139)\b/.test(str) || str.endsWith('-139');
}

/**
 * Recognizes if a string explicitly names the S76 family.
 */
function isS76(str: string): boolean {
  return /\b(S76|SK76)\b/.test(str) || str.endsWith('-76') || str.endsWith('-S76') || str.endsWith('-SK76');
}

export function isCheckCompatibleWithAircraft(
  codigoCheck?: string | null,
  modeloAeronave?: string | null,
): boolean {
  const codigo = String(codigoCheck || '')
    .trim()
    .toUpperCase();
  const modelo = normalizeAircraftModel(modeloAeronave);

  if (!codigo || !modelo) {
    return true;
  }

  const checkIs139 = isAw139(codigo);
  const checkIsS76 = isS76(codigo);

  const modelIs139 = isAw139(modelo) || modelo.includes('139');
  const modelIsS76 = isS76(modelo) || modelo.includes('76');

  // If the check targets AW139 specifically, it cannot be used on an S76 model.
  if (checkIs139 && modelIsS76) return false;
  // If the check targets S76 specifically, it cannot be used on an AW139 model.
  if (checkIsS76 && modelIs139) return false;

  // If the check doesn't specifically target either, or the model doesn't conflict, it's allowed.
  return true;
}

export function filterCompatibleChecks<T extends CheckLike>(
  checks: T[],
  modeloAeronave?: string | null,
): T[] {
  return checks.filter((check) => isCheckCompatibleWithAircraft(check.codigo, modeloAeronave));
}

export function filterCompatibleCheckIds<T extends CheckLike>(
  checkIds: number[],
  checks: T[],
  modeloAeronave?: string | null,
): number[] {
  const idsPermitidos = new Set(
    filterCompatibleChecks(checks, modeloAeronave).map((check) => Number(check.id)),
  );

  return Array.from(
    new Set(
      checkIds
        .map((checkId) => Number(checkId))
        .filter((checkId) => Number.isFinite(checkId) && idsPermitidos.has(checkId)),
    ),
  );
}
