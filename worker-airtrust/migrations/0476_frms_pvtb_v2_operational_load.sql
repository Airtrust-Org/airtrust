-- 0476 — FRMS PVT-B V2 baseline isolation + Operational Load V1 persistence
--
-- Additive only. No existing FRMS row is rewritten and the canonical
-- effectiveness formula's stored history is untouched by this migration; the
-- new operational-load columns default to NULL until the pipeline recomputes a
-- journey.
--
-- 1) PVT-B V2: individual readiness baseline is computed per protocol version,
--    so `airtrust-vigilance-v1` sessions never contribute to an
--    `airtrust-pvtb-v2` baseline. This index backs that per-protocol query.
CREATE INDEX IF NOT EXISTS idx_frms_readiness_baseline_protocol
  ON frms_readiness_assessment (empresa_id, funcionario_id, protocol_version, created_at)
  WHERE deleted_at IS NULL;

-- 2) Operational Load V1 (OPERATIONAL_POLICY_V1): landings + observed-temperature
--    contribution to effectiveness, stored alongside the fatorização so it is
--    queryable without parsing `effectiveness_componentes_json`.
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN operational_load_policy_version TEXT;
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN operational_load_landings_count INTEGER;
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN operational_load_temperature_max_c REAL;
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN operational_load_weather_quality TEXT;
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN operational_load_data_quality TEXT;
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN operational_load_landings_delta REAL;
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN operational_load_temperature_delta REAL;
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN operational_load_total_delta REAL;
