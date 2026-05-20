-- ================================================================
-- Migration 0326: corrigir datas planejadas do G1-SEM
-- Data: 2026-04-02
--
-- Regra correta:
-- - data_conclusao = data planejada do G1-SEM (G1 + 6 meses)
-- - data_vencimento = vencimento do ciclo semestral (G1 + 12 meses)
-- ================================================================

WITH g1_sem_por_g1 AS (
  SELECT
    sem.id AS g1_sem_id,
    date(g1.data_conclusao, '+6 months') AS data_planejada,
    date(g1.data_conclusao, '+12 months') AS data_vencimento_ciclo
  FROM qualificacoes_historico sem
  JOIN qualificacoes_historico g1
    ON g1.funcionario_id = sem.funcionario_id
   AND g1.deleted_at IS NULL
   AND UPPER(COALESCE(g1.qualificacao_codigo, '')) = 'G1'
   AND sem.observacoes LIKE '%' || '#' || g1.id || '%'
  WHERE sem.deleted_at IS NULL
    AND UPPER(COALESCE(sem.qualificacao_codigo, '')) = 'G1-SEM'
    AND COALESCE(sem.status, 'PLANEJADA') = 'PLANEJADA'
)
UPDATE qualificacoes_historico
SET data_conclusao = (
      SELECT data_planejada
      FROM g1_sem_por_g1
      WHERE g1_sem_id = qualificacoes_historico.id
    ),
    data_vencimento = (
      SELECT data_vencimento_ciclo
      FROM g1_sem_por_g1
      WHERE g1_sem_id = qualificacoes_historico.id
    ),
    tipo_treinamento = 'SEMESTRAL',
    updated_at = datetime('now')
WHERE id IN (SELECT g1_sem_id FROM g1_sem_por_g1)
  AND (
    data_conclusao IS NULL
    OR data_vencimento = (
      SELECT data_planejada
      FROM g1_sem_por_g1
      WHERE g1_sem_id = qualificacoes_historico.id
    )
  );
