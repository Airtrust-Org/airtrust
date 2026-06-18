-- DEPRECATED: use scripts/integrity/run-integrity.mjs with scripts/integrity/invariants.sql.
-- This compatibility file remains SELECT-only and intentionally avoids schema-dependent checks.

SELECT
  'DEPRECATED_USE_SCRIPTS_INTEGRITY_RUNNER' AS check_name,
  'Use node scripts/integrity/run-integrity.mjs --db <path> --baseline scripts/integrity/baseline.example.json' AS message;
