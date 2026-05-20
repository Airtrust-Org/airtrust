-- Migration: Fix certificado_arquivo_id type from TEXT to INTEGER
-- Data: 2026-01-12
-- Descrição: Corrige o tipo da coluna certificado_arquivo_id para INTEGER com FK correta
-- IMPORTANTE: Usa data_conclusao (nome em produção) não data_realizacao

-- 0. Limpar registros órfãos (certificado_arquivo_id que não existem em documentos)
-- Isso evita FOREIGN KEY constraint failed
UPDATE qualificacoes_historico
SET certificado_arquivo_id = NULL
WHERE certificado_arquivo_id IS NOT NULL 
  AND certificado_arquivo_id != ''
  AND NOT EXISTS (
    SELECT 1 FROM documentos d WHERE CAST(d.id AS TEXT) = certificado_arquivo_id
  );

-- 1. Backup
CREATE TABLE IF NOT EXISTS qualificacoes_historico_backup_176 AS SELECT * FROM qualificacoes_historico;

-- 2. Drop tabela existente
DROP TABLE qualificacoes_historico;

-- 3. Recriar com certificado_arquivo_id como INTEGER
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
  data_conclusao TEXT, -- NOME ATUAL EM PRODUÇÃO
  validade_meses INTEGER,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT CHECK(modalidade IS NULL OR modalidade IN ('PRESENCIAL', 'EAD', 'HIBRIDO')),
  nota REAL CHECK(nota IS NULL OR (nota >= 1.0 AND nota <= 5.0)),
  carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  data_vencimento TEXT,
  renovada INTEGER DEFAULT 0,
  certificado_arquivo_id INTEGER, -- CORRIGIDO: INTEGER em vez de TEXT
  funcionario_cpf TEXT,
  qualificacao_codigo TEXT COLLATE NOCASE,
  empresa_id INTEGER DEFAULT 1,
  FOREIGN KEY(certificado_arquivo_id) REFERENCES documentos(id) ON DELETE SET NULL
);

-- 4. Restaurar dados convertendo TEXT para INTEGER
INSERT INTO qualificacoes_historico (
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
  numero_certificado, observacoes, arquivo_url, created_at, updated_at, deleted_at,
  data_conclusao, validade_meses, instrutor, local, modalidade, nota, carga_horaria,
  data_vencimento, renovada, certificado_arquivo_id, funcionario_cpf, qualificacao_codigo, empresa_id
)
SELECT 
  id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
  numero_certificado, observacoes, arquivo_url, created_at, updated_at, deleted_at,
  data_conclusao, validade_meses, instrutor, local, modalidade, nota, carga_horaria,
  data_vencimento, renovada, 
  CASE 
    WHEN certificado_arquivo_id IS NULL OR certificado_arquivo_id = '' THEN NULL
    ELSE CAST(certificado_arquivo_id AS INTEGER)
  END, -- Converter TEXT para INTEGER com segurança
  funcionario_cpf, qualificacao_codigo, 
  COALESCE(empresa_id, 1)
FROM qualificacoes_historico_backup_176;

-- 5. Limpar backup
DROP TABLE qualificacoes_historico_backup_176;

-- 6. Recriar índices
CREATE INDEX IF NOT EXISTS idx_historico_func_cpf ON qualificacoes_historico(funcionario_cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_qual_codigo ON qualificacoes_historico(qualificacao_codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_conclusao ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_funcionario_id ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_qualificacao_id ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_certificado_arquivo ON qualificacoes_historico(certificado_arquivo_id) WHERE deleted_at IS NULL AND certificado_arquivo_id IS NOT NULL;

-- 7. Recriar triggers (usando data_conclusao)
DROP TRIGGER IF EXISTS trg_calc_vencimento_insert;
DROP TRIGGER IF EXISTS trg_calc_vencimento_update;

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

-- Auditoria
SELECT '0176_fix_certificado_arquivo_id_type' AS migration_applied,
       COUNT(*) AS total_registros,
       COUNT(certificado_arquivo_id) AS total_com_certificado
FROM qualificacoes_historico;
