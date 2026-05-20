-- Migration: Sistema de Empresas com R2 Storage
-- Data: 28/10/2025
-- Descrição: Criação da tabela de empresas com suporte a logo no R2

-- Tabela de empresas
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  razao_social TEXT,
  cnpj TEXT UNIQUE,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  logo_url TEXT,  -- URL pública do R2
  logo_path TEXT, -- Path interno do R2
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_empresas_ativo ON empresas(ativo);
CREATE INDEX IF NOT EXISTS idx_empresas_deleted ON empresas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj);

-- Comentários (SQLite não suporta COMMENT, mas documentamos aqui)
-- empresas.logo_url: URL pública do Cloudflare R2 para acesso direto
-- empresas.logo_path: Caminho interno no bucket R2 (ex: empresas/1-logo.png)
-- empresas.ativo: 1 = ativa, 0 = inativa
-- empresas.deleted_at: NULL = ativa, timestamp = soft deleted
