# A-06 Matrix: Índices Redundantes

## Categoria A (Exatamente Equivalentes)

| Tabela | Colunas | Where | Único | Índices Duplicados | Ação Proposta |
|--------|---------|-------|-------|--------------------|---------------|
| `qualificacoes_tipos` | `ativo` | `deleted_at is null;` | false | `idx_qualificacoes_tipos_ativo`, `idx_qual_tipos_ativo` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `funcionario_id` | `deleted_at is null;` | false | `idx_qualificacoes_historico_funcionario`, `idx_qualificacoes_funcionario`, `idx_qh_funcionario`, `idx_historico_funcionario_id` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `qualificacao_id` | `deleted_at is null;` | false | `idx_qualificacoes_historico_qualificacao`, `idx_qh_qualificacao`, `idx_historico_qualificacao_id` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `status` | `deleted_at is null;` | false | `idx_qualificacoes_historico_status`, `idx_qh_status` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `data_vencimento` | `deleted_at is null;` | false | `idx_qualificacoes_historico_vencimento`, `idx_qh_data_vencimento`, `idx_historico_data_vencimento`, `idx_qualificacoes_hist_data_vencimento` | DROP dos redundantes (manter 1) |
| `modelos_sessao` | `codigo` | `-` | false | `idx_modelos_codigo`, `idx_modelos_sessao_codigo` | DROP dos redundantes (manter 1) |
| `modelos_sessao` | `deleted_at` | `-` | false | `idx_modelos_deleted`, `idx_modelos_sessao_deleted` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `status,data_vencimento` | `-` | false | `idx_qh_status_vencimento`, `idx_qh_status_venc` | DROP dos redundantes (manter 1) |
| `qualificacoes_tipos` | `deleted_at` | `-` | false | `idx_qt_deleted_at`, `idx_qualificacoes_tipos_deleted_at` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `data_vencimento` | `-` | false | `idx_qh_data_vencimento`, `idx_qualificacoes_hist_data_vencimento` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `validade` | `deleted_at is null;` | false | `idx_qualificacoes_validade`, `idx_qualificacoes_historico_validade`, `idx_qh_validade` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `codigo` | `deleted_at is null;` | false | `idx_qualificacoes_codigo`, `idx_qh_codigo` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `numero_certificado` | `deleted_at is null;` | false | `idx_qh_numero_cert`, `idx_qh_certificado` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `data_conclusao` | `deleted_at is null;` | false | `idx_historico_data_conclusao`, `idx_qualificacoes_hist_data_conclusao` | DROP dos redundantes (manter 1) |
| `funcionarios` | `modelo_aeronave_id` | `-` | false | `idx_funcionarios_modelo_aeronave`, `idx_funcionarios_modelo_aeronave_id` | DROP dos redundantes (manter 1) |
| `fichas_sessao` | `agendamento_slot_id` | `-` | false | `idx_fichas_sessao_agendamento`, `idx_fichas_agendamento` | DROP dos redundantes (manter 1) |
| `fichas_sessao` | `colaborador_id_aluno` | `-` | false | `idx_fichas_sessao_aluno`, `idx_fichas_aluno` | DROP dos redundantes (manter 1) |
| `fichas_sessao` | `instrutor_id` | `-` | false | `idx_fichas_sessao_instrutor`, `idx_fichas_instrutor` | DROP dos redundantes (manter 1) |
| `qualificacoes_historico` | `empresa_id` | `-` | false | `idx_qualificacoes_empresa`, `idx_qual_hist_empresa` | DROP dos redundantes (manter 1) |
| `fichas_sessao` | `empresa_id` | `-` | false | `idx_fichas_empresa`, `idx_fichas_sessao_empresa`, `idx_fichas_sessao_empresa_id` | DROP dos redundantes (manter 1) |
| `pasta_virtual` | `empresa_id` | `-` | false | `idx_pasta_empresa`, `idx_pasta_virtual_empresa` | DROP dos redundantes (manter 1) |
| `modelos_sessao` | `modelo_aeronave` | `-` | false | `idx_modelos_sessao_modelo`, `idx_modelos_sessao_modelo_aeronave` | DROP dos redundantes (manter 1) |
| `modelos_sessao` | `codigo_aeronave` | `-` | false | `idx_modelos_sessao_aeronave_codigo`, `idx_modelos_sessao_codigo_aeronave` | DROP dos redundantes (manter 1) |
| `modelos_sessao_manobras` | `modelo_id` | `-` | false | `idx_modelos_manobras_modelo`, `idx_modelos_sessao_manobras_modelo_id` | DROP dos redundantes (manter 1) |
| `simulador_agendamentos` | `data` | `-` | false | `idx_agendamentos_data`, `idx_agend_data_v5`, `idx_simulador_agendamentos_data` | DROP dos redundantes (manter 1) |
| `simulador_agendamentos` | `simulador_id` | `-` | false | `idx_agendamentos_simulador_id`, `idx_agend_sim_id_v5` | DROP dos redundantes (manter 1) |
| `simulador_agendamentos` | `funcionario_id` | `-` | false | `idx_agendamentos_funcionario_id`, `idx_agend_func_id_v5` | DROP dos redundantes (manter 1) |
| `simulador_agendamentos` | `status` | `-` | false | `idx_agendamentos_status`, `idx_agend_status_v5` | DROP dos redundantes (manter 1) |
| `simulador_agendamentos` | `deleted_at` | `-` | false | `idx_agendamentos_deleted_at`, `idx_agend_deleted_v5`, `idx_agendamentos_deleted` | DROP dos redundantes (manter 1) |
| `modelos_sessao` | `tipo_sessao_id,codigo_aeronave` | `deleted_at is null;` | false | `idx_modelos_sessao_tipo_aeronave`, `idx_modelos_sessao_codigo_aeronave` | DROP dos redundantes (manter 1) |
