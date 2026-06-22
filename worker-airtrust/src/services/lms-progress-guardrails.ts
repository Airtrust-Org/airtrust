type Nullable<T> = T | null | undefined;

export function normalizeMatriculaStatus(status: Nullable<string>) {
  return String(status ?? '')
    .trim()
    .toUpperCase();
}

export function mergeMonotonicMatriculaStatus(current: Nullable<string>, desired: Nullable<string>) {
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
  const currentNumber =
    current == null || current === '' ? null : Number(current);
  const incomingNumber =
    incoming == null || incoming === '' ? null : Number(incoming);

  if (!Number.isFinite(incomingNumber)) {
    return Number.isFinite(currentNumber) ? currentNumber : null;
  }
  if (!Number.isFinite(currentNumber)) return incomingNumber;
  return Math.max(currentNumber, incomingNumber);
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
  return completionStatus === 'completed' && (!successStatus || successStatus === 'passed' || successStatus === 'unknown');
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

export function parseScormLocationPair(location: unknown): { current: number; total: number } | null {
  const marker = parseScormLocationMarker(location);
  if (!marker || marker.total == null) return null;
  return { current: marker.current, total: marker.total };
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

export function preferScormValue<T>(current: Nullable<T>, incoming: Nullable<T>, preferIncoming: boolean) {
  if (preferIncoming) return incoming ?? current ?? null;
  return current ?? incoming ?? null;
}
