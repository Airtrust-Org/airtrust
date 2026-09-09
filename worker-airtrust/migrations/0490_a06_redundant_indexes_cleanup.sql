-- Migration 0490: A-06 - Remocao de Indices Redundantes (Categoria A)
-- Removes exact duplicates found in the schema to save storage and write performance.

-- qualificacoes_tipos
DROP INDEX IF EXISTS idx_qual_tipos_ativo;
DROP INDEX IF EXISTS idx_qt_deleted_at;

-- qualificacoes_historico
DROP INDEX IF EXISTS idx_qualificacoes_funcionario;
DROP INDEX IF EXISTS idx_qh_funcionario;
DROP INDEX IF EXISTS idx_historico_funcionario_id;
DROP INDEX IF EXISTS idx_qh_qualificacao;
DROP INDEX IF EXISTS idx_historico_qualificacao_id;
DROP INDEX IF EXISTS idx_qh_status;
DROP INDEX IF EXISTS idx_qh_data_vencimento;
DROP INDEX IF EXISTS idx_historico_data_vencimento;
DROP INDEX IF EXISTS idx_qualificacoes_hist_data_vencimento;
DROP INDEX IF EXISTS idx_qh_status_venc;
DROP INDEX IF EXISTS idx_qualificacoes_historico_validade;
DROP INDEX IF EXISTS idx_qh_validade;
DROP INDEX IF EXISTS idx_qh_codigo;
DROP INDEX IF EXISTS idx_qh_certificado;
DROP INDEX IF EXISTS idx_qualificacoes_hist_data_conclusao;
DROP INDEX IF EXISTS idx_qual_hist_empresa;

-- modelos_sessao
DROP INDEX IF EXISTS idx_modelos_sessao_codigo;
DROP INDEX IF EXISTS idx_modelos_sessao_deleted;
DROP INDEX IF EXISTS idx_modelos_sessao_modelo_aeronave;
DROP INDEX IF EXISTS idx_modelos_sessao_codigo_aeronave;

-- funcionarios
DROP INDEX IF EXISTS idx_funcionarios_modelo_aeronave;

-- fichas_sessao
DROP INDEX IF EXISTS idx_fichas_agendamento;
DROP INDEX IF EXISTS idx_fichas_aluno;
DROP INDEX IF EXISTS idx_fichas_instrutor;
DROP INDEX IF EXISTS idx_fichas_sessao_empresa;
DROP INDEX IF EXISTS idx_fichas_sessao_empresa_id;

-- pasta_virtual
DROP INDEX IF EXISTS idx_pasta_empresa;

-- modelos_sessao_manobras
DROP INDEX IF EXISTS idx_modelos_manobras_modelo;

-- simulador_agendamentos
DROP INDEX IF EXISTS idx_agend_data_v5;
DROP INDEX IF EXISTS idx_simulador_agendamentos_data;
DROP INDEX IF EXISTS idx_agend_sim_id_v5;
DROP INDEX IF EXISTS idx_agend_func_id_v5;
DROP INDEX IF EXISTS idx_agend_status_v5;
DROP INDEX IF EXISTS idx_agend_deleted_v5;
DROP INDEX IF EXISTS idx_agendamentos_deleted;
