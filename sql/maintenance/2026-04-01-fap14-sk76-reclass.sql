WITH sk76_target AS (
  SELECT id, codigo, nome, categoria
  FROM qualificacoes_tipos
  WHERE id = 105
    AND deleted_at IS NULL
  LIMIT 1
),
candidate_rows AS (
  SELECT
    qh.id AS historico_id,
    target.id AS target_id,
    target.codigo AS target_codigo,
    target.nome AS target_nome,
    target.categoria AS target_categoria
  FROM qualificacoes_historico AS qh
  JOIN funcionarios AS f
    ON f.id = qh.funcionario_id
   AND f.deleted_at IS NULL
  CROSS JOIN sk76_target AS target
  WHERE qh.deleted_at IS NULL
    AND qh.qualificacao_id = 84
    AND COALESCE(
      (
        SELECT REPLACE(
          GROUP_CONCAT(DISTINCT UPPER(TRIM(COALESCE(a.modelo, '')))),
          ',',
          ' / '
        )
        FROM funcionarios_aeronaves AS fa
        JOIN aeronaves AS a
          ON a.id = fa.aeronave_id
         AND COALESCE(a.deleted_at, '') = ''
        WHERE fa.funcionario_id = f.id
          AND COALESCE(fa.deleted_at, '') = ''
          AND TRIM(COALESCE(a.modelo, '')) <> ''
      ),
      CASE
        WHEN UPPER(TRIM(COALESCE(f.aeronave, ''))) IN ('S76', 'SK76') THEN 'SK76'
        WHEN UPPER(TRIM(COALESCE(f.aeronave, ''))) = 'AW139' THEN 'AW139'
        ELSE NULL
      END,
      NULLIF(REPLACE(REPLACE(COALESCE(f.modelo_aeronave_id, ''), ',', ' / '), ' ', ''), '')
    ) = 'SK76'
    AND NOT EXISTS (
      SELECT 1
      FROM qualificacoes_historico AS qh2
      WHERE qh2.deleted_at IS NULL
        AND qh2.id != qh.id
        AND qh2.funcionario_id = qh.funcionario_id
        AND COALESCE(qh2.data_conclusao, '') = COALESCE(qh.data_conclusao, '')
        AND qh2.qualificacao_id = target.id
    )
)
UPDATE qualificacoes_historico
SET
  qualificacao_id = (
    SELECT candidate_rows.target_id
    FROM candidate_rows
    WHERE candidate_rows.historico_id = qualificacoes_historico.id
  ),
  qualificacao_codigo = (
    SELECT candidate_rows.target_codigo
    FROM candidate_rows
    WHERE candidate_rows.historico_id = qualificacoes_historico.id
  ),
  tipo = (
    SELECT candidate_rows.target_nome
    FROM candidate_rows
    WHERE candidate_rows.historico_id = qualificacoes_historico.id
  ),
  categoria = (
    SELECT candidate_rows.target_categoria
    FROM candidate_rows
    WHERE candidate_rows.historico_id = qualificacoes_historico.id
  ),
  updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND id IN (SELECT historico_id FROM candidate_rows);

SELECT changes() AS historicos_fap14_sk76_reclassificados;