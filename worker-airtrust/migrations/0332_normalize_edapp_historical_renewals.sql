WITH next_edapp_qualificacao AS (
  SELECT
    qh.id,
    (
      SELECT MIN(qh_next.data_conclusao)
      FROM qualificacoes_historico qh_next
      WHERE qh_next.funcionario_id = qh.funcionario_id
        AND qh_next.qualificacao_codigo = qh.qualificacao_codigo
        AND qh_next.deleted_at IS NULL
        AND COALESCE(qh_next.status, 'CONCLUIDA') <> 'PLANEJADA'
        AND date(COALESCE(qh_next.data_conclusao, '1900-01-01')) > date(COALESCE(qh.data_conclusao, '1900-01-01'))
    ) AS next_data_conclusao
  FROM qualificacoes_historico qh
  WHERE qh.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM integracoes_edapp_eventos ie
      WHERE ie.qualificacao_historico_id = qh.id
        AND ie.deleted_at IS NULL
    )
)
UPDATE qualificacoes_historico
SET renovada = 1,
    status = 'RENOVADA',
    updated_at = datetime('now'),
    observacoes = CASE
      WHEN COALESCE(observacoes, '') = '' THEN 'Substituída por curso EdApp em ' || (
        SELECT next_data_conclusao
        FROM next_edapp_qualificacao neq
        WHERE neq.id = qualificacoes_historico.id
      )
      WHEN COALESCE(observacoes, '') LIKE '%Substituída por curso EdApp%' THEN observacoes
      ELSE observacoes || ' | ' || 'Substituída por curso EdApp em ' || (
        SELECT next_data_conclusao
        FROM next_edapp_qualificacao neq
        WHERE neq.id = qualificacoes_historico.id
      )
    END
WHERE id IN (
    SELECT id
    FROM next_edapp_qualificacao
    WHERE next_data_conclusao IS NOT NULL
  )
  AND COALESCE(status, 'CONCLUIDA') <> 'PLANEJADA'
  AND (
    COALESCE(renovada, 0) = 0
    OR COALESCE(status, '') <> 'RENOVADA'
  );