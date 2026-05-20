-- Migration 0107: Corrigir estrutura qualificacoes_historico para usar chaves naturais
-- Data: 2025-11-25
-- Objetivo: Substituir funcionario_id/qualificacao_id por funcionario_cpf/qualificacao_codigo
-- Beneficios:
--   - Importacao Excel direta (sem lookups)
--   - FKs validam automaticamente
--   - Codigo mais simples
--   - Zero redundancia
--   - Performance melhor

-- =============================
-- 1. BACKUP DA TABELA ANTIGA
-- =============================
DROP TABLE IF EXISTS qualificacoes_historico_old;
ALTER TABLE qualificacoes_historico RENAME TO qualificacoes_historico_old;

-- =============================
-- 2. CRIAR NOVA ESTRUTURA (CORRETA)
-- =============================
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 🎯 FKs para chaves naturais (não IDs)
  funcionario_cpf TEXT NOT NULL,
  qualificacao_codigo TEXT NOT NULL,
  
  -- Dados do evento
  data_conclusao TEXT NOT NULL,
  data_vencimento TEXT,
  validade_meses INTEGER,
  carga_horaria REAL,
  nota REAL CHECK(nota IS NULL OR (nota >= 1.0 AND nota <= 5.0)),
  numero_certificado TEXT,
  codigo TEXT,
  categoria TEXT,
  tipo_codigo TEXT,
  certificado_arquivo_id TEXT,
  arquivo_url TEXT,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT CHECK(modalidade IS NULL OR modalidade IN ('PRESENCIAL', 'EAD', 'HIBRIDO', 'ONLINE', 'SIMULATOR')),
  observacoes TEXT,
  
  -- Flags
  renovada INTEGER DEFAULT 0,
  
  -- Auditoria
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  
  -- 🔐 FKs corretas para chaves naturais
  FOREIGN KEY (funcionario_cpf) REFERENCES funcionarios(cpf) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  FOREIGN KEY (qualificacao_codigo) REFERENCES qualificacoes_tipos(codigo) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
  FOREIGN KEY (certificado_arquivo_id) REFERENCES arquivos(id) 
    ON DELETE SET NULL
);

-- =============================
-- 3. MIGRAR DADOS ANTIGOS (se existirem)
-- =============================
INSERT INTO qualificacoes_historico (
  funcionario_cpf,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  validade_meses,
  carga_horaria,
  nota,
  numero_certificado,
  codigo,
  categoria,
  tipo_codigo,
  arquivo_url,
  instrutor,
  local,
  modalidade,
  observacoes,
  renovada,
  created_at,
  updated_at,
  deleted_at
)
SELECT 
  COALESCE(h.funcionario_cpf, f.cpf) as funcionario_cpf,
  COALESCE(h.qualificacao_codigo, q.codigo) as qualificacao_codigo,
  h.data_conclusao,
  h.data_vencimento,
  h.validade_meses,
  h.carga_horaria,
  h.nota,
  h.numero_certificado,
  h.codigo,
  h.categoria,
  h.tipo_codigo,
  h.arquivo_url,
  h.instrutor,
  h.local,
  h.modalidade,
  h.observacoes,
  COALESCE(h.renovada, 0),
  h.created_at,
  h.updated_at,
  h.deleted_at
FROM qualificacoes_historico_old h
LEFT JOIN funcionarios f ON h.funcionario_id = f.id
LEFT JOIN qualificacoes_tipos q ON h.qualificacao_id = q.id
WHERE COALESCE(h.funcionario_cpf, f.cpf) IS NOT NULL 
  AND COALESCE(h.qualificacao_codigo, q.codigo) IS NOT NULL;

-- =============================
-- 4. CRIAR ÍNDICES OTIMIZADOS
-- =============================
CREATE INDEX IF NOT EXISTS idx_historico_func_cpf 
  ON qualificacoes_historico(funcionario_cpf) 
  WHERE deleted_at IS NULL;
  
CREATE INDEX IF NOT EXISTS idx_historico_qual_codigo 
  ON qualificacoes_historico(qualificacao_codigo) 
  WHERE deleted_at IS NULL;
  
CREATE INDEX IF NOT EXISTS idx_historico_data_conclusao 
  ON qualificacoes_historico(data_conclusao) 
  WHERE deleted_at IS NULL;
  
CREATE INDEX IF NOT EXISTS idx_historico_data_vencimento 
  ON qualificacoes_historico(data_vencimento) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_historico_funcionario_vencimento 
  ON qualificacoes_historico(funcionario_cpf, data_vencimento) 
  WHERE deleted_at IS NULL;

-- =============================
-- 5. RECRIAR VIEW NORMALIZADA
-- =============================
DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT 
  h.id,
  h.funcionario_cpf,
  h.qualificacao_codigo,
  h.data_conclusao,
  h.data_vencimento,
  h.validade_meses,
  h.carga_horaria,
  h.nota,
  h.numero_certificado,
  h.codigo,
  h.categoria,
  h.tipo_codigo,
  h.certificado_arquivo_id,
  h.arquivo_url,
  h.instrutor,
  h.local,
  h.modalidade,
  h.observacoes,
  h.renovada,
  h.created_at,
  h.updated_at,
  h.deleted_at,
  
  -- Dados do funcionario
  f.id as funcionario_id,
  f.nome as funcionario_nome,
  f.matricula as funcionario_matricula,
  f.canac as funcionario_canac,
  f.email as funcionario_email,
  
  -- Dados da qualificacao
  q.id as qualificacao_id,
  q.nome as qualificacao_nome,
  q.tipo as qualificacao_tipo,
  q.categoria as qualificacao_categoria,
  COALESCE(h.validade_meses, q.validade) as qualificacao_validade_meses,
  q.obrigatoria as qualificacao_obrigatoria,
  
  -- Status calculado
  CASE
    WHEN h.deleted_at IS NOT NULL THEN 'REMOVIDA'
    WHEN h.data_vencimento IS NULL THEN 'INDETERMINADA'
    WHEN DATE(h.data_vencimento) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(h.data_vencimento) <= DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(h.data_vencimento) <= DATE('now', '+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END as status_calculado,
  
  -- Dias até vencimento
  CAST(JULIANDAY(h.data_vencimento) - JULIANDAY('now') AS INTEGER) as dias_ate_vencimento
  
FROM qualificacoes_historico h
INNER JOIN funcionarios f ON h.funcionario_cpf = f.cpf AND f.deleted_at IS NULL
INNER JOIN qualificacoes_tipos q ON h.qualificacao_codigo = q.codigo AND q.deleted_at IS NULL;

-- =============================
-- 6. TRIGGER DE AUDITORIA
-- =============================
DROP TRIGGER IF EXISTS trg_qh_updated_at;
CREATE TRIGGER trg_qh_updated_at
AFTER UPDATE ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at OR NEW.updated_at IS NULL
BEGIN
  UPDATE qualificacoes_historico 
  SET updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

-- =============================
-- VERIFICAÇÃO PÓS-MIGRATION
-- =============================
-- SELECT 'Migration 0107 aplicada com sucesso!' as status;
-- SELECT COUNT(*) as total_registros FROM qualificacoes_historico;
-- SELECT COUNT(*) as total_migrados FROM qualificacoes_historico WHERE created_at < datetime('now', '-1 minute');
-- 
-- Para remover backup após validar:
-- DROP TABLE qualificacoes_historico_old;
