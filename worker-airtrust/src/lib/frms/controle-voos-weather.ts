import type { ControleVoosOperationalRecord } from './controle-voos-source';
import {
  enrichFlightLegWeatherFromRedemet,
  type FlightLegWeatherResult,
  type MetarSelectionMode,
  type RedemetClient,
} from './redemet-weather';

export type OperationalTimezoneSource = 'RECORD_EXPLICIT' | 'TENANT_OPERATIONAL_CONFIG' | 'UNAVAILABLE';

export interface ControleVoosWeatherContext {
  recordId: string;
  vooId: number;
  etapaId: number | null;
  tripulanteId: number;
  dataOperacional: string;
  timezoneIana: string | null;
  timezoneSource: OperationalTimezoneSource;
  weather: FlightLegWeatherResult;
}

export interface ControleVoosWeatherOptions {
  /**
   * Timezone operacional configurado explicitamente para o tenant.
   * Não é fallback inferido por país/ICAO. Só usar quando a configuração
   * do tenant tiver origem documental/operacional conhecida.
   */
  tenantOperationalTimezoneIana?: string | null;
  selectionMode?: MetarSelectionMode;
  maxAgeMinutes?: number;
}

export function resolveOperationalTimezone(
  record: ControleVoosOperationalRecord,
  tenantOperationalTimezoneIana?: string | null,
): { timezoneIana: string | null; source: OperationalTimezoneSource } {
  if (record.timezoneFonte === 'EXPLICITO' && record.timezone) {
    return { timezoneIana: record.timezone, source: 'RECORD_EXPLICIT' };
  }
  const tenantTimezone = String(tenantOperationalTimezoneIana || '').trim();
  if (tenantTimezone) {
    return { timezoneIana: tenantTimezone, source: 'TENANT_OPERATIONAL_CONFIG' };
  }
  return { timezoneIana: null, source: 'UNAVAILABLE' };
}

/**
 * Enriquecimento somente-leitura do read-model Controle de Voos.
 *
 * A função não escreve em D1 e não muda a fonte canônica do FRMS. Pode ser
 * usada em shadow-mode antes do cutover SIGVOOS -> Controle de Voos -> FRMS.
 */
export async function enrichControleVoosRecordWeather(
  client: RedemetClient,
  record: ControleVoosOperationalRecord,
  options: ControleVoosWeatherOptions = {},
): Promise<ControleVoosWeatherContext> {
  const timezone = resolveOperationalTimezone(record, options.tenantOperationalTimezoneIana);
  const weather = await enrichFlightLegWeatherFromRedemet(
    client,
    {
      departureIcao: record.origemIcao,
      arrivalIcao: record.destinoIcao,
      dataOperacional: record.dataOperacional,
      takeoffLocal: record.horaDecolagem,
      landingLocal: record.horaPouso,
      timezoneIana: timezone.timezoneIana,
    },
    {
      selectionMode: options.selectionMode,
      maxAgeMinutes: options.maxAgeMinutes,
    },
  );

  return {
    recordId: record.identificadorInterno,
    vooId: record.vooId,
    etapaId: record.etapaId,
    tripulanteId: record.tripulanteId,
    dataOperacional: record.dataOperacional,
    timezoneIana: timezone.timezoneIana,
    timezoneSource: timezone.source,
    weather,
  };
}
