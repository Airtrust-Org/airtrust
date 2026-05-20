-- Migration number: 2020 	 2025-11-03T23:52:30.312Z

CREATE TABLE IF NOT EXISTS empresa_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL UNIQUE,
  
  -- Informações básicas
  nome TEXT NOT NULL,
  logo_url TEXT,
  
  -- Certificado
  template_certificado TEXT,
  cor_primaria TEXT DEFAULT '#0066cc',
  cor_secundaria TEXT DEFAULT '#333333',
  
  -- Auditoria
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  
  -- Foreign key
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Índices para performance
CREATE INDEX idx_empresa_config_empresa_id ON empresa_config(empresa_id);
CREATE INDEX idx_empresa_config_deleted_at ON empresa_config(deleted_at);
