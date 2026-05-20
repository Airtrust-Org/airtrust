-- 0083_create_triggers_validacao_historico.sql
-- Triggers para garantir faixa válida de nota (0-100) e carga_horaria >= 0

DROP TRIGGER IF EXISTS trg_qh_validate_nota_insert;
DROP TRIGGER IF EXISTS trg_qh_validate_nota_update;
DROP TRIGGER IF EXISTS trg_qh_validate_carga_insert;
DROP TRIGGER IF EXISTS trg_qh_validate_carga_update;

CREATE TRIGGER trg_qh_validate_nota_insert
BEFORE INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.nota IS NOT NULL AND (NEW.nota < 0 OR NEW.nota > 100)
BEGIN
  SELECT RAISE(ABORT, 'Valor de nota fora do intervalo 0-100');
END;

CREATE TRIGGER trg_qh_validate_nota_update
BEFORE UPDATE OF nota ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.nota IS NOT NULL AND (NEW.nota < 0 OR NEW.nota > 100)
BEGIN
  SELECT RAISE(ABORT, 'Valor de nota fora do intervalo 0-100');
END;

CREATE TRIGGER trg_qh_validate_carga_insert
BEFORE INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.carga_horaria IS NOT NULL AND NEW.carga_horaria < 0
BEGIN
  SELECT RAISE(ABORT, 'Carga horária não pode ser negativa');
END;

CREATE TRIGGER trg_qh_validate_carga_update
BEFORE UPDATE OF carga_horaria ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.carga_horaria IS NOT NULL AND NEW.carga_horaria < 0
BEGIN
  SELECT RAISE(ABORT, 'Carga horária não pode ser negativa');
END;
