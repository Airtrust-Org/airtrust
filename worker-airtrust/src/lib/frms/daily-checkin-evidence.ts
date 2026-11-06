import type { DailyRiskLevel } from './daily-checkin-risk';

type FatigueEvidenceInput = {
  hasCheckin: boolean;
  presentationTime: unknown;
  wakeTime: unknown;
  sleepHours: unknown;
  kssScore: unknown;
  kssProvenance: unknown;
  fitForDuty: unknown;
  storedRiskLevel: unknown;
};

type FatigueEvidence = {
  complete: boolean;
  riskLevel: DailyRiskLevel | null;
  riskReconciledFromEvidence: boolean;
};

function validTime(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function isRiskLevel(value: unknown): value is DailyRiskLevel {
  return value === 'normal' || value === 'attention' ||
    value === 'critical' || value === 'unfit_for_duty';
}

/**
 * Safe projection of historical daily check-ins.
 *
 * An old, stored NORMAL status is never allowed to mask explicit KSS/sleep
 * triggers. Missing KSS or fitness evidence is not silently defaulted.
 * The KSS origin of old rows cannot be proven until the Schema V2 provenance
 * migration: a plausible 1-9 integer alone does NOT validate its origin.
 */
export function resolveDailyCheckinEvidence(input: FatigueEvidenceInput): FatigueEvidence {
  const incomplete: FatigueEvidence = {
    complete: false,
    riskLevel: null,
    riskReconciledFromEvidence: false,
  };
  if (!input.hasCheckin || !validTime(input.presentationTime) || !validTime(input.wakeTime)) {
    return incomplete;
  }

  const sleep = input.sleepHours;
  if (typeof sleep !== 'number' || !Number.isFinite(sleep) || sleep < 0 || sleep > 24) {
    return incomplete;
  }
  if (!Number.isInteger(input.kssScore) || Number(input.kssScore) < 1 || Number(input.kssScore) > 9) {
    return incomplete;
  }
  if (input.kssProvenance !== 'CREW_REPORTED') return incomplete;
  if (input.fitForDuty !== 0 && input.fitForDuty !== 1 &&
      input.fitForDuty !== false && input.fitForDuty !== true) {
    return incomplete;
  }
  if (!isRiskLevel(input.storedRiskLevel)) return incomplete;

  const storedRisk = input.storedRiskLevel;
  const fit = input.fitForDuty === 1 || input.fitForDuty === true;
  const kss = Number(input.kssScore);
  let riskLevel: DailyRiskLevel = storedRisk;

  // Self-reported unfitness is independent of the screening score.
  if (!fit) riskLevel = 'unfit_for_duty';
  else if ((kss >= 8 || sleep < 4) && riskLevel !== 'unfit_for_duty') riskLevel = 'critical';
  else if ((kss >= 7 || sleep < 5) && riskLevel === 'normal') riskLevel = 'attention';

  return {
    complete: true,
    riskLevel,
    riskReconciledFromEvidence: storedRisk !== riskLevel,
  };
}
