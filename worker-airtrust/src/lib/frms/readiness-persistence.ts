import {
  READINESS_PROTOCOL,
  deriveReadinessAssessment,
  normalizeReadinessTrials,
  summarizeReadinessTrials,
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
};

export type PersistReadinessResult = {
  assessmentId: string;
  classification: 'baseline_building' | 'preserved' | 'attention' | 'operational_review';
  baselineSessions: number;
  baselineReady: boolean;
  warningSignals: string[];
  criticalSignals: string[];
};

export async function countReadinessBaselineSessions(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  excludeReferenceDate?: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM frms_readiness_assessment
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND deleted_at IS NULL
          AND (? IS NULL OR reference_date <> ?)`,
    )
    .bind(empresaId, funcionarioId, excludeReferenceDate || null, excludeReferenceDate || null)
    .first<{ total: number }>();

  return Number(row?.total || 0);
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

  const baselineSessions = await countReadinessBaselineSessions(
    db,
    input.empresaId,
    input.funcionarioId,
    input.referenceDate,
  );
  const summary = summarizeReadinessTrials(normalizedTrials, input.durationMs);
  const assessment = deriveReadinessAssessment({
    kssScore: input.kssScore,
    sleepHours: input.sleepHours,
    summary,
    baselineSessions,
  });
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
          baseline_sessions, baseline_ready, kss_score, sleep_hours,
          duration_ms, valid_trials, response_trials, lapse_count, lapse_rate,
          false_start_count, missed_count, median_rt_ms, mean_rt_ms, p90_rt_ms,
          sd_rt_ms, response_speed, warning_signals_json, critical_signals_json,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        assessmentId,
        input.empresaId,
        input.funcionarioId,
        input.checkinId,
        input.referenceDate,
        READINESS_PROTOCOL.version,
        READINESS_PROTOCOL.scoringVersion,
        assessment.classification,
        assessment.baselineSessions,
        assessment.baselineReady ? 1 : 0,
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
    warningSignals: assessment.warningSignals,
    criticalSignals: assessment.criticalSignals,
  };
}
