-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Performance indexes for simuladores module
-- Data: 2025-11-30
-- Cloudflare D1 (SQLite) - SEM WHERE clause
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Simuladores
CREATE INDEX IF NOT EXISTS idx_simuladores_status ON simuladores(status);
CREATE INDEX IF NOT EXISTS idx_simuladores_tipo ON simuladores(tipo);
CREATE INDEX IF NOT EXISTS idx_simuladores_deleted ON simuladores(deleted_at);

-- Fichas Sessão
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_agendamento ON fichas_sessao(agendamento_slot_id);
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_aluno ON fichas_sessao(colaborador_id_aluno);
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_instrutor ON fichas_sessao(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_status ON fichas_sessao(status);
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_deleted ON fichas_sessao(deleted_at);

-- Manobras (cadastro de manobras)
CREATE INDEX IF NOT EXISTS idx_manobras_codigo ON manobras(codigo);
CREATE INDEX IF NOT EXISTS idx_manobras_categoria ON manobras(categoria);
CREATE INDEX IF NOT EXISTS idx_manobras_deleted ON manobras(deleted_at);
