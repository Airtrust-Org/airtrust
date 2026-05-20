-- ========================================
-- Migration 0025: Índices Críticos - Módulo Simuladores
-- Data: 2025-12-01
-- Objetivo: Melhorar performance de queries mais usadas
-- ========================================

-- ÍNDICES PARA MANOBRAS
-- Query: SELECT FROM manobras WHERE tipo_sessao=? AND tipo_aeronave=?
CREATE INDEX IF NOT EXISTS idx_manobras_tipo_sessao_aeronave 
ON manobras(tipo_sessao, tipo_aeronave) 
WHERE deleted_at IS NULL;

-- Query: SELECT FROM manobras WHERE deleted_at IS NULL ORDER BY ordem
CREATE INDEX IF NOT EXISTS idx_manobras_ordem 
ON manobras(ordem) 
WHERE deleted_at IS NULL;

-- ÍNDICES PARA FICHAS_SESSAO
-- Query: SELECT FROM fichas_sessao WHERE tipo_sessao=?
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_tipo 
ON fichas_sessao(tipo_sessao) 
WHERE deleted_at IS NULL;

-- Query: SELECT FROM fichas_sessao WHERE status=?
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_status 
ON fichas_sessao(status) 
WHERE deleted_at IS NULL;

-- Query: SELECT FROM fichas_sessao WHERE colaborador_id_aluno=?
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_aluno 
ON fichas_sessao(colaborador_id_aluno) 
WHERE deleted_at IS NULL;

-- Query: SELECT FROM fichas_sessao WHERE agendamento_slot_id=?
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_agendamento 
ON fichas_sessao(agendamento_slot_id) 
WHERE deleted_at IS NULL;

-- ÍNDICES PARA FICHAS_SESSAO_MANOBRAS
-- Query: SELECT FROM fichas_sessao_manobras WHERE ficha_id=? ORDER BY ordem
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_ficha_ordem 
ON fichas_sessao_manobras(ficha_id, ordem) 
WHERE deleted_at IS NULL;

-- Tabela sessoes_template não existe no banco atual
-- Usando modelos_sessao no lugar

-- ÍNDICES PARA MODELOS_SESSAO
-- Query: SELECT FROM modelos_sessao WHERE tipo_sessao_id=? AND codigo_aeronave=?
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_tipo_aeronave 
ON modelos_sessao(tipo_sessao_id, codigo_aeronave) 
WHERE deleted_at IS NULL;

-- ÍNDICES PARA MODELOS_SESSAO_MANOBRAS
-- Query: SELECT FROM modelos_sessao_manobras WHERE modelo_id=? ORDER BY ordem
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_modelo_ordem 
ON modelos_sessao_manobras(modelo_id, ordem) 
WHERE deleted_at IS NULL;

-- ÍNDICES PARA SIMULADOR_AGENDAMENTOS
-- Query: SELECT FROM simulador_agendamentos WHERE simulador_id=? AND data=?
CREATE INDEX IF NOT EXISTS idx_simulador_agendamentos_simulador_data 
ON simulador_agendamentos(simulador_id, data) 
WHERE deleted_at IS NULL;

-- Query: SELECT FROM simulador_agendamentos WHERE tipo_sessao=?
CREATE INDEX IF NOT EXISTS idx_simulador_agendamentos_tipo 
ON simulador_agendamentos(tipo_sessao) 
WHERE deleted_at IS NULL;

-- Verificar se sessoes_participantes existe (não confirmado)
