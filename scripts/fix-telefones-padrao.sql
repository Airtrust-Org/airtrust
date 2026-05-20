-- fix-telefones-padrao.sql
-- Padroniza formato de telefones dos funcionários
-- Remove caracteres especiais e adiciona formatação padrão
-- Formato esperado: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX

-- Primeiro, limpar telefones NULL ou vazios
UPDATE funcionarios
SET telefone = NULL
WHERE telefone IS NOT NULL 
  AND (TRIM(telefone) = '' OR telefone = 'null')
  AND deleted_at IS NULL;

-- Criar função auxiliar para limpar telefone (apenas dígitos)
-- Depois aplicar formato padrão

-- Para SQLite, vamos limpar e formatar em uma única query
UPDATE funcionarios
SET 
  telefone = 
    CASE 
      -- Se telefone tem 11 dígitos (celular): (XX) XXXXX-XXXX
      WHEN LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '.', '')) = 11 
      THEN 
        '(' || 
        SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '.', ''), 1, 2) || 
        ') ' || 
        SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '.', ''), 3, 5) || 
        '-' || 
        SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '.', ''), 8, 4)
      
      -- Se telefone tem 10 dígitos (fixo): (XX) XXXX-XXXX
      WHEN LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '.', '')) = 10 
      THEN 
        '(' || 
        SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '.', ''), 1, 2) || 
        ') ' || 
        SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '.', ''), 3, 4) || 
        '-' || 
        SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', ''), '.', ''), 7, 4)
      
      -- Se não tem formato esperado, manter como está
      ELSE telefone
    END,
  updated_at = datetime('now')
WHERE 
  telefone IS NOT NULL
  AND deleted_at IS NULL;

-- Verificar resultado
SELECT 
  'Telefones formatados' as descricao,
  COUNT(*) as quantidade
FROM funcionarios
WHERE telefone LIKE '(__)%' AND deleted_at IS NULL;

SELECT 
  'Telefones sem formato padrão' as descricao,
  COUNT(*) as quantidade
FROM funcionarios
WHERE telefone IS NOT NULL 
  AND telefone NOT LIKE '(__)%' 
  AND deleted_at IS NULL;
