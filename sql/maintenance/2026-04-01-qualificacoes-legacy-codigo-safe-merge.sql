UPDATE qualificacoes_historico AS qh_ok
SET
  numero_certificado = COALESCE(
    qh_ok.numero_certificado,
    (
      SELECT qh_null.numero_certificado
      FROM qualificacoes_historico AS qh_null
      JOIN qualificacoes_tipos AS qt
        ON qt.id = qh_null.qualificacao_id
       AND qt.deleted_at IS NULL
      WHERE qh_null.deleted_at IS NULL
        AND COALESCE(qh_null.qualificacao_codigo, '') = ''
        AND qh_null.id != qh_ok.id
        AND qh_null.funcionario_id = qh_ok.funcionario_id
        AND qh_null.qualificacao_id = qh_ok.qualificacao_id
        AND COALESCE(qh_null.data_conclusao, '') = COALESCE(qh_ok.data_conclusao, '')
        AND COALESCE(qh_ok.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
      ORDER BY qh_null.id DESC
      LIMIT 1
    )
  ),
  certificado_arquivo_id = COALESCE(
    qh_ok.certificado_arquivo_id,
    (
      SELECT qh_null.certificado_arquivo_id
      FROM qualificacoes_historico AS qh_null
      JOIN qualificacoes_tipos AS qt
        ON qt.id = qh_null.qualificacao_id
       AND qt.deleted_at IS NULL
      WHERE qh_null.deleted_at IS NULL
        AND COALESCE(qh_null.qualificacao_codigo, '') = ''
        AND qh_null.id != qh_ok.id
        AND qh_null.funcionario_id = qh_ok.funcionario_id
        AND qh_null.qualificacao_id = qh_ok.qualificacao_id
        AND COALESCE(qh_null.data_conclusao, '') = COALESCE(qh_ok.data_conclusao, '')
        AND COALESCE(qh_ok.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
      ORDER BY qh_null.id DESC
      LIMIT 1
    )
  ),
  observacoes = CASE
    WHEN NULLIF(
      TRIM(
        COALESCE(
          (
            SELECT qh_null.observacoes
            FROM qualificacoes_historico AS qh_null
            JOIN qualificacoes_tipos AS qt
              ON qt.id = qh_null.qualificacao_id
             AND qt.deleted_at IS NULL
            WHERE qh_null.deleted_at IS NULL
              AND COALESCE(qh_null.qualificacao_codigo, '') = ''
              AND qh_null.id != qh_ok.id
              AND qh_null.funcionario_id = qh_ok.funcionario_id
              AND qh_null.qualificacao_id = qh_ok.qualificacao_id
              AND COALESCE(qh_null.data_conclusao, '') = COALESCE(qh_ok.data_conclusao, '')
              AND COALESCE(qh_ok.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
            ORDER BY qh_null.id DESC
            LIMIT 1
          ),
          ''
        )
      ),
      ''
    ) IS NULL THEN qh_ok.observacoes
    WHEN NULLIF(TRIM(COALESCE(qh_ok.observacoes, '')), '') IS NULL THEN (
      SELECT TRIM(qh_null.observacoes)
      FROM qualificacoes_historico AS qh_null
      JOIN qualificacoes_tipos AS qt
        ON qt.id = qh_null.qualificacao_id
       AND qt.deleted_at IS NULL
      WHERE qh_null.deleted_at IS NULL
        AND COALESCE(qh_null.qualificacao_codigo, '') = ''
        AND qh_null.id != qh_ok.id
        AND qh_null.funcionario_id = qh_ok.funcionario_id
        AND qh_null.qualificacao_id = qh_ok.qualificacao_id
        AND COALESCE(qh_null.data_conclusao, '') = COALESCE(qh_ok.data_conclusao, '')
        AND COALESCE(qh_ok.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
      ORDER BY qh_null.id DESC
      LIMIT 1
    )
    ELSE qh_ok.observacoes || ' | ' || (
      SELECT TRIM(qh_null.observacoes)
      FROM qualificacoes_historico AS qh_null
      JOIN qualificacoes_tipos AS qt
        ON qt.id = qh_null.qualificacao_id
       AND qt.deleted_at IS NULL
      WHERE qh_null.deleted_at IS NULL
        AND COALESCE(qh_null.qualificacao_codigo, '') = ''
        AND qh_null.id != qh_ok.id
        AND qh_null.funcionario_id = qh_ok.funcionario_id
        AND qh_null.qualificacao_id = qh_ok.qualificacao_id
        AND COALESCE(qh_null.data_conclusao, '') = COALESCE(qh_ok.data_conclusao, '')
        AND COALESCE(qh_ok.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
      ORDER BY qh_null.id DESC
      LIMIT 1
    )
  END,
  updated_at = datetime('now')
WHERE qh_ok.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM qualificacoes_historico AS qh_null
    JOIN qualificacoes_tipos AS qt
      ON qt.id = qh_null.qualificacao_id
     AND qt.deleted_at IS NULL
    WHERE qh_null.deleted_at IS NULL
      AND COALESCE(qh_null.qualificacao_codigo, '') = ''
      AND qh_null.id != qh_ok.id
      AND qh_null.funcionario_id = qh_ok.funcionario_id
      AND qh_null.qualificacao_id = qh_ok.qualificacao_id
      AND COALESCE(qh_null.data_conclusao, '') = COALESCE(qh_ok.data_conclusao, '')
      AND COALESCE(qh_ok.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
  );

UPDATE qualificacoes_historico AS qh_null
SET
  deleted_at = datetime('now'),
  updated_at = datetime('now'),
  observacoes = TRIM(
    COALESCE(NULLIF(TRIM(qh_null.observacoes), ''), '') ||
    CASE
      WHEN NULLIF(TRIM(COALESCE(qh_null.observacoes, '')), '') IS NOT NULL THEN ' | '
      ELSE ''
    END ||
    'Duplicata legada sem codigo mesclada e desativada automaticamente em 2026-04-01'
  )
WHERE qh_null.deleted_at IS NULL
  AND COALESCE(qh_null.qualificacao_codigo, '') = ''
  AND EXISTS (
    SELECT 1
    FROM qualificacoes_historico AS qh_ok
    JOIN qualificacoes_tipos AS qt
      ON qt.id = qh_null.qualificacao_id
     AND qt.deleted_at IS NULL
    WHERE qh_ok.deleted_at IS NULL
      AND qh_ok.id != qh_null.id
      AND qh_ok.funcionario_id = qh_null.funcionario_id
      AND qh_ok.qualificacao_id = qh_null.qualificacao_id
      AND COALESCE(qh_ok.data_conclusao, '') = COALESCE(qh_null.data_conclusao, '')
      AND COALESCE(qh_ok.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
  );

SELECT changes() AS legacy_rows_soft_deleted;