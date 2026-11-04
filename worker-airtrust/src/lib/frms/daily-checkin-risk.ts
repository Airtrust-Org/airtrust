/** FRMS screening signals; business triage only, never flight-fitness certification. */
export type DailyRiskLevel = 'normal' | 'attention' | 'critical' | 'unfit_for_duty';

export type DailyRiskInput = {
  apto: 0 | 1;
  kssScore: number;
  horasSono24h: number;
  subjectiveFatigueLevel: number | null;
  sleepinessLevel: number | null;
};

/** KSS thresholds are provisional operational-policy triggers pending scientific calibration (#1476). */
export function evaluateDailyRisk(input: DailyRiskInput): DailyRiskLevel {
  if (input.apto === 0) return 'unfit_for_duty';
  if (input.kssScore >= 8 || input.horasSono24h < 4) return 'critical';
  if ((input.subjectiveFatigueLevel ?? 0) >= 8) return 'critical';
  if ((input.sleepinessLevel ?? 0) >= 8) return 'critical';
  if (input.kssScore >= 7 || input.horasSono24h < 5) return 'attention';
  if ((input.subjectiveFatigueLevel ?? 0) >= 6) return 'attention';
  if ((input.sleepinessLevel ?? 0) >= 6) return 'attention';
  return 'normal';
}
