import { hasCompleteScormSlideCoverage, isTrustedScorm12Finish, extractScormLocationFromCmiJson } from './lms-progress-guardrails';
import { resolveLmsCompletionScorePct } from './lms-completion-evidence';

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

/**
 * Player 2.0 — one source of truth for the terminal SCORM evidence checklist.
 *
 * An observed SCORM status or the final slide counter is NOT a completed
 * enrollment. This function only answers whether persisted or just-submitted
 * evidence is eligible for the *separate* tenant/session/edition/qualification
 * transaction. Native and future standards adapters must supply their own
 * verified evidence, never bypass this checklist with a 100% badge.
 */
export type ScormClosureCode =
  | 'SCORM_ALREADY_COMPLETED'
  | 'SCORM_USER_CONFIRMATION_REQUIRED'
  | 'PROGRESS_EVIDENCE_MISSING'
  | 'COMPLETION_EVIDENCE_INSUFFICIENT'
  | 'EXPLICIT_FAILURE'
  | 'MASTERY_SCORE_MISSING'
  | 'SCORE_MISSING'
  | 'SCORE_BELOW_MASTERY'
  | 'SCORM_ASSESSMENT_POLICY_INVALID'
  | 'SCORM_READY_FOR_SERVER_VERIFICATION';

export interface ScormClosureReadiness {
  contract_version: 1;
  eligible_for_server_verification: boolean;
  code: ScormClosureCode;
  missing: string[];
  /** Informational, not proof of completion or certificate issuance. */
  last_step_reached: boolean;
  every_slide_verified: boolean;
  terminal_status_verified: boolean;
  assessment_verified: boolean;
}

export function evaluateScormClosureReadiness(params: {
  mode: 'commit' | 'reconcile';
  commit: ScormCommitLike;
  wasCompleted: boolean;
  cmiJson: string | null;
  location: { current: number; total: number | null } | null;
  policy: 'SCORED' | 'FORMATIVE' | null | undefined;
  masteryScore: number | null;
  scorePct: number | null;
}): ScormClosureReadiness {
  const { commit, wasCompleted, cmiJson, location, masteryScore, scorePct } = params;
  // Legacy rows without an explicit policy remain SCORED, never FORMATIVE.
  // This is the same fail-closed default as evaluateLmsCompletionEvidence.
  const policy = params.policy ?? 'SCORED';
  const lastStep = Boolean(location?.total && location.current >= location.total);
  const everySlide = hasCompleteScormSlideCoverage(cmiJson);
  const failed = isScormFailed(commit);
  const scoreRequired = policy === 'SCORED';
  const validMastery = masteryScore != null && Number.isFinite(masteryScore) &&
    masteryScore > 0 && masteryScore <= 100;
  const validScore = scorePct != null && Number.isFinite(scorePct) &&
    scorePct >= 0 && scorePct <= 100;
  const scorePassed = scoreRequired
    ? validMastery && validScore && scorePct >= masteryScore
    : policy === 'FORMATIVE';
  const terminal = !failed && isScormSuccess(commit, {
    masteryScore: scoreRequired ? masteryScore : null,
    effectiveScorePct: scorePct,
  });
  const userConfirmed = params.mode !== 'commit' || commit.commit_event === 'SCORM_USER_FINALIZE';

  const missing = [
    ...(!userConfirmed ? ['user_confirmation'] : []),
    ...(!lastStep ? ['terminal_location'] : []),
    ...(!everySlide ? ['distinct_slide_coverage'] : []),
    ...(!terminal ? ['terminal_scorm_status'] : []),
    ...(scoreRequired && !validMastery ? ['course_mastery_policy'] : []),
    ...(scoreRequired && !validScore ? ['assessment_score'] : []),
    ...(scoreRequired && validMastery && validScore && !scorePassed ? ['assessment_pass'] : []),
  ];

  let code: ScormClosureCode = 'SCORM_READY_FOR_SERVER_VERIFICATION';
  if (wasCompleted) code = 'SCORM_ALREADY_COMPLETED';
  else if (failed) code = 'EXPLICIT_FAILURE';
  else if (!userConfirmed) code = 'SCORM_USER_CONFIRMATION_REQUIRED';
  else if (!everySlide || !lastStep) code = 'PROGRESS_EVIDENCE_MISSING';
  else if (policy !== 'SCORED' && policy !== 'FORMATIVE') code = 'SCORM_ASSESSMENT_POLICY_INVALID';
  else if (scoreRequired && !validMastery) code = 'MASTERY_SCORE_MISSING';
  else if (scoreRequired && !validScore) code = 'SCORE_MISSING';
  else if (scoreRequired && !scorePassed) code = 'SCORE_BELOW_MASTERY';
  else if (!terminal) code = 'COMPLETION_EVIDENCE_INSUFFICIENT';

  return {
    contract_version: 1,
    eligible_for_server_verification: code === 'SCORM_READY_FOR_SERVER_VERIFICATION',
    code,
    missing,
    last_step_reached: lastStep,
    every_slide_verified: everySlide,
    terminal_status_verified: terminal,
    assessment_verified: scorePassed,
  };
}

/** Read model adapter: the enrollment and commit guards share the same verdict.
 * Never infer a completed enrollment from a package's progress or score.
 */
export function buildPersistedScormClosureReadiness(
  matricula: Record<string, unknown>,
  scorm: Record<string, unknown> | null,
): ScormClosureReadiness {
  const cmiJson = typeof scorm?.cmi_json === 'string' ? scorm.cmi_json : null;
  return evaluateScormClosureReadiness({
    mode: 'reconcile',
    commit: {
      lesson_status: (scorm?.lesson_status as string | null) ?? null,
      completion_status: (scorm?.completion_status as string | null) ?? null,
      success_status: (scorm?.success_status as string | null) ?? null,
    },
    wasCompleted: matricula.status === 'CONCLUIDO',
    cmiJson,
    location: extractScormLocationFromCmiJson(cmiJson),
    policy: matricula.scorm_assessment_policy as 'SCORED' | 'FORMATIVE' | null,
    masteryScore: matricula.scorm_mastery_score as number | null,
    scorePct: resolveLmsCompletionScorePct({
      scoreRaw: scorm?.score_raw ?? null,
      scoreMin: scorm?.score_min ?? null,
      scoreMax: scorm?.score_max ?? null,
      scoreScaled: scorm?.score_scaled ?? null,
    }),
  });
}

/** Legacy boolean guard delegates to the same Player 2.0 terminal checklist. */
export function canFinalizeScormEnrollment(params: {
  commit: ScormCommitLike;
  wasCompleted: boolean;
  cmiJson: string | null;
  location: { current: number; total: number | null } | null;
  policy: 'SCORED' | 'FORMATIVE' | null | undefined;
  masteryScore: number | null;
  scorePct: number | null;
}): boolean {
  return evaluateScormClosureReadiness({ ...params, mode: 'commit' })
    .eligible_for_server_verification;
}

/** Verifica se o status indica falha */
export function isScormFailed(data: ScormCommitLike): boolean {
  const ls = (data.lesson_status ?? '').toLowerCase();
  const ss = (data.success_status ?? '').toLowerCase();
  return ls === 'failed' || ss === 'failed';
}
