-- 0200_remove_unused_columns_historico.sql
-- Remove colunas inúteis da tabela qualificacoes_historico
-- Colunas removidas: local, modalidade (não utilizadas no sistema)
-- Nota: A estrutura real difere do schema base

-- SQLite não suporta DROP COLUMN diretamente
-- Precisamos recriar a tabela sem essas colunas

-- 0. Dropar triggers e views que dependem da tabela
DROP TRIGGER IF EXISTS trg_calc_vencimento_insert;
DROP TRIGGER IF EXISTS trg_calc_vencimento_update;
DROP TRIGGER IF EXISTS trg_tipo_update_recalcular_historico;
DROP TRIGGER IF EXISTS trg_historico_notas_updated_at;
DROP VIEW IF EXISTS qualificacoes_historico_v;

-- 1. Criar tabela temporária com estrutura correta (sem local e modalidade)
CREATE TABLE IF NOT EXISTS qualificacoes_historico_new (
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
  sessao_id INTEGER
);

-- 2. Copiar dados (excluindo as colunas local e modalidade)
INSERT INTO qualificacoes_historico_new (
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria,
  validade, numero_certificado, observacoes, arquivo_url, created_at,
  updated_at, deleted_at, data_conclusao, validade_meses, instrutor,
  nota, carga_horaria, data_vencimento, renovada, certificado_arquivo_id,
  funcionario_cpf, qualificacao_codigo, empresa_id, status, tipo_check_id,
  sessao_id
)
SELECT 
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria,
  validade, numero_certificado, observacoes, arquivo_url, created_at,
  updated_at, deleted_at, data_conclusao, validade_meses, instrutor,
  nota, carga_horaria, data_vencimento, renovada, certificado_arquivo_id,
  funcionario_cpf, qualificacao_codigo, empresa_id, status, tipo_check_id,
  sessao_id
FROM qualificacoes_historico;

-- 3. Dropar tabela antiga
DROP TABLE qualificacoes_historico;

-- 4. Renomear nova tabela
ALTER TABLE qualificacoes_historico_new RENAME TO qualificacoes_historico;

-- 5. Recriar índices importantes
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_funcionario 
  ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_qualificacao 
  ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_status 
  ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_hist_data_vencimento 
  ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_hist_data_conclusao 
  ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_sessao 
  ON qualificacoes_historico(sessao_id) WHERE deleted_at IS NULL;

-- 6. Recriar triggers
CREATE TRIGGER IF NOT EXISTS trg_calc_vencimento_insert
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.validade_meses > 0 AND NEW.data_conclusao IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_calc_vencimento_update
AFTER UPDATE OF validade_meses, data_conclusao ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.validade_meses > 0 AND NEW.data_conclusao IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;

-- 7. Recriar view sem as colunas removidas
CREATE VIEW qualificacoes_historico_v AS
SELECT 
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.numero_certificado,
  qh.arquivo_url AS certificado_url,
  qh.nota,
  qh.instrutor,
  qh.observacoes,
  COALESCE(qt.nome, qh.tipo_codigo, qh.codigo) AS qualificacao_nome,
  COALESCE(qt.codigo, qh.codigo) AS qualificacao_codigo,
  COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
  qt.validade AS qualificacao_validade_meses,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.email AS funcionario_email,
  f.codigo_anac AS funcionario_codigo_anac,
  CASE
    WHEN qh.data_vencimento IS NULL THEN 'INDETERMINADA'
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 90 THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status,
  CAST(julianday(qh.data_vencimento) - julianday('now') AS INTEGER) AS dias_ate_vencimento,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON CAST(qt.id AS TEXT) = CAST(qh.qualificacao_id AS TEXT) AND qt.deleted_at IS NULL
LEFT JOIN funcionarios f ON CAST(f.id AS TEXT) = CAST(qh.funcionario_id AS TEXT) AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;
