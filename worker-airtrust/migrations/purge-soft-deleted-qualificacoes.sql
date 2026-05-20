-- ================================================================
-- HARD DELETE (PURGE) - Qualificações Soft-Deleted
-- ================================================================
-- Remove permanentemente registros com deleted_at preenchido
-- Impacto: Remove 2179 registros (~78% da tabela qualificacoes_historico)
-- Data: 2025-11-29
-- ================================================================

BEGIN TRANSACTION;

-- 1. Backup count antes do purge
SELECT 
  'ANTES DO PURGE' as momento,
  COUNT(*) as total_registros,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deletados
FROM qualificacoes_historico;

-- 2. HARD DELETE - Remove permanentemente registros soft-deleted
DELETE FROM qualificacoes_historico 
WHERE deleted_at IS NOT NULL;

-- 3. Count após purge
SELECT 
  'DEPOIS DO PURGE' as momento,
  COUNT(*) as total_registros,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deletados
FROM qualificacoes_historico;

-- 4. Verificar espaço recuperado
SELECT 
  'ESTATISTICAS' as info,
  page_count * page_size / 1024 / 1024 as tamanho_mb
FROM pragma_page_count(), pragma_page_size();

COMMIT;

-- 5. VACUUM para recuperar espaço físico do arquivo DB
-- (Executar separadamente após o commit)
VACUUM;

-- ================================================================
-- RESULTADO ESPERADO:
-- - Antes: 2806 total (627 ativos, 2179 deletados)
-- - Depois: 627 total (627 ativos, 0 deletados)
-- - Redução: ~78% dos registros removidos
-- - Espaço: DB deve reduzir de ~6.8 MB para ~1.5 MB
-- ================================================================
