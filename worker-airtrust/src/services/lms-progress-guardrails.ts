type Nullable<T> = T | null | undefined;

// See matching constant/comment in worker-airtrust/src/routes/lms-assets.ts.
const SUSPEND_DATA_NEAR_LIMIT_THRESHOLD = 3800;

export type ScormCompletionDiagnosticCode =
  | 'SCORM_COMPLETION_ACCEPTED'
  | 'SCORM_COMPLETION_CANDIDATE'
  | 'SCORM_COMPLETION_REJECTED'
  | 'SCORM_FINAL_COMMIT_MISSING'
  | 'SCORM_STATUS_INCONSISTENT'
  | 'SCORM_NONE';

export type ScormCompletionDiagnosticStatus = 'none' | 'accepted' | 'candidate' | 'rejected';

export interface ScormCompletionDiagnostic {
  status: ScormCompletionDiagnosticStatus;
  code: ScormCompletionDiagnosticCode;
  reasons: string[];
  can_finalize: boolean;
  explicit_completion: boolean;
  explicit_failure: boolean;
  mastery_score: number | null;
  score_pct: number | null;
  progresso_pct: number;
  inferred_progress_pct: number | null;
  location: string | null;
  reached_final_location: boolean;
  final_commit_observed: boolean;
  has_runtime_evidence: boolean;
  commit_event: string | null;
}

export function normalizeMatriculaStatus(status: Nullable<string>) {
  return String(status ?? '')
    .trim()
    .toUpperCase();
}

export function mergeMonotonicMatriculaStatus(
  current: Nullable<string>,
  desired: Nullable<string>,
) {
  const currentStatus = normalizeMatriculaStatus(current);
  const desiredStatus = normalizeMatriculaStatus(desired);

  if (currentStatus === 'CONCLUIDO') return 'CONCLUIDO';
  if (currentStatus === 'CANCELADO') return 'CANCELADO';
  if (currentStatus === 'REPROVADO' && desiredStatus !== 'CONCLUIDO') return 'REPROVADO';
  if (!desiredStatus) return currentStatus || 'NAO_INICIADO';
  if (!currentStatus) return desiredStatus;
  if (currentStatus === 'EM_ANDAMENTO' && desiredStatus === 'NAO_INICIADO') return 'EM_ANDAMENTO';
  return desiredStatus;
}

export function mergeMonotonicNumber(current: Nullable<number>, incoming: Nullable<number>) {
  const currentNumber = current == null ? null : Number(current);
  const incomingNumber = incoming == null ? null : Number(incoming);

  if (!Number.isFinite(incomingNumber)) {
    return Number.isFinite(currentNumber) ? currentNumber! : null;
  }
  if (!Number.isFinite(currentNumber)) return incomingNumber!;
  return Math.max(currentNumber!, incomingNumber!);
}

function normalizeScormToken(value: Nullable<string>) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function scormStatusIndicatesCompletion(params: {
  lessonStatus?: Nullable<string>;
  completionStatus?: Nullable<string>;
  successStatus?: Nullable<string>;
}) {
  const lessonStatus = normalizeScormToken(params.lessonStatus);
  const completionStatus = normalizeScormToken(params.completionStatus);
  const successStatus = normalizeScormToken(params.successStatus);

  if (lessonStatus === 'passed' || lessonStatus === 'completed') return true;
  return (
    completionStatus === 'completed' &&
    (!successStatus || successStatus === 'passed' || successStatus === 'unknown')
  );
}

export function scormStatusIndicatesFailure(params: {
  lessonStatus?: Nullable<string>;
  successStatus?: Nullable<string>;
}) {
  const lessonStatus = normalizeScormToken(params.lessonStatus);
  const successStatus = normalizeScormToken(params.successStatus);
  return lessonStatus === 'failed' || successStatus === 'failed';
}

export function parseScormLocationMarker(
  location: unknown,
): { current: number; total: number | null } | null {
  if (typeof location !== 'string' || !location.trim()) return null;

  const trimmed = location.trim();
  let match = trimmed.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    match = trimmed.match(/(\d+)\s*of\s*(\d+)/i);
  }
  if (match) {
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0 || current < 0) {
      return null;
    }

    return { current, total };
  }

  const single = Number(trimmed);
  if (Number.isFinite(single) && single > 0) {
    return { current: single, total: null };
  }

  return null;
}

export function parseScormLocationPair(
  location: unknown,
): { current: number; total: number } | null {
  const marker = parseScormLocationMarker(location);
  if (!marker || marker.total == null) return null;
  return { current: marker.current, total: marker.total };
}

export function clampPct(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function inferScormProgressPct(cmiJson: Nullable<string>): number | null {
  if (!cmiJson) return null;

  try {
    const parsed = JSON.parse(cmiJson) as Record<string, unknown>;
    const progressMeasure = Number(parsed['cmi.progress_measure']);
    if (Number.isFinite(progressMeasure) && progressMeasure >= 0) {
      return clampPct(progressMeasure * 100);
    }

    const location = parseScormLocationPair(
      parsed['cmi.location'] ?? parsed['cmi.core.lesson_location'],
    );
    if (location && location.total > 0) {
      return clampPct((location.current / location.total) * 100);
    }
  } catch {
    return null;
  }

  return null;
}

export function extractScormLocationFromCmiJson(cmiJson: Nullable<string>) {
  if (!cmiJson) return null;

  try {
    const parsed = JSON.parse(cmiJson) as Record<string, unknown>;
    return parseScormLocationMarker(parsed['cmi.location'] ?? parsed['cmi.core.lesson_location']);
  } catch {
    return null;
  }
}

/** Aceita o fallback SCORM 1.2 apenas com as evidências finais emitidas pelo wrapper. */
export function isTrustedScorm12Finish(data: {
  lesson_status?: Nullable<string>;
  commit_event?: Nullable<string>;
  completion_candidate?: Nullable<boolean>;
  completion_observed_at?: Nullable<string>;
  cmi_json?: Nullable<string>;
}) {
  const location = extractScormLocationFromCmiJson(data.cmi_json);
  return (
    normalizeScormToken(data.lesson_status) === 'incomplete' &&
    normalizeCommitEvent(data.commit_event) === 'SCORM_FINISH' &&
    data.completion_candidate === true &&
    Number.isFinite(Date.parse(String(data.completion_observed_at ?? ''))) &&
    location?.total != null &&
    location.current >= location.total
  );
}

type ScormSnapshotInput = {
  lesson_status?: Nullable<string>;
  completion_status?: Nullable<string>;
  success_status?: Nullable<string>;
  suspend_data?: Nullable<string>;
  cmi_json?: Nullable<string>;
  progresso_pct?: Nullable<number>;
};

type ScormSnapshot = {
  completed: boolean;
  failed: boolean;
  locationCurrent: number;
  progressPct: number;
  payloadBytes: number;
};

function buildScormSnapshot(input: Nullable<ScormSnapshotInput>): ScormSnapshot {
  const location = extractScormLocationFromCmiJson(input?.cmi_json);
  const progressPct = Number(input?.progresso_pct);

  return {
    completed: scormStatusIndicatesCompletion({
      lessonStatus: input?.lesson_status,
      completionStatus: input?.completion_status,
      successStatus: input?.success_status,
    }),
    failed: scormStatusIndicatesFailure({
      lessonStatus: input?.lesson_status,
      successStatus: input?.success_status,
    }),
    locationCurrent: location?.current ?? 0,
    progressPct: Number.isFinite(progressPct) ? progressPct : 0,
    payloadBytes:
      (typeof input?.cmi_json === 'string' ? input.cmi_json.length : 0) +
      (typeof input?.suspend_data === 'string' ? input.suspend_data.length : 0),
  };
}

export function shouldPreferIncomingScormState(params: {
  current?: Nullable<ScormSnapshotInput>;
  incoming?: Nullable<ScormSnapshotInput>;
}) {
  const current = buildScormSnapshot(params.current);
  const incoming = buildScormSnapshot(params.incoming);

  if (!params.current) return true;
  if (incoming.completed !== current.completed) return incoming.completed;
  if (incoming.locationCurrent !== current.locationCurrent) {
    return incoming.locationCurrent > current.locationCurrent;
  }
  if (incoming.progressPct !== current.progressPct) {
    return incoming.progressPct > current.progressPct;
  }
  if (incoming.payloadBytes !== current.payloadBytes) {
    return incoming.payloadBytes > current.payloadBytes;
  }
  if (incoming.failed !== current.failed) {
    return incoming.failed && !current.completed;
  }
  return true;
}

export function preferScormValue<T>(
  current: Nullable<T>,
  incoming: Nullable<T>,
  preferIncoming: boolean,
) {
  if (preferIncoming) return incoming ?? current ?? null;
  return current ?? incoming ?? null;
}

function normalizeScormText(value: Nullable<string>) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseScormCmiJson(cmiJson: Nullable<string>) {
  if (!cmiJson) return null;

  try {
    const parsed = JSON.parse(cmiJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readScormLocationValue(cmi: Record<string, unknown> | null) {
  if (!cmi) return null;

  const direct = typeof cmi['cmi.location'] === 'string' ? cmi['cmi.location'] : null;
  if (direct?.trim()) return direct.trim();

  const legacy =
    typeof cmi['cmi.core.lesson_location'] === 'string' ? cmi['cmi.core.lesson_location'] : null;
  return legacy?.trim() ? legacy.trim() : null;
}

function writeScormLocationValue(
  cmi: Record<string, unknown>,
  location: string,
  options?: { syncLegacy?: boolean },
) {
  cmi['cmi.location'] = location;
  if (options?.syncLegacy !== false) {
    cmi['cmi.core.lesson_location'] = location;
  }
}

function isRegressiveScormLocation(
  current: { current: number; total: number | null } | null,
  incoming: { current: number; total: number | null } | null,
) {
  if (!current || current.current <= 1 || !incoming) return false;
  if (incoming.current >= current.current) return false;

  if (current.total != null && incoming.total != null) {
    return incoming.total === current.total;
  }

  if (incoming.total != null) {
    return current.current <= incoming.total;
  }

  return true;
}

export function mergeScormRuntimeState(params: {
  currentCmiJson?: Nullable<string>;
  incomingCmiJson?: Nullable<string>;
  currentSuspendData?: Nullable<string>;
  incomingSuspendData?: Nullable<string>;
}) {
  const currentCmi = parseScormCmiJson(params.currentCmiJson);
  const incomingCmi = parseScormCmiJson(params.incomingCmiJson);
  const mergedCmi = incomingCmi ? { ...incomingCmi } : currentCmi ? { ...currentCmi } : null;

  const currentLocationValue = readScormLocationValue(currentCmi);
  const incomingLocationValue = readScormLocationValue(incomingCmi);
  const currentLocation = parseScormLocationMarker(currentLocationValue);
  const incomingLocation = parseScormLocationMarker(incomingLocationValue);

  const blockedLocationRegression = isRegressiveScormLocation(currentLocation, incomingLocation);
  const preservedLocationFromCurrent =
    Boolean(currentLocationValue) && (!incomingLocationValue || blockedLocationRegression);
  const mergedLocationValue = preservedLocationFromCurrent
    ? currentLocationValue
    : (incomingLocationValue ?? currentLocationValue);

  const currentSuspendData = normalizeScormText(params.currentSuspendData);
  const incomingSuspendData = normalizeScormText(params.incomingSuspendData);
  const blockedEmptySuspendData = Boolean(currentSuspendData) && !incomingSuspendData;
  // Mirrors the wrapper-level exemption in lms-assets.ts: a shorter write is
  // only blocked when the current value is NOT already crowding the SCORM
  // 1.2 practical suspend_data ceiling (~4096 bytes). A write shrinking a
  // near-limit value is treated as intentional finalization, not the
  // accidental mid-session reset this guard defends against.
  const blockedShorterSuspendData = Boolean(
    currentSuspendData &&
      incomingSuspendData &&
      incomingSuspendData.length < currentSuspendData.length &&
      currentSuspendData.length < SUSPEND_DATA_NEAR_LIMIT_THRESHOLD,
  );
  const mergedSuspendData: string | null = (() => {
    if (blockedEmptySuspendData || blockedShorterSuspendData) {
      return currentSuspendData ?? null;
    }
    return incomingSuspendData ?? currentSuspendData ?? null;
  })();

  if (mergedCmi && mergedLocationValue) {
    writeScormLocationValue(mergedCmi, mergedLocationValue);
  }
  if (mergedCmi && mergedSuspendData) {
    mergedCmi['cmi.suspend_data'] = mergedSuspendData;
  }

  return {
    cmiJson: mergedCmi
      ? JSON.stringify(mergedCmi)
      : (params.incomingCmiJson ?? params.currentCmiJson ?? null),
    suspendData: mergedSuspendData ?? null,
    location: parseScormLocationMarker(mergedLocationValue),
    decisions: {
      blockedLocationRegression,
      blockedEmptySuspendData,
      blockedShorterSuspendData,
      preservedLocationFromCurrent,
    },
  };
}

export function resolveScormScorePct(params: {
  scoreRaw?: Nullable<number>;
  scoreMax?: Nullable<number>;
  scoreScaled?: Nullable<number>;
}) {
  const scaled = params.scoreScaled == null ? null : Number(params.scoreScaled);
  if (scaled != null && Number.isFinite(scaled) && scaled >= 0) {
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

function normalizeCommitEvent(commitEvent: Nullable<string>) {
  const normalized = String(commitEvent ?? '')
    .trim()
    .toUpperCase();
  return normalized || null;
}

export function buildScormCompletionDiagnostic(params: {
  lessonStatus?: Nullable<string>;
  completionStatus?: Nullable<string>;
  successStatus?: Nullable<string>;
  scoreRaw?: Nullable<number>;
  scoreMax?: Nullable<number>;
  scoreScaled?: Nullable<number>;
  masteryScore?: Nullable<number>;
  progressoPct?: Nullable<number>;
  cmiJson?: Nullable<string>;
  suspendData?: Nullable<string>;
  sessionTime?: Nullable<string>;
  totalTime?: Nullable<string>;
  commitEvent?: Nullable<string>;
  completionCandidate?: Nullable<boolean>;
  completionObservedAt?: Nullable<string>;
  commit?: {
    commit_event?: Nullable<string>;
    completion_candidate?: Nullable<boolean>;
    completion_observed_at?: Nullable<string>;
  };
}): ScormCompletionDiagnostic {
  const locationMarker = extractScormLocationFromCmiJson(params.cmiJson);
  const inferredProgressPct = inferScormProgressPct(params.cmiJson);
  const progressoPct = Number(params.progressoPct);
  const scorePct = resolveScormScorePct({
    scoreRaw: params.scoreRaw,
    scoreMax: params.scoreMax,
    scoreScaled: params.scoreScaled,
  });
  const masteryScore = params.masteryScore == null ? null : Number(params.masteryScore);
  const hasMasteryScore = Number.isFinite(masteryScore) && Number(masteryScore) > 0;
  const masteryMet =
    !hasMasteryScore ||
    (scorePct != null && Number.isFinite(scorePct) && scorePct >= Number(masteryScore));
  const explicitCompletion = scormStatusIndicatesCompletion({
    lessonStatus: params.lessonStatus,
    completionStatus: params.completionStatus,
    successStatus: params.successStatus,
  });
  const explicitFailure = scormStatusIndicatesFailure({
    lessonStatus: params.lessonStatus,
    successStatus: params.successStatus,
  });
  const reachedFinalLocation =
    locationMarker != null && locationMarker.total != null && locationMarker.total > 0
      ? locationMarker.current >= locationMarker.total
      : false;
  const commitEvent = params.commitEvent ?? params.commit?.commit_event;
  const finalCommitObserved = [
    'SCORM_FINISH',
    'SCORM_COMPLETION_CANDIDATE',
    'SCORM_BEFORE_UNLOAD_COMMIT',
    'SCORM_VISIBILITY_COMMIT',
  ].includes(normalizeCommitEvent(commitEvent) ?? '');
  const progressSignal = Math.max(
    Number.isFinite(progressoPct) ? progressoPct : 0,
    inferredProgressPct ?? 0,
  );
  const nearFinalProgress = progressSignal >= 99;
  const hasRuntimeEvidence =
    Boolean(locationMarker) ||
    Boolean(String(params.suspendData ?? '').trim()) ||
    Boolean(String(params.sessionTime ?? '').trim()) ||
    Boolean(String(params.totalTime ?? '').trim()) ||
    scorePct != null;
  const candidate =
    !explicitCompletion &&
    !explicitFailure &&
    masteryMet &&
    hasRuntimeEvidence &&
    (reachedFinalLocation || nearFinalProgress);
  const trustedScorm12Finish =
    candidate &&
    isTrustedScorm12Finish({
      lesson_status: params.lessonStatus,
      commit_event: commitEvent,
      completion_candidate: params.completionCandidate ?? params.commit?.completion_candidate,
      completion_observed_at: params.completionObservedAt ?? params.commit?.completion_observed_at,
      cmi_json: params.cmiJson,
    });
  const highScoreWithoutCompletion =
    !explicitCompletion &&
    !explicitFailure &&
    scorePct != null &&
    scorePct >= Math.max(hasMasteryScore ? Number(masteryScore) : 0, 95);
  const location =
    locationMarker == null
      ? null
      : locationMarker.total == null
        ? String(locationMarker.current)
        : `${locationMarker.current}/${locationMarker.total}`;

  const reasons: string[] = [];
  if (explicitCompletion) reasons.push('explicit-scorm-status');
  if (explicitFailure) reasons.push('explicit-scorm-failure');
  if (hasMasteryScore) reasons.push(masteryMet ? 'mastery-met' : 'mastery-missing');
  if (reachedFinalLocation) reasons.push('final-location-reached');
  if (nearFinalProgress) reasons.push('progress-near-100');
  if (highScoreWithoutCompletion) reasons.push('high-score-without-completion-status');
  if (finalCommitObserved) reasons.push('final-commit-observed');
  if (trustedScorm12Finish) reasons.push('trusted-scorm-1.2-finish');
  if (hasRuntimeEvidence) reasons.push('runtime-evidence-present');

  if (explicitCompletion || trustedScorm12Finish) {
    return {
      status: 'accepted',
      code: 'SCORM_COMPLETION_ACCEPTED',
      reasons,
      can_finalize: false,
      explicit_completion: explicitCompletion,
      explicit_failure: false,
      mastery_score: hasMasteryScore ? Number(masteryScore) : null,
      score_pct: scorePct,
      progresso_pct: progressSignal,
      inferred_progress_pct: inferredProgressPct,
      location,
      reached_final_location: reachedFinalLocation,
      final_commit_observed: finalCommitObserved,
      has_runtime_evidence: hasRuntimeEvidence,
      commit_event: normalizeCommitEvent(commitEvent),
    };
  }

  if (explicitFailure) {
    return {
      status: 'rejected',
      code: 'SCORM_COMPLETION_REJECTED',
      reasons,
      can_finalize: false,
      explicit_completion: false,
      explicit_failure: true,
      mastery_score: hasMasteryScore ? Number(masteryScore) : null,
      score_pct: scorePct,
      progresso_pct: progressSignal,
      inferred_progress_pct: inferredProgressPct,
      location,
      reached_final_location: reachedFinalLocation,
      final_commit_observed: finalCommitObserved,
      has_runtime_evidence: hasRuntimeEvidence,
      commit_event: normalizeCommitEvent(commitEvent),
    };
  }

  if (candidate) {
    return {
      status: 'candidate',
      code: finalCommitObserved ? 'SCORM_COMPLETION_CANDIDATE' : 'SCORM_STATUS_INCONSISTENT',
      reasons,
      can_finalize: true,
      explicit_completion: false,
      explicit_failure: false,
      mastery_score: hasMasteryScore ? Number(masteryScore) : null,
      score_pct: scorePct,
      progresso_pct: progressSignal,
      inferred_progress_pct: inferredProgressPct,
      location,
      reached_final_location: reachedFinalLocation,
      final_commit_observed: finalCommitObserved,
      has_runtime_evidence: hasRuntimeEvidence,
      commit_event: normalizeCommitEvent(commitEvent),
    };
  }

  if (finalCommitObserved || highScoreWithoutCompletion) {
    return {
      status: 'none',
      code: finalCommitObserved ? 'SCORM_FINAL_COMMIT_MISSING' : 'SCORM_STATUS_INCONSISTENT',
      reasons,
      can_finalize: false,
      explicit_completion: false,
      explicit_failure: false,
      mastery_score: hasMasteryScore ? Number(masteryScore) : null,
      score_pct: scorePct,
      progresso_pct: progressSignal,
      inferred_progress_pct: inferredProgressPct,
      location,
      reached_final_location: reachedFinalLocation,
      final_commit_observed: finalCommitObserved,
      has_runtime_evidence: hasRuntimeEvidence,
      commit_event: normalizeCommitEvent(params.commitEvent),
    };
  }

  return {
    status: 'none',
    code: 'SCORM_NONE',
    reasons,
    can_finalize: false,
    explicit_completion: false,
    explicit_failure: false,
    mastery_score: hasMasteryScore ? Number(masteryScore) : null,
    score_pct: scorePct,
    progresso_pct: progressSignal,
    inferred_progress_pct: inferredProgressPct,
    location,
    reached_final_location: reachedFinalLocation,
    final_commit_observed: finalCommitObserved,
    has_runtime_evidence: hasRuntimeEvidence,
    commit_event: normalizeCommitEvent(commitEvent),
  };
}


export function buildMatriculaCompletionDiagnostic(params: {
  matriculaStatus?: Nullable<string>;
  progressoPct?: Nullable<number>;
  masteryScore?: Nullable<number>;
  scorm?: {
    lesson_status?: Nullable<string>;
    completion_status?: Nullable<string>;
    success_status?: Nullable<string>;
    score_raw?: Nullable<number>;
    score_max?: Nullable<number>;
    score_scaled?: Nullable<number>;
    suspend_data?: Nullable<string>;
    session_time?: Nullable<string>;
    total_time?: Nullable<string>;
    cmi_json?: Nullable<string>;
  } | null;
  commit?: {
    commit_event?: Nullable<string>;
    completion_candidate?: Nullable<boolean>;
    completion_observed_at?: Nullable<string>;
  };
}) {
  const base = buildScormCompletionDiagnostic({
    lessonStatus: params.scorm?.lesson_status,
    completionStatus: params.scorm?.completion_status,
    successStatus: params.scorm?.success_status,
    scoreRaw: params.scorm?.score_raw,
    scoreMax: params.scorm?.score_max,
    scoreScaled: params.scorm?.score_scaled,
    masteryScore: params.masteryScore,
    progressoPct: params.progressoPct,
    cmiJson: params.scorm?.cmi_json,
    suspendData: params.scorm?.suspend_data,
    sessionTime: params.scorm?.session_time,
    totalTime: params.scorm?.total_time,
    commit: params.commit,
  });

  return {
    ...base,
    matricula_status: params.matriculaStatus ?? null,
    pending_server_confirmation:
      base.status === 'candidate' &&
      normalizeMatriculaStatus(params.matriculaStatus) !== 'CONCLUIDO',
  };
}

export function requiresExplicitScormCompletion(
  tipoConteudo: Nullable<string>,
  completionDiagnostic: { explicit_completion?: boolean },
): boolean {
  const isScorm = String(tipoConteudo ?? 'scorm').toLowerCase() === 'scorm';
  return isScorm && completionDiagnostic.explicit_completion !== true;
}

// ── Progresso efetivo (99/100) ──────────────────────────────────────────────
//
// Regra: apenas matrícula canonicamente CONCLUIDA reporta 100%. Qualquer outro
// status — inclusive progresso bruto 100 sem conclusão aceita (SCORM final
// commit ausente, xAPI sem completion aceito etc.) — é limitado a 99% para
// impedir qualificação/certificado/validade prematuros. Ver PENDING_FINAL_STEP.

export type LmsCompletionState =
  'COMPLETED' | 'PENDING_FINAL_STEP' | 'IN_PROGRESS' | 'NOT_STARTED' | 'FAILED' | 'CANCELLED';

export type LmsCompletionReasonCode =
  | 'MATRICULA_CONCLUIDA'
  | 'MATRICULA_CANCELADA'
  | 'MATRICULA_REPROVADA'
  | 'MATRICULA_NAO_INICIADA'
  | 'MATRICULA_EM_ANDAMENTO'
  | 'PROGRESS_100_WITHOUT_ACCEPTED_COMPLETION';

export interface LmsEffectiveProgressResult {
  progresso_bruto: number;
  progresso_efetivo: number;
  completion_state: LmsCompletionState;
  completion_reason_code: LmsCompletionReasonCode;
}

export function resolveLmsEffectiveProgress(params: {
  status: Nullable<string>;
  progressoBruto: Nullable<number>;
}): LmsEffectiveProgressResult {
  const status = normalizeMatriculaStatus(params.status);
  const rawInput = Number(params.progressoBruto);
  const progressoBruto = Number.isFinite(rawInput) ? clampPct(rawInput) : 0;

  if (status === 'CONCLUIDO') {
    return {
      progresso_bruto: progressoBruto,
      progresso_efetivo: 100,
      completion_state: 'COMPLETED',
      completion_reason_code: 'MATRICULA_CONCLUIDA',
    };
  }

  if (status === 'CANCELADO') {
    return {
      progresso_bruto: progressoBruto,
      progresso_efetivo: Math.min(progressoBruto, 99),
      completion_state: 'CANCELLED',
      completion_reason_code: 'MATRICULA_CANCELADA',
    };
  }

  if (status === 'REPROVADO') {
    return {
      progresso_bruto: progressoBruto,
      progresso_efetivo: Math.min(progressoBruto, 99),
      completion_state: 'FAILED',
      completion_reason_code: 'MATRICULA_REPROVADA',
    };
  }

  if (status === 'NAO_INICIADO') {
    return {
      progresso_bruto: progressoBruto,
      progresso_efetivo: 0,
      completion_state: 'NOT_STARTED',
      completion_reason_code: 'MATRICULA_NAO_INICIADA',
    };
  }

  // EM_ANDAMENTO (e qualquer status legado não canônico é tratado como em andamento).
  if (progressoBruto >= 100) {
    return {
      progresso_bruto: progressoBruto,
      progresso_efetivo: 99,
      completion_state: 'PENDING_FINAL_STEP',
      completion_reason_code: 'PROGRESS_100_WITHOUT_ACCEPTED_COMPLETION',
    };
  }

  return {
    progresso_bruto: progressoBruto,
    progresso_efetivo: Math.min(progressoBruto, 99),
    completion_state: 'IN_PROGRESS',
    completion_reason_code: 'MATRICULA_EM_ANDAMENTO',
  };
}
