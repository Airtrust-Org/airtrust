-- Índices essenciais (apenas tabelas garantidas no ambiente v2)

-- Qualificações
CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_validade ON qualificacoes(data_validade);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted ON qualificacoes(deleted_at);

-- Sessoes de simulador
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_simulador ON sessoes_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_status ON sessoes_simulador(status);
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_deleted ON sessoes_simulador(deleted_at);

-- Simuladores
CREATE INDEX IF NOT EXISTS idx_simuladores_deleted ON simuladores(deleted_at);
