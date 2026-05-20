SELECT
  qh.id,
  qh.funcionario_id,
  f.nome AS funcionario_nome,
  qh.qualificacao_id,
  qh.qualificacao_codigo,
  qt.codigo AS codigo_correto,
  qh.tipo,
  qt.nome AS tipo_correto,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.numero_certificado,
  qh.certificado_arquivo_id,
  qh.observacoes
FROM qualificacoes_historico AS qh
JOIN qualificacoes_tipos AS qt
  ON qt.id = qh.qualificacao_id
 AND qt.deleted_at IS NULL
LEFT JOIN funcionarios AS f
  ON f.id = qh.funcionario_id
 AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL
  AND COALESCE(qh.qualificacao_codigo, '') != COALESCE(qt.codigo, '')
  AND NOT EXISTS (
    SELECT 1
    FROM qualificacoes_historico AS qh_ok
    WHERE qh_ok.deleted_at IS NULL
      AND qh_ok.id != qh.id
      AND qh_ok.funcionario_id = qh.funcionario_id
      AND qh_ok.qualificacao_id = qh.qualificacao_id
      AND COALESCE(qh_ok.data_conclusao, '') = COALESCE(qh.data_conclusao, '')
      AND COALESCE(qh_ok.qualificacao_codigo, '') = COALESCE(qt.codigo, '')
  )
ORDER BY qt.codigo, qh.funcionario_id, qh.data_conclusao, qh.id;