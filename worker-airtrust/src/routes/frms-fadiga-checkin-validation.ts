import type { CheckinCreateInput } from './frms-fadiga-checkin.schema';

export type CheckinPayloadCompleteness =
  | { ok: true }
  | { ok: false; error: string; message: string; field: string };

function hhmmToMinute(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? h * 60 + m : null;
}

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

  if (hhmmToMinute(presentationTime) == null) {
    return { ok: false, error: 'presentation_time_invalid', field: 'hora_apresentacao', message: 'Horário de apresentação inválido.' };
  }
  const wakeMinute = hhmmToMinute(wakeTime);
  if (wakeMinute == null) {
    return { ok: false, error: 'wake_time_invalid', field: 'wake_time', message: 'Horário de despertar inválido.' };
  }
  if (input.hora_dormiu) {
    const sleepStartMinute = hhmmToMinute(input.hora_dormiu);
    const windowMinutes = sleepStartMinute == null ? null : (wakeMinute - sleepStartMinute + 1440) % 1440;
    if (windowMinutes == null || windowMinutes === 0 || windowMinutes > 14 * 60) {
      return {
        ok: false, error: 'sleep_window_invalid', field: 'hora_dormiu',
        message: 'Janela de sono impossível ou maior que 14 h; confira os horários informados.',
      };
    }
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
