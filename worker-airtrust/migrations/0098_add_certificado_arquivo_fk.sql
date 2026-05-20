-- Migration 0098: Adicionar FK certificado_arquivo_id
-- Data: 2025-11-24
-- Objetivo: Substituir numero_certificado (TEXT) por FK para arquivos
-- Estratégia: Adicionar coluna opcional, manter numero_certificado para compatibilidade

-- 1. Adicionar coluna certificado_arquivo_id (FK para tabela arquivos)
ALTER TABLE qualificacoes_historico 
  ADD COLUMN certificado_arquivo_id INTEGER REFERENCES arquivos(id);

-- 2. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_qh_certificado_arquivo 
  ON qualificacoes_historico(certificado_arquivo_id) 
  WHERE deleted_at IS NULL;

-- Checklist pós-migração:
-- 1. PRAGMA table_info('qualificacoes_historico') - verificar coluna certificado_arquivo_id
-- 2. Testar INSERT com certificado_arquivo_id NULL
-- 3. Testar INSERT com certificado_arquivo_id válido
-- 4. SELECT * FROM qualificacoes_historico WHERE certificado_arquivo_id IS NOT NULL

-- NOTA: numero_certificado continua existindo para compatibilidade.
-- Em futuro próximo, migrar dados: criar registro em arquivos para cada certificado.
