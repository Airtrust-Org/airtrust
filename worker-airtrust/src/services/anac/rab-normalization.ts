export const ANAC_RAB_PROJECTION_VERSION = 'anac.rab-aircraft.v1' as const;

export type AnacRabAirworthinessCode = 'R' | 'N' | 'S' | 'C' | 'V' | 'X' | 'U' | 'Z' | 'P' | 'M';

export type AnacRabAirworthinessStatus =
  | 'MARK_RESERVED'
  | 'NORMAL'
  | 'AIRWORTHINESS_CERTIFICATE_SUSPENDED'
  | 'AIRWORTHINESS_CERTIFICATE_CANCELLED'
  | 'AIRWORTHINESS_CERTIFICATE_EXPIRED'
  | 'AIRCRAFT_INTERDICTED'
  | 'ULTRALIGHT_NORMAL'
  | 'EXPERIMENTAL_NORMAL'
  | 'PUNITIVE_STATUS_IN_FORCE'
  | 'REGISTRATION_CANCELLED'
  | 'UNKNOWN';

export interface AnacRabAircraftProjection {
  schemaVersion: typeof ANAC_RAB_PROJECTION_VERSION;
  source: 'ANAC_RAB_PUBLIC_DATA';
  registration: string;
  serialNumber: string | null;
  category: string | null;
  typeCertificate: string | null;
  model: string | null;
  manufacturer: string | null;
  aircraftClass: string | null;
  maximumTakeoffWeight: number | null;
  icaoType: string | null;
  minimumCrew: number | null;
  maximumPassengers: number | null;
  seats: number | null;
  manufactureYear: number | null;
  cavValidUntil: string | null;
  caValidUntil: string | null;
  registrationCancelledAt: string | null;
  airworthinessCode: string | null;
  airworthinessStatus: AnacRabAirworthinessStatus;
}

function canonicalKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function indexRecord(raw: Record<string, unknown>): Map<string, unknown> {
  const indexed = new Map<string, unknown>();
  for (const [key, value] of Object.entries(raw)) {
    indexed.set(canonicalKey(key), value);
  }
  return indexed;
}

function read(index: Map<string, unknown>, ...aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = index.get(canonicalKey(alias));
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const normalized = text(value)?.replace(/\s+/g, '');
  if (!normalized) return null;

  // ANAC datasets are Brazilian and commonly use comma as the decimal separator. When a comma is
  // present, periods are treated as grouping separators. Otherwise, preserve a decimal point.
  const machineValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  const parsed = Number(machineValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

export function normalizeBrazilianAircraftRegistration(value: unknown): string | null {
  const normalized = text(value)?.toUpperCase().replace(/\s+/g, '') ?? null;
  if (!normalized) return null;

  const compact = normalized.replace('-', '');
  if (!/^(PP|PR|PS|PT|PU)[A-Z]{3}$/.test(compact)) return null;
  return `${compact.slice(0, 2)}-${compact.slice(2)}`;
}

export function mapAnacRabAirworthinessStatus(code: unknown): AnacRabAirworthinessStatus {
  const normalized = text(code)?.toUpperCase();
  switch (normalized) {
    case 'R':
      return 'MARK_RESERVED';
    case 'N':
      return 'NORMAL';
    case 'S':
      return 'AIRWORTHINESS_CERTIFICATE_SUSPENDED';
    case 'C':
      return 'AIRWORTHINESS_CERTIFICATE_CANCELLED';
    case 'V':
      return 'AIRWORTHINESS_CERTIFICATE_EXPIRED';
    case 'X':
      return 'AIRCRAFT_INTERDICTED';
    case 'U':
      return 'ULTRALIGHT_NORMAL';
    case 'Z':
      return 'EXPERIMENTAL_NORMAL';
    case 'P':
      return 'PUNITIVE_STATUS_IN_FORCE';
    case 'M':
      return 'REGISTRATION_CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Converts one public RAB row into the minimized AirTrust aircraft projection.
 *
 * Deliberately excluded even when present in the public dataset:
 * - owner/operator CPF/CNPJ;
 * - owner/operator names and addresses;
 * - liens/encumbrance free text.
 *
 * Those attributes are not required for aircraft master-data enrichment and must not be copied
 * merely because the upstream dataset is public.
 */
export function normalizeAnacRabAircraft(
  raw: Record<string, unknown>,
): AnacRabAircraftProjection | null {
  const index = indexRecord(raw);
  const registration = normalizeBrazilianAircraftRegistration(read(index, 'MARCAS'));
  if (!registration) return null;

  const airworthinessCode = text(read(index, 'CD_INTERDICAO'))?.toUpperCase() ?? null;

  return {
    schemaVersion: ANAC_RAB_PROJECTION_VERSION,
    source: 'ANAC_RAB_PUBLIC_DATA',
    registration,
    serialNumber: text(read(index, 'NÚM. SÉRIE', 'NUM. SERIE', 'NUM SERIE', 'NUMERO SERIE')),
    category: text(read(index, 'CATEGORIA')),
    typeCertificate: text(read(index, 'TIPO CERT')),
    model: text(read(index, 'MODELO')),
    manufacturer: text(read(index, 'NOME FABRICANTE')),
    aircraftClass: text(read(index, 'CLASSE')),
    maximumTakeoffWeight: numberValue(read(index, 'PMD')),
    icaoType: text(read(index, 'TIPO_ICAO', 'TIPO ICAO')),
    minimumCrew: integerValue(read(index, 'TRIP. MÍN.', 'TRIP. MIN.', 'TRIP MIN')),
    maximumPassengers: integerValue(read(index, 'PAX MAX')),
    seats: integerValue(read(index, 'ASSENTOS')),
    manufactureYear: integerValue(read(index, 'ANO FAB')),
    cavValidUntil: text(read(index, 'VAL CAV')),
    caValidUntil: text(read(index, 'VAL CA')),
    registrationCancelledAt: text(read(index, 'DATA CANC')),
    airworthinessCode,
    airworthinessStatus: mapAnacRabAirworthinessStatus(airworthinessCode),
  };
}
