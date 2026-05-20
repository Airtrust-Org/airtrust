-- 0093_perf_indexes_qualificacoes.sql
-- Índices adicionais para reduzir latência em /qualificacoes/tipos e /qualificacoes/historico
-- Foco: filtros por categoria, ordenações por data, paginação eficiente

-- TIPOS
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;

-- HISTORICO
CREATE INDEX IF NOT EXISTS idx_qh_datas_compostas ON qualificacoes_historico(data_conclusao, data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_func_qual ON qualificacoes_historico(funcionario_id, qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_updated_at ON qualificacoes_historico(updated_at);

-- Estatísticas rápidas (já existem alguns índices, complementar com validade)
CREATE INDEX IF NOT EXISTS idx_qh_validade ON qualificacoes_historico(validade) WHERE deleted_at IS NULL;

-- Verificação básica
SELECT 'qualificacoes_tipos' AS tabela, count(*) AS total_registros FROM qualificacoes_tipos;
SELECT 'qualificacoes_historico' AS tabela, count(*) AS total_registros FROM qualificacoes_historico;
