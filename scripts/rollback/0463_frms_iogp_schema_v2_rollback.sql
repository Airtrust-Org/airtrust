-- Rollback 0463.
-- source_reference: worker-airtrust/migrations/0463_frms_iogp_schema_v2.sql.
-- operational_decision: drop the three FRMS IOGP schema-v2 tables created by 0463.
-- dry_run_required: yes; confirm the shadow feature flag (FRMS_IOGP_SHADOW_MODE_TENANTS)
--   is OFF for every tenant before rollback, since any row written while the shadow
--   pipeline was enabled will be permanently lost.
-- rollback_plan_required: yes; take a recovery point and use the repository's
--   controlled rollback procedure. D1/SQLite does not support `DROP TABLE a, b, c;` —
--   each statement below is separate and ordered so dependents drop before what
--   they reference (none of these three tables reference each other, only
--   `empresas`, so order is not FK-load-bearing here but is kept deterministic).

DROP TABLE IF EXISTS frms_jornada_avaliacoes;
DROP TABLE IF EXISTS frms_location_catalog;
DROP TABLE IF EXISTS frms_regulatory_profiles;
