-- Fechamento de gaps do FRMS Fadiga Check-in (estrutura incremental sem quebra)

ALTER TABLE frms_fadiga_checkin ADD COLUMN jornada_inicio_prevista TEXT;
ALTER TABLE frms_fadiga_checkin ADD COLUMN jornada_fim_prevista TEXT;
ALTER TABLE frms_fadiga_checkin ADD COLUMN horas_acordado REAL;
ALTER TABLE frms_fadiga_checkin ADD COLUMN meds_ult_12h INTEGER NOT NULL DEFAULT 0;
ALTER TABLE frms_fadiga_checkin ADD COLUMN alcool_ult_12h INTEGER NOT NULL DEFAULT 0;
ALTER TABLE frms_fadiga_checkin ADD COLUMN risco_autoavaliado INTEGER;
ALTER TABLE frms_fadiga_checkin ADD COLUMN origem_registro TEXT NOT NULL DEFAULT 'TRIPULANTE';

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_empresa_status_data
  ON frms_fadiga_checkin (empresa_id, status_operacional, data_checkin)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS frms_fadiga_avaliacao_gestor (
  id TEXT PRIMARY KEY,
  checkin_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  avaliador_id INTEGER NOT NULL,
  decisao TEXT NOT NULL CHECK (decisao IN ('APTO', 'MONITORADO', 'RESTRITO', 'NAO_APTO')),
  mitigacoes_json TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_fadiga_avaliacao_gestor_checkin
  ON frms_fadiga_avaliacao_gestor (checkin_id, created_at)
  WHERE deleted_at IS NULL;

ALTER TABLE sgso_frat_avaliacoes ADD COLUMN origem_vinculo TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE sgso_frat_avaliacoes ADD COLUMN frms_fadiga_checkin_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sgso_frat_origem_fadiga
  ON sgso_frat_avaliacoes (empresa_id, origem_vinculo, frms_fadiga_checkin_id);
