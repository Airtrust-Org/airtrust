-- ETAPA 2: Refresh Tokens & Token Revocation
-- Tabelas para gerenciar rotação de tokens e revogação
-- Data: 2025-11-02

-- ============================================================
-- 1. Tabela de Refresh Tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Associação
  usuario_id INTEGER NOT NULL,
  
  -- Token Info
  token_jti TEXT UNIQUE NOT NULL,  -- JWT ID (identificador único do token)
  token_hash TEXT UNIQUE NOT NULL, -- Hash do refresh token (nunca armazenar token em plaintext)
  
  -- Expiração
  expires_at TIMESTAMP NOT NULL,
  
  -- Auditoria
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_ip TEXT,
  created_user_agent TEXT,
  
  -- Soft Delete
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_refresh_usuario ON refresh_tokens(usuario_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_refresh_jti ON refresh_tokens(token_jti);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);

-- ============================================================
-- 2. Tabela de Revogação de Tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS token_revocation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Token Revogado
  token_jti TEXT UNIQUE NOT NULL,
  
  -- Contexto
  usuario_id INTEGER,
  refresh_token_id INTEGER,
  
  -- Motivo da Revogação
  reason TEXT DEFAULT 'user_logout', -- 'user_logout', 'password_reset', 'admin_revoke', 'session_expired', 'security_incident'
  detalhes TEXT,
  
  -- Auditoria
  revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_by TEXT DEFAULT 'SYSTEM',
  revoked_ip TEXT,
  
  -- Soft Delete (permite auditoria histórica)
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (refresh_token_id) REFERENCES refresh_tokens(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_revocation_jti ON token_revocation(token_jti);
CREATE INDEX IF NOT EXISTS idx_revocation_usuario ON token_revocation(usuario_id);
CREATE INDEX IF NOT EXISTS idx_revocation_motivo ON token_revocation(reason, revoked_at DESC);

-- ============================================================
-- 3. Tabela de Histórico de Sessões
-- ============================================================
CREATE TABLE IF NOT EXISTS session_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Sessão
  usuario_id INTEGER NOT NULL,
  session_id TEXT UNIQUE NOT NULL,
  
  -- Detalhes da Sessão
  login_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  logout_em TIMESTAMP,
  duracao_segundos INTEGER,
  
  -- Informações de Acesso
  ip_address TEXT,
  user_agent TEXT,
  dispositivo TEXT,
  localizacao TEXT,
  
  -- Status
  ativa BOOLEAN DEFAULT TRUE,
  finalizado_por TEXT DEFAULT NULL, -- 'user_logout', 'timeout', 'admin_logout', 'forced_logout'
  
  -- Segurança
  tentativas_falhas INTEGER DEFAULT 0,
  atividade_suspeita BOOLEAN DEFAULT FALSE,
  observacoes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_session_usuario ON session_history(usuario_id, ativa);
CREATE INDEX IF NOT EXISTS idx_session_login ON session_history(login_em DESC);

-- ============================================================
-- 4. Trigger para limpar tokens expirados
-- ============================================================

-- Trigger: Marcar tokens expirados como deletados automaticamente
CREATE TRIGGER IF NOT EXISTS trig_refresh_tokens_auto_expire
AFTER UPDATE ON refresh_tokens
FOR EACH ROW
WHEN (NEW.expires_at < CURRENT_TIMESTAMP AND NEW.deleted_at IS NULL)
BEGIN
  UPDATE refresh_tokens 
  SET deleted_at = CURRENT_TIMESTAMP 
  WHERE id = NEW.id;
END;

-- ============================================================
-- 5. Views para Relatórios de Segurança
-- ============================================================

-- View: Sessões Ativas
CREATE VIEW IF NOT EXISTS vw_sessions_ativas AS
SELECT 
  s.id,
  s.usuario_id,
  u.name as usuario_nome,
  u.email,
  s.login_em,
  DATETIME('now') - DATETIME(s.login_em) as duracao_atual,
  s.ip_address,
  s.dispositivo,
  s.atividade_suspeita
FROM session_history s
LEFT JOIN usuarios u ON s.usuario_id = u.id
WHERE s.ativa = TRUE AND s.deleted_at IS NULL
ORDER BY s.login_em DESC;

-- View: Tentativas de Login Suspeitas
CREATE VIEW IF NOT EXISTS vw_login_suspeito AS
SELECT 
  s.id,
  s.usuario_id,
  u.name as usuario_nome,
  s.login_em,
  s.tentativas_falhas,
  s.ip_address,
  s.observacoes
FROM session_history s
LEFT JOIN usuarios u ON s.usuario_id = u.id
WHERE s.tentativas_falhas > 3 
  OR s.atividade_suspeita = TRUE
  AND s.deleted_at IS NULL
ORDER BY s.login_em DESC
LIMIT 100;
