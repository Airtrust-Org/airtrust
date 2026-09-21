import type { CheckinCreateInput } from './frms-fadiga-checkin.schema';

export type CheckinPayloadCompleteness =
  | { ok: true }
  | { ok: false; error: string; message: string; field: string };

export function validateCheckinPayloadCompleteness(
  input: CheckinCreateInput,
): CheckinPayloadCompleteness {
  const presentationTime = input.hora_apresentacao || input.jornada_inicio_prevista;
  if (!presentationTime) {
    return {
      ok: false,
      error: 'presentation_time_required',
      field: 'hora_apresentacao',
      message: 'Informe a hora de apresentação para registrar o check-in de fadiga.',
    };
  }

  const wakeTime = input.wake_time || input.hora_acordou;
  if (!wakeTime) {
    return {
      ok: false,
      error: 'wake_time_required',
      field: 'wake_time',
      message: 'Informe wake_time ou hora_acordou para registrar o check-in de fadiga.',
    };
  }

  const hasHorasSono24h = typeof input.horas_sono_24h === 'number';
  const hasHoraDormiu = Boolean(input.hora_dormiu);
  if (!hasHorasSono24h && !hasHoraDormiu) {
    return {
      ok: false,
      error: 'sleep_data_required',
      field: 'horas_sono_24h',
      message: 'Informe horas_sono_24h ou hora_dormiu para registrar o check-in de fadiga.',
    };
  }

  return { ok: true };
}
