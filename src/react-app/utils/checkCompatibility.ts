export interface CheckLike {
  id: number;
  codigo?: string | null;
}

export function normalizeAircraftModel(modeloAeronave?: string | null): string {
  return String(modeloAeronave || '')
    .trim()
    .toUpperCase();
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

  if (codigo.endsWith('-139')) {
    return modelo.includes('139');
  }

  if (codigo.endsWith('-76')) {
    return modelo.includes('76');
  }

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
