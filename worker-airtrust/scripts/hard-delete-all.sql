-- Remove todos os triggers
DROP TRIGGER IF EXISTS trg_apply_reclassification;
DROP TRIGGER IF EXISTS trg_audit_funcionarios_soft_delete_after_update;
DROP TRIGGER IF EXISTS trg_audit_funcionarios_update;
DROP TRIGGER IF EXISTS trg_funcionarios_prevent_hard_delete;
DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_prevent_hard_delete;
DROP TRIGGER IF EXISTS update_credenciais_updated_at;
DROP TRIGGER IF EXISTS update_papeis_updated_at;
DROP TRIGGER IF EXISTS update_qt_timestamp;

-- Deleta dados (na ordem correta)
DELETE FROM qualificacoes_historico;
DELETE FROM funcionarios_aeronaves;
DELETE FROM funcionario_documentos;
DELETE FROM funcionarios;
DELETE FROM qualificacoes_tipos;

-- Verifica
SELECT 
  (SELECT COUNT(*) FROM funcionarios) as funcionarios,
  (SELECT COUNT(*) FROM qualificacoes_tipos) as tipos,
  (SELECT COUNT(*) FROM qualificacoes_historico) as historico;
