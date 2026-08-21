import {
  enrichFlightLegWeatherFromRedemet,
  type FlightLegWeatherResult,
  type MetarSelectionMode,
  type RedemetClient,
} from '../frms/redemet-weather';

export interface SigvoosLegForWeather {
  data: string;
  departureIcao: string | null;
  arrivalIcao: string | null;
  takeoffTime: string | null;
  landingTime: string | null;
}

export interface SigvoosWeatherOptions {
  /** Explicit/documented tenant operational timezone, never inferred from ICAO. */
  tenantOperationalTimezoneIana: string | null;
  selectionMode?: MetarSelectionMode;
  maxAgeMinutes?: number;
}

export async function enrichSigvoosLegWeather(
  client: RedemetClient,
  leg: SigvoosLegForWeather,
  options: SigvoosWeatherOptions,
): Promise<FlightLegWeatherResult> {
  return enrichFlightLegWeatherFromRedemet(
    client,
    {
      departureIcao: leg.departureIcao,
      arrivalIcao: leg.arrivalIcao,
      dataOperacional: leg.data,
      takeoffLocal: leg.takeoffTime,
      landingLocal: leg.landingTime,
      timezoneIana: options.tenantOperationalTimezoneIana,
    },
    {
      selectionMode: options.selectionMode,
      maxAgeMinutes: options.maxAgeMinutes,
    },
  );
}
