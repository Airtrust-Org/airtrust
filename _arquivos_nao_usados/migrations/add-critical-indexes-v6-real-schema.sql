-- =====================================================
-- FASE 1.2.1: ÍNDICES CRÍTICOS V6 - SCHEMA REAL
-- =====================================================
-- Baseado na estrutura REAL validada em produção
-- Foco: Certificados (29 reg), Qualificacoes (78 reg), Habilitacoes (936 reg)
-- Total: 10 índices para otimizar consultas mais frequentes
-- =====================================================

-- ========== CERTIFICADOS (29 registros) ==========

-- Busca por funcionário (consulta mais comum)
CREATE INDEX IF NOT EXISTS idx_cert_func_id_v6 ON certificados(funcionario_id);

-- Busca por habilitação
CREATE INDEX IF NOT EXISTS idx_cert_hab_id_v6 ON certificados(habilitacao_id);

-- Busca por qualificação
CREATE INDEX IF NOT EXISTS idx_cert_qual_id_v6 ON certificados(qualificacao_id);

-- Soft delete (filtro WHERE deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_cert_deleted_v6 ON certificados(deleted_at);

-- ========== QUALIFICACOES (78 registros) ==========

-- Busca por funcionário
CREATE INDEX IF NOT EXISTS idx_qual_func_id_v6 ON qualificacoes(funcionario_id);

-- Filtro por categoria (INICIAL, PERIODICA, RECORRENTE)
CREATE INDEX IF NOT EXISTS idx_qual_categoria_v6 ON qualificacoes(categoria);

-- Soft delete
CREATE INDEX IF NOT EXISTS idx_qual_deleted_v6 ON qualificacoes(deleted_at);

-- ========== HABILITACOES (936 registros - PRIORIDADE MÁXIMA) ==========

-- Busca por funcionário (consulta mais comum)
CREATE INDEX IF NOT EXISTS idx_hab_func_id_v6 ON habilitacoes(funcionario_id);

-- Busca por qualificação
CREATE INDEX IF NOT EXISTS idx_hab_qual_id_v6 ON habilitacoes(qualificacao_id);

-- Soft delete (filtro WHERE deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_hab_deleted_v6 ON habilitacoes(deleted_at);

-- =====================================================
-- RESULTADO ESPERADO:
-- - 10 novos índices aplicados
-- - Cobertura: 1.043 registros (29 + 78 + 936)
-- - Total no sistema: 15 índices (5 v5 + 10 v6)
-- =====================================================
