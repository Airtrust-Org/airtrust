-- ============================================================
-- LOTE 2 APPLY — documentos + pasta_virtual
-- ATENÇÃO: Contém UPDATEs reais. NÃO EXECUTAR sem autorização.
-- Pré-condições: ver docs/AIRTRUST_DOCUMENTS_TENANT_RECONCILIATION_DRY_RUN_20260607.md
-- ============================================================
-- EXECUTAR NA ORDEM:
--   Passo 1 → documentos (45 registros ativos)
--   Passo 2 → pasta_virtual (60 registros ativos)
--   Passo 3 → verificação pós-apply
-- ============================================================

-- PRÉ-CHECK obrigatório (deve retornar 0 duplicatas):
-- SELECT d1.id FROM documentos d1
-- INNER JOIN documentos d6 ON d6.funcionario_id=d1.funcionario_id
--   AND d6.nome_arquivo=d1.nome_arquivo AND d6.empresa_id=6 AND d6.deleted_at IS NULL
-- INNER JOIN funcionarios f ON f.id=d1.funcionario_id AND f.empresa_id=6
-- WHERE d1.empresa_id=1 AND d1.deleted_at IS NULL;

-- PASSO 1: Mover documentos para empresa_id=6
UPDATE documentos
SET empresa_id  = 6,
    updated_at  = datetime('now')
WHERE empresa_id = 1
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM funcionarios
    WHERE id         = documentos.funcionario_id
      AND empresa_id = 6
      AND deleted_at IS NULL
  );
-- Esperado: 45 linhas afetadas

-- PASSO 2: Mover pasta_virtual para empresa_id=6
UPDATE pasta_virtual
SET empresa_id  = 6,
    updated_at  = datetime('now')
WHERE (empresa_id IS NULL OR empresa_id = 1)
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM funcionarios
    WHERE id         = pasta_virtual.funcionario_id
      AND empresa_id = 6
      AND deleted_at IS NULL
  );
-- Esperado: 60 linhas afetadas

-- PASSO 3: Verificação pós-apply
SELECT 'doc_e1_residuais' AS check_item, COUNT(*) AS valor
FROM documentos d
INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.empresa_id = 6
WHERE d.empresa_id = 1 AND d.deleted_at IS NULL

UNION ALL

SELECT 'pv_e1_residuais', COUNT(*)
FROM pasta_virtual pv
INNER JOIN funcionarios f ON f.id = pv.funcionario_id AND f.empresa_id = 6
WHERE (pv.empresa_id IS NULL OR pv.empresa_id = 1) AND pv.deleted_at IS NULL

UNION ALL

SELECT 'doc_e6_total', COUNT(*)
FROM documentos WHERE empresa_id = 6 AND deleted_at IS NULL

UNION ALL

SELECT 'pv_e6_total', COUNT(*)
FROM pasta_virtual WHERE empresa_id = 6 AND deleted_at IS NULL;
-- Esperado: doc_e1_residuais=0, pv_e1_residuais=0,
--           doc_e6_total=237 (192+45), pv_e6_total=178 (118+60)
