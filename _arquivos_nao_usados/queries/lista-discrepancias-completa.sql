-- ============================================================
-- LISTA COMPLETA DE DISCREPÂNCIAS COM NOMES
-- ============================================================

-- 1. DUPLICATAS (21 casos) - Com nomes completos
SELECT 
  '=== DUPLICATAS ===' as secao,
  '' as separador
UNION ALL
SELECT 
  'CPF: ' || f.cpf || ' | Nome: ' || f.nome as linha,
  'Qualificação: ' || q.codigo || ' - ' || q.nome || ' | Vencimento: ' || qh.data_vencimento as detalhes
FROM (
  SELECT 
    funcionario_id,
    qualificacao_id,
    data_vencimento,
    COUNT(*) as total
  FROM qualificacoes_historico
  WHERE deleted_at IS NULL
  GROUP BY funcionario_id, qualificacao_id, data_vencimento
  HAVING COUNT(*) > 1
) dup
JOIN funcionarios f ON f.id = dup.funcionario_id
JOIN qualificacoes q ON q.id = dup.qualificacao_id
WHERE f.deleted_at IS NULL AND q.deleted_at IS NULL
ORDER BY f.cpf, q.codigo

UNION ALL
SELECT 
  '' as linha,
  '=== VENCIDOS ===' as detalhes

UNION ALL
-- 2. VENCIDOS (30 casos) - Com nomes completos
SELECT 
  'CPF: ' || f.cpf || ' | Nome: ' || f.nome as linha,
  'Qualificação: ' || q.codigo || ' - ' || q.nome || ' | Vencimento: ' || qh.data_vencimento || ' | Dias: ' || CAST(julianday('now') - julianday(qh.data_vencimento) AS INTEGER) as detalhes
FROM qualificacoes_historico qh
JOIN funcionarios f ON f.id = qh.funcionario_id
JOIN qualificacoes q ON q.id = qh.qualificacao_id
WHERE qh.deleted_at IS NULL
  AND f.deleted_at IS NULL
  AND q.deleted_at IS NULL
  AND qh.data_vencimento < date('now')
ORDER BY (julianday('now') - julianday(qh.data_vencimento)) DESC

UNION ALL
SELECT 
  '' as linha,
  '=== CANDIDATOS RENOVAÇÃO SEM VÍNCULO ===' as detalhes

UNION ALL
-- 3. CANDIDATOS RENOVAÇÃO (21 casos) - Com nomes completos
SELECT 
  'CPF: ' || f.cpf || ' | Nome: ' || f.nome as linha,
  'Qualificação: ' || q.codigo || ' - ' || q.nome || ' | Total registros: ' || COUNT(*) || ' | Com vínculo: ' || SUM(CASE WHEN qh.renovacao_de IS NOT NULL THEN 1 ELSE 0 END) as detalhes
FROM qualificacoes_historico qh
JOIN funcionarios f ON f.id = qh.funcionario_id
JOIN qualificacoes q ON q.id = qh.qualificacao_id
WHERE qh.deleted_at IS NULL
  AND f.deleted_at IS NULL
  AND q.deleted_at IS NULL
GROUP BY f.id, f.cpf, f.nome, q.id, q.codigo, q.nome
HAVING COUNT(*) > 1 AND SUM(CASE WHEN qh.renovacao_de IS NOT NULL THEN 1 ELSE 0 END) = 0
ORDER BY f.cpf, q.codigo;
