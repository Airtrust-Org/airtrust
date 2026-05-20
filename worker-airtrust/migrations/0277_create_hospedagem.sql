-- Migration 0277: Módulo Hospedagem
-- Tabela para gestão de acomodações de tripulantes (hotel, plataforma, base)

CREATE TABLE IF NOT EXISTS hospedagem (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id  INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  tipo        TEXT NOT NULL CHECK(tipo IN ('HOTEL','PLATAFORMA','BASE','OUTRO')),
  local       TEXT NOT NULL,
  cidade      TEXT,
  estado      TEXT,
  data_checkin  TEXT NOT NULL,   -- ISO date YYYY-MM-DD
  data_checkout TEXT,            -- NULL = ainda hospedado
  numero_quarto TEXT,
  custo_diaria  REAL,
  moeda         TEXT DEFAULT 'BRL',
  escala_id     INTEGER,         -- vínculo opcional com escalas
  observacoes   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT,
  FOREIGN KEY (empresa_id)    REFERENCES empresas(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (escala_id)      REFERENCES escalas(id)
);

CREATE INDEX IF NOT EXISTS idx_hospedagem_empresa       ON hospedagem(empresa_id);
CREATE INDEX IF NOT EXISTS idx_hospedagem_funcionario   ON hospedagem(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_hospedagem_checkin       ON hospedagem(data_checkin);
CREATE INDEX IF NOT EXISTS idx_hospedagem_escala        ON hospedagem(escala_id);
