-- Migration 0211: Corrigir deleted_at em usuarios e adicionar soft delete nas tabelas faltantes
-- Data: 2026-02-26
-- Auditoria: AUDITORIA-ARQUITETURA-PRE-FRMS-2026-02-26.md

-- ============================================================
-- 1. CORRIGIR BUG CRÍTICO: usuarios.deleted_at INTEGER DEFAULT 1
-- Problema: todos os novos usuários eram criados como "soft-deleted"
-- Fix: zerar todos os registros onde deleted_at = 1 (valor do DEFAULT errado)
-- Nota: deleted_at = 1 é impossível como timestamp real de exclusão,
--       pois o código sempre usa datetime('now') para soft delete.
-- ============================================================

-- Converter todos os usuários "falso-deletados" (deleted_at=1) para ativos
UPDATE usuarios SET deleted_at = NULL WHERE CAST(deleted_at AS INTEGER) = 1 AND deleted_at IS NOT '1970-01-01';

-- Recriar tabela usuarios com deleted_at TEXT DEFAULT NULL correto
CREATE TABLE IF NOT EXISTS usuarios_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  perfil TEXT DEFAULT 'USUARIO' CHECK(perfil IN ('ADMIN', 'COMPLIANCE', 'GESTOR', 'USUARIO')),
  funcionario_id INTEGER,
  deleted_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  active INTEGER DEFAULT 1,
  last_login TEXT,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

-- Migrar dados: qualquer deleted_at = 1 já foi zerado na linha acima,
-- os restantes (datetime strings) são preservados
INSERT INTO usuarios_new
  SELECT
    id,
    email,
    password_hash,
    nome,
    perfil,
    funcionario_id,
    CASE
      WHEN deleted_at IS NULL THEN NULL
      WHEN CAST(deleted_at AS INTEGER) = 1 THEN NULL
      ELSE CAST(deleted_at AS TEXT)
    END AS deleted_at,
    created_at,
    updated_at,
    active,
    last_login,
    failed_login_attempts,
    locked_until
  FROM usuarios;

DROP TABLE usuarios;
ALTER TABLE usuarios_new RENAME TO usuarios;

-- Recriar índices para usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_ativo ON usuarios(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 2. ADICIONAR deleted_at ÀS TABELAS QUE NÃO POSSUEM
-- Permite soft delete consistente em todo o sistema
-- ============================================================

-- compliance_status (dados de compliance de funcionários - CRÍTICO)
ALTER TABLE compliance_status ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- consentimentos_lgpd (dados LGPD - CRÍTICO para auditoria)
ALTER TABLE consentimentos_lgpd ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- solicitacoes_lgpd (solicitações LGPD - CRÍTICO)
ALTER TABLE solicitacoes_lgpd ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- funcionarios_aeronaves (relação tripulante-aeronave - ALTO)
ALTER TABLE funcionarios_aeronaves ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- pasta_virtual_sync (sincronização R2 - ALTO)
ALTER TABLE pasta_virtual_sync ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- sessoes_treinamento (dados de treinamento - ALTO)
ALTER TABLE sessoes_treinamento ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- user_profiles (perfis de usuário - ALTO)
ALTER TABLE user_profiles ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- ficha_manobras_avaliacao (tabela legacy de avaliação - MÉDIO)
ALTER TABLE ficha_manobras_avaliacao ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- empresa_certificado_config (config de certificados por empresa - MÉDIO)
ALTER TABLE empresa_certificado_config ADD COLUMN deleted_at TEXT DEFAULT NULL;
