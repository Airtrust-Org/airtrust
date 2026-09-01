export const SIMULATOR_TRAINING_TIME_POLICY = Object.freeze({
  business_start: '08:00',
  business_end: '18:00',
  daytime_start: '06:00',
  daytime_end: '22:00',
});

export type SimulatorTrainingTimeQuality = 'BUSINESS' | 'DAYTIME' | 'NIGHT';

function minutesOfDay(value: string): number {
  const [hour, minute] = String(value || '').split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return -1;
  return hour * 60 + minute;
}

function policyMinutes(value: string): number {
  const parsed = minutesOfDay(value);
  if (parsed < 0) throw new Error(`Invalid simulator training time policy: ${value}`);
  return parsed;
}

export function classifySimulatorTrainingTimeWindow(params: {
  date: string;
  start_time: string;
  end_date: string;
  end_time: string;
}): SimulatorTrainingTimeQuality {
  if (params.date !== params.end_date) return 'NIGHT';

  const start = minutesOfDay(params.start_time);
  const end = minutesOfDay(params.end_time);
  if (start < 0 || end < 0 || end <= start) return 'NIGHT';

  const businessStart = policyMinutes(SIMULATOR_TRAINING_TIME_POLICY.business_start);
  const businessEnd = policyMinutes(SIMULATOR_TRAINING_TIME_POLICY.business_end);
  if (start >= businessStart && end <= businessEnd) return 'BUSINESS';

  const daytimeStart = policyMinutes(SIMULATOR_TRAINING_TIME_POLICY.daytime_start);
  const daytimeEnd = policyMinutes(SIMULATOR_TRAINING_TIME_POLICY.daytime_end);
  if (start >= daytimeStart && end <= daytimeEnd) return 'DAYTIME';

  return 'NIGHT';
}

export function simulatorTrainingTimeQualityRank(value: SimulatorTrainingTimeQuality): number {
  if (value === 'BUSINESS') return 0;
  if (value === 'DAYTIME') return 1;
  return 2;
}

export function simulatorTrainingTimeQualityReason(value: SimulatorTrainingTimeQuality): string {
  if (value === 'BUSINESS') {
    return `horário comercial preferencial (${SIMULATOR_TRAINING_TIME_POLICY.business_start}–${SIMULATOR_TRAINING_TIME_POLICY.business_end})`;
  }
  if (value === 'DAYTIME') {
    return `horário diurno fora da faixa comercial (${SIMULATOR_TRAINING_TIME_POLICY.daytime_start}–${SIMULATOR_TRAINING_TIME_POLICY.daytime_end})`;
  }
  return 'horário noturno usado somente como fallback por indisponibilidade de opção diurna compatível';
}
