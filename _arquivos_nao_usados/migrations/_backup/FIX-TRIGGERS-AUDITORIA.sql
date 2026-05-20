-- ============================================================================
-- CORRIGIR TRIGGERS DE AUDITORIA
-- Problema: Triggers usam coluna 'action' mas tabela tem 'acao'
-- ============================================================================

-- Dropar triggers antigos
DROP TRIGGER IF EXISTS soft_delete_qualificacoes;
DROP TRIGGER IF EXISTS soft_delete_exames;
DROP TRIGGER IF EXISTS soft_delete_checks;

-- Recriar triggers com coluna correta
CREATE TRIGGER soft_delete_qualificacoes
AFTER UPDATE ON funcionarios
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  -- Marcar qualificações como deletadas
  UPDATE qualificacoes
  SET deleted_at = datetime('now'),
      updated_at = datetime('now')
  WHERE funcionario_id = NEW.id
    AND deleted_at IS NULL;
  
  -- Registrar auditoria (coluna correta: acao)
  INSERT INTO auditoriaavancadav2 (acao, detalhes, timestamp)
  VALUES ('CASCADE_DELETE_QUALIFICACOES', 
          json_object('funcionario_id', NEW.id, 'count', (SELECT COUNT(*) FROM qualificacoes WHERE funcionario_id = NEW.id AND deleted_at IS NOT NULL)),
          datetime('now'));
END;

CREATE TRIGGER soft_delete_exames
AFTER UPDATE ON funcionarios
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  -- Marcar exames como deletados
  UPDATE exames
  SET deleted_at = datetime('now'),
      updated_at = datetime('now')
  WHERE funcionario_id = NEW.id
    AND deleted_at IS NULL;
  
  -- Registrar auditoria (coluna correta: acao)
  INSERT INTO auditoriaavancadav2 (acao, detalhes, timestamp)
  VALUES ('CASCADE_DELETE_EXAMES',
          json_object('funcionario_id', NEW.id, 'count', (SELECT COUNT(*) FROM exames WHERE funcionario_id = NEW.id AND deleted_at IS NOT NULL)),
          datetime('now'));
END;

CREATE TRIGGER soft_delete_checks
AFTER UPDATE ON funcionarios
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  -- Marcar checks como deletados
  UPDATE checks
  SET deleted_at = datetime('now'),
      updated_at = datetime('now')
  WHERE funcionario_id = NEW.id
    AND deleted_at IS NULL;
  
  -- Registrar auditoria (coluna correta: acao)
  INSERT INTO auditoriaavancadav2 (acao, detalhes, timestamp)
  VALUES ('CASCADE_DELETE_CHECKS',
          json_object('funcionario_id', NEW.id, 'count', (SELECT COUNT(*) FROM checks WHERE funcionario_id = NEW.id AND deleted_at IS NOT NULL)),
          datetime('now'));
END;

SELECT 'Triggers corrigidos com sucesso!' as message;
