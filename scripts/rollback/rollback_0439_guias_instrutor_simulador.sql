-- Rollback: 0439_guias_instrutor_simulador.sql
-- Reversível: dropa apenas os objetos criados por esta migration. Não toca em
-- nenhuma tabela pré-existente (modelos_sessao, modelos_aeronave, empresas).

DROP INDEX IF EXISTS idx_guias_instrutor_auditoria_empresa;
DROP TABLE IF EXISTS simuladores_guias_instrutor_auditoria;

DROP INDEX IF EXISTS uq_modelos_sessao_guias_par;
DROP INDEX IF EXISTS idx_modelos_sessao_guias_guia;
DROP INDEX IF EXISTS idx_modelos_sessao_guias_modelo;
DROP INDEX IF EXISTS idx_modelos_sessao_guias_empresa;
DROP TABLE IF EXISTS simuladores_modelos_sessao_guias;

DROP INDEX IF EXISTS uq_guias_instrutor_ativo_por_combinacao;
DROP INDEX IF EXISTS idx_guias_instrutor_aeronave_programa;
DROP INDEX IF EXISTS idx_guias_instrutor_codigo;
DROP INDEX IF EXISTS idx_guias_instrutor_empresa_status;
DROP INDEX IF EXISTS idx_guias_instrutor_empresa;
DROP TABLE IF EXISTS simuladores_guias_instrutor;
