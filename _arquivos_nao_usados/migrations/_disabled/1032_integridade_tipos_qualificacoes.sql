-- ════════════════════════════════════════════════════════════════
-- MIGRATION: Integridade Referencial tipos_qualificacoes ↔ qualificacoes
-- Data: 25/10/2025
-- Descrição: Garantir consistência via triggers e constraints
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- PARTE 1: ÍNDICES PARA PERFORMANCE E INTEGRIDADE
-- ════════════════════════════════════════════════════════════════

-- 1.1 - Índice único em tipos_qualificacoes.codigo
CREATE UNIQUE INDEX IF NOT EXISTS idx_tipos_codigo_unique 
ON tipos_qualificacoes(codigo) 
WHERE deleted_at IS NULL;

-- 1.2 - Índice em qualificacoes.codigo para performance
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo 
ON qualificacoes(codigo) 
WHERE deleted_at IS NULL;

-- 1.3 - Índice composto para joins frequentes
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo_status 
ON qualificacoes(codigo, status) 
WHERE deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════
-- PARTE 2: TRIGGERS DE VALIDAÇÃO
-- ════════════════════════════════════════════════════════════════

-- 2.1 - Trigger: Validar código antes de inserir qualificação
CREATE TRIGGER IF NOT EXISTS validate_qualificacao_codigo_insert
BEFORE INSERT ON qualificacoes
BEGIN
  SELECT RAISE(ABORT, 'Código de qualificação não existe em tipos_qualificacoes')
  WHERE NOT EXISTS (
    SELECT 1 FROM tipos_qualificacoes 
    WHERE codigo = NEW.codigo 
      AND deleted_at IS NULL
  );
END;

-- 2.2 - Trigger: Validar código antes de atualizar qualificação
CREATE TRIGGER IF NOT EXISTS validate_qualificacao_codigo_update
BEFORE UPDATE OF codigo ON qualificacoes
BEGIN
  SELECT RAISE(ABORT, 'Código de qualificação não existe em tipos_qualificacoes')
  WHERE NOT EXISTS (
    SELECT 1 FROM tipos_qualificacoes 
    WHERE codigo = NEW.codigo 
      AND deleted_at IS NULL
  );
END;

-- 2.3 - Trigger: Recalcular vencimento ao alterar validade_meses do tipo
CREATE TRIGGER IF NOT EXISTS update_vencimento_on_tipo_change
AFTER UPDATE OF validade_meses ON tipos_qualificacoes
WHEN OLD.validade_meses != NEW.validade_meses
BEGIN
  -- Atualizar apenas qualificações ATIVAS que ainda não venceram
  UPDATE qualificacoes
  SET data_validade = date(
    COALESCE(data_conclusao, data_realizacao, created_at), 
    '+' || NEW.validade_meses || ' months'
  ),
  updated_at = datetime('now')
  WHERE codigo = NEW.codigo
    AND (status = 'ATIVO' OR status IS NULL)
    AND deleted_at IS NULL;
END;

-- 2.4 - Trigger: Atualizar nome da qualificação ao alterar nome do tipo
CREATE TRIGGER IF NOT EXISTS update_nome_on_tipo_change
AFTER UPDATE OF nome ON tipos_qualificacoes
WHEN OLD.nome != NEW.nome
BEGIN
  UPDATE qualificacoes
  SET nome = NEW.nome,
      updated_at = datetime('now')
  WHERE codigo = NEW.codigo
    AND (nome IS NULL OR nome = OLD.nome)
    AND deleted_at IS NULL;
END;

-- ════════════════════════════════════════════════════════════════
-- PARTE 3: DIAGNÓSTICO - ENCONTRAR INCONSISTÊNCIAS
-- ════════════════════════════════════════════════════════════════

-- 3.1 - Criar tabela temporária para log de inconsistências
CREATE TEMP TABLE IF NOT EXISTS inconsistencias_log (
  tipo TEXT,
  codigo TEXT,
  total INTEGER,
  detalhes TEXT
);

-- 3.2 - Registrar qualificações órfãs (sem tipo correspondente)
INSERT INTO inconsistencias_log (tipo, codigo, total, detalhes)
SELECT 
  'QUALIFICACAO_ORFA' as tipo,
  q.codigo,
  COUNT(*) as total,
  'Qualificações sem tipo correspondente em tipos_qualificacoes' as detalhes
FROM qualificacoes q
LEFT JOIN tipos_qualificacoes tq ON tq.codigo = q.codigo AND tq.deleted_at IS NULL
WHERE tq.codigo IS NULL
  AND q.deleted_at IS NULL
GROUP BY q.codigo;

-- ════════════════════════════════════════════════════════════════
-- PARTE 4: CORREÇÃO AUTOMÁTICA DE DADOS INCONSISTENTES
-- ════════════════════════════════════════════════════════════════

-- 4.1 - Criar tipos faltantes para qualificações órfãs
INSERT INTO tipos_qualificacoes (codigo, nome, categoria, validade_meses, descricao, created_at)
SELECT DISTINCT 
  q.codigo,
  COALESCE(q.nome, q.codigo) as nome,
  CASE 
    WHEN q.tipo = 'EXAME' THEN 'EXAME'
    WHEN q.tipo = 'CHECK' THEN 'CHECK'
    WHEN q.tipo = 'TREINAMENTO' THEN 'TREINAMENTO_TEORICO'
    ELSE 'EXAME'
  END as categoria,
  12 as validade_meses,
  'Criado automaticamente para manter integridade - VERIFICAR E ATUALIZAR' as descricao,
  datetime('now')
FROM qualificacoes q
LEFT JOIN tipos_qualificacoes tq ON tq.codigo = q.codigo AND tq.deleted_at IS NULL
WHERE tq.codigo IS NULL
  AND q.deleted_at IS NULL
  AND q.codigo IS NOT NULL
  AND q.codigo != ''
ON CONFLICT(codigo) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- PARTE 5: RELATÓRIOS DE VERIFICAÇÃO
-- ════════════════════════════════════════════════════════════════

-- 5.1 - Relatório de integridade
SELECT 
  'RESUMO INTEGRIDADE' as relatorio,
  (SELECT COUNT(*) FROM qualificacoes WHERE deleted_at IS NULL) as total_qualificacoes,
  (SELECT COUNT(*) FROM tipos_qualificacoes WHERE deleted_at IS NULL) as total_tipos,
  (SELECT COUNT(DISTINCT codigo) FROM qualificacoes WHERE deleted_at IS NULL) as codigos_unicos_qualificacoes,
  (SELECT COUNT(*) FROM inconsistencias_log WHERE tipo = 'QUALIFICACAO_ORFA') as orfas_encontradas,
  (SELECT COUNT(*) FROM tipos_qualificacoes WHERE descricao LIKE '%Criado automaticamente%' AND deleted_at IS NULL) as tipos_criados_automaticamente;

-- 5.2 - Listar tipos criados automaticamente (para revisão)
SELECT 
  codigo,
  nome,
  categoria,
  validade_meses,
  'REVISAR MANUALMENTE' as acao_necessaria
FROM tipos_qualificacoes
WHERE descricao LIKE '%Criado automaticamente%'
  AND deleted_at IS NULL
ORDER BY codigo;

-- 5.3 - Relatório de vinculação por categoria
SELECT 
  tq.categoria,
  COUNT(DISTINCT tq.codigo) as total_tipos,
  COUNT(q.id) as total_qualificacoes,
  SUM(CASE WHEN q.status = 'ATIVO' THEN 1 ELSE 0 END) as ativas,
  SUM(CASE WHEN q.data_validade < DATE('now') THEN 1 ELSE 0 END) as vencidas
FROM tipos_qualificacoes tq
LEFT JOIN qualificacoes q ON q.codigo = tq.codigo AND q.deleted_at IS NULL
WHERE tq.deleted_at IS NULL
GROUP BY tq.categoria
ORDER BY tq.categoria;

-- ════════════════════════════════════════════════════════════════
-- PARTE 6: LIMPEZA
-- ════════════════════════════════════════════════════════════════

-- Limpar tabela temporária
DROP TABLE IF EXISTS inconsistencias_log;

-- ════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ════════════════════════════════════════════════════════════════

-- Contar qualificações órfãs restantes (deve ser 0)
SELECT 
  'VERIFICACAO_FINAL' as status,
  COUNT(*) as qualificacoes_orfas_restantes
FROM qualificacoes q
LEFT JOIN tipos_qualificacoes tq ON tq.codigo = q.codigo AND tq.deleted_at IS NULL
WHERE tq.codigo IS NULL
  AND q.deleted_at IS NULL;
