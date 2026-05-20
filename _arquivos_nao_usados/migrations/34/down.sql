
-- Remover índices do módulo de simuladores
DROP INDEX IF EXISTS idx_agendamento_slots_simulador_data;
DROP INDEX IF EXISTS idx_agendamento_slots_status;
DROP INDEX IF EXISTS idx_agendamento_slots_instrutor;
DROP INDEX IF EXISTS idx_agendamento_slots_data_inicio;
DROP INDEX IF EXISTS idx_fichas_sessao_slot;
DROP INDEX IF EXISTS idx_fichas_sessao_aluno;
DROP INDEX IF EXISTS idx_fichas_sessao_status;
DROP INDEX IF EXISTS idx_fichas_sessao_template;
DROP INDEX IF EXISTS idx_fichas_sessao_uuid;
DROP INDEX IF EXISTS idx_fichas_sessao_certificacao;
DROP INDEX IF EXISTS idx_manobras_catalogo_categoria;
DROP INDEX IF EXISTS idx_manobras_catalogo_ativo;
DROP INDEX IF EXISTS idx_manobras_catalogo_codigo;
DROP INDEX IF EXISTS idx_sessoes_template_manobras_sessao;
DROP INDEX IF EXISTS idx_sessoes_template_manobras_manobra;
DROP INDEX IF EXISTS idx_auditoria_simulador_ficha;
DROP INDEX IF EXISTS idx_auditoria_simulador_usuario;
DROP INDEX IF EXISTS idx_auditoria_simulador_timestamp;
DROP INDEX IF EXISTS idx_auditoria_simulador_acao;
DROP INDEX IF EXISTS idx_simuladores_status;
DROP INDEX IF EXISTS idx_simuladores_codigo;
DROP INDEX IF EXISTS idx_funcionarios_instrutor;
DROP INDEX IF EXISTS idx_funcionarios_checador;
DROP INDEX IF EXISTS idx_fichas_completa;
DROP INDEX IF EXISTS idx_agendamento_completo;
