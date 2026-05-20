-- fix-matriculas-5-digitos.sql
-- Corrige todas as matrículas para ter 5 dígitos com zeros à esquerda
-- Exemplo: 246 -> 00246, 4 -> 00004

UPDATE funcionarios
SET 
  matricula = 
    CASE 
      WHEN LENGTH(matricula) = 1 THEN '0000' || matricula
      WHEN LENGTH(matricula) = 2 THEN '000' || matricula
      WHEN LENGTH(matricula) = 3 THEN '00' || matricula
      WHEN LENGTH(matricula) = 4 THEN '0' || matricula
      ELSE matricula
    END,
  updated_at = datetime('now')
WHERE 
  LENGTH(matricula) < 5
  AND deleted_at IS NULL
  AND matricula GLOB '[0-9]*';

-- Verificar resultado
SELECT 
  'Total de matrículas corrigidas' as descricao,
  COUNT(*) as quantidade
FROM funcionarios
WHERE LENGTH(matricula) = 5 AND deleted_at IS NULL;
