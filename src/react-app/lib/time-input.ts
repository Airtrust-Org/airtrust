const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseAndNormalize(hourText: string, minuteText: string): string | null {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeTimeInput(value: string): string | null {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, '');
  const separatorMatch = compact.match(/^(\d{1,2})[:h](\d{1,2})$/);
  if (separatorMatch) {
    const [, hourText, minuteText] = separatorMatch;
    return parseAndNormalize(hourText, minuteText);
  }

  const digitsOnly = compact.replace(/\D/g, '');
  if (!digitsOnly) return null;

  if (digitsOnly.length <= 2) {
    return parseAndNormalize(digitsOnly, '00');
  }

  if (digitsOnly.length === 3) {
    return parseAndNormalize(digitsOnly.slice(0, 1), digitsOnly.slice(1));
  }

  if (digitsOnly.length === 4) {
    return parseAndNormalize(digitsOnly.slice(0, 2), digitsOnly.slice(2));
  }

  return null;
}

export function isValidTimeHHMM(value: string): boolean {
  return HHMM_REGEX.test(String(value || '').trim());
}

export function formatTimeInputForDisplay(value: string): string {
  const normalized = normalizeTimeInput(value);
  if (normalized) return normalized;
  return String(value || '').trim();
}

export function sanitizeTimeInputForTyping(value: string): string {
  const raw = String(value || '');
  const cleaned = raw.replace(/[^\dhH:]/g, '').replace(/H/g, 'h');
  const separatorIndex = cleaned.search(/[:h]/);

  if (separatorIndex === -1) {
    return cleaned.replace(/\D/g, '').slice(0, 4);
  }

  const head = cleaned.slice(0, separatorIndex).replace(/\D/g, '').slice(0, 2);
  const separator = cleaned.charAt(separatorIndex) === ':' ? ':' : 'h';
  const tail = cleaned
    .slice(separatorIndex + 1)
    .replace(/[^\d]/g, '')
    .slice(0, 2);
  return `${head}${separator}${tail}`;
}
