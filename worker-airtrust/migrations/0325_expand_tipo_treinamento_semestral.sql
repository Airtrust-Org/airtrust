-- ================================================================
-- Migration 0325: aceitar tipo_treinamento SEMESTRAL no histórico
-- Data: 2026-04-02
-- ================================================================

PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS trg_calc_vencimento_insert;
DROP TRIGGER IF EXISTS trg_qualificacoes_historico_set_tipo;
DROP TRIGGER IF EXISTS trg_qualificacoes_historico_update_tipo;

DROP INDEX IF EXISTS idx_qh_renovacao_de;
DROP INDEX IF EXISTS idx_qualificacoes_hist_data_conclusao;
DROP INDEX IF EXISTS idx_qualificacoes_hist_data_vencimento;
DROP INDEX IF EXISTS idx_qualificacoes_historico_empresa_funcionario;
DROP INDEX IF EXISTS idx_qualificacoes_historico_empresa_id;
DROP INDEX IF EXISTS idx_qualificacoes_historico_sessao;
DROP INDEX IF EXISTS idx_qualificacoes_historico_status;
DROP INDEX IF EXISTS idx_qualificacoes_historico_tipo;
DROP INDEX IF EXISTS idx_qualificacoes_historico_unique_active;

ALTER TABLE qualificacoes_historico RENAME TO qualificacoes_historico_old;

CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER,
  qualificacao_id INTEGER,
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  data_conclusao TEXT,
  validade_meses INTEGER,
  instrutor TEXT,
  nota REAL,
  carga_horaria REAL,
  data_vencimento TEXT,
  renovada INTEGER DEFAULT 0,
  certificado_arquivo_id INTEGER,
  funcionario_cpf TEXT,
  qualificacao_codigo TEXT,
  empresa_id INTEGER DEFAULT 1,
  status TEXT,
  tipo_check_id INTEGER,
  sessao_id INTEGER,
  tipo TEXT,
  data_confirmacao TEXT,
  confirmada_por INTEGER,
  tipo_treinamento TEXT CHECK(tipo_treinamento IN ('INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO')),
  renovacao_de INTEGER DEFAULT NULL
);

INSERT INTO qualificacoes_historico (
  id,
  funcionario_id,
  qualificacao_id,
  tipo_codigo,
  codigo,
  categoria,
  validade,
  numero_certificado,
  observacoes,
  arquivo_url,
  created_at,
  updated_at,
  deleted_at,
  data_conclusao,
  validade_meses,
  instrutor,
  nota,
  carga_horaria,
  data_vencimento,
  renovada,
  certificado_arquivo_id,
  funcionario_cpf,
  qualificacao_codigo,
  empresa_id,
  status,
  tipo_check_id,
  sessao_id,
  tipo,
  data_confirmacao,
  confirmada_por,
  tipo_treinamento,
  renovacao_de
)
SELECT
  id,
  funcionario_id,
  qualificacao_id,
  tipo_codigo,
  codigo,
  categoria,
  validade,
  numero_certificado,
  observacoes,
  arquivo_url,
  created_at,
  updated_at,
  deleted_at,
  data_conclusao,
  validade_meses,
  instrutor,
  nota,
  carga_horaria,
  data_vencimento,
  renovada,
  certificado_arquivo_id,
  funcionario_cpf,
  qualificacao_codigo,
  empresa_id,
  status,
  tipo_check_id,
  sessao_id,
  tipo,
  data_confirmacao,
  confirmada_por,
  tipo_treinamento,
  renovacao_de
FROM qualificacoes_historico_old;

DROP TABLE qualificacoes_historico_old;

CREATE INDEX idx_qh_renovacao_de ON qualificacoes_historico(renovacao_de) WHERE renovacao_de IS NOT NULL;
CREATE INDEX idx_qualificacoes_hist_data_conclusao ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_hist_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_empresa_funcionario ON qualificacoes_historico (empresa_id, funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_empresa_id ON qualificacoes_historico (empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_sessao ON qualificacoes_historico(sessao_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_tipo ON qualificacoes_historico(tipo);
CREATE UNIQUE INDEX idx_qualificacoes_historico_unique_active ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_calc_vencimento_insert
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL
  AND NEW.validade_meses > 0
  AND NEW.data_conclusao IS NOT NULL
  AND NEW.data_vencimento IS NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_qualificacoes_historico_set_tipo
AFTER INSERT ON qualificacoes_historico
WHEN NEW.tipo IS NULL AND NEW.qualificacao_id IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos
    WHERE id = NEW.qualificacao_id
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_qualificacoes_historico_update_tipo
AFTER UPDATE OF qualificacao_id ON qualificacoes_historico
WHEN NEW.qualificacao_id IS NOT NULL
  AND (OLD.qualificacao_id IS NULL OR OLD.qualificacao_id != NEW.qualificacao_id)
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos
    WHERE id = NEW.qualificacao_id
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

UPDATE qualificacoes_tipos
   SET tipo = 'SEMESTRAL',
       updated_at = datetime('now')
 WHERE deleted_at IS NULL
   AND COALESCE(validade, 0) = 6
   AND COALESCE(tipo, '') != 'SEMESTRAL';

UPDATE qualificacoes_historico
   SET tipo_treinamento = 'SEMESTRAL',
       updated_at = datetime('now')
 WHERE deleted_at IS NULL
   AND COALESCE(tipo_treinamento, '') != 'SEMESTRAL'
   AND EXISTS (
     SELECT 1
       FROM qualificacoes_tipos qt
      WHERE qt.id = qualificacoes_historico.qualificacao_id
        AND qt.deleted_at IS NULL
        AND COALESCE(qt.validade, 0) = 6
   );

PRAGMA foreign_keys = ON;