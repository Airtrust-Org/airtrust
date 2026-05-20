PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS escala_alocacoes_v3 (
  id                TEXT    PRIMARY KEY,
  escala_id         TEXT    NOT NULL REFERENCES escalas_mensais(id) ON DELETE CASCADE,
  funcionario_id    TEXT    NOT NULL REFERENCES funcionarios(id),
  aeronave_id       INTEGER REFERENCES aeronaves(id),
  funcao            TEXT    CHECK (funcao IN ('PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX')),
  situacao_tipo     TEXT,
  situacao_cor      TEXT,
  quinzena_id       INTEGER REFERENCES escalas_quinzenas(id),
  data_inicio       TEXT    NOT NULL,
  data_fim          TEXT    NOT NULL,
  padrao_escala_id  TEXT    REFERENCES padroes_escala(id),
  base              TEXT,
  observacoes       TEXT,
  status            TEXT    NOT NULL DEFAULT 'planejado'
                    CHECK (status IN ('planejado','confirmado','cancelado')),
  tripulacao_legado_id TEXT,
  created_by        TEXT    NOT NULL DEFAULT 'system',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT,
  CONSTRAINT chk_alocacao_datas CHECK (data_fim >= data_inicio)
);

INSERT INTO escala_alocacoes_v3 (
  id, escala_id, funcionario_id, aeronave_id, funcao, situacao_tipo, situacao_cor,
  quinzena_id, data_inicio, data_fim, padrao_escala_id, base, observacoes, status,
  tripulacao_legado_id, created_by, created_at, updated_at, deleted_at
)
SELECT
  id, escala_id, funcionario_id, aeronave_id, funcao, NULL, NULL,
  quinzena_id, data_inicio, data_fim, padrao_escala_id, base, observacoes, status,
  tripulacao_legado_id, created_by, created_at, updated_at, deleted_at
FROM escala_alocacoes;

DROP TABLE escala_alocacoes;
ALTER TABLE escala_alocacoes_v3 RENAME TO escala_alocacoes;

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

CREATE INDEX IF NOT EXISTS idx_alocacoes_situacao_tipo
  ON escala_alocacoes(situacao_tipo)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS escala_situacao_tipos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo              TEXT    NOT NULL UNIQUE,
  nome                TEXT    NOT NULL,
  cor                 TEXT    NOT NULL,
  icone               TEXT,
  bloqueia_alocacao   INTEGER NOT NULL DEFAULT 1,
  ativo               INTEGER NOT NULL DEFAULT 1,
  ordem               INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT
);

INSERT INTO escala_situacao_tipos
  (codigo, nome, cor, icone, bloqueia_alocacao, ordem)
VALUES
  ('FERIAS', 'Férias', '#10b981', '🌴', 1, 1),
  ('SIM',    'Simulador', '#6366f1', '🎮', 1, 2),
  ('CURSO',  'Curso / Treinamento', '#f59e0b', '📚', 1, 3),
  ('MED',    'Afastamento Médico', '#ef4444', '🏥', 1, 4),
  ('AFT',    'Afastamento', '#6b7280', '⏸', 1, 5),
  ('STB',    'Standby s/ Aeronave', '#0891b2', '⏳', 0, 6)
ON CONFLICT(codigo) DO UPDATE SET
  nome = excluded.nome,
  cor = excluded.cor,
  icone = excluded.icone,
  bloqueia_alocacao = excluded.bloqueia_alocacao,
  ordem = excluded.ordem,
  ativo = 1,
  updated_at = datetime('now'),
  deleted_at = NULL;

CREATE TABLE IF NOT EXISTS funcionario_ferias (
  id                  TEXT    PRIMARY KEY,
  funcionario_id      TEXT    NOT NULL REFERENCES funcionarios(id),
  data_inicio         TEXT    NOT NULL,
  data_fim            TEXT    NOT NULL,
  tipo                TEXT    NOT NULL DEFAULT 'FERIAS',
  observacoes         TEXT,
  escala_alocacao_id  TEXT,
  criado_por          TEXT    NOT NULL,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_func_ferias_funcionario
  ON funcionario_ferias(funcionario_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_func_ferias_periodo
  ON funcionario_ferias(data_inicio, data_fim)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_func_ferias_alocacao
  ON funcionario_ferias(escala_alocacao_id)
  WHERE deleted_at IS NULL;

PRAGMA foreign_keys=ON;

SELECT codigo, nome, cor, icone, bloqueia_alocacao, ordem
FROM escala_situacao_tipos
WHERE deleted_at IS NULL
ORDER BY ordem;