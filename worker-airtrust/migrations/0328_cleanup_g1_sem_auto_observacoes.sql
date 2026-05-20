-- ================================================================
-- Migration 0328: normalizar observacoes automaticas do G1-SEM
-- Data: 2026-04-02
--
-- Limpeza segura:
-- - preenche o vinculo textual com o G1 de origem quando o G1-SEM ja foi
--   corrigido para a mesma data do G1, mas permaneceu sem observacao padrao.
-- ================================================================

WITH g1_sem_sem_origem AS (
  SELECT
    sem.id AS g1_sem_id,
    g1.id AS g1_id
  FROM qualificacoes_historico sem
  JOIN qualificacoes_historico g1
    ON g1.funcionario_id = sem.funcionario_id
   AND g1.deleted_at IS NULL
   AND UPPER(COALESCE(g1.qualificacao_codigo, '')) = 'G1'
   AND sem.data_conclusao = g1.data_conclusao
   AND sem.data_vencimento = date(g1.data_conclusao, '+6 months')
  WHERE sem.deleted_at IS NULL
    AND UPPER(COALESCE(sem.qualificacao_codigo, '')) = 'G1-SEM'
    AND COALESCE(TRIM(sem.observacoes), '') = ''
)
UPDATE qualificacoes_historico
SET observacoes = 'Gerada automaticamente a partir do G1 #' || (
      SELECT g1_id
      FROM g1_sem_sem_origem
      WHERE g1_sem_id = qualificacoes_historico.id
    ),
    updated_at = datetime('now')
WHERE id IN (SELECT g1_sem_id FROM g1_sem_sem_origem);