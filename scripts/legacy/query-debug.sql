-- Verificar se registro 3577 existe em qualificacoes_historico
SELECT 
  qh.id,
  qh.deleted_at,
  qh.empresa_id,
  qh.funcionario_id,
  f.nome as funcionario_nome,
  qt.nome as qualificacao_nome
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
WHERE qh.id = 3577;
