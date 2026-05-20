-- Migration 0251: escala_cobertura_diaria
-- Cache materializado de cobertura operacional por aeronave por dia.
-- Recalculado após cada mutação em escala_alocacoes.
-- Permite que a grade carregue alertas de gap sem recalcular sempre.
-- ROLLBACK EMERGENCIAL:
--   DROP TABLE IF EXISTS escala_cobertura_diaria;
--   DROP INDEX IF EXISTS idx_cobertura_escala_data;
--   DROP INDEX IF EXISTS idx_cobertura_aeronave_data;
--   DROP INDEX IF EXISTS idx_cobertura_status;

CREATE TABLE IF NOT EXISTS escala_cobertura_diaria (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  escala_id       TEXT    NOT NULL REFERENCES escalas_mensais(id) ON DELETE CASCADE,
  aeronave_id     INTEGER NOT NULL REFERENCES aeronaves(id),
  data            TEXT    NOT NULL,   -- YYYY-MM-DD
  qtd_pic         INTEGER NOT NULL DEFAULT 0,
  qtd_sic         INTEGER NOT NULL DEFAULT 0,
  status_cobertura TEXT NOT NULL DEFAULT 'ok'
                  CHECK (status_cobertura IN ('ok','gap_pic','gap_sic','gap_total','excesso')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (escala_id, aeronave_id, data)
);

CREATE INDEX IF NOT EXISTS idx_cobertura_escala_data
  ON escala_cobertura_diaria(escala_id, data);

CREATE INDEX IF NOT EXISTS idx_cobertura_aeronave_data
  ON escala_cobertura_diaria(aeronave_id, data);

CREATE INDEX IF NOT EXISTS idx_cobertura_status
  ON escala_cobertura_diaria(escala_id, status_cobertura)
  WHERE status_cobertura != 'ok';
