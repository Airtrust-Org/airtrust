import {
  READINESS_PROTOCOL,
  deriveReadinessAssessment,
  isReadinessProtocolVersion,
  normalizeReadinessTrials,
  summarizeReadinessTrials,
  type ReadinessProtocolVersion,
  type ReadinessTrial,
} from './readiness';

export type PersistReadinessInput = {
  empresaId: number;
  funcionarioId: number;
  userId: number | null;
  checkinId: string | null;
  referenceDate: string;
  kssScore: number;
  sleepHours: number;
  durationMs: number;
  trials: ReadinessTrial[];
  /** Defaults to the active protocol. Baseline is isolated per protocol version. */
  protocolVersion?: string;
};

export type ReadinessBaselineSnapshot = {
  sessions: number;
  medianRtMs: number | null;
  lapseRate: number | null;
};

export type PersistReadinessResult = {
  assessmentId: string;
  classification: 'baseline_building' | 'preserved' | 'attention' | 'operational_review';
  baselineSessions: number;
  baselineReady: boolean;
  baselineMedianRtMs: number | null;
  baselineLapseRate: number | null;
  medianRtDeltaPct: number | null;
  lapseRateDelta: number | null;
  warningSignals: string[];
  criticalSignals: string[];
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export async function countReadinessBaselineSessions(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  protocolVersion: string,
  beforeReferenceDate?: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM frms_readiness_assessment
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND protocol_version = ?
          AND deleted_at IS NULL
          AND response_trials > 0
          AND (? IS NULL OR reference_date < ?)`,
    )
    .bind(
      empresaId,
      funcionarioId,
      protocolVersion,
      beforeReferenceDate || null,
      beforeReferenceDate || null,
    )
    .first<{ total: number }>();

  return Number(row?.total || 0);
}

export async function getReadinessBaselineSnapshot(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  protocolVersion: string,
  beforeReferenceDate?: string,
): Promise<ReadinessBaselineSnapshot> {
  const sessions = await countReadinessBaselineSessions(
    db,
    empresaId,
    funcionarioId,
    protocolVersion,
    beforeReferenceDate,
  );
  const result = await db
    .prepare(
      `SELECT median_rt_ms, lapse_rate
         FROM frms_readiness_assessment
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND protocol_version = ?
          AND deleted_at IS NULL
          AND response_trials > 0
          AND (? IS NULL OR reference_date < ?)
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .bind(
      empresaId,
      funcionarioId,
      protocolVersion,
      beforeReferenceDate || null,
      beforeReferenceDate || null,
      READINESS_PROTOCOL.minimumBaselineSessions,
    )
    .all<{ median_rt_ms: number | null; lapse_rate: number | null }>();

  const rows = result.results || [];
  const medianRtMs = median(
    rows
      .map((row) => Number(row.median_rt_ms))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  const lapseRate = median(
    rows
      .map((row) => Number(row.lapse_rate))
      .filter((value) => Number.isFinite(value) && value >= 0),
  );

  return { sessions, medianRtMs, lapseRate };
}

export async function persistReadinessAssessment(
  db: D1Database,
  input: PersistReadinessInput,
): Promise<PersistReadinessResult> {
  if (!Number.isInteger(input.empresaId) || input.empresaId <= 0) throw new Error('invalid_empresa_id');
  if (!Number.isInteger(input.funcionarioId) || input.funcionarioId <= 0) throw new Error('invalid_funcionario_id');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate)) throw new Error('invalid_reference_date');
  if (!Number.isFinite(input.kssScore) || input.kssScore < 1 || input.kssScore > 9) throw new Error('invalid_kss');
  if (!Number.isFinite(input.sleepHours) || input.sleepHours < 0 || input.sleepHours > 24) throw new Error('invalid_sleep_hours');
  if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) throw new Error('invalid_duration');
  if (!Array.isArray(input.trials) || input.trials.length === 0) throw new Error('readiness_trials_required');

  const protocolVersion: ReadinessProtocolVersion = isReadinessProtocolVersion(input.protocolVersion)
    ? input.protocolVersion
    : READINESS_PROTOCOL.version;

  const normalizedTrials = normalizeReadinessTrials(input.trials, input.durationMs);

  const existing = await db
    .prepare(
      `SELECT id
         FROM frms_readiness_assessment
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND reference_date = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(input.empresaId, input.funcionarioId, input.referenceDate)
    .first<{ id: string }>();

  const baseline = await getReadinessBaselineSnapshot(
    db,
    input.empresaId,
    input.funcionarioId,
    protocolVersion,
    input.referenceDate,
  );
  const summary = summarizeReadinessTrials(normalizedTrials, input.durationMs);
  const assessment = deriveReadinessAssessment({
    kssScore: input.kssScore,
    sleepHours: input.sleepHours,
    summary,
    baselineSessions: baseline.sessions,
  });
  const medianRtDeltaPct =
    baseline.medianRtMs != null && baseline.medianRtMs > 0 && summary.medianRtMs != null
      ? ((summary.medianRtMs - baseline.medianRtMs) / baseline.medianRtMs) * 100
      : null;
  const lapseRateDelta =
    baseline.lapseRate != null ? summary.lapseRate - baseline.lapseRate : null;
  const assessmentId = crypto.randomUUID();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const statements: D1PreparedStatement[] = [];

  if (existing?.id) {
    statements.push(
      db
        .prepare(
          `UPDATE frms_readiness_assessment
              SET deleted_at = ?, updated_at = ?
            WHERE id = ? AND empresa_id = ? AND funcionario_id = ? AND deleted_at IS NULL`,
        )
        .bind(now, now, existing.id, input.empresaId, input.funcionarioId),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO frms_readiness_assessment (
          id, empresa_id, funcionario_id, checkin_id, reference_date,
          protocol_version, scoring_version, classification,
          baseline_sessions, baseline_ready, baseline_median_rt_ms, baseline_lapse_rate,
          median_rt_delta_pct, lapse_rate_delta, kss_score, sleep_hours,
          duration_ms, valid_trials, response_trials, lapse_count, lapse_rate,
          false_start_count, missed_count, median_rt_ms, mean_rt_ms, p90_rt_ms,
          sd_rt_ms, response_speed, warning_signals_json, critical_signals_json,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        assessmentId,
        input.empresaId,
        input.funcionarioId,
        input.checkinId,
        input.referenceDate,
        protocolVersion,
        READINESS_PROTOCOL.scoringVersion,
        assessment.classification,
        assessment.baselineSessions,
        assessment.baselineReady ? 1 : 0,
        baseline.medianRtMs,
        baseline.lapseRate,
        medianRtDeltaPct,
        lapseRateDelta,
        input.kssScore,
        input.sleepHours,
        summary.durationMs,
        summary.validTrials,
        summary.responseTrials,
        summary.lapseCount,
        summary.lapseRate,
        summary.falseStartCount,
        summary.missedCount,
        summary.medianRtMs,
        summary.meanRtMs,
        summary.p90RtMs,
        summary.sdRtMs,
        summary.responseSpeed,
        JSON.stringify(assessment.warningSignals),
        JSON.stringify(assessment.criticalSignals),
        input.userId,
        now,
        now,
      ),
  );

  for (const trial of normalizedTrials) {
    statements.push(
      db
        .prepare(
          `INSERT INTO frms_readiness_vigilance_trial (
            id, assessment_id, empresa_id, funcionario_id, sequence,
            scheduled_at_ms, stimulus_at_ms, response_at_ms, reaction_time_ms,
            outcome, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          assessmentId,
          input.empresaId,
          input.funcionarioId,
          trial.sequence,
          trial.scheduledAtMs,
          trial.stimulusAtMs,
          trial.responseAtMs,
          trial.reactionTimeMs,
          trial.outcome,
          now,
        ),
    );
  }

  await db.batch(statements);

  return {
    assessmentId,
    classification: assessment.classification,
    baselineSessions: assessment.baselineSessions,
    baselineReady: assessment.baselineReady,
    baselineMedianRtMs: baseline.medianRtMs,
    baselineLapseRate: baseline.lapseRate,
    medianRtDeltaPct,
    lapseRateDelta,
    warningSignals: assessment.warningSignals,
    criticalSignals: assessment.criticalSignals,
  };
}
