SELECT 
  q.id,
  q.funcionario_id,
  q.nome as tipo_nome,
  q.codigo as tipo_codigo,
  q.categoria,
  q.data_vencimento,
  f.nome as funcionario_nome,
  f.email,
  f.telefone
FROM qualificacoes_historico q
LEFT JOIN funcionarios f ON f.id = q.funcionario_id
WHERE q.id = 3463
  AND q.deleted_at IS NULL;
