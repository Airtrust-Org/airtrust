/**
 * Generates frms_helicopter_offshore_baseline_v1.sql directly from the real
 * TS source constants (LIMITES_DEFAULT, LEGACY_FADIGA_BUSINESS_POLICY,
 * LEGACY_FORTNIGHT_POLICY) — zero manual transcription of the 120 values.
 *
 * Run with: npx tsx scripts/frms-seeds/generate-frms-helicopter-offshore-baseline-v1.ts
 * (from repo root). Writes the seed file; does not touch any database.
 *
 * The baseline must stay self-contained: it must NOT read from
 * frms_configuracao_limites or copy from any other revision (that was the
 * bug this generator fixes — see FRMS_PARAMETER_BASELINE_AUDIT.md).
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITES_DEFAULT } from '../../worker-airtrust/src/lib/frms/types';
import { LEGACY_FADIGA_BUSINESS_POLICY } from '../../worker-airtrust/src/lib/frms/fadiga-score';
import { LEGACY_FORTNIGHT_POLICY } from '../../worker-airtrust/src/lib/frms/fortnight-indicator';

const REVISION_ID = 'frms-helicopter-offshore-baseline-v1';

// Mirrors the governed-key mapping already embedded (reviewed, applied) in
// 0464_frms_parameter_governance_recalc.sql's own bootstrap INSERT block —
// same field->key pairing, not re-derived or guessed.
const FADIGA_KEY_MAP: Record<keyof typeof LEGACY_FADIGA_BUSINESS_POLICY, string> = {
  medicationBonus: 'FATIGUE_MEDICATION_BONUS',
  alcoholBonus: 'FATIGUE_ALCOHOL_BONUS',
  woclStartMinute: 'WOCL_START_MINUTE',
  woclEndMinute: 'WOCL_END_MINUTE',
  woclCenterPenalty: 'WOCL_CENTER_PENALTY',
  woclEdgePenalty: 'WOCL_EDGE_PENALTY',
  kssNormLe2: 'KSS_NORM_LE_2',
  kssNormLe4: 'KSS_NORM_LE_4',
  kssNormLe6: 'KSS_NORM_LE_6',
  kssNormEq7: 'KSS_NORM_EQ_7',
  kssNormEq8: 'KSS_NORM_EQ_8',
  kssNormGe9: 'KSS_NORM_GE_9',
  sleepDurationMissingNorm: 'SLEEP_DURATION_MISSING_NORM',
  sleepDurationGe8Norm: 'SLEEP_DURATION_GE_8_NORM',
  sleepDurationGe7Norm: 'SLEEP_DURATION_GE_7_NORM',
  sleepDurationGe6Norm: 'SLEEP_DURATION_GE_6_NORM',
  sleepDurationGe5Norm: 'SLEEP_DURATION_GE_5_NORM',
  sleepDurationGe4Norm: 'SLEEP_DURATION_GE_4_NORM',
  sleepDurationLt4Norm: 'SLEEP_DURATION_LT_4_NORM',
  sleepQualityMissingNorm: 'SLEEP_QUALITY_MISSING_NORM',
  sleepQualityGe5Norm: 'SLEEP_QUALITY_GE_5_NORM',
  sleepQualityEq4Norm: 'SLEEP_QUALITY_EQ_4_NORM',
  sleepQualityEq3Norm: 'SLEEP_QUALITY_EQ_3_NORM',
  sleepQualityEq2Norm: 'SLEEP_QUALITY_EQ_2_NORM',
  sleepQualityLt2Norm: 'SLEEP_QUALITY_LT_2_NORM',
};

const FORTNIGHT_KEY_MAP: Record<keyof typeof LEGACY_FORTNIGHT_POLICY, string> = {
  consecutiveAttentionDays: 'FORTNIGHT_CONSECUTIVE_DAYS_ATTENTION',
  consecutiveCriticalDays: 'FORTNIGHT_CONSECUTIVE_DAYS_CRITICAL',
  lowSleepHours: 'FORTNIGHT_LOW_SLEEP_HOURS',
  highKss: 'KSS_HIGH_THRESHOLD',
  lowEffectivenessPct: 'FORTNIGHT_LOW_EFFECTIVENESS_PCT',
  daysWithoutDuty: 'FORTNIGHT_DAYS_WITHOUT_DUTY',
  longRestMinutes: 'FORTNIGHT_LONG_REST_MINUTES',
  shortAverageDutyMinutes: 'FORTNIGHT_SHORT_AVG_DUTY_MINUTES',
  shortRestMinutes: 'FORTNIGHT_SHORT_REST_MINUTES',
  earlyPresentation0600Minutes: 'FORTNIGHT_EARLY_0600_MINUTES',
  earlyPresentation0700Minutes: 'FORTNIGHT_EARLY_0700_MINUTES',
  recurringEarlyPresentations: 'FORTNIGHT_RECURRING_EARLY_PRESENTATIONS',
  rollingDutyPct: 'FORTNIGHT_ROLLING_DUTY_PCT',
  scoreAttention: 'FORTNIGHT_SCORE_ATTENTION',
  scoreCritical: 'FORTNIGHT_SCORE_CRITICAL',
  scoreLimitWeight: 'FORTNIGHT_SCORE_LIMIT_WEIGHT',
  trendIncreasingImpact: 'FORTNIGHT_TREND_INCREASING_IMPACT',
  trendReducingImpact: 'FORTNIGHT_TREND_REDUCING_IMPACT',
  impactDaysWithoutDuty: 'FORTNIGHT_IMPACT_DAYS_WITHOUT_DUTY',
  impactLongRest: 'FORTNIGHT_IMPACT_LONG_REST',
  impactShortAverageDuty: 'FORTNIGHT_IMPACT_SHORT_AVG_DUTY',
  impactNoEarlyPresentation: 'FORTNIGHT_IMPACT_NO_EARLY_PRESENTATION',
  impactCompleteData: 'FORTNIGHT_IMPACT_COMPLETE_DATA',
  impactConsecutiveAttention: 'FORTNIGHT_IMPACT_CONSECUTIVE_ATTENTION',
  impactConsecutiveCritical: 'FORTNIGHT_IMPACT_CONSECUTIVE_CRITICAL',
  impactCheckinPending: 'FORTNIGHT_IMPACT_CHECKIN_PENDING',
  impactEstimatedData: 'FORTNIGHT_IMPACT_ESTIMATED_DATA',
  impactEarly0600: 'FORTNIGHT_IMPACT_EARLY_0600',
  impactRecurringEarly: 'FORTNIGHT_IMPACT_RECURRING_EARLY',
  impactShortRest: 'FORTNIGHT_IMPACT_SHORT_REST',
  impactLowSleep: 'FORTNIGHT_IMPACT_LOW_SLEEP',
  impactHighKss: 'FORTNIGHT_IMPACT_HIGH_KSS',
  impactLowEffectiveness: 'FORTNIGHT_IMPACT_LOW_EFFECTIVENESS',
  impactRollingDuty: 'FORTNIGHT_IMPACT_ROLLING_DUTY',
  impactDailyCritical: 'FORTNIGHT_IMPACT_DAILY_CRITICAL',
  impactDailyAttention: 'FORTNIGHT_IMPACT_DAILY_ATTENTION',
};

export function buildGovernedParameterMap(): Record<string, number> {
  const values: Record<string, number> = { ...LIMITES_DEFAULT };
  for (const [field, key] of Object.entries(FADIGA_KEY_MAP)) {
    values[key] = (LEGACY_FADIGA_BUSINESS_POLICY as Record<string, number>)[field];
  }
  for (const [field, key] of Object.entries(FORTNIGHT_KEY_MAP)) {
    values[key] = (LEGACY_FORTNIGHT_POLICY as Record<string, number>)[field];
  }
  return values;
}

function sqlLiteral(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Non-finite value cannot be embedded: ${value}`);
  return String(value);
}

export function renderSeedSql(): string {
  const values = buildGovernedParameterMap();
  const keys = Object.keys(values).sort();
  const paramInserts = keys
    .map(
      (key) =>
        `  ('${REVISION_ID}-${key}', '${REVISION_ID}', '${key}', ${sqlLiteral(values[key])}, NULL, 'unit', NULL, NULL, NULL, 1, datetime('now'))`,
    )
    .join(',\n');

  return `-- ============================================================
-- FRMS_HELICOPTER_OFFSHORE_BASELINE_V1 (self-contained)
--
-- NOT a numbered migration. NOT applied to any environment by this file's
-- presence. Generated by
-- scripts/frms-seeds/generate-frms-helicopter-offshore-baseline-v1.ts
-- directly from LIMITES_DEFAULT / LEGACY_FADIGA_BUSINESS_POLICY /
-- LEGACY_FORTNIGHT_POLICY (worker-airtrust/src/lib/frms/{types,fadiga-score,
-- fortnight-indicator}.ts) — do not hand-edit the values below; regenerate
-- instead if a value ever needs to change (never in this baseline; V1 is a
-- pure governance snapshot of the current model, not a model change).
--
-- Deliberately self-contained: this file does NOT read from
-- frms_configuracao_limites and does NOT copy from any other revision
-- (e.g. 'frms-legacy-global-v2'). A real staging inspection found that
-- table empty, which leaves 0464's own bootstrap revision incomplete
-- (missing all 63 LimitesMap parameters) — this baseline must not inherit
-- that gap regardless of what any other table or revision contains.
--
-- Governance only: no formula, weight, threshold, or alert logic is
-- changed. profile_code = 'HELICOPTER_OFFSHORE', policy_version (stored as
-- model_version per the existing schema convention) = 'LEGACY_MODEL_V2'.
--
-- empresa_id = NULL: this is a global default revision. No
-- frms_regulatory_profiles row and no frms_profile_assignments row are
-- created here — frms_regulatory_profiles.empresa_id is NOT NULL by schema
-- (0463), so a regulatory profile is inherently tenant-scoped and only
-- meaningful once a real tenant is being assigned to this profile_code.
-- That assignment (and its regulatory-profile row) is a separate, explicit,
-- tenant-scoped, reviewed action — not implied by seeding this baseline.
--
-- FAIL-CLOSED reapply: rerunning this file against a DB that already has
-- this revision will fail on the UNIQUE(revision_id, parameter_key)
-- constraint rather than silently duplicate or diverge. Use
-- scripts/frms-seeds/apply-frms-helicopter-offshore-baseline-v1.mjs for a
-- safe, idempotent-aware apply (checks existing content before writing).
-- ============================================================

INSERT INTO frms_config_revisions (
  id, empresa_id, profile_code, revision_number, status, source_type,
  source_reference, regulatory_profile_id, policy_version, effective_from, effective_to,
  actor_user_id, reason, supersedes_revision_id, created_at
) VALUES (
  '${REVISION_ID}', NULL, 'HELICOPTER_OFFSHORE', 1, 'ACTIVE', 'INTERNAL_POLICY',
  'FRMS_HELICOPTER_OFFSHORE_BASELINE_V1 — governance migration only, self-contained, no formula/value change',
  NULL, 'LEGACY_MODEL_V2', '1970-01-01', NULL,
  NULL,
  'First governed revision for HELICOPTER_OFFSHORE: snapshots the current LIMITES_DEFAULT/LEGACY_FADIGA_BUSINESS_POLICY/LEGACY_FORTNIGHT_POLICY values verbatim (generated from source, not copied from any other revision or table) to make the offshore configuration auditable and versioned before any future model evolution.',
  NULL, datetime('now')
);

INSERT INTO frms_config_parameters (
  id, revision_id, parameter_key, numeric_value, json_value, unit, metric, window_kind, direction, required, created_at
) VALUES
${paramInserts};
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'frms_helicopter_offshore_baseline_v1.sql');
  writeFileSync(outPath, renderSeedSql(), 'utf8');
  const paramCount = Object.keys(buildGovernedParameterMap()).length;
  console.log(`Wrote ${outPath} — ${paramCount} parameters.`);
}
