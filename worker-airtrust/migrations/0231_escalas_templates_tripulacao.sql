-- Migration: 0231_escalas_templates_tripulacao
-- Templates reutilizáveis de tripulação (quinzena + aeronave + PIC/SIC padrão)
-- Data: 2026-03-05

CREATE TABLE IF NOT EXISTS escalas_templates_tripulacao (
  id         TEXT    PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nome       TEXT    NOT NULL,           -- ex: "Q1 - AW139 - Base Macaé"
  quinzena   INTEGER NOT NULL DEFAULT 0, -- 0=ambas, 1=primeira, 2=segunda
  aeronave   TEXT,                       -- prefixo ou modelo
  pic_id     TEXT    REFERENCES funcionarios(id),
  sic_id     TEXT    REFERENCES funcionarios(id),
  padrao_escala_id TEXT,
  base       TEXT,
  observacoes TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1,
  usos       INTEGER NOT NULL DEFAULT 0, -- contador de aplicações
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalas_templates_empresa
  ON escalas_templates_tripulacao(empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_escalas_templates_aeronave
  ON escalas_templates_tripulacao(empresa_id, aeronave)
  WHERE deleted_at IS NULL;
