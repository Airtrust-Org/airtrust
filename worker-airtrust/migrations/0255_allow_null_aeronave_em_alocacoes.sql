-- Migration 0255: permitir alocações operacionais sem aeronave vinculada

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS escala_alocacoes_v2 (
  id              TEXT    PRIMARY KEY,
  escala_id       TEXT    NOT NULL REFERENCES escalas_mensais(id) ON DELETE CASCADE,
  funcionario_id  TEXT    NOT NULL REFERENCES funcionarios(id),
  aeronave_id     INTEGER REFERENCES aeronaves(id),
  funcao          TEXT    NOT NULL CHECK (funcao IN ('PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX')),
  quinzena_id     INTEGER REFERENCES escalas_quinzenas(id),
  data_inicio     TEXT    NOT NULL,
  data_fim        TEXT    NOT NULL,
  padrao_escala_id TEXT   REFERENCES padroes_escala(id),
  base            TEXT,
  observacoes     TEXT,
  status          TEXT    NOT NULL DEFAULT 'planejado'
                  CHECK (status IN ('planejado','confirmado','cancelado')),
  tripulacao_legado_id TEXT,
  created_by      TEXT    NOT NULL DEFAULT 'system',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT,
  CONSTRAINT chk_alocacao_datas CHECK (data_fim >= data_inicio)
);

INSERT INTO escala_alocacoes_v2 (
  id, escala_id, funcionario_id, aeronave_id, funcao, quinzena_id,
  data_inicio, data_fim, padrao_escala_id, base, observacoes, status,
  tripulacao_legado_id, created_by, created_at, updated_at, deleted_at
)
SELECT
  id, escala_id, funcionario_id, aeronave_id, funcao, quinzena_id,
  data_inicio, data_fim, padrao_escala_id, base, observacoes, status,
  tripulacao_legado_id, created_by, created_at, updated_at, deleted_at
FROM escala_alocacoes;

DROP TABLE escala_alocacoes;
ALTER TABLE escala_alocacoes_v2 RENAME TO escala_alocacoes;

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

PRAGMA foreign_keys=ON;