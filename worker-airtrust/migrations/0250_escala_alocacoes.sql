-- Migration 0250: escala_alocacoes
-- Substitui o modelo de pares PIC+SIC (escala_tripulacoes) por alocações
-- individuais por função. PIC e SIC têm registros totalmente independentes,
-- permitindo períodos distintos na mesma aeronave.
--
-- IMPORTANTE: esta tabela COEXISTE com escala_tripulacoes durante a migração
-- faseada. Não remove nem altera a tabela legada.
-- Nota: aeronaves.id neste projeto é INTEGER, então aeronave_id permanece INTEGER.
-- ROLLBACK EMERGENCIAL:
--   DROP TABLE IF EXISTS escala_alocacoes;
--   DROP INDEX IF EXISTS idx_alocacoes_escala;
--   DROP INDEX IF EXISTS idx_alocacoes_funcionario;
--   DROP INDEX IF EXISTS idx_alocacoes_aeronave;
--   DROP INDEX IF EXISTS idx_alocacoes_datas;
--   DROP INDEX IF EXISTS idx_alocacoes_escala_aeronave;
--   DROP INDEX IF EXISTS idx_alocacoes_funcionario_datas;

CREATE TABLE IF NOT EXISTS escala_alocacoes (
  id              TEXT    PRIMARY KEY,
  escala_id       TEXT    NOT NULL REFERENCES escalas_mensais(id) ON DELETE CASCADE,
  funcionario_id  TEXT    NOT NULL REFERENCES funcionarios(id),
  aeronave_id     INTEGER NOT NULL REFERENCES aeronaves(id),
  funcao          TEXT    NOT NULL CHECK (funcao IN ('PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX')),
  quinzena_id     INTEGER REFERENCES escalas_quinzenas(id),
  data_inicio     TEXT    NOT NULL,   -- YYYY-MM-DD
  data_fim        TEXT    NOT NULL,   -- YYYY-MM-DD
  padrao_escala_id TEXT   REFERENCES padroes_escala(id),
  base            TEXT,
  observacoes     TEXT,
  status          TEXT    NOT NULL DEFAULT 'planejado'
                  CHECK (status IN ('planejado','confirmado','cancelado')),
  -- Referência opcional ao registro legado (nullável, será removida na Fase 5)
  tripulacao_legado_id TEXT,
  created_by      TEXT    NOT NULL DEFAULT 'system',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT,
  CONSTRAINT chk_alocacao_datas CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_alocacoes_escala
  ON escala_alocacoes(escala_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alocacoes_funcionario
  ON escala_alocacoes(funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alocacoes_aeronave
  ON escala_alocacoes(aeronave_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alocacoes_datas
  ON escala_alocacoes(data_inicio, data_fim)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alocacoes_escala_aeronave
  ON escala_alocacoes(escala_id, aeronave_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alocacoes_funcionario_datas
  ON escala_alocacoes(funcionario_id, data_inicio, data_fim)
  WHERE deleted_at IS NULL;
