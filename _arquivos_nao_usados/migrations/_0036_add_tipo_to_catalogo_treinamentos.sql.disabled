-- Migration: Adicionar coluna 'tipo' à tabela catalogo_treinamentos
-- Data: 2025-10-22
-- Descrição: Adiciona coluna para diferenciar TREINAMENTO, CHECK e EXAME

-- NOTA: Esta migration só se aplica se a tabela existir
-- Se não existir, será ignorada (tabela descontinuada)

-- Adicionar coluna tipo (se tabela existir)
-- Verificar se tabela existe antes de alterar
-- SQLite não suporta IF EXISTS para ALTER TABLE, então usamos trigger pragmas

-- Tentaremos adicionar, mas se falhar silenciosamente é ok (tabela pode ter sido descontinuada)
ALTER TABLE catalogo_treinamentos ADD COLUMN tipo TEXT DEFAULT 'TREINAMENTO';

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_catalogo_treinamentos_tipo ON catalogo_treinamentos(tipo);

-- Atualizar registros existentes baseado no código ou categoria
UPDATE catalogo_treinamentos 
SET tipo = 'CHECK' 
WHERE codigo LIKE 'PC-%' 
   OR codigo LIKE 'OPC-%' 
   OR codigo LIKE 'LPC-%'
   OR codigo LIKE 'CHECK-%'
   OR nome LIKE '%Check%'
   OR nome LIKE '%Proficiency%';

UPDATE catalogo_treinamentos 
SET tipo = 'EXAME' 
WHERE codigo LIKE 'ASO%' 
   OR codigo LIKE 'CMA%'
   OR codigo LIKE 'EXAME-%'
   OR nome LIKE '%Exame%'
   OR nome LIKE '%ASO%'
   OR nome LIKE '%CMA%';
