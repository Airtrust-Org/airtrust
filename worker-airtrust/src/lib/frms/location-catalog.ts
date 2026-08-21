/**
 * AirTrust FRMS — explicit operational location catalogue contract.
 *
 * Safety rule: no heuristic may silently classify an unknown code as platform,
 * helideck or aerodrome. Classification and timezone must come from an auditable
 * tenant-scoped catalogue (or an explicitly configured tenant fallback for
 * timezone only).
 */

import type { LocationOperationalClass } from './operational-demand';

export type WeatherSourceKind = 'REDEMET' | 'HELIDECK_FEED' | 'MANUAL_MEASURED' | 'NONE';
export type LocationResolutionQuality = 'EXACT' | 'PARTIAL' | 'UNKNOWN';

export interface FrmsLocationCatalogEntry {
  code: string;
  operationalClass: Exclude<LocationOperationalClass, 'UNKNOWN'>;
  timezoneIana: string | null;
  weatherSourceKind: WeatherSourceKind;
  redemetStationIcao: string | null;
  active: boolean;
  sourceReference?: string | null;
}

export interface ResolvedOperationalLocation {
  code: string | null;
  operationalClass: LocationOperationalClass;
  timezoneIana: string | null;
  weatherSourceKind: WeatherSourceKind | 'UNKNOWN';
  redemetStationIcao: string | null;
  quality: LocationResolutionQuality;
  notes: string[];
}

function normalizeCode(value: string | null | undefined): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  return code ? code : null;
}

function normalizeIcao(value: string | null | undefined): string | null {
  const code = normalizeCode(value);
  return code && /^[A-Z]{4}$/.test(code) ? code : null;
}

function isValidTimeZone(timezoneIana: string | null | undefined): boolean {
  if (!timezoneIana) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezoneIana }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function validateLocationCatalogEntry(entry: FrmsLocationCatalogEntry): string[] {
  const errors: string[] = [];
  const code = normalizeCode(entry.code);
  if (!code) errors.push('LOCATION_CODE_REQUIRED');
  if (entry.timezoneIana && !isValidTimeZone(entry.timezoneIana)) {
    errors.push('TIMEZONE_IANA_INVALID');
  }
  if (entry.weatherSourceKind === 'REDEMET') {
    if (!normalizeIcao(entry.redemetStationIcao)) errors.push('REDEMET_STATION_ICAO_REQUIRED');
  } else if (entry.redemetStationIcao) {
    errors.push('REDEMET_STATION_WITH_NON_REDEMET_SOURCE');
  }
  return errors;
}

export function resolveOperationalLocation(
  codeInput: string | null | undefined,
  catalogue: FrmsLocationCatalogEntry[],
  options?: { tenantTimezoneIana?: string | null },
): ResolvedOperationalLocation {
  const code = normalizeCode(codeInput);
  if (!code) {
    return {
      code: null,
      operationalClass: 'UNKNOWN',
      timezoneIana: null,
      weatherSourceKind: 'UNKNOWN',
      redemetStationIcao: null,
      quality: 'UNKNOWN',
      notes: ['Código de localidade ausente; nenhuma classificação foi inferida.'],
    };
  }

  const entry = catalogue.find((item) => item.active && normalizeCode(item.code) === code);
  if (!entry || validateLocationCatalogEntry(entry).length > 0) {
    const fallbackTimezone = isValidTimeZone(options?.tenantTimezoneIana)
      ? options!.tenantTimezoneIana!
      : null;
    return {
      code,
      operationalClass: 'UNKNOWN',
      timezoneIana: fallbackTimezone,
      weatherSourceKind: 'UNKNOWN',
      redemetStationIcao: null,
      quality: fallbackTimezone ? 'PARTIAL' : 'UNKNOWN',
      notes: [
        'Localidade sem entrada válida no catálogo; não inferir aeródromo/plataforma por formato ou nome.',
        ...(fallbackTimezone ? ['Timezone do tenant usada apenas para normalização temporal.'] : []),
      ],
    };
  }

  const timezoneIana = isValidTimeZone(entry.timezoneIana)
    ? entry.timezoneIana
    : isValidTimeZone(options?.tenantTimezoneIana)
      ? options!.tenantTimezoneIana!
      : null;
  const exactTimezone = Boolean(entry.timezoneIana && isValidTimeZone(entry.timezoneIana));

  return {
    code,
    operationalClass: entry.operationalClass,
    timezoneIana,
    weatherSourceKind: entry.weatherSourceKind,
    redemetStationIcao:
      entry.weatherSourceKind === 'REDEMET' ? normalizeIcao(entry.redemetStationIcao) : null,
    quality: exactTimezone ? 'EXACT' : 'PARTIAL',
    notes: exactTimezone
      ? []
      : ['Timezone do tenant usada como fallback explícito; cadastro da localidade deve ser completado.'],
  };
}
