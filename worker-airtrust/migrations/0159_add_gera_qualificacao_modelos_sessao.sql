-- Migration: Adicionar coluna gera_qualificacao em modelos_sessao
-- Data: 04/12/2025
-- Descrição: Permite configurar se um modelo de sessão deve ter botão de gerar qualificação

ALTER TABLE modelos_sessao ADD COLUMN gera_qualificacao BOOLEAN DEFAULT 0;

-- Atualizar modelos existentes (sessão 12 - Check Final gera qualificação)
UPDATE modelos_sessao 
SET gera_qualificacao = 1 
WHERE nome LIKE '%CHECK FINAL%' OR nome LIKE '%12/12%' OR codigo LIKE '%12/12%';
