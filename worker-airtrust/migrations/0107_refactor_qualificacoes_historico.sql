-- ================================================================
-- Migration 0107: Refatorar tabela QUALIFICACOES_HISTORICO
-- Data: 2025-11-25
-- Objetivo: Normalizar - APENAS FKs + dados do evento (sem duplicação)
-- ================================================================

-- 1. Backup da tabela antiga
DROP TABLE IF EXISTS qualificacoes_historico_old;
ALTER TABLE qualificacoes_historico RENAME TO qualificacoes_historico_old;

-- 2. Criar tabela normalizada (apenas FKs + evento)
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- FKs obrigatórias (sem duplicação de dados)
  funcionario_cpf TEXT NOT NULL,
  qualificacao_codigo TEXT NOT NULL COLLATE NOCASE,
  
  -- Dados do evento (planilha oficial)
  data_conclusao TEXT NOT NULL, -- ISO date YYYY-MM-DD
  data_vencimento TEXT, -- ISO date YYYY-MM-DD
  carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  nota REAL CHECK(nota IS NULL OR (nota >= 1.0 AND nota <= 5.0)),
  codigo TEXT, -- código interno/matrícula do curso
  certificado_arquivo_id TEXT, -- FK → arquivos.id
  instrutor TEXT,
  local TEXT,
  modalidade TEXT CHECK(modalidade IS NULL OR modalidade IN ('PRESENCIAL', 'EAD', 'HIBRIDO')),
  observacoes TEXT,
  
  -- Auditoria
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  
  -- Constraints de integridade
  FOREIGN KEY (funcionario_cpf) REFERENCES funcionarios(cpf) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  FOREIGN KEY (qualificacao_codigo) REFERENCES qualificacoes_tipos(codigo) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  FOREIGN KEY (certificado_arquivo_id) REFERENCES arquivos(id) 
    ON DELETE SET NULL
);

-- 3. Índices para performance e queries JOIN (idempotentes)
CREATE INDEX IF NOT EXISTS idx_historico_func_cpf ON qualificacoes_historico(funcionario_cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_qual_codigo ON qualificacoes_historico(qualificacao_codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_conclusao ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_certificado ON qualificacoes_historico(certificado_arquivo_id) WHERE deleted_at IS NULL;

-- 4. Migrar dados compatíveis da tabela antiga
INSERT INTO qualificacoes_historico (
  funcionario_cpf,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  carga_horaria,
  nota,
  instrutor,
  local,
  observacoes,
  created_at,
  updated_at
)
SELECT 
  funcionario_cpf,
  UPPER(qualificacao_codigo) as qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  carga_horaria,
  nota,
  instrutor,
  local,
  observacoes,
  created_at,
  updated_at
FROM qualificacoes_historico_old 
WHERE funcionario_cpf IS NOT NULL 
  AND qualificacao_codigo IS NOT NULL
  AND data_conclusao IS NOT NULL
  AND EXISTS (SELECT 1 FROM funcionarios WHERE cpf = funcionario_cpf)
  AND EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(qualificacao_codigo));

-- 5. Limpar backup
DROP TABLE qualificacoes_historico_old;

-- ================================================================
-- VALIDAÇÕES PÓS-MIGRATION
-- ================================================================
-- 1. SELECT COUNT(*) FROM qualificacoes_historico; -- verificar migração
-- 2. PRAGMA table_info('qualificacoes_historico'); -- verificar colunas
-- 3. PRAGMA foreign_key_list('qualificacoes_historico'); -- verificar FKs
-- 4. Query com JOIN:
--    SELECT h.*, f.nome, q.nome 
--    FROM qualificacoes_historico h
--    JOIN funcionarios f ON h.funcionario_cpf = f.cpf
--    JOIN qualificacoes_tipos q ON h.qualificacao_codigo = q.codigo
--    LIMIT 5;
