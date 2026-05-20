-- Migration 0102: Tabela de auditoria de ações administrativas
-- Registra ações destrutivas (reset de módulos, etc)
-- Data: 2025-11-25

CREATE TABLE IF NOT EXISTS admin_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Quem fez
  user_id INTEGER,
  user_email TEXT,
  
  -- O quê
  action TEXT NOT NULL, -- 'RESET_FUNCIONARIOS', 'RESET_QUALIFICACOES_TIPOS', etc
  module TEXT NOT NULL, -- 'funcionarios', 'qualificacoes_tipos', 'qualificacoes_historico'
  
  -- Resultado
  deleted_count INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT 1,
  error_message TEXT,
  
  -- Metadados
  metadata_json TEXT, -- JSON com informações extras
  ip_address TEXT,
  user_agent TEXT,
  
  -- Timestamp
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Soft delete (para auditoria nunca é apagado)
  deleted_at DATETIME DEFAULT NULL
);

-- Indexes para busca
CREATE INDEX IF NOT EXISTS idx_admin_actions_user_id ON admin_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action ON admin_actions(action);
CREATE INDEX IF NOT EXISTS idx_admin_actions_module ON admin_actions(module);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at DESC);

-- View para auditoria completa
CREATE VIEW IF NOT EXISTS v_admin_actions_audit AS
SELECT 
  aa.id,
  aa.user_email,
  aa.action,
  aa.module,
  aa.deleted_count,
  aa.success,
  aa.error_message,
  aa.created_at,
  CASE 
    WHEN aa.action LIKE 'RESET_%' THEN '🗑️ Limpeza de Dados'
    ELSE '⚙️ Ação Admin'
  END as action_type
FROM admin_actions aa
WHERE aa.deleted_at IS NULL
ORDER BY aa.created_at DESC;
