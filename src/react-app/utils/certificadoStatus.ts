export function hasActiveCertificateFlag(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (
      normalized === '' ||
      normalized === '0' ||
      normalized === 'false' ||
      normalized === 'null' ||
      normalized === 'undefined' ||
      normalized === 'nao' ||
      normalized === 'não'
    ) {
      return false;
    }

    if (normalized === '1' || normalized === 'true') {
      return true;
    }

    const numericValue = Number(normalized);
    if (!Number.isNaN(numericValue)) {
      return numericValue > 0;
    }

    return true;
  }

  return Boolean(value);
}
