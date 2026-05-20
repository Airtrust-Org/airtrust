-- Migration: Adicionar constraints críticos para qualificações
-- Data: 2025-11-01
-- Objetivo: Garantir integridade de dados e conformidade ANAC

-- 1. Criar índices adicionais para performance
CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_status ON qualificacoes(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_vencimento ON qualificacoes(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipo ON qualificacoes(tipo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_renovada ON qualificacoes(is_renovada) WHERE deleted_at IS NULL;

-- 2. Criar tabela de auditoria se não existir
CREATE TABLE IF NOT EXISTS qualificacoes_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qualificacao_id INTEGER NOT NULL,
  acao TEXT NOT NULL CHECK(acao IN ('CREATE', 'UPDATE', 'DELETE', 'RENOVAR')),
  dados_antes TEXT,
  dados_depois TEXT,
  usuario TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id)
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_auditoria_id ON qualificacoes_auditoria(qualificacao_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_auditoria_acao ON qualificacoes_auditoria(acao);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_auditoria_timestamp ON qualificacoes_auditoria(timestamp);

-- 3. Criar trigger para auditoria automática em INSERT
CREATE TRIGGER IF NOT EXISTS qualificacoes_audit_insert
AFTER INSERT ON qualificacoes
FOR EACH ROW
BEGIN
  INSERT INTO qualificacoes_auditoria (
    qualificacao_id,
    acao,
    dados_antes,
    dados_depois,
    usuario
  ) VALUES (
    NEW.id,
    'CREATE',
    NULL,
    json_object(
      'id', NEW.id,
      'funcionario_id', NEW.funcionario_id,
      'tipo', NEW.tipo,
      'codigo', NEW.codigo,
      'data_conclusao', NEW.data_conclusao,
      'data_vencimento', NEW.data_vencimento,
      'status', NEW.status
    ),
    'system'
  );
END;

-- 4. Criar trigger para auditoria automática em UPDATE
CREATE TRIGGER IF NOT EXISTS qualificacoes_audit_update
AFTER UPDATE ON qualificacoes
FOR EACH ROW
WHEN OLD.updated_at != NEW.updated_at
BEGIN
  INSERT INTO qualificacoes_auditoria (
    qualificacao_id,
    acao,
    dados_antes,
    dados_depois,
    usuario
  ) VALUES (
    NEW.id,
    CASE 
      WHEN NEW.deleted_at IS NOT NULL THEN 'DELETE'
      WHEN NEW.is_renovada = 1 AND OLD.is_renovada = 0 THEN 'RENOVAR'
      ELSE 'UPDATE'
    END,
    json_object(
      'id', OLD.id,
      'funcionario_id', OLD.funcionario_id,
      'tipo', OLD.tipo,
      'codigo', OLD.codigo,
      'data_conclusao', OLD.data_conclusao,
      'data_vencimento', OLD.data_vencimento,
      'status', OLD.status,
      'deleted_at', OLD.deleted_at
    ),
    json_object(
      'id', NEW.id,
      'funcionario_id', NEW.funcionario_id,
      'tipo', NEW.tipo,
      'codigo', NEW.codigo,
      'data_conclusao', NEW.data_conclusao,
      'data_vencimento', NEW.data_vencimento,
      'status', NEW.status,
      'deleted_at', NEW.deleted_at
    ),
    'system'
  );
END;

-- 5. Criar trigger para prevenir UPDATE em auditoria (imutabilidade)
CREATE TRIGGER IF NOT EXISTS qualificacoes_auditoria_immutable
BEFORE UPDATE ON qualificacoes_auditoria
BEGIN
  SELECT RAISE(ABORT, 'Registros de auditoria são imutáveis e não podem ser alterados');
END;

-- 6. Criar trigger para prevenir DELETE em auditoria (imutabilidade)
CREATE TRIGGER IF NOT EXISTS qualificacoes_auditoria_no_delete
BEFORE DELETE ON qualificacoes_auditoria
BEGIN
  SELECT RAISE(ABORT, 'Registros de auditoria não podem ser deletados - retenção obrigatória 5 anos');
END;

-- 7. Criar view para compliance rápido
CREATE VIEW IF NOT EXISTS vw_qualificacoes_compliance AS
SELECT 
  q.id,
  q.funcionario_id,
  f.nome as funcionario_nome,
  q.codigo,
  q.nome,
  q.data_conclusao,
  q.data_vencimento,
  CAST(julianday(q.data_vencimento) - julianday('now') AS INTEGER) as dias_para_vencimento,
  CASE
    WHEN q.is_renovada = 1 THEN 'RENOVADA'
    WHEN q.data_vencimento IS NULL THEN 'VALIDA'
    WHEN julianday(q.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(q.data_vencimento) - julianday('now') <= 7 THEN 'CRITICO'
    WHEN julianday(q.data_vencimento) - julianday('now') <= 30 THEN 'VENCENDO'
    ELSE 'CONFORME'
  END as status_compliance
FROM qualificacoes q
INNER JOIN funcionarios f ON f.id = q.funcionario_id
WHERE q.deleted_at IS NULL;

-- 8. Comentários para documentação
-- Este migration adiciona:
-- - Índices de performance para queries rápidas
-- - Sistema de auditoria automática com triggers
-- - Imutabilidade de logs (conformidade ANAC)
-- - View para compliance rápido
-- - Retenção obrigatória de 5 anos

-- IMPORTANTE: Não adicionar constraints CHECK em SQLite pois não suporta ALTER TABLE ADD CONSTRAINT
-- As validações de datas são feitas no schema Zod no backend
