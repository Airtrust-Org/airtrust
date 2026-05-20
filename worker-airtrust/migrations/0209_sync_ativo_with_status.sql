-- ========================================================
-- Migration 0209: Sincronizar coluna ativo com coluna status
-- ========================================================
-- Data: 25/02/2026
-- Objetivo: Garantir que ativo=1 quando status='ATIVO'
--           e ativo=0 para qualquer outro status (INATIVO, DESLIGADO, AFASTADO, FERIAS)
-- Contexto: Correção de inconsistência - quando status era alterado para
--           DESLIGADO/INATIVO, a coluna ativo não era atualizada.
--           Isso causava funcionários não-ativos aparecendo no filtro
--           e funcionários ativos desaparecendo da listagem.
-- ========================================================

-- Marcar como ATIVO (ativo=1) todos que possuem status='ATIVO' ou status NULL/vazio
UPDATE funcionarios
SET ativo = 1, updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
  AND ativo != 1;

-- Marcar como INATIVO (ativo=0) todos que possuem status != 'ATIVO'
UPDATE funcionarios
SET ativo = 0, updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) != 'ATIVO'
  AND ativo != 0;
