-- ============================================================
-- LOTE 2 ROLLBACK — documentos + pasta_virtual
-- Restaura empresa_id anterior usando snapshot pré-apply.
-- ============================================================

-- PASSO 1: Restaurar pasta_virtual para empresa_id=1
-- (pasta_virtual original era sempre empresa_id=1, nunca NULL — confirmar via snapshot)
UPDATE pasta_virtual
SET empresa_id = 1,
    updated_at = datetime('now')
WHERE empresa_id = 6
  AND deleted_at IS NULL
  AND id IN (
    -- IDs capturados na SEÇÃO 3 do dry-run antes do apply
    -- Substituir pela lista explícita do CSV snapshot
    SELECT pv.id FROM pasta_virtual pv
    INNER JOIN funcionarios f ON f.id = pv.funcionario_id AND f.empresa_id = 6
    WHERE pv.empresa_id = 6 AND pv.deleted_at IS NULL
      AND pv.created_at < '2026-06-08T00:00:00'  -- created before apply date
  );

-- PASSO 2: Restaurar documentos para empresa_id=1
UPDATE documentos
SET empresa_id = 1,
    updated_at = datetime('now')
WHERE empresa_id = 6
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM funcionarios
    WHERE id         = documentos.funcionario_id
      AND empresa_id = 6
      AND deleted_at IS NULL
  )
  AND created_at < '2026-06-08T00:00:00';
-- ATENÇÃO: Usar lista explícita de IDs do snapshot CSV para rollback preciso.
-- O filtro por data é um fallback; o snapshot é o método correto.

-- PASSO 3: Verificação pós-rollback
SELECT 'doc_e1_restaurados' AS check_item,
  (SELECT COUNT(*) FROM documentos d
   INNER JOIN funcionarios f ON f.id=d.funcionario_id AND f.empresa_id=6
   WHERE d.empresa_id=1 AND d.deleted_at IS NULL) AS valor

UNION ALL

SELECT 'pv_e1_restaurados',
  (SELECT COUNT(*) FROM pasta_virtual pv
   INNER JOIN funcionarios f ON f.id=pv.funcionario_id AND f.empresa_id=6
   WHERE pv.empresa_id=1 AND pv.deleted_at IS NULL);
