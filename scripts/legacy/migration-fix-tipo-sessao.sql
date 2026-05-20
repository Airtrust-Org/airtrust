-- ========================================
-- MIGRATION: Corrigir tipo_sessao 
-- ========================================
-- Problema: tipo_sessao foi salvo com nome do modelo (ex: "02/03: IFR CICLO 2")
-- Solução: Extrair o tipo correto dos nomes salvos

-- 1. Criar coluna temporária para guardar tipo correto
ALTER TABLE simulador_agendamentos 
ADD COLUMN tipo_sessao_novo TEXT;

-- 2. Mapear nomes salvos para códigos corretos
UPDATE simulador_agendamentos 
SET tipo_sessao_novo = 'INI'
WHERE tipo_sessao LIKE '%INICIAL%' 
   OR tipo_sessao LIKE '%INI%';

UPDATE simulador_agendamentos 
SET tipo_sessao_novo = 'PER'
WHERE tipo_sessao LIKE '%PERIÓDICA%' 
   OR tipo_sessao LIKE '%PER%'
   OR tipo_sessao LIKE '%IFR%';

UPDATE simulador_agendamentos 
SET tipo_sessao_novo = 'TREINAMENTO'
WHERE tipo_sessao IS NULL OR tipo_sessao = '';

-- 3. Se ainda houver valores que não foram mapeados, usar TREINAMENTO como padrão
UPDATE simulador_agendamentos 
SET tipo_sessao_novo = 'TREINAMENTO'
WHERE tipo_sessao_novo IS NULL;

-- 4. Substituir coluna antiga
UPDATE simulador_agendamentos 
SET tipo_sessao = tipo_sessao_novo;

-- 5. Remover coluna temporária
ALTER TABLE simulador_agendamentos 
DROP COLUMN tipo_sessao_novo;

-- 6. Verificar resultado
SELECT 
  id, 
  tipo_sessao, 
  nome as tema_sessao,
  COUNT(*) as total
FROM simulador_agendamentos
WHERE deleted_at IS NULL
GROUP BY tipo_sessao
ORDER BY tipo_sessao;
