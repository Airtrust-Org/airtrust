-- =========================================
-- INTEGRAÇÃO EDAPP - SCHEMA D1
-- Migration: 0144_integracao_edapp.sql
-- Data: 2025-12-05
-- Descrição: Tabelas para integração com EdApp (EAD)
-- =========================================

-- Tabela de mapeamento de usuários AirTrust ↔ EdApp
CREATE TABLE IF NOT EXISTS integracoes_edapp_usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  edapp_user_id TEXT NOT NULL,
  edapp_email TEXT,
  edapp_username TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(funcionario_id, edapp_user_id)
);

CREATE INDEX IF NOT EXISTS idx_edapp_usuarios_funcionario
  ON integracoes_edapp_usuarios(funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_edapp_usuarios_edapp
  ON integracoes_edapp_usuarios(edapp_user_id) WHERE deleted_at IS NULL;

-- Tabela de mapeamento de cursos EdApp ↔ qualificação AirTrust
CREATE TABLE IF NOT EXISTS integracoes_edapp_cursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edapp_course_id TEXT NOT NULL,
  edapp_course_name TEXT,
  edapp_course_code TEXT,
  qualificacao_codigo TEXT NOT NULL,
  qualificacao_id INTEGER,
  validade_meses INTEGER DEFAULT 12,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(edapp_course_id)
);

CREATE INDEX IF NOT EXISTS idx_edapp_cursos_qualificacao
  ON integracoes_edapp_cursos(qualificacao_codigo) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_edapp_cursos_edapp_id
  ON integracoes_edapp_cursos(edapp_course_id) WHERE deleted_at IS NULL;

-- Tabela de log de eventos recebidos do EdApp (webhooks, polling, etc.)
CREATE TABLE IF NOT EXISTS integracoes_edapp_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_evento TEXT NOT NULL,
  edapp_user_id TEXT,
  edapp_course_id TEXT,
  payload_json TEXT NOT NULL,
  processado INTEGER NOT NULL DEFAULT 0,
  erro_ultima TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  funcionario_id INTEGER,
  qualificacao_historico_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_edapp_eventos_processado
  ON integracoes_edapp_eventos(processado) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_edapp_eventos_tipo
  ON integracoes_edapp_eventos(tipo_evento) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_edapp_eventos_created
  ON integracoes_edapp_eventos(created_at) WHERE deleted_at IS NULL;

-- Gatilhos de updated_at
CREATE TRIGGER IF NOT EXISTS trg_integracoes_edapp_usuarios_updated_at
AFTER UPDATE ON integracoes_edapp_usuarios
FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_usuarios
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_integracoes_edapp_cursos_updated_at
AFTER UPDATE ON integracoes_edapp_cursos
FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_cursos
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_integracoes_edapp_eventos_updated_at
AFTER UPDATE ON integracoes_edapp_eventos
FOR EACH ROW
BEGIN
  UPDATE integracoes_edapp_eventos
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;
