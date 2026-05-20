-- Análise completa de qualificações duplicadas

-- 1. Contar quantos grupos têm duplicatas
SELECT 
  COUNT(*) as total_grupos_com_duplicata,
  SUM(cnt) as total_registros_duplicados
FROM (
  SELECT 
    funcionario_id,
    qualificacao_codigo,
    tipo_codigo,
    categoria,
    COUNT(*) as cnt
  FROM qualificacoes_historico
  WHERE deleted_at IS NULL
  GROUP BY funcionario_id, qualificacao_codigo, tipo_codigo, categoria
  HAVING COUNT(*) > 1
);

-- 2. Top 30 duplicatas
SELECT 
  funcionario_id,
  qualificacao_codigo,
  tipo_codigo,
  categoria,
  COUNT(*) as total_duplicados
FROM qualificacoes_historico
WHERE deleted_at IS NULL
GROUP BY funcionario_id, qualificacao_codigo, tipo_codigo, categoria
HAVING COUNT(*) > 1
ORDER BY total_duplicados DESC
LIMIT 30;
