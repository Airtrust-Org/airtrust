-- 0499: Costa do Sol FRMS V2 historical policy scope and governed backfill ledger.
-- No coefficients are introduced here: the tenant revision copies the complete
-- reviewed generic FRMS_OPERATIONAL_POLICY_V2 parameter set from 0498.

INSERT OR IGNORE INTO frms_config_revisions (
  id, empresa_id, profile_code, revision_number, status, source_type,
  source_reference, regulatory_profile_id, policy_version, effective_from, effective_to,
  actor_user_id, reason, supersedes_revision_id, created_at
)
SELECT
  'frms-empresa6-helicopter-offshore-v2-history-0499',
  6,
  'HELICOPTER_OFFSHORE',
  COALESCE((
    SELECT MAX(rr.revision_number)
      FROM frms_config_revisions rr
     WHERE rr.empresa_id = 6 AND rr.profile_code = 'HELICOPTER_OFFSHORE'
  ), 0) + 1,
  'ACTIVE',
  'APPROVED_OPERATIONAL_POLICY',
  'Costa do Sol historical recalculation with approved FRMS Parametric V2 — 2026-09-17',
  a.regulatory_profile_id,
  'FRMS_OPERATIONAL_POLICY_V2',
  '2026-01-01',
  NULL,
  NULL,
  'Apply the approved FRMS V2 coefficients to Costa do Sol 2026 history and rebuild derived FRMS results with auditable provenance.',
  NULL,
  datetime('now')
FROM frms_profile_assignments a
JOIN frms_regulatory_profiles p ON p.id = a.regulatory_profile_id
WHERE a.empresa_id = 6
  AND a.profile_code = 'HELICOPTER_OFFSHORE'
  AND a.status = 'ACTIVE'
  AND a.effective_from <= '2026-01-01'
  AND (a.effective_to IS NULL OR a.effective_to >= '2026-01-01')
  AND p.empresa_id = 6
  AND p.profile_code = a.profile_code
  AND p.active = 1
  AND p.deleted_at IS NULL
LIMIT 1;

INSERT OR IGNORE INTO frms_config_parameters (
  id, revision_id, parameter_key, numeric_value, json_value, unit, metric,
  window_kind, direction, required, created_at
)
SELECT
  'frms-empresa6-v2-history-0499-' || p.parameter_key,
  'frms-empresa6-helicopter-offshore-v2-history-0499',
  p.parameter_key,
  p.numeric_value,
  p.json_value,
  p.unit,
  p.metric,
  p.window_kind,
  p.direction,
  p.required,
  datetime('now')
FROM frms_config_parameters p
WHERE p.revision_id = (
  SELECT r.id
    FROM frms_config_revisions r
   WHERE r.empresa_id IS NULL
     AND r.profile_code = 'HELICOPTER_OFFSHORE'
     AND r.status = 'ACTIVE'
     AND r.policy_version = 'FRMS_OPERATIONAL_POLICY_V2'
   ORDER BY r.revision_number DESC, r.created_at DESC
   LIMIT 1
);

INSERT OR IGNORE INTO frms_recalc_runs (
  id, empresa_id, profile_code, previous_revision_id, target_revision_id,
  effective_from, effective_to, changed_parameter_keys_json, status,
  processed_count, failed_count, cursor_json, error_summary,
  started_at, completed_at, created_at, updated_at
)
SELECT
  'frms-recalc-empresa6-v2-history-2026-0499',
  6,
  'HELICOPTER_OFFSHORE',
  (
    SELECT r.id FROM frms_config_revisions r
     WHERE r.empresa_id IS NULL
       AND r.profile_code = 'HELICOPTER_OFFSHORE'
       AND r.status = 'SUPERSEDED'
       AND r.effective_from <= '2026-09-16'
       AND (r.effective_to IS NULL OR r.effective_to >= '2026-01-01')
     ORDER BY r.revision_number DESC LIMIT 1
  ),
  'frms-empresa6-helicopter-offshore-v2-history-0499',
  '2026-01-01',
  '2026-09-16',
  COALESCE((
    SELECT json_group_array(parameter_key)
      FROM frms_config_parameters
     WHERE revision_id = 'frms-empresa6-helicopter-offshore-v2-history-0499'
  ), '[]'),
  'PENDING',
  0, 0, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')
WHERE EXISTS (
  SELECT 1 FROM frms_config_revisions
   WHERE id = 'frms-empresa6-helicopter-offshore-v2-history-0499'
);
