-- Migrations: Performance Indexes v3
-- Data: 6 de Novembro de 2025
-- Objetivo: Otimizar queries lentas com índices

-- ✅ Índices em fichas (tabela mais crítica)
CREATE INDEX IF NOT EXISTS idx_fichas_colaborador_id ON fichas(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_fichas_instrutor_id ON fichas(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_fichas_deleted_at ON fichas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_fichas_status ON fichas(status);
CREATE INDEX IF NOT EXISTS idx_fichas_agendamento_id ON fichas(agendamento_id);

-- ✅ Índices em agendamentos_simulador (tabela crítica)
CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador_id ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_funcionario_id ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos_simulador(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_deleted_at ON agendamentos_simulador(deleted_at);

-- ✅ Índices adicionais para melhor cobertura
CREATE INDEX IF NOT EXISTS idx_ficha_manobras_ficha_id ON ficha_manobras_avaliacao(ficha_id);
CREATE INDEX IF NOT EXISTS idx_ficha_manobras_manobra_id ON ficha_manobras_avaliacao(manobra_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted_at ON funcionarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status);

-- Resultado: Queries que fazem FULL TABLE SCAN agora usarão índices
-- Impacto esperado: 50-80% mais rápido em listagens com WHERE/JOIN
