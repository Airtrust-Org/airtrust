-- FRMS regulatory evidence + minimal operational location catalogue.
-- 0512
-- Data-only governed change; no physical schema alteration.
-- Safety: Appendix B/C remain explicitly unselected until operator-specific evidence exists.

UPDATE frms_regulatory_profiles
SET approval_reference = 'AIRTRUST_FRMS_REGULATORY_SOURCE_MANIFEST_2026-09-27',
    limits_json = '{"rbac117_appendices":[],"appendix_selection_status":"UNCONFIRMED_OPERATOR_SELECTION","grf_status":"NOT_DOCUMENTED_IN_AIRTRUST","sgrf_status":"NOT_APPROVED_EVIDENCE_IN_AIRTRUST","source_manifest":"docs/regulatory/frms/costa-do-sol-frms-regulatory-source-manifest-2026-09-27.json","prescriptive_mode":"FAIL_CLOSED_NO_APPENDIX_INFERENCE"}',
    source_document_hash = 'c66536dba033f7854e2e1702418d1dbb4d4b45dc59e03dfa4cf949b645ec35cc',
    updated_at = datetime('now')
WHERE id = 'frms-regulatory-profile-6-helicopter-offshore-v1'
  AND empresa_id = 6
  AND profile_code = 'HELICOPTER_OFFSHORE'
  AND active = 1
  AND deleted_at IS NULL
  AND approval_reference = 'FRMS_HELICOPTER_OFFSHORE_BASELINE_V1'
  AND limits_json IS NULL
  AND source_document_hash IS NULL;

INSERT INTO frms_location_catalog (
  id, empresa_id, location_code, operational_class, name, timezone_iana,
  weather_source_kind, redemet_station_icao, latitude, longitude, active,
  source_reference, created_at, updated_at, deleted_at
) VALUES
  ('frms-loc-6-sbme-v1', 6, 'SBME', 'AERODROME', 'Macaé', 'America/Sao_Paulo', 'REDEMET', 'SBME', NULL, NULL, 1, 'cv_pontos_navegacao:SBME; CORDERNADAS.pdf | Flight Preview Waypoints List | 2026-09-17 17:07; operational use observed in cv_voo_etapas', datetime('now'), datetime('now'), NULL),
  ('frms-loc-6-9pgb-v1', 6, '9PGB', 'HELIDECK', NULL, 'America/Sao_Paulo', 'NONE', NULL, NULL, NULL, 1, 'cv_pontos_navegacao:9PGB; offshore helideck observed in cv_voo_etapas; no unrelated aerodrome METAR fallback', datetime('now'), datetime('now'), NULL),
  ('frms-loc-6-9pgs-v1', 6, '9PGS', 'HELIDECK', NULL, 'America/Sao_Paulo', 'NONE', NULL, NULL, NULL, 1, 'cv_pontos_navegacao:9PGS; offshore helideck observed in cv_voo_etapas; no unrelated aerodrome METAR fallback', datetime('now'), datetime('now'), NULL),
  ('frms-loc-6-9pgf-v1', 6, '9PGF', 'HELIDECK', NULL, 'America/Sao_Paulo', 'NONE', NULL, NULL, NULL, 1, 'cv_pontos_navegacao:9PGF; offshore helideck observed in cv_voo_etapas; coordinates intentionally omitted because source catalogue has conflicting records', datetime('now'), datetime('now'), NULL),
  ('frms-loc-6-9phk-v1', 6, '9PHK', 'HELIDECK', NULL, 'America/Sao_Paulo', 'NONE', NULL, NULL, NULL, 1, 'cv_pontos_navegacao:9PHK; offshore helideck observed in cv_voo_etapas; coordinates intentionally omitted because source catalogue has multiple records', datetime('now'), datetime('now'), NULL),
  ('frms-loc-6-9pss-v1', 6, '9PSS', 'HELIDECK', NULL, 'America/Sao_Paulo', 'NONE', NULL, NULL, NULL, 1, 'cv_pontos_navegacao:9PSS; offshore helideck observed in cv_voo_etapas; no unrelated aerodrome METAR fallback', datetime('now'), datetime('now'), NULL),
  ('frms-loc-6-9puf-v1', 6, '9PUF', 'HELIDECK', NULL, 'America/Sao_Paulo', 'NONE', NULL, NULL, NULL, 1, 'cv_pontos_navegacao:9PUF; offshore helideck observed in cv_voo_etapas; no unrelated aerodrome METAR fallback', datetime('now'), datetime('now'), NULL);
