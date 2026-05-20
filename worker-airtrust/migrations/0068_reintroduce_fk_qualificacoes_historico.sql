-- NOTE: Removido BEGIN/COMMIT por limitação de D1 ingestion (usar transação implícita do executor)

ALTER TABLE qualificacoes_historico RENAME TO qualificacoes_historico_old_fk_0068;

CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER,
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  orgao_emissor TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT
);

INSERT INTO qualificacoes_historico (
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
  numero_certificado, orgao_emissor, observacoes, arquivo_url, created_at, updated_at, deleted_at
)
SELECT
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
  numero_certificado, orgao_emissor, observacoes, arquivo_url, created_at, updated_at, deleted_at
FROM qualificacoes_historico_old_fk_0068;

DROP TABLE qualificacoes_historico_old_fk_0068;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_validade ON qualificacoes_historico(validade) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo ON qualificacoes_historico(codigo) WHERE deleted_at IS NULL;

-- Pós-validação recomendada:
-- SELECT COUNT(*) FROM qualificacoes_historico;
-- PRAGMA foreign_key_check;
