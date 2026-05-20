-- ================================================================
-- Migration 0139: Renomear data_conclusao para data_realizacao
-- Data: 2025-11-30
-- Objetivo: Padronizar nomenclatura da API (data_realizacao)
--           com o nome real da coluna no banco
-- ================================================================

-- SQLite não suporta ALTER COLUMN RENAME diretamente
-- Estratégia: recriar tabela com novo nome de coluna

-- 1. Criar tabela temporária
CREATE TABLE IF NOT EXISTS qualificacoes_historico_temp AS SELECT * FROM qualificacoes_historico;

-- 2. Dropar tabela original
DROP TABLE qualificacoes_historico;

-- 3. Recriar com data_realizacao (em vez de data_conclusao)
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
  data_realizacao TEXT, -- RENOMEADO de data_conclusao
  validade_meses INTEGER,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT CHECK(modalidade IS NULL OR modalidade IN ('PRESENCIAL', 'EAD', 'HIBRIDO')),
  nota REAL CHECK(nota IS NULL OR (nota >= 1.0 AND nota <= 5.0)),
  carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  data_vencimento TEXT,
  renovada INTEGER DEFAULT 0,
  certificado_arquivo_id TEXT,
  funcionario_cpf TEXT,
  qualificacao_codigo TEXT COLLATE NOCASE
);

-- 4. Restaurar dados (mapeando data_conclusao → data_realizacao)
INSERT INTO qualificacoes_historico (
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
  numero_certificado, observacoes, arquivo_url, created_at, updated_at, deleted_at,
  data_realizacao, validade_meses, instrutor, local, modalidade, nota, carga_horaria,
  data_vencimento, renovada, certificado_arquivo_id, funcionario_cpf, qualificacao_codigo
)
SELECT 
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
  numero_certificado, observacoes, arquivo_url, created_at, updated_at, deleted_at,
  data_conclusao, validade_meses, instrutor, local, modalidade, nota, carga_horaria,
  data_vencimento, renovada, certificado_arquivo_id, funcionario_cpf, qualificacao_codigo
FROM qualificacoes_historico_temp;

-- 5. Limpar temporária
DROP TABLE qualificacoes_historico_temp;

-- 6. Recriar índices
CREATE INDEX IF NOT EXISTS idx_historico_func_cpf ON qualificacoes_historico(funcionario_cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_qual_codigo ON qualificacoes_historico(qualificacao_codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_realizacao ON qualificacoes_historico(data_realizacao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_funcionario_id ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_qualificacao_id ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;

-- 7. Recriar triggers de validade
DROP TRIGGER IF EXISTS trg_calc_vencimento_insert;
DROP TRIGGER IF EXISTS trg_calc_vencimento_update;

CREATE TRIGGER IF NOT EXISTS trg_calc_vencimento_insert
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.validade_meses > 0 AND NEW.data_realizacao IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_realizacao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_calc_vencimento_update
AFTER UPDATE OF validade_meses, data_realizacao ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.validade_meses > 0 AND NEW.data_realizacao IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_realizacao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;

-- Auditoria
SELECT '0139_rename_data_conclusao_to_data_realizacao' AS migration_applied,
       COUNT(*) AS total_registros
FROM qualificacoes_historico;
