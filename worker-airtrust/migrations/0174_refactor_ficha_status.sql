-- Migration: Refactor Ficha Status Flow to 3 States
-- Date: 2026-01-10
-- Description: Simplify status flow by removing EM_PREENCHIMENTO and ASSINADA_TOTAL
--              New flow: AVALIACAO_PENDENTE → AGUARDANDO_ASSINATURAS → CONCLUIDA

-- Update existing fichas with old status values
UPDATE fichas_sessao 
SET status = 'AVALIACAO_PENDENTE', 
    updated_at = datetime('now')
WHERE status = 'EM_PREENCHIMENTO' 
  AND deleted_at IS NULL;

UPDATE fichas_sessao 
SET status = 'CONCLUIDA',
    updated_at = datetime('now')
WHERE status = 'ASSINADA_TOTAL' 
  AND deleted_at IS NULL;

-- Also update ASSINADA_ALUNO to AGUARDANDO_ASSINATURAS for consistency
UPDATE fichas_sessao 
SET status = 'AGUARDANDO_ASSINATURAS',
    updated_at = datetime('now')
WHERE status = 'ASSINADA_ALUNO' 
  AND deleted_at IS NULL;

-- Verify the migration
SELECT 
  status,
  COUNT(*) as total
FROM fichas_sessao
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY status;
