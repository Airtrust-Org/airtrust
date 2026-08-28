export type ThermalExposureConfig = {
  enabled: boolean;
  thresholdC: number;
  pointsPerDegree: number;
  maxPoints: number;
};

export type ThermalExposureInput = {
  temperatureC: number | null;
  observedAt: string | null;
  stationIcao: string | null;
  source: 'REDEMET_METAR' | 'MANUAL' | null;
};

export type ThermalExposureAssessment = {
  applicable: boolean;
  temperatureC: number | null;
  thresholdC: number;
  points: number;
  excessDegreesC: number;
  observedAt: string | null;
  stationIcao: string | null;
  source: ThermalExposureInput['source'];
};

export const DEFAULT_THERMAL_EXPOSURE_CONFIG: ThermalExposureConfig = {
  // Deliberately disabled until AirTrust's operational benchmark is approved.
  // Public aviation FRMS guidance does not define a universal temperature-to-fatigue
  // point conversion, and METAR dry-bulb temperature is not equivalent to WBGT.
  enabled: false,
  thresholdC: 30,
  pointsPerDegree: 1,
  maxPoints: 10,
};

export function assessThermalExposure(
  input: ThermalExposureInput,
  config: ThermalExposureConfig = DEFAULT_THERMAL_EXPOSURE_CONFIG,
): ThermalExposureAssessment {
  const temperatureC = input.temperatureC;
  if (!config.enabled || temperatureC == null || !Number.isFinite(temperatureC)) {
    return {
      applicable: false,
      temperatureC,
      thresholdC: config.thresholdC,
      points: 0,
      excessDegreesC: 0,
      observedAt: input.observedAt,
      stationIcao: input.stationIcao,
      source: input.source,
    };
  }

  const excessDegreesC = Math.max(0, temperatureC - config.thresholdC);
  const points = Math.min(config.maxPoints, excessDegreesC * config.pointsPerDegree);

  return {
    applicable: true,
    temperatureC,
    thresholdC: config.thresholdC,
    points: Math.round(points * 10) / 10,
    excessDegreesC: Math.round(excessDegreesC * 10) / 10,
    observedAt: input.observedAt,
    stationIcao: input.stationIcao,
    source: input.source,
  };
}
