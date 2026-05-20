-- ========================================
-- ÍNDICES CRÍTICOS DE PERFORMANCE - V5 CORRIGIDO
-- Data: 10/11/2025
-- Baseado nas tabelas reais do banco
-- ========================================

-- ===========================================
-- FUNCIONARIOS (tabela mais consultada)
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_func_email_v5 
ON funcionarios(email) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_func_matricula_v5 
ON funcionarios(matricula) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_func_cpf_v5 
ON funcionarios(cpf) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_func_deleted_v5 
ON funcionarios(deleted_at);

CREATE INDEX IF NOT EXISTS idx_func_status_v5 
ON funcionarios(status) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_func_funcao_v5 
ON funcionarios(funcao) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_func_setor_v5 
ON funcionarios(setor) 
WHERE deleted_at IS NULL;

-- ===========================================
-- AGENDAMENTOS_SIMULADOR
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_agend_func_v5 
ON agendamentos_simulador(funcionario_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agend_instrutor_v5 
ON agendamentos_simulador(instrutor_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agend_simulador_v5 
ON agendamentos_simulador(simulador_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agend_data_v5 
ON agendamentos_simulador(data) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agend_status_v5 
ON agendamentos_simulador(status) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agend_deleted_v5 
ON agendamentos_simulador(deleted_at);

-- ===========================================
-- QUALIFICACOES
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_qual_func_v5 
ON qualificacoes(funcionario_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qual_tipo_v5 
ON qualificacoes(tipo) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qual_nome_v5 
ON qualificacoes(nome) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qual_deleted_v5 
ON qualificacoes(deleted_at);

-- ===========================================
-- HABILITACOES
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_hab_func_v5 
ON habilitacoes(funcionario_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hab_validade_v5 
ON habilitacoes(data_vencimento) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hab_deleted_v5 
ON habilitacoes(deleted_at);

CREATE INDEX IF NOT EXISTS idx_hab_tipo_v5 
ON habilitacoes(tipo) 
WHERE deleted_at IS NULL;

-- ===========================================
-- SESSOES_SIMULADOR (similar a simulador_fichas)
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_sess_func_v5 
ON sessoes_simulador(funcionario_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sess_simulador_v5 
ON sessoes_simulador(simulador_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sess_data_v5 
ON sessoes_simulador(data_sessao) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sess_deleted_v5 
ON sessoes_simulador(deleted_at);

-- ===========================================
-- FICHAS
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_fichas_agend_v5 
ON fichas(agendamento_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_uuid2_v5 
ON fichas(uuid) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_deleted2_v5 
ON fichas(deleted_at);

-- ===========================================
-- MANOBRAS
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_manobras_codigo_v5 
ON manobras(codigo) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_manobras_categoria_v5 
ON manobras(categoriaid) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_manobras_deleted_v5 
ON manobras(deleted_at);

-- ===========================================
-- AUDITORIAAVANCADAV2 (logs crescem muito)
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_audit_created_v5 
ON auditoriaavancadav2(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_user_v5 
ON auditoriaavancadav2(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_action_v5 
ON auditoriaavancadav2(action);

CREATE INDEX IF NOT EXISTS idx_audit_table_v5 
ON auditoriaavancadav2(table_name);

-- ===========================================
-- CERTIFICADOS
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_cert_func_v5 
ON certificados(funcionario_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cert_deleted_v5 
ON certificados(deleted_at);

-- ===========================================
-- EXAMES
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_exames_func_v5 
ON exames(funcionario_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exames_data_v5 
ON exames(data_vencimento) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exames_deleted_v5 
ON exames(deleted_at);

-- ===========================================
-- TREINAMENTOS
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_trei_deleted_v5 
ON treinamentos(deleted_at);

-- ===========================================
-- SIMULADORES
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_sim_deleted_v5 
ON simuladores(deleted_at);

CREATE INDEX IF NOT EXISTS idx_sim_tipo_v5 
ON simuladores(tipo) 
WHERE deleted_at IS NULL;

-- ===========================================
-- TOTAL: ~45 ÍNDICES CRÍTICOS
-- ===========================================
-- Impacto esperado: Queries 10-100x mais rápidas
-- Dashboard: 5-10s → <1s
-- Listagens: 3-5s → <500ms
-- ===========================================
