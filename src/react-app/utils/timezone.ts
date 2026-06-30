/**
 * Utilitários de timezone agnósticos.
 *
 * O timezone operacional é fornecido pelo contexto da aplicação (systemSettings)
 * ou pelo valor passado explicitamente. Nunca hardcodado.
 *
 * Fallback: 'UTC' (nunca 'America/Sao_Paulo').
 */

import { getSystemSettings } from '@/react-app/config/systemSettings';

/** Retorna o timezone configurado na empresa ou 'UTC' como fallback seguro. */
export function getSystemTimeZone(): string {
  try {
    const settings = getSystemSettings();
    const tz = (settings as { timezone?: unknown }).timezone;
    if (typeof tz === 'string' && tz.trim().length > 0) {
      return tz.trim();
    }
  } catch {
    // ignora erros de leitura do localStorage
  }
  return 'UTC';
}

/**
 * Retorna a data de hoje no formato YYYY-MM-DD usando o timezone configurado.
 *
 * @param tz - Timezone IANA. Se omitido, usa getSystemTimeZone().
 */
export function getTodayYmdInTz(tz?: string): string {
  const timezone = tz ?? getSystemTimeZone();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Formata uma Date usando o timezone e as opções fornecidas.
 *
 * @param date  - Data a formatar.
 * @param opts  - Opções de Intl.DateTimeFormat (sem timeZone — é injetado).
 * @param tz    - Timezone IANA. Se omitido, usa getSystemTimeZone().
 */
export function formatWithSystemTZ(
  date: Date,
  opts: Omit<Intl.DateTimeFormatOptions, 'timeZone'> = {},
  tz?: string,
): string {
  const timezone = tz ?? getSystemTimeZone();
  return new Intl.DateTimeFormat('pt-BR', { ...opts, timeZone: timezone }).format(date);
}

/**
 * Formata uma Date como hora local (HH:MM) no timezone configurado.
 *
 * @param date - Data a formatar.
 * @param tz   - Timezone IANA. Se omitido, usa getSystemTimeZone().
 */
export function formatTimeInTz(date: Date, tz?: string): string {
  const timezone = tz ?? getSystemTimeZone();
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Verifica se uma string é um timezone IANA válido.
 * Usa Intl.supportedValuesOf quando disponível; caso contrário tenta criar um DateTimeFormat.
 */
export function isValidIANATimezone(tz: string): boolean {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return (Intl.supportedValuesOf('timeZone') as string[]).includes(tz);
    }
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Timezones IANA relevantes para operações aéreas brasileiras e internacionais,
 * agrupados por região.
 */
export const AVIATION_TIMEZONES: Array<{ value: string; label: string; group: string }> = [
  // Brasil
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC−3 / −2 verão)', group: 'Brasil' },
  { value: 'America/Manaus', label: 'Manaus (UTC−4)', group: 'Brasil' },
  { value: 'America/Belem', label: 'Belém (UTC−3)', group: 'Brasil' },
  { value: 'America/Fortaleza', label: 'Fortaleza (UTC−3)', group: 'Brasil' },
  { value: 'America/Recife', label: 'Recife (UTC−3)', group: 'Brasil' },
  { value: 'America/Bahia', label: 'Salvador (UTC−3)', group: 'Brasil' },
  { value: 'America/Cuiaba', label: 'Cuiabá (UTC−4 / −3 verão)', group: 'Brasil' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (UTC−4)', group: 'Brasil' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (UTC−4)', group: 'Brasil' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC−2)', group: 'Brasil' },
  // Internacional
  { value: 'UTC', label: 'UTC (tempo universal)', group: 'Internacional' },
  { value: 'America/New_York', label: 'Nova York (UTC−5 / −4)', group: 'América do Norte' },
  { value: 'America/Chicago', label: 'Chicago (UTC−6 / −5)', group: 'América do Norte' },
  { value: 'America/Denver', label: 'Denver (UTC−7 / −6)', group: 'América do Norte' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (UTC−8 / −7)', group: 'América do Norte' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (UTC−3)', group: 'América do Sul' },
  { value: 'America/Santiago', label: 'Santiago (UTC−4 / −3)', group: 'América do Sul' },
  { value: 'America/Lima', label: 'Lima (UTC−5)', group: 'América do Sul' },
  { value: 'America/Bogota', label: 'Bogotá (UTC−5)', group: 'América do Sul' },
  { value: 'Europe/London', label: 'Londres (UTC / +1 verão)', group: 'Europa' },
  { value: 'Europe/Lisbon', label: 'Lisboa (UTC / +1 verão)', group: 'Europa' },
  { value: 'Europe/Paris', label: 'Paris (UTC+1 / +2)', group: 'Europa' },
  { value: 'Europe/Amsterdam', label: 'Amsterdã (UTC+1 / +2)', group: 'Europa' },
  { value: 'Africa/Luanda', label: 'Luanda (UTC+1)', group: 'África' },
  { value: 'Africa/Maputo', label: 'Maputo (UTC+2)', group: 'África' },
];
