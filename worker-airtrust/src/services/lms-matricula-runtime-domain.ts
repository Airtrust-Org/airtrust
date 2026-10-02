import { isTrustedScorm12Finish } from './lms-progress-guardrails';

export type ScormCommitLike = {
  lesson_status?: string | null;
  completion_status?: string | null;
  success_status?: string | null;
  score_raw?: number | null;
  score_max?: number | null;
  score_min?: number | null;
  score_scaled?: number | null;
  session_time?: string | null;
  total_time?: string | null;
  suspend_data?: string | null;
  launch_data?: string | null;
  cmi_json?: string | null;
  commit_event?: string | null;
  completion_candidate?: boolean | null;
  completion_observed_at?: string | null;
};

export function parsePositiveInt(val: string | null | undefined, fallback: number) {
  const n = parseInt(val ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function isMatriculaUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('UNIQUE constraint failed') && message.includes('lms_matriculas');
}

export function clampPct(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function formatScormLocationTelemetry(marker: { current: number; total: number | null } | null) {
  if (!marker) return null;
  return marker.total != null ? `${marker.current}/${marker.total}` : String(marker.current);
}

export function summarizeScormTextPayload(value: string | null | undefined) {
  if (typeof value !== 'string') return { present: false, bytes: 0 };
  return {
    present: value.trim().length > 0,
    bytes: value.length,
  };
}

export function requiresServerValidatedNonScormEvidence(
  tipoConteudo: string | null | undefined,
  gerarQualificacaoAoConcluir: number | null | undefined,
): boolean {
  if (gerarQualificacaoAoConcluir !== 1) return false;
  const type = String(tipoConteudo ?? 'scorm')
    .trim()
    .toLowerCase();
  return !['scorm', 'h5p'].includes(type);
}

export function extractProgressPctFromCmiJson(cmiJson: string | null | undefined): number | null {
  if (!cmiJson) return null;
  try {
    const parsed = JSON.parse(cmiJson) as Record<string, unknown>;

    // SCORM 2004 native progress_measure: range 0..1
    const progressMeasure = Number(parsed['cmi.progress_measure']);
    if (Number.isFinite(progressMeasure) && progressMeasure >= 0 && progressMeasure <= 1) {
      return clampPct(progressMeasure * 100);
    }

    const locationRaw =
      (parsed['cmi.location'] as string | undefined) ??
      (parsed['cmi.core.lesson_location'] as string | undefined);
    if (!locationRaw || typeof locationRaw !== 'string') return null;

    // Common patterns: "10/76" or "10 of 76"
    const slashMatch = locationRaw.match(/(\d+)\s*\/\s*(\d+)/);
    if (slashMatch) {
      const current = Number(slashMatch[1]);
      const total = Number(slashMatch[2]);
      if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
        return clampPct((current / total) * 100);
      }
    }

    const ofMatch = locationRaw.match(/(\d+)\s+of\s+(\d+)/i);
    if (ofMatch) {
      const current = Number(ofMatch[1]);
      const total = Number(ofMatch[2]);
      if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
        return clampPct((current / total) * 100);
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function resolveScormScorePct(params: {
  scoreRaw?: number | null;
  scoreMax?: number | null;
  scoreScaled?: number | null;
}): number | null {
  const scaled = params.scoreScaled == null ? null : Number(params.scoreScaled);
  if (scaled != null && Number.isFinite(scaled) && scaled >= 0 && scaled <= 1) {
    return clampPct(scaled * 100);
  }

  const raw = params.scoreRaw == null ? null : Number(params.scoreRaw);
  const max = params.scoreMax == null ? null : Number(params.scoreMax);
  if (raw != null && max != null && Number.isFinite(raw) && Number.isFinite(max) && max > 0) {
    return clampPct((raw / max) * 100);
  }

  if (raw != null && Number.isFinite(raw) && raw >= 0) {
    return clampPct(raw);
  }

  return null;
}

/** Verifica se o status SCORM indica conclusão com sucesso */
export function isScormSuccess(
  data: ScormCommitLike,
  options?: {
    masteryScore?: number | null;
    effectiveScorePct?: number | null;
  },
): boolean {
  const ls = (data.lesson_status ?? '').toLowerCase();
  const cs = (data.completion_status ?? '').toLowerCase();
  const ss = (data.success_status ?? '').toLowerCase();
  const masteryScore = Number(options?.masteryScore);
  const hasMasteryScore = Number.isFinite(masteryScore) && masteryScore > 0;
  const effectiveScorePct = Number(options?.effectiveScorePct);
  const meetsMasteryScore =
    !hasMasteryScore || (Number.isFinite(effectiveScorePct) && effectiveScorePct >= masteryScore);
  if (isTrustedScorm12Finish(data)) return meetsMasteryScore;
  // SCORM 1.2
  if (ls === 'passed') return true;
  if (ls === 'completed') return meetsMasteryScore;
  // SCORM 2004
  if (ss === 'passed') return cs !== 'incomplete';
  if (cs === 'completed' && (ss === 'unknown' || !ss)) return meetsMasteryScore;
  return false;
}

/** Verifica se o status indica falha */
export function isScormFailed(data: ScormCommitLike): boolean {
  const ls = (data.lesson_status ?? '').toLowerCase();
  const ss = (data.success_status ?? '').toLowerCase();
  return ls === 'failed' || ss === 'failed';
}
