-- =============================================
-- MIGRATION: Sistema de Notificações
-- Data: 27/11/2025
-- Descrição: Tabelas para configuração e log de notificações
-- =============================================

-- Tabela de configuração de notificações
CREATE TABLE IF NOT EXISTS notificacoes_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo VARCHAR(50) NOT NULL, -- 'EMAIL', 'DASHBOARD', 'SMS'
  ativo INTEGER DEFAULT 1 CHECK(ativo IN (0, 1)),
  dias_antes INTEGER NOT NULL, -- Quantos dias antes do vencimento notificar
  urgencia VARCHAR(20), -- 'critical', 'high', 'medium', 'low', NULL = todas
  destinatarios TEXT, -- JSON array de emails
  template TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

-- Tabela de log de notificações enviadas
CREATE TABLE IF NOT EXISTS notificacoes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER REFERENCES notificacoes_config(id),
  qualificacao_historico_id INTEGER REFERENCES qualificacoes_historico(id),
  funcionario_cpf VARCHAR(11),
  tipo VARCHAR(50),
  destinatario TEXT,
  assunto TEXT,
  corpo TEXT,
  status VARCHAR(20), -- 'enviada', 'erro', 'pendente'
  erro_mensagem TEXT,
  enviado_em TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notificacoes_config_ativo 
  ON notificacoes_config(ativo);
  
CREATE INDEX IF NOT EXISTS idx_notificacoes_config_tipo 
  ON notificacoes_config(tipo);
  
CREATE INDEX IF NOT EXISTS idx_notificacoes_log_status 
  ON notificacoes_log(status);
  
CREATE INDEX IF NOT EXISTS idx_notificacoes_log_enviado_em 
  ON notificacoes_log(enviado_em);
  
CREATE INDEX IF NOT EXISTS idx_notificacoes_log_funcionario_cpf 
  ON notificacoes_log(funcionario_cpf);

-- Configurações padrão
INSERT INTO notificacoes_config (tipo, ativo, dias_antes, urgencia, destinatarios, template) VALUES
-- Notificações críticas (0-7 dias)
('EMAIL', 1, 7, 'critical', '["compliance@airtrust.com"]', 'URGENTE: Qualificação {{qualificacao}} de {{funcionario}} vence em {{dias}} dias. Ação imediata necessária!'),

-- Notificações alta urgência (8-15 dias)
('EMAIL', 1, 15, 'high', '["compliance@airtrust.com"]', 'ALERTA: Qualificação {{qualificacao}} de {{funcionario}} vence em {{dias}} dias. Providencie renovação.'),

-- Notificações média urgência (16-30 dias)
('EMAIL', 1, 30, 'medium', '["compliance@airtrust.com"]', 'Lembrete: Qualificação {{qualificacao}} de {{funcionario}} vence em {{dias}} dias.'),

-- Dashboard (todas as urgências)
('DASHBOARD', 1, 30, NULL, NULL, 'Qualificação expirando em {{dias}} dias');

-- Verificar dados inseridos
SELECT 
  id,
  tipo,
  ativo,
  dias_antes,
  urgencia,
  CASE 
    WHEN LENGTH(template) > 50 THEN SUBSTR(template, 1, 50) || '...'
    ELSE template
  END as template_preview
FROM notificacoes_config
ORDER BY dias_antes DESC;
