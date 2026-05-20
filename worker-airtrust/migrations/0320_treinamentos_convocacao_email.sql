CREATE TABLE IF NOT EXISTS notificacoes_convocacao_email_config (
  empresa_id INTEGER PRIMARY KEY,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_security TEXT DEFAULT 'TLS',
  smtp_user TEXT,
  smtp_password TEXT,
  smtp_password_encrypted TEXT,
  sender_name TEXT,
  reply_to TEXT,
  assunto_padrao TEXT,
  assinatura_html TEXT,
  template_html TEXT,
  batch_size INTEGER DEFAULT 50,
  batch_interval_ms INTEGER DEFAULT 1000,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notificacoes_convocacao_cc_gestores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  cargo TEXT,
  empresa TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS treinamentos_convocacoes_email (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  disparado_por INTEGER,
  disparado_por_nome TEXT,
  assunto TEXT NOT NULL,
  template_html_snapshot TEXT,
  reply_to TEXT,
  cc_json TEXT,
  avisos_json TEXT,
  destinatarios_total INTEGER NOT NULL DEFAULT 0,
  enviados_sucesso INTEGER NOT NULL DEFAULT 0,
  enviados_falha INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS treinamentos_convocacoes_email_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  convocacao_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  email_destino TEXT,
  status TEXT NOT NULL,
  erro_mensagem TEXT,
  provider_message_id TEXT,
  payload_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_convocacao_cc_empresa
  ON notificacoes_convocacao_cc_gestores(empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_treinamentos_convocacoes_email_treinamento
  ON treinamentos_convocacoes_email(treinamento_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_treinamentos_convocacoes_email_itens_convocacao
  ON treinamentos_convocacoes_email_itens(convocacao_id, funcionario_id);