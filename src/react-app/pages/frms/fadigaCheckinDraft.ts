import type { OperationalVigilanceResult } from './OperationalVigilanceTest';

export interface FadigaCheckinDraft {
  version: 1;
  sonoOpcao: string | null;
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
    const parsed = JSON.parse(raw) as Partial<FadigaCheckinDraft> | null;
    if (!parsed || parsed.version !== 1) return null;
    return parsed as FadigaCheckinDraft;
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
