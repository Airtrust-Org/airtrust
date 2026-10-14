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

export function loadFadigaCheckinDraft(key: string): FadigaCheckinDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || (parsed.version !== 1 && parsed.version !== 2)) return null;
    if (parsed.version === 1) {
      // Old h4/h8 options were ranges ("4 ou menos", "8 ou mais").
      // Never reinterpret a stored range as an exact physiological measurement.
      return {
        ...parsed,
        version: 2,
        sonoOpcao: parsed.sonoOpcao === 'h4' || parsed.sonoOpcao === 'h8'
          ? null : parsed.sonoOpcao,
        horasSonoPersonalizadas: null,
      } as unknown as FadigaCheckinDraft;
    }
    return parsed as unknown as FadigaCheckinDraft;
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
