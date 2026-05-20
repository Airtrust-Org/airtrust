-- ========================================
-- RELATÓRIO DE QUALIFICAÇÕES ATUALIZADAS
-- Importação Histórico EdApp
-- Data: 2026-02-05
-- ========================================

-- ========================================
-- 1. RESUMO GERAL
-- ========================================

SELECT 
  COUNT(*) as total_qualificacoes_edapp,
  COUNT(CASE WHEN observacoes LIKE '%Importação histórico%' THEN 1 END) as importadas_historico,
  COUNT(CASE WHEN observacoes LIKE '%Renovada via importação%' THEN 1 END) as renovadas,
  COUNT(CASE WHEN observacoes NOT LIKE '%Importação histórico%' AND observacoes NOT LIKE '%Renovada%' THEN 1 END) as via_webhook
FROM qualificacoes_historico
WHERE observacoes LIKE '%EdApp%'
  AND deleted_at IS NULL;

-- ========================================
-- 2. QUALIFICAÇÕES CRIADAS (NOVAS)
-- ========================================

SELECT 
  f.matricula,
  f.nome as funcionario,
  qh.qualificacao_codigo,
  qt.nome as qualificacao_nome,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.created_at as data_criacao,
  '✅ NOVA' as status
FROM qualificacoes_historico qh
JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo AND qt.deleted_at IS NULL
WHERE qh.observacoes LIKE '%Importação histórico%'
  AND qh.deleted_at IS NULL
ORDER BY qh.created_at DESC;

-- ========================================
-- 3. QUALIFICAÇÕES RENOVADAS
-- ========================================

SELECT 
  f.matricula,
  f.nome as funcionario,
  qh.qualificacao_codigo,
  qt.nome as qualificacao_nome,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.updated_at as data_renovacao,
  '🔄 RENOVADA' as status,
  qh.observacoes
FROM qualificacoes_historico qh
JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo AND qt.deleted_at IS NULL
WHERE qh.observacoes LIKE '%Renovada via importação EdApp%'
  AND qh.deleted_at IS NULL
ORDER BY qh.updated_at DESC;

-- ========================================
-- 4. TOTAL POR FUNCIONÁRIO
-- ========================================

SELECT 
  f.matricula,
  f.nome as funcionario,
  COUNT(*) as total_qualificacoes,
  COUNT(CASE WHEN qh.observacoes LIKE '%Importação histórico%' THEN 1 END) as novas,
  COUNT(CASE WHEN qh.observacoes LIKE '%Renovada via importação%' THEN 1 END) as renovadas
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh ON f.id = qh.funcionario_id 
  AND qh.deleted_at IS NULL
  AND qh.observacoes LIKE '%EdApp%'
WHERE f.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM integracoes_edapp_usuarios u 
    WHERE u.funcionario_id = f.id 
      AND u.deleted_at IS NULL 
      AND u.ativo = 1
  )
GROUP BY f.id, f.matricula, f.nome
ORDER BY total_qualificacoes DESC;

-- ========================================
-- 5. TOTAL POR TIPO DE QUALIFICAÇÃO
-- ========================================

SELECT 
  qh.qualificacao_codigo,
  qt.nome as qualificacao_nome,
  COUNT(*) as total,
  COUNT(CASE WHEN qh.observacoes LIKE '%Importação histórico%' THEN 1 END) as novas,
  COUNT(CASE WHEN qh.observacoes LIKE '%Renovada via importação%' THEN 1 END) as renovadas
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo AND qt.deleted_at IS NULL
WHERE qh.observacoes LIKE '%EdApp%'
  AND qh.deleted_at IS NULL
GROUP BY qh.qualificacao_codigo, qt.nome
ORDER BY total DESC;

-- ========================================
-- 6. TIMELINE DE IMPORTAÇÃO
-- ========================================

SELECT 
  DATE(qh.created_at) as data,
  COUNT(*) as qualificacoes_criadas
FROM qualificacoes_historico qh
WHERE qh.observacoes LIKE '%Importação histórico%'
  AND qh.deleted_at IS NULL
GROUP BY DATE(qh.created_at)
ORDER BY data DESC;

-- ========================================
-- 7. QUALIFICAÇÕES VENCENDO NOS PRÓXIMOS 30 DIAS
-- (das que foram importadas)
-- ========================================

SELECT 
  f.matricula,
  f.nome as funcionario,
  qh.qualificacao_codigo,
  qt.nome as qualificacao_nome,
  qh.data_vencimento,
  julianday(qh.data_vencimento) - julianday('now') as dias_restantes
FROM qualificacoes_historico qh
JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo AND qt.deleted_at IS NULL
WHERE qh.observacoes LIKE '%Importação histórico%'
  AND qh.data_vencimento BETWEEN date('now') AND date('now', '+30 days')
  AND qh.deleted_at IS NULL
ORDER BY qh.data_vencimento ASC;

-- ========================================
-- 8. LISTAGEM COMPLETA FORMATADA
-- ========================================

SELECT 
  '📋 ' || f.matricula || ' - ' || f.nome as funcionario,
  '📚 ' || qh.qualificacao_codigo || ' - ' || COALESCE(qt.nome, 'N/A') as qualificacao,
  '📅 ' || qh.data_conclusao as conclusao,
  '⏰ ' || qh.data_vencimento as vencimento,
  CASE 
    WHEN qh.observacoes LIKE '%Importação histórico%' THEN '✅ NOVA (importada)'
    WHEN qh.observacoes LIKE '%Renovada via importação%' THEN '🔄 RENOVADA'
    ELSE '⚡ VIA WEBHOOK'
  END as status,
  julianday(qh.data_vencimento) - julianday('now') as dias_validade
FROM qualificacoes_historico qh
JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo AND qt.deleted_at IS NULL
WHERE qh.observacoes LIKE '%EdApp%'
  AND qh.deleted_at IS NULL
ORDER BY f.nome, qh.data_conclusao DESC;
