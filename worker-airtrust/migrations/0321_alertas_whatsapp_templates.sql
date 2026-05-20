CREATE TABLE IF NOT EXISTS alertas_whatsapp_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'twilio',
  friendly_name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'UTILITY',
  language TEXT NOT NULL DEFAULT 'pt_BR',
  body_text TEXT NOT NULL,
  variables_json TEXT NOT NULL,
  twilio_content_sid TEXT,
  approval_status TEXT,
  approval_error TEXT,
  approval_payload_json TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_templates_provider
  ON alertas_whatsapp_templates (provider, approval_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_whatsapp_templates_sid
  ON alertas_whatsapp_templates (twilio_content_sid);
