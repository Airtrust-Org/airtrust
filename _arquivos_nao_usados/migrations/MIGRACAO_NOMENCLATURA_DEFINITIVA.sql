-- =============================================
-- SCRIPT DE MIGRAÇÃO: Nomenclatura Definitiva
-- Data: 14 de Novembro de 2025
-- Objetivo: Renomear tabelas para nomenclatura correta
-- =============================================

-- ⚠️ ATENÇÃO: Execute este script APENAS se as tabelas antigas ainda existirem
-- ⚠️ Faça backup do banco antes de executar!

-- 1. Verificar se tabela habilitacoes existe
-- Se existir, migrar dados para qualificacoes_historico

BEGIN TRANSACTION;

-- Criar qualificacoes_historico se não existir
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  data_emissao DATE NOT NULL,
  data_validade DATE,
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK(status IN ('ATIVO', 'VENCIDO', 'A_VENCER', 'CANCELADO')),
  numero_certificado TEXT,
  arquivo_certificado TEXT,
  observacoes TEXT,
  is_renovacao BOOLEAN DEFAULT 0,
  renovacao_de_id INTEGER,
  emitido_por TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id),
  FOREIGN KEY (renovacao_de_id) REFERENCES qualificacoes_historico(id)
);

-- Criar índices em qualificacoes_historico
CREATE INDEX IF NOT EXISTS idx_qualif_hist_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualif_hist_tipo ON qualificacoes_historico(qualificacao_tipo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualif_hist_validade ON qualificacoes_historico(data_validade) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualif_hist_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualif_hist_renovacao ON qualificacoes_historico(renovacao_de_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualif_hist_deleted ON qualificacoes_historico(deleted_at);

-- Migrar dados de habilitacoes para qualificacoes_historico (se habilitacoes existir)
INSERT OR IGNORE INTO qualificacoes_historico (
  uuid, funcionario_id, qualificacao_tipo_id, data_emissao, data_validade,
  status, numero_certificado, arquivo_certificado, observacoes,
  is_renovacao, renovacao_de_id, emitido_por, created_at, updated_at, deleted_at
)
SELECT 
  COALESCE(uuid, lower(hex(randomblob(16)))), -- Gerar UUID se não existir
  funcionario_id,
  COALESCE(qualificacao_id, qualificacao_tipo_id) as qualificacao_tipo_id,
  COALESCE(data_conclusao, data_emissao, created_at) as data_emissao,
  COALESCE(data_vencimento, data_validade) as data_validade,
  CASE 
    WHEN status = 'ATIVA' THEN 'ATIVO'
    WHEN status = 'VENCIDA' THEN 'VENCIDO'
    WHEN status IN ('ATIVO', 'VENCIDO', 'A_VENCER', 'CANCELADO') THEN status
    ELSE 'ATIVO'
  END as status,
  numero_certificado,
  arquivo_certificado,
  observacoes,
  COALESCE(is_renovada, is_renovacao, 0) as is_renovacao,
  COALESCE(habilitacao_anterior_id, renovacao_de_id) as renovacao_de_id,
  COALESCE(instrutor, emitido_por) as emitido_por,
  created_at,
  updated_at,
  deleted_at
FROM habilitacoes
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='habilitacoes');

-- Renomear qualificacoes para qualificacoes_tipos (se ainda não foi feito)
-- Verificar se tabela qualificacoes existe e NÃO é qualificacoes_tipos
DROP TABLE IF EXISTS qualificacoes_tipos_backup;
ALTER TABLE qualificacoes_tipos RENAME TO qualificacoes_tipos_backup;

-- Se qualificacoes existir, renomear para qualificacoes_tipos
ALTER TABLE qualificacoes RENAME TO qualificacoes_tipos
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='qualificacoes')
  AND NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='qualificacoes_tipos');

-- Restaurar backup se existir
ALTER TABLE qualificacoes_tipos_backup RENAME TO qualificacoes_tipos
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='qualificacoes_tipos_backup');

COMMIT;

-- 2. Dropar tabelas antigas (APENAS após confirmar que migração funcionou)
-- ⚠️ COMENTE estas linhas até ter certeza de que os dados foram migrados corretamente!

-- DROP TABLE IF EXISTS habilitacoes;
-- DROP TABLE IF EXISTS tipos_qualificacoes;

-- 3. Atualizar referências em outras tabelas (se existirem)

-- Certificados
UPDATE certificados 
SET habilitacao_id = NULL 
WHERE habilitacao_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico WHERE id = certificados.habilitacao_id);

-- Auditoria
UPDATE auditoria 
SET tabela_afetada = 'qualificacoes_historico' 
WHERE tabela_afetada = 'habilitacoes';

UPDATE auditoria 
SET tabela_afetada = 'qualificacoes_tipos' 
WHERE tabela_afetada = 'qualificacoes';

-- 4. Recalcular status de todas as qualificacoes_historico
UPDATE qualificacoes_historico
SET 
  status = CASE
    WHEN data_validade IS NULL THEN 'ATIVO'
    WHEN julianday(data_validade) - julianday('now', 'localtime') < 0 THEN 'VENCIDO'
    WHEN julianday(data_validade) - julianday('now', 'localtime') <= 30 THEN 'A_VENCER'
    ELSE 'ATIVO'
  END,
  updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND status != 'CANCELADO';

-- 5. Verificação final
SELECT 
  'qualificacoes_tipos' as tabela,
  COUNT(*) as total_registros,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos
FROM qualificacoes_tipos
UNION ALL
SELECT 
  'qualificacoes_historico' as tabela,
  COUNT(*) as total_registros,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos
FROM qualificacoes_historico;

-- Fim da migração
