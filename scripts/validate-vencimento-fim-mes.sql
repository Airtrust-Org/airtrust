-- PHASE 1 VALIDATION: vencimento_fim_mes schema and data
-- Run via: npx wrangler d1 execute airtrust-db --remote --file=scripts/validate-vencimento-fim-mes.sql

-- 1. Check column exists and has correct constraints
SELECT 
  '✅ Schema Check' as test,
  name as column_name,
  type as column_type,
  "notnull" as not_null,
  dflt_value as default_value
FROM pragma_table_info('qualificacoes_tipos')
WHERE name = 'vencimento_fim_mes';

-- 2. Check index exists
SELECT 
  '✅ Index Check' as test,
  name as index_name,
  tbl_name as table_name,
  sql
FROM sqlite_master
WHERE type = 'index' 
  AND name = 'idx_qualificacoes_tipos_vencimento_fim_mes';

-- 3. Validate only 0 or 1 values exist
SELECT 
  '✅ Value Range Check' as test,
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS: No invalid values'
    ELSE 'FAIL: Found ' || COUNT(*) || ' invalid records'
  END as result
FROM qualificacoes_tipos
WHERE deleted_at IS NULL 
  AND vencimento_fim_mes NOT IN (0, 1);

-- 4. Distribution of values
SELECT 
  '✅ Distribution Check' as test,
  vencimento_fim_mes,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL), 2) as percentage
FROM qualificacoes_tipos
WHERE deleted_at IS NULL
GROUP BY vencimento_fim_mes
ORDER BY vencimento_fim_mes;

-- 5. Sample medical types (should be vencimento_fim_mes=1)
SELECT 
  '✅ Medical Types Sample' as test,
  codigo,
  nome,
  vencimento_fim_mes,
  CASE 
    WHEN vencimento_fim_mes = 1 THEN '✓ Correct'
    ELSE '✗ Should be 1'
  END as validation
FROM qualificacoes_tipos
WHERE deleted_at IS NULL
  AND (
    codigo LIKE '%CMA%' 
    OR codigo LIKE '%ASO%' 
    OR nome LIKE '%Médic%'
  )
LIMIT 5;

-- 6. Check no NULL values
SELECT 
  '✅ NULL Check' as test,
  COUNT(*) as null_count,
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS: No NULL values'
    ELSE 'FAIL: Found ' || COUNT(*) || ' NULL records'
  END as result
FROM qualificacoes_tipos
WHERE deleted_at IS NULL 
  AND vencimento_fim_mes IS NULL;

-- 7. Total active records
SELECT 
  '✅ Active Records Count' as test,
  COUNT(*) as total_active
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;
