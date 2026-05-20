-- =============================================
-- MIGRATION 0160: Sistema de Backup Completo
-- Data: 2025-12-07
-- Objetivo: Criar tabelas para sistema de backup/restore
-- =============================================

-- Tabela principal de controle de backups
CREATE TABLE IF NOT EXISTS backups_controle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('COMPLETO', 'MODULAR', 'INCREMENTAL')),
  escopo TEXT NOT NULL CHECK (escopo IN ('GERAL', 'MODULAR')),
  triggered_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'EM_PROGRESSO' CHECK (status IN ('EM_PROGRESSO', 'CONCLUIDO', 'FALHOU')),
  
  -- Módulos incluídos (JSON array)
  modulos_incluidos TEXT,
  
  -- Storage
  r2_bucket TEXT NOT NULL DEFAULT 'airtrust-storage',
  r2_path TEXT NOT NULL,
  r2_checksum_sha256 TEXT,
  
  -- Políticas de retenção
  retention_policy TEXT NOT NULL DEFAULT '7_ANOS' CHECK (retention_policy IN ('30_DIAS', '1_ANO', '7_ANOS')),
  expires_at TEXT NOT NULL,
  
  -- Métricas
  duracao_segundos INTEGER,
  total_registros INTEGER DEFAULT 0,
  total_tabelas INTEGER DEFAULT 0,
  tamanho_bytes INTEGER DEFAULT 0,
  
  -- Rastreamento
  usuarios_id INTEGER,
  descricao TEXT,
  
  -- Auditoria
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  FOREIGN KEY (usuarios_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Tabela de logs de backup
CREATE TABLE IF NOT EXISTS backups_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backups_controle_id INTEGER NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('INFO', 'WARN', 'ERROR', 'SUCCESS')),
  mensagem TEXT NOT NULL,
  tabela_afetada TEXT,
  registros_processados INTEGER,
  detalhes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (backups_controle_id) REFERENCES backups_controle(id) ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_backups_controle_uuid 
  ON backups_controle(uuid);

CREATE INDEX IF NOT EXISTS idx_backups_controle_status 
  ON backups_controle(status);

CREATE INDEX IF NOT EXISTS idx_backups_controle_tipo 
  ON backups_controle(tipo);

CREATE INDEX IF NOT EXISTS idx_backups_controle_created_at 
  ON backups_controle(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backups_controle_expires_at 
  ON backups_controle(expires_at);

CREATE INDEX IF NOT EXISTS idx_backups_controle_deleted_at 
  ON backups_controle(deleted_at);

CREATE INDEX IF NOT EXISTS idx_backups_logs_controle_id 
  ON backups_logs(backups_controle_id);

CREATE INDEX IF NOT EXISTS idx_backups_logs_nivel 
  ON backups_logs(nivel);

CREATE INDEX IF NOT EXISTS idx_backups_logs_created_at 
  ON backups_logs(created_at DESC);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS trigger_backups_controle_updated_at
AFTER UPDATE ON backups_controle
FOR EACH ROW
BEGIN
  UPDATE backups_controle 
  SET updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

-- Mensagem de confirmação
SELECT '✅ Sistema de backup criado com sucesso!' as message;
