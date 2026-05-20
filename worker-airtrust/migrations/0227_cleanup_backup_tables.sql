-- Migration 0227: Limpar tabelas de backup temporarias
-- Criadas durante migracoes de schema (0062, 0133, 0136, 0152)
-- Dados ja consolidados em empresa_id=6 (migration 0225/0226)

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS _backup_qualificacoes_historico;
DROP TABLE IF EXISTS _backup_qualificacoes_tipos;
DROP TABLE IF EXISTS _backup_funcionarios;
DROP TABLE IF EXISTS pasta_virtual_backup;
DROP TABLE IF EXISTS avaliacoes_manobras_backup;
DROP TABLE IF EXISTS alertas_enviados_backup;
DROP TABLE IF EXISTS arquivos_backup;
DROP TABLE IF EXISTS compliance_status_backup;
DROP TABLE IF EXISTS consentimentos_lgpd_backup;
DROP TABLE IF EXISTS documentos_backup;
DROP TABLE IF EXISTS fichas_manobras_historico_backup;
DROP TABLE IF EXISTS funcionario_documentos_backup;
DROP TABLE IF EXISTS funcionarios_aeronaves_backup;
DROP TABLE IF EXISTS instrutores_simulador_backup;
DROP TABLE IF EXISTS licencas_backup;
DROP TABLE IF EXISTS logs_acesso_dados_backup;
DROP TABLE IF EXISTS notificacoes_backup;
DROP TABLE IF EXISTS fichas_sessao_backup_20260113;
DROP TABLE IF EXISTS funcionarios_backup;
DROP TABLE IF EXISTS backup_funcionarios;
DROP TABLE IF EXISTS qh_backup_tmp;
DROP TABLE IF EXISTS backup_qh_tmp;
DROP TABLE IF EXISTS _backup_pessoas;
DROP TABLE IF EXISTS pessoas_backup;

PRAGMA foreign_keys = ON;

