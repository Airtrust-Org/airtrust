-- Migration: 0187_remove_qualificacoes_duplicadas
-- Data: 2026-02-04
-- Descrição: Remove qualificações duplicadas, mantendo apenas uma de cada grupo

-- 1. Funcionário 32 - G2 (18 duplicatas)
-- Mantém ID 3931, remove os demais
UPDATE qualificacoes_historico 
SET deleted_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE funcionario_id = 32 
  AND qualificacao_codigo = 'G2' 
  AND id IN (3933, 3934, 3935, 3936, 3937, 3938, 3939, 3940, 3941, 3942, 3944, 3945, 3946, 3947, 3949, 3950, 3951)
  AND deleted_at IS NULL;

-- 2. Funcionário 39 - G2 (9 duplicatas)
-- Verifica e remove mantendo apenas o primeiro
WITH dup_39 AS (
  SELECT id 
  FROM qualificacoes_historico 
  WHERE funcionario_id = 39 
    AND qualificacao_codigo = 'G2' 
    AND deleted_at IS NULL
  ORDER BY id
  LIMIT -1 OFFSET 1
)
UPDATE qualificacoes_historico 
SET deleted_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE id IN (SELECT id FROM dup_39);

-- 3. LOFT com funcionario_id = NULL (7 duplicatas)
-- Verifica e remove mantendo apenas o primeiro
WITH dup_loft AS (
  SELECT id 
  FROM qualificacoes_historico 
  WHERE funcionario_id IS NULL 
    AND qualificacao_codigo = 'LOFT' 
    AND deleted_at IS NULL
  ORDER BY id
  LIMIT -1 OFFSET 1
)
UPDATE qualificacoes_historico 
SET deleted_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE id IN (SELECT id FROM dup_loft);

-- 4. Funcionário 41 - B (3 duplicatas)
-- Verifica e remove mantendo apenas o primeiro
WITH dup_41 AS (
  SELECT id 
  FROM qualificacoes_historico 
  WHERE funcionario_id = 41 
    AND qualificacao_codigo = 'B' 
    AND deleted_at IS NULL
  ORDER BY id
  LIMIT -1 OFFSET 1
)
UPDATE qualificacoes_historico 
SET deleted_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE id IN (SELECT id FROM dup_41);

-- Verificação final: confirmar que restou apenas 1 de cada grupo
SELECT 
  funcionario_id,
  qualificacao_codigo,
  COUNT(*) as total_restante
FROM qualificacoes_historico
WHERE deleted_at IS NULL
GROUP BY funcionario_id, qualificacao_codigo, categoria
HAVING COUNT(*) > 1;
