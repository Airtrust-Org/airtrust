-- Verificar qualificações duplicadas
SELECT 
  funcionario_id,
  qualificacao_codigo as codigo,
  tipo_codigo as tipo,
  categoria,
  COUNT(*) as total_duplicados,
  GROUP_CONCAT(id, ', ') as ids
FROM qualificacoes_historico
WHERE deleted_at IS NULL
GROUP BY funcionario_id, qualificacao_codigo, tipo_codigo, categoria
HAVING COUNT(*) > 1
ORDER BY total_duplicados DESC
LIMIT 100;
