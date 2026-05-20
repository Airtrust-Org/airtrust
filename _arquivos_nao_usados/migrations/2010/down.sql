-- Rollback: Remover sistema de certificados
DROP VIEW IF EXISTS vw_certificados_historico;
DROP VIEW IF EXISTS vw_certificados_ativos;
DROP TABLE IF EXISTS certificados_qualificacoes;
