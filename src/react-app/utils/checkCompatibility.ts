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

  // Match on the trailing aircraft-model token after the last '-', not a
  // literal suffix: codes like `IFR-SK76` end in `SK76`, not `-76`, but
  // still name the SK76 aircraft just as much as `FAP06-76` does.
  const ultimoSegmento = codigo.slice(codigo.lastIndexOf('-') + 1);

  if (ultimoSegmento === '139') {
    return modelo.includes('139');
  }

  if (ultimoSegmento === '76' || ultimoSegmento === 'SK76') {
    return modelo.includes('76');
  }

  // Deliberately permissive fallback: a code whose trailing segment names
  // no known aircraft (e.g. `FAP14`, `FAP13`, `FAP07`) is an
  // aircraft-agnostic credential (examiner/instructor accreditation, route
  // check, etc.) that legitimately applies across every fleet, not an
  // unhandled case that should be hidden. Only codes recognized as
  // naming ONE specific aircraft (139/76/SK76 above) are ever restricted.
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
