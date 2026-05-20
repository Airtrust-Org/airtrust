-- fix-codigo-anac-formato.sql
-- Formata códigos ANAC para o padrão XXXXX-X (5 dígitos, hífen, 1 dígito)
-- Exemplo: 126947 -> 12694-7

UPDATE funcionarios
SET 
  codigo_anac = 
    CASE 
      -- Se tem exatamente 6 dígitos sem hífen, formata como XXXXX-X
      WHEN LENGTH(REPLACE(codigo_anac, '-', '')) = 6 
           AND codigo_anac GLOB '[0-9]*' 
      THEN 
        SUBSTR(REPLACE(codigo_anac, '-', ''), 1, 5) || '-' || 
        SUBSTR(REPLACE(codigo_anac, '-', ''), 6, 1)
      
      -- Se já tem hífen mas está em formato incorreto, corrige
      WHEN codigo_anac LIKE '%-%' 
           AND LENGTH(REPLACE(codigo_anac, '-', '')) = 6
      THEN
        SUBSTR(REPLACE(codigo_anac, '-', ''), 1, 5) || '-' || 
        SUBSTR(REPLACE(codigo_anac, '-', ''), 6, 1)
      
      -- Mantém como está se não atender aos critérios
      ELSE codigo_anac
    END,
  updated_at = datetime('now')
WHERE 
  codigo_anac IS NOT NULL
  AND deleted_at IS NULL
  AND (
    -- Precisa de formatação se tem 6 dígitos mas não está no formato correto
    (LENGTH(REPLACE(codigo_anac, '-', '')) = 6 AND codigo_anac NOT LIKE '_____-_')
    OR
    -- Ou se tem hífen em posição errada
    (codigo_anac LIKE '%-%' AND codigo_anac NOT LIKE '_____-_')
  );

-- Verificar resultado
SELECT 
  'Códigos ANAC formatados' as descricao,
  COUNT(*) as quantidade
FROM funcionarios
WHERE codigo_anac LIKE '_____-_' AND deleted_at IS NULL;

SELECT 
  'Códigos ANAC sem formato padrão' as descricao,
  COUNT(*) as quantidade
FROM funcionarios
WHERE codigo_anac IS NOT NULL 
  AND codigo_anac NOT LIKE '_____-_' 
  AND deleted_at IS NULL;
