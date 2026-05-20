
-- Rollback das tabelas do Módulo 2
DROP INDEX IF EXISTS idx_compliance_vencimento;
DROP INDEX IF EXISTS idx_compliance_status;
DROP INDEX IF EXISTS idx_compliance_funcionario_id;
DROP INDEX IF EXISTS idx_anexos_historico_id;
DROP INDEX IF EXISTS idx_historico_data_vencimento;
DROP INDEX IF EXISTS idx_historico_treinamento_id;
DROP INDEX IF EXISTS idx_historico_funcionario_id;
DROP INDEX IF EXISTS idx_catalogo_treinamentos_categoria;
DROP INDEX IF EXISTS idx_catalogo_treinamentos_codigo;

DROP TABLE IF EXISTS compliance_status_v2;
DROP TABLE IF EXISTS certificado_anexos_v2;
DROP TABLE IF EXISTS historico_certificacoes_v2;
DROP TABLE IF EXISTS catalogo_treinamentos_v2;
