-- ============================================================
-- LOTE 1 APPLY — qualificacoes_historico + qualificacoes_tipos
-- ATENÇÃO: Contém UPDATEs reais. NÃO EXECUTAR sem autorização explícita.
-- Pré-condições: ver docs/AIRTRUST_QUALIFICATION_TENANT_RECONCILIATION_DRY_RUN_20260607.md
-- Commit base: 3ca7b7264fcd4124e8588743ee05a32e71a84337
-- ============================================================
--
-- EXECUTAR NA ORDEM:
--   Passo 1 → Tipos de qualificação (empresa_id=1 → 6)
--   Passo 2 → Históricos ativos (empresa_id=1 → 6)
--   Passo 3 → Históricos soft-deleted (empresa_id=1 → 6) — OPCIONAL, requer decisão
--   Passo 4 → Verificação pós-apply
--
-- ROLLBACK: ver rollback-qualificacoes-lote1.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PASSO 1: Mover tipos de qualificação para empresa_id=6
-- Elegíveis: ids 105, 106, 110, 111, 112, 113, 114, 115
-- Critério: empresa_id=1, sem código duplicado em empresa_id=6
-- ────────────────────────────────────────────────────────────

-- PRÉ-CHECK obrigatório antes de executar o UPDATE:
-- Deve retornar 0 linhas. Se retornar alguma, PARAR.
-- SELECT qt1.id, qt1.codigo FROM qualificacoes_tipos qt1
-- INNER JOIN qualificacoes_tipos qt2
--   ON UPPER(qt2.codigo) = UPPER(qt1.codigo) AND qt2.empresa_id = 6 AND qt2.deleted_at IS NULL
-- WHERE qt1.empresa_id = 1 AND qt1.deleted_at IS NULL AND qt1.id IN (105,106,110,111,112,113,114,115);

UPDATE qualificacoes_tipos
SET empresa_id   = 6,
    updated_at   = datetime('now')
WHERE id IN (106, 112, 113, 114, 115)
  AND empresa_id = 1
  AND deleted_at IS NULL;
-- Esperado: 5 linhas afetadas (ids exclusivamente usados por historicos e1, zero uso e6)

UPDATE qualificacoes_tipos
SET empresa_id   = 6,
    updated_at   = datetime('now')
WHERE id IN (105, 110, 111)
  AND empresa_id = 1
  AND deleted_at IS NULL;
-- Esperado: 3 linhas afetadas (compartilhados: usados por e6 historicos mas sem código duplicado)

-- ────────────────────────────────────────────────────────────
-- PASSO 2: Mover históricos ativos para empresa_id=6
-- Critério: empresa_id=1, funcionário em empresa_id=6, deleted_at IS NULL
-- Confiança ALTA confirmada: 0 duplicatas exatas, 0 sessao_id, 0 conflito de tipo
-- ────────────────────────────────────────────────────────────

UPDATE qualificacoes_historico
SET empresa_id  = 6,
    updated_at  = datetime('now')
WHERE empresa_id = 1
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM funcionarios
     WHERE id         = qualificacoes_historico.funcionario_id
       AND empresa_id = 6
       AND deleted_at IS NULL
  );
-- Esperado: 324 linhas afetadas

-- ────────────────────────────────────────────────────────────
-- PASSO 3 (OPCIONAL): Mover soft-deleted para empresa_id=6
-- Apenas os 37 com funcionário válido da empresa 6.
-- NÃO inclui o órfão (funcionario_id=0, id=4517).
-- Requer decisão explícita antes de executar.
-- ────────────────────────────────────────────────────────────

-- UPDATE qualificacoes_historico
-- SET empresa_id  = 6,
--     updated_at  = datetime('now')
-- WHERE empresa_id = 1
--   AND deleted_at IS NOT NULL
--   AND funcionario_id != 0
--   AND EXISTS (
--     SELECT 1 FROM funcionarios
--      WHERE id         = qualificacoes_historico.funcionario_id
--        AND empresa_id = 6
--   );
-- Esperado: 37 linhas afetadas (excluindo o órfão id=4517)

-- ────────────────────────────────────────────────────────────
-- PASSO 4: Verificação pós-apply (executar imediatamente após)
-- ────────────────────────────────────────────────────────────

-- 4A: Deve retornar 0 ativos restantes em e1 com funcionário e6
SELECT COUNT(*) AS residuo_ativo_e1
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
WHERE qh.empresa_id = 1 AND qh.deleted_at IS NULL;

-- 4B: Deve retornar 0 tipos da lista em empresa_id=1
SELECT COUNT(*) AS tipos_restantes_e1
FROM qualificacoes_tipos
WHERE id IN (105, 106, 110, 111, 112, 113, 114, 115)
  AND empresa_id = 1;

-- 4C: Contador de renovadas em e6 após move
SELECT COUNT(*) AS renovadas_e6
FROM qualificacoes_historico
WHERE empresa_id = 6 AND status = 'RENOVADA' AND deleted_at IS NULL;

-- 4D: Total ativos em e6 após move (esperado ≈ 538 + 324 = 862)
SELECT COUNT(*) AS total_ativos_e6
FROM qualificacoes_historico
WHERE empresa_id = 6 AND deleted_at IS NULL;
