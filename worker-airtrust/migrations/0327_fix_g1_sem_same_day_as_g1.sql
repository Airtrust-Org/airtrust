-- ================================================================
-- Migration 0327: alinhar G1-SEM com a mesma data de realização do G1
-- Data: 2026-04-02
--
-- Regra correta:
-- - G1-SEM não fica em status PLANEJADA quando nasce a partir de um G1 anual
-- - data_conclusao do G1-SEM = mesma data do G1 de origem
-- - data_vencimento do G1-SEM = G1 + 6 meses
-- ================================================================

WITH g1_sem_automatico AS (
  SELECT
    sem.id AS g1_sem_id,
    g1.data_conclusao AS data_realizacao_g1,
    date(g1.data_conclusao, '+6 months') AS data_vencimento_g1_sem
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
      SELECT data_realizacao_g1
      FROM g1_sem_automatico
      WHERE g1_sem_id = qualificacoes_historico.id
    ),
    data_vencimento = (
      SELECT data_vencimento_g1_sem
      FROM g1_sem_automatico
      WHERE g1_sem_id = qualificacoes_historico.id
    ),
    validade_meses = 6,
    tipo_treinamento = 'SEMESTRAL',
    status = 'CONCLUIDA',
    updated_at = datetime('now')
WHERE id IN (SELECT g1_sem_id FROM g1_sem_automatico);