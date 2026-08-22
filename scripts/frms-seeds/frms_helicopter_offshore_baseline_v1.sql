-- ============================================================
-- FRMS_HELICOPTER_OFFSHORE_BASELINE_V1
--
-- NOT a numbered migration. NOT applied to any environment by this file's
-- presence. Governance seed only: creates the first governed revision for
-- profile_code = 'HELICOPTER_OFFSHORE', copying every parameter value
-- verbatim from the values already bootstrapped for 'LEGACY_GENERAL' in
-- 0464_frms_parameter_governance_recalc.sql (which itself copies
-- frms_configuracao_limites + the biological/fortnight constants that were
-- previously hardcoded). No value is changed, no formula is touched — this
-- is a governance/traceability migration, not a model change.
--
-- empresa_id = NULL: this is a global default revision, exactly like the
-- LEGACY_GENERAL bootstrap. No tenant is assigned to this profile by this
-- file (no frms_profile_assignments row is created here) — assigning a real
-- offshore tenant to HELICOPTER_OFFSHORE is a separate, explicit, reviewed
-- action, not implied by seeding this baseline.
--
-- model_version requested (LEGACY_MODEL_V2) is stored in policy_version,
-- per the existing schema convention (buildResolvedParameterSet maps
-- modelVersion := revision.policy_version).
-- ============================================================

INSERT INTO frms_config_revisions (
  id, empresa_id, profile_code, revision_number, status, source_type,
  source_reference, regulatory_profile_id, policy_version, effective_from, effective_to,
  actor_user_id, reason, supersedes_revision_id, created_at
) VALUES (
  'frms-helicopter-offshore-baseline-v1', NULL, 'HELICOPTER_OFFSHORE', 1, 'ACTIVE', 'INTERNAL_POLICY',
  'FRMS_HELICOPTER_OFFSHORE_BASELINE_V1 — governance migration only, no formula/value change',
  NULL, 'LEGACY_MODEL_V2', '1970-01-01', NULL,
  NULL,
  'First governed revision for HELICOPTER_OFFSHORE: copies frms-legacy-global-v2 values verbatim to make the offshore configuration auditable and versioned before any future model evolution.',
  NULL, datetime('now')
);

-- Copies every parameter row from the LEGACY_GENERAL bootstrap revision,
-- unchanged, under the new profile's revision id. Uses a deterministic id
-- suffix so re-running this script against the same DB is idempotent-safe
-- to inspect (INSERT will fail on the UNIQUE(revision_id, parameter_key)
-- constraint on a second run, which is the desired fail-closed behavior for
-- a governance seed — it must never silently double-apply).
INSERT INTO frms_config_parameters (
  id, revision_id, parameter_key, numeric_value, json_value, unit, metric, window_kind, direction, required, created_at
)
SELECT
  'frms-helicopter-offshore-baseline-v1-' || parameter_key,
  'frms-helicopter-offshore-baseline-v1',
  parameter_key, numeric_value, json_value, unit, metric, window_kind, direction, required,
  datetime('now')
FROM frms_config_parameters
WHERE revision_id = 'frms-legacy-global-v2';
