-- =============================================================
-- QUERY CONSOLIDADA DE VALIDAÇÃO SSOT AIRTRUST
-- Executar:
--   wrangler d1 execute airtrust-db --remote --file=scripts/validation_query.sql
-- =============================================================

-- Seção 1: Métricas Gerais
SELECT '========================================' as linha
UNION ALL SELECT '📊 MÉTRICAS GERAIS'
UNION ALL SELECT '========================================'
UNION ALL SELECT ''
UNION ALL SELECT 'Total de registros: ' || (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL)
UNION ALL SELECT 'Visíveis na view: ' || (SELECT COUNT(*) FROM qualificacoes_historico_v)
UNION ALL SELECT 'Com datas válidas: ' || (SELECT COUNT(*) FROM qualificacoes_historico WHERE validade IS NOT NULL AND deleted_at IS NULL)
UNION ALL SELECT 'Funcionários únicos: ' || (SELECT COUNT(DISTINCT funcionario_id) FROM qualificacoes_historico WHERE deleted_at IS NULL)
UNION ALL SELECT 'Tipos únicos: ' || (SELECT COUNT(DISTINCT qualificacao_id) FROM qualificacoes_historico WHERE deleted_at IS NULL)
UNION ALL SELECT ''

-- Seção 2: Integridade Referencial
UNION ALL SELECT '========================================'
UNION ALL SELECT '🔗 INTEGRIDADE REFERENCIAL'
UNION ALL SELECT '========================================'
UNION ALL SELECT ''
UNION ALL SELECT 'Foreign Keys ativas: ' || (SELECT COUNT(*) FROM pragma_foreign_key_list('qualificacoes_historico'))
UNION ALL SELECT 'Órfãos de funcionários: ' || (
  SELECT COUNT(*) FROM qualificacoes_historico qh
  WHERE qh.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM funcionarios f WHERE f.id = qh.funcionario_id AND f.deleted_at IS NULL)
)
UNION ALL SELECT 'Órfãos de tipos: ' || (
  SELECT COUNT(*) FROM qualificacoes_historico qh
  WHERE qh.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL)
)
UNION ALL SELECT ''

-- Seção 3: Distribuição por Status
UNION ALL SELECT '========================================'
UNION ALL SELECT '📅 DISTRIBUIÇÃO POR STATUS'
UNION ALL SELECT '========================================';

SELECT 
  status_qualificacao,
  COUNT(*) as total,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM qualificacoes_historico_v), 1) || '%' as porcentagem
FROM qualificacoes_historico_v
GROUP BY status_qualificacao
ORDER BY 
  CASE status_qualificacao
    WHEN 'VENCIDA' THEN 1
    WHEN 'PROXIMA_VENCIMENTO' THEN 2
    WHEN 'ATENCAO' THEN 3
    WHEN 'VALIDA' THEN 4
    ELSE 5
  END;

-- Seção 4: Amostra de Dados
SELECT '' as separador
UNION ALL SELECT '========================================'
UNION ALL SELECT '📋 AMOSTRA DE DADOS (10 mais próximas de vencer)'
UNION ALL SELECT '========================================';

SELECT 
  qh.id,
  SUBSTR(f.nome, 1, 20) as funcionario,
  f.matricula,
  SUBSTR(COALESCE(qt.nome,'(sem nome)'), 1, 25) as tipo_qualificacao,
  DATE(qh.validade) as validade,
  CASE
    WHEN qh.validade IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.validade) < DATE('now') THEN '🔴 VENCIDA'
    WHEN DATE(qh.validade) BETWEEN DATE('now') AND DATE('now','+30 days') THEN '🟡 PRÓXIMO'
    ELSE '🟢 VÁLIDA'
  END as status_visual,
  CAST((julianday(qh.validade) - julianday('now')) AS INTEGER) as dias_restantes
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL
ORDER BY qh.validade ASC NULLS LAST
LIMIT 10;

-- Seção 5: Triggers Ativos
SELECT '' as separador
UNION ALL SELECT '========================================'
UNION ALL SELECT '⚙️  TRIGGERS ATIVOS'
UNION ALL SELECT '========================================';

SELECT 
  name as trigger_name,
  tbl_name as tabela,
  CASE 
    WHEN sql LIKE '%AFTER UPDATE%' THEN 'AFTER UPDATE'
    WHEN sql LIKE '%AFTER INSERT%' THEN 'AFTER INSERT'
    WHEN sql LIKE '%BEFORE DELETE%' THEN 'BEFORE DELETE'
    WHEN sql LIKE '%AFTER DELETE%' THEN 'AFTER DELETE'
    ELSE 'OUTRO'
  END as tipo
FROM sqlite_master
WHERE type = 'trigger'
  AND (tbl_name LIKE '%qualificacoes%' OR tbl_name LIKE '%funcionarios%')
ORDER BY tbl_name, name;

-- Seção 6: Auditorias Recentes (últimas 24h)
SELECT '' as separador
UNION ALL SELECT '========================================'
UNION ALL SELECT '📝 ÚLTIMAS AUDITORIAS (24h)'
UNION ALL SELECT '========================================';

SELECT 
  tabela,
  acao,
  COUNT(*) as total,
  MAX(created_at) as ultima
FROM auditoria_avancada_v2
WHERE created_at > datetime('now','-24 hours')
  AND tabela IN ('funcionarios','qualificacoes_tipos','qualificacoes_historico','system_recovery')
GROUP BY tabela, acao
ORDER BY ultima DESC
LIMIT 12;

-- Fim
