-- ============================================================
-- MIGRATION 0463: Create new tables for FRMS IOGP schema V2
--
-- source_reference: FRMS IOGP schema design (2026-08-20)
-- operational_decision: create tables frms_regulatory_profiles, frms_location_catalog,
--   and frms_jornada_avaliacoes to support IOGP compliance tracking.
-- dry_run_required: no, standard CREATE TABLE statements.
-- rollback_plan_required: yes; run DROP TABLE for the three new tables.
--
-- GOVERNANCE NOTE (item 11 audit, 2026-08-20):
--   These are audit/regulatory-trail tables. The established FRMS convention
--   (see 0212_frms_module.sql / 0351_frms_jornada_origem_sigvoos.sql) does NOT
--   attach a hard-delete cascade to tenant data of this kind — frms_jornada
--   itself carries no empresa_id column or FK at all; tenant scoping is
--   enforced at the service layer via a join through tripulante_id ->
--   funcionarios.empresa_id. Deleting an empresa should not silently destroy
--   regulatory/compliance evidence. `ON DELETE CASCADE` was therefore removed
--   below in favor of the SQLite/D1 default (RESTRICT-like NO ACTION),
--   matching the "no auto-delete on tenant removal" posture used elsewhere in
--   FRMS. Cross-tenant integrity for frms_jornada_avaliacoes.jornada_id vs.
--   frms_jornada (which has no empresa_id column) must be enforced in the
--   service layer: look up tripulante_id -> funcionarios.empresa_id and
--   compare against frms_jornada_avaliacoes.empresa_id on every write/read,
--   the same pattern already used for frms_jornada itself. A composite FK is
--   not possible here because frms_jornada has no empresa_id to reference.
-- ============================================================

-- only after verifying origin/main, current numbering, baseline/ledger and repo conventions.

CREATE TABLE frms_regulatory_profiles (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  profile_code TEXT NOT NULL,
  service_category TEXT,
  approval_reference TEXT,
  policy_version TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  limits_json TEXT,
  source_document_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE INDEX idx_frms_reg_profiles_empresa_effective
  ON frms_regulatory_profiles (empresa_id, active, effective_from, effective_to);

CREATE TABLE frms_location_catalog (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  location_code TEXT NOT NULL,
  operational_class TEXT NOT NULL,
  name TEXT,
  timezone_iana TEXT,
  weather_source_kind TEXT NOT NULL,
  redemet_station_icao TEXT,
  latitude REAL,
  longitude REAL,
  active INTEGER NOT NULL DEFAULT 1,
  source_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE UNIQUE INDEX idx_frms_location_catalog_empresa_code_active
  ON frms_location_catalog (empresa_id, location_code)
  WHERE active = 1 AND deleted_at IS NULL;

CREATE TABLE frms_jornada_avaliacoes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  jornada_id TEXT NOT NULL,
  evaluation_version TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  regulatory_profile_id TEXT,
  compliance_json TEXT NOT NULL,
  biological_summary_json TEXT,
  operational_demand_json TEXT NOT NULL,
  environmental_json TEXT NOT NULL,
  overall_level TEXT NOT NULL,
  automatic_approval_allowed INTEGER NOT NULL DEFAULT 0,
  evidence_hash TEXT,
  calculated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE INDEX idx_frms_jornada_avaliacoes_empresa_jornada
  ON frms_jornada_avaliacoes (empresa_id, jornada_id, deleted_at);

CREATE INDEX idx_frms_jornada_avaliacoes_empresa_level
  ON frms_jornada_avaliacoes (empresa_id, overall_level, calculated_at);

CREATE UNIQUE INDEX idx_frms_jornada_avaliacoes_input_active
  ON frms_jornada_avaliacoes (empresa_id, jornada_id, evaluation_version, input_fingerprint)
  WHERE deleted_at IS NULL;
