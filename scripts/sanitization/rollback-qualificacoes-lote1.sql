-- ============================================================
-- LOTE 1 ROLLBACK — qualificacoes_historico + qualificacoes_tipos
-- Restaura empresa_id=1 para todos os registros movidos pelo apply.
-- EXECUTAR NA ORDEM INVERSA do apply.
-- ============================================================

-- PASSO 1: Restaurar históricos soft-deleted (se o Passo 3 do apply foi executado)
-- UPDATE qualificacoes_historico
-- SET empresa_id = 1,
--     updated_at = datetime('now')
-- WHERE empresa_id = 6
--   AND deleted_at IS NOT NULL
--   AND id IN (
--     SELECT qh.id FROM qualificacoes_historico qh
--     INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
--     WHERE qh.empresa_id = 6
--       AND qh.deleted_at IS NOT NULL
--   );
-- ATENÇÃO: Esse rollback é amplo. Para rollback preciso, usar os IDs individuais
-- gerados pelo dry-run antes da aplicação.

-- PASSO 2: Restaurar históricos ATIVOS para empresa_id=1
-- Requer os IDs exatos que foram movidos.
-- Execute o SELECT abaixo ANTES do apply para capturar os IDs:
--
-- SELECT id FROM qualificacoes_historico
-- WHERE empresa_id = 1 AND deleted_at IS NULL
--   AND EXISTS (SELECT 1 FROM funcionarios WHERE id = funcionario_id AND empresa_id = 6 AND deleted_at IS NULL)
-- ORDER BY id;
--
-- Com a lista de IDs capturada, o rollback seria:
-- UPDATE qualificacoes_historico
-- SET empresa_id = 1, updated_at = datetime('now')
-- WHERE id IN ( /* ids capturados */ )
--   AND empresa_id = 6;

-- ROLLBACK GENÉRICO (seguro se empresa_id=1 estava vazio de históricos e6 antes):
UPDATE qualificacoes_historico
SET empresa_id  = 1,
    updated_at  = datetime('now')
WHERE empresa_id = 6
  AND deleted_at IS NULL
  AND id >= 4114
  AND id <= 4540
  AND EXISTS (
    SELECT 1 FROM funcionarios
     WHERE id         = qualificacoes_historico.funcionario_id
       AND empresa_id = 6
       AND deleted_at IS NULL
  );
-- ATENÇÃO: O range 4114-4540 cobre os IDs observados na auditoria.
-- Verificar IDs exatos antes de executar. Preferir lista de IDs explícita.

-- PASSO 3: Restaurar tipos para empresa_id=1
UPDATE qualificacoes_tipos
SET empresa_id = 1,
    updated_at = datetime('now')
WHERE id IN (105, 106, 110, 111, 112, 113, 114, 115)
  AND empresa_id = 6;
-- Esperado: 8 linhas afetadas

-- PASSO 4: Verificação pós-rollback
SELECT
  'historicos_e1_restaurados' AS check_item,
  COUNT(*) AS valor
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
WHERE qh.empresa_id = 1 AND qh.deleted_at IS NULL

UNION ALL

SELECT
  'tipos_e1_restaurados' AS check_item,
  COUNT(*) AS valor
FROM qualificacoes_tipos
WHERE id IN (105, 106, 110, 111, 112, 113, 114, 115)
  AND empresa_id = 1;
