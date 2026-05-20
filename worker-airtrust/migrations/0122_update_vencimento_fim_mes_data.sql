-- Migration: Update vencimento_fim_mes for existing records
-- Set vencimento_fim_mes=1 (end of month) for medical qualification types
-- Set vencimento_fim_mes=0 (exact day) for operational qualification types

-- Medical types: expire at end of month
UPDATE qualificacoes_tipos 
SET vencimento_fim_mes = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND (
    codigo LIKE '%CMA%' 
    OR codigo LIKE '%ASO%' 
    OR codigo LIKE '%MEDIC%'
    OR nome LIKE '%CMA%'
    OR nome LIKE '%ASO%'
    OR nome LIKE '%Médic%'
    OR nome LIKE '%Saúde%'
    OR categoria = 'MEDICO'
  );

-- Operational types: expire on exact day (already default 0, but explicit update for clarity)
UPDATE qualificacoes_tipos 
SET vencimento_fim_mes = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND vencimento_fim_mes IS NULL;

-- Verify results
SELECT 
  vencimento_fim_mes,
  COUNT(*) as count,
  GROUP_CONCAT(DISTINCT codigo) as sample_codigos
FROM qualificacoes_tipos
WHERE deleted_at IS NULL
GROUP BY vencimento_fim_mes
ORDER BY vencimento_fim_mes;
