-- Migration 0067: Auditoria BEFORE UPDATE + limpeza triggers soft delete antigas
-- Objetivos:
-- 1. Remover trigger(s) de soft delete antiga em funcionarios (cascata agora manual via service)
-- 2. Criar trigger BEFORE UPDATE para registrar alterações (UPDATE) em auditoria_avancada_v2 sempre
-- 3. Criar trigger AFTER UPDATE para registrar SOFT_DELETE quando deleted_at é definido (defesa dupla caso service não insira)
-- 4. Garantir idempotência

-- Drop de triggers antigas possíveis (nomes variados de versões anteriores)
DROP TRIGGER IF EXISTS trg_funcionarios_soft_delete_cascade;
DROP TRIGGER IF EXISTS trg_funcionarios_soft_delete;
DROP TRIGGER IF EXISTS trg_audit_funcionarios_update;
DROP TRIGGER IF EXISTS trg_audit_funcionarios_soft_delete_after_update;

-- Trigger BEFORE UPDATE para auditoria de alterações (campo diff simplificado JSON com colunas principais)
CREATE TRIGGER IF NOT EXISTS trg_audit_funcionarios_update
BEFORE UPDATE ON funcionarios
FOR EACH ROW
WHEN NEW.deleted_at IS NULL -- apenas updates não deletando
BEGIN
  INSERT INTO auditoria_avancada_v2 (
    tabela, registro_id, acao, origem, created_at
  ) VALUES (
    'funcionarios', OLD.id, 'UPDATE', 'trigger', datetime('now')
  );
END;

-- Trigger AFTER UPDATE para detectar soft delete caso service não tenha registrado (fallback)
CREATE TRIGGER IF NOT EXISTS trg_audit_funcionarios_soft_delete_after_update
AFTER UPDATE ON funcionarios
FOR EACH ROW
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, origem, created_at)
  VALUES ('funcionarios', NEW.id, 'SOFT_DELETE', 'trigger', datetime('now'));
END;

-- Observação: cascata removida das triggers para evitar inconsistências; implementação manual no service.
