import type { OperationalVigilanceResult } from './OperationalVigilanceTest';

export interface FadigaCheckinDraft {
  version: 2;
  horasSonoPersonalizadas?: number | null;
  sonoOpcao: string | null;
  repousoHoras?: number | null;
  presentationTime: string;
  wakeTime: string;
  qualidadeSono: number | null;
  kssScore: number | null;
  fitForDutyChoice: string | null;
  medsUlt12h: boolean | null;
  alcoolUlt12h: boolean | null;
  observacao: string;
  aceiteTermos: boolean;
  aceitePrivacidade: boolean;
  vigilanceResult: OperationalVigilanceResult | null;
  vigilanceInProgress: boolean;
}

export function fadigaCheckinDraftKey(
  userId: number | null | undefined,
  empresaId: number | null | undefined,
  date: string,
): string {
  return `airtrust:frms-checkin-draft:${userId ?? 0}:${empresaId ?? 0}:${date}`;
}

// sessionStorage is not a trusted typed source: validate restored values instead
// of hiding incompatible old drafts behind a double assertion.
function isFadigaDraft(value: unknown): value is FadigaCheckinDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const numericOrNull = (item: unknown) =>
    item === null || (typeof item === 'number' && Number.isFinite(item));
  const booleanOrNull = (item: unknown) => item === null || typeof item === 'boolean';
  const stringOrNull = (item: unknown) => item === null || typeof item === 'string';
  const options = [null, 'h4', 'h5', 'h6', 'h7', 'h8', 'outro'];
  const vigilance = row.vigilanceResult;
  const validVigilance = vigilance === null ||
    (typeof vigilance === 'object' && !Array.isArray(vigilance) &&
      vigilance !== null && 'summary' in vigilance && 'trials' in vigilance &&
      Array.isArray(vigilance.trials));
  return row.version === 2 &&
    options.includes(row.sonoOpcao as string | null) &&
    (row.horasSonoPersonalizadas === undefined || numericOrNull(row.horasSonoPersonalizadas)) &&
    (row.repousoHoras === undefined || numericOrNull(row.repousoHoras)) &&
    typeof row.presentationTime === 'string' &&
    typeof row.wakeTime === 'string' &&
    numericOrNull(row.qualidadeSono) &&
    numericOrNull(row.kssScore) &&
    stringOrNull(row.fitForDutyChoice) &&
    booleanOrNull(row.medsUlt12h) &&
    booleanOrNull(row.alcoolUlt12h) &&
    typeof row.observacao === 'string' &&
    typeof row.aceiteTermos === 'boolean' &&
    typeof row.aceitePrivacidade === 'boolean' &&
    typeof row.vigilanceInProgress === 'boolean' &&
    validVigilance;
}

export function loadFadigaCheckinDraft(key: string): FadigaCheckinDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 && record.version !== 2) return null;
    const candidate = record.version === 1
      ? {
          ...record,
          version: 2,
          // Legacy extremes were ranges, not exact hours. Do not infer a measurement.
          sonoOpcao: record.sonoOpcao === 'h4' || record.sonoOpcao === 'h8'
            ? null : record.sonoOpcao,
          horasSonoPersonalizadas: null,
        }
      : record;
    return isFadigaDraft(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function saveFadigaCheckinDraft(key: string, draft: FadigaCheckinDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Session storage is best-effort and must never block the check-in.
  }
}

export function clearFadigaCheckinDraft(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // noop
  }
}
