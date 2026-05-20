-- ================================================================
-- Migration 0108: Criar tabela ARQUIVOS
-- Data: 2025-11-25
-- Objetivo: Gerenciar uploads de certificados e documentos
-- ================================================================

CREATE TABLE IF NOT EXISTS arquivos (
  id TEXT PRIMARY KEY, -- UUID v4
  
  -- Metadados do arquivo
  nome_original TEXT NOT NULL,
  nome_armazenado TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL CHECK(tamanho_bytes > 0),
  path TEXT NOT NULL,
  
  -- Classificação
  tipo TEXT CHECK(tipo IN ('CERTIFICADO', 'DOCUMENTO', 'FOTO', 'ANEXO')),
  entidade_tipo TEXT CHECK(entidade_tipo IN ('HISTORICO', 'FUNCIONARIO', 'QUALIFICACAO')),
  entidade_id INTEGER,
  
  -- Auditoria
  uploaded_by INTEGER, -- FK → usuarios.id (se existir)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL
);

-- Índices (idempotentes)
CREATE INDEX IF NOT EXISTS idx_arquivos_entidade ON arquivos(entidade_tipo, entidade_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_arquivos_tipo ON arquivos(tipo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_arquivos_uploaded_by ON arquivos(uploaded_by) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_arquivos_nome_armazenado ON arquivos(nome_armazenado) WHERE deleted_at IS NULL;

-- ================================================================
-- VALIDAÇÕES PÓS-MIGRATION
-- ================================================================
-- 1. PRAGMA table_info('arquivos'); -- verificar colunas
-- 2. SELECT COUNT(*) FROM arquivos; -- deve retornar 0 (tabela vazia)
