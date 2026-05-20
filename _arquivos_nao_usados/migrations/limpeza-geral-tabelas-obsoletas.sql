-- ============================================================================
-- LIMPEZA GERAL: Remover tabelas obsoletas
-- Data: 2025-11-06
-- Autor: Sistema AirTrust
-- Descrição: Remove 13 tabelas obsoletas após migração de dados órfãos
-- ============================================================================

-- FASE 1: Remover indexes de qualificacoes_registros
DROP INDEX IF EXISTS idx_qual_reg_funcionario_deleted;
DROP INDEX IF EXISTS idx_qual_reg_vencimento_status;
DROP INDEX IF EXISTS idx_qual_reg_codigo_tipo;
DROP INDEX IF EXISTS idx_qual_reg_renovada;
DROP INDEX IF EXISTS idx_qual_reg_status_deleted;

-- FASE 2: Remover tabela principal obsoleta
DROP TABLE IF EXISTS qualificacoes_registros;

-- FASE 3: Remover backups antigos (Nov 2)
DROP TABLE IF EXISTS __backup_20251102_auditoriaavancadav2;
DROP TABLE IF EXISTS __backup_20251102_certificados;
DROP TABLE IF EXISTS __backup_20251102_certificados_auditoria;
DROP TABLE IF EXISTS __backup_20251102_certificados_qualificacoes;
DROP TABLE IF EXISTS __backup_20251102_certificados_storage;
DROP TABLE IF EXISTS __backup_20251102_fichas_assinaturas;
DROP TABLE IF EXISTS __backup_20251102_funcionarios;
DROP TABLE IF EXISTS __backup_20251102_pasta_virtual_sync;
DROP TABLE IF EXISTS __backup_20251102_qualificacoes;
DROP TABLE IF EXISTS __backup_20251102_sessoes_simulador;
DROP TABLE IF EXISTS __backup_20251102_usuarios;

-- FASE 4: Remover duplicatas antigas
DROP TABLE IF EXISTS manobras_old;

-- Verificar resultado
SELECT 
  'TABELAS_RESTANTES' as status,
  COUNT(*) as total,
  GROUP_CONCAT(name, ', ') as nomes
FROM sqlite_master 
WHERE type='table' 
  AND name NOT LIKE 'sqlite_%'
  AND name NOT LIKE 'd1_%'
  AND (
    name LIKE '_%' 
    OR name LIKE '%_old' 
    OR name LIKE '%_backup' 
    OR name LIKE '%_v1'
    OR name = 'qualificacoes_registros'
  );
