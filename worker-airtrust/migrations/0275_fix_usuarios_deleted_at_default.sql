-- Migration 0275: Corrigir bug usuarios.deleted_at INTEGER DEFAULT 1
-- Data: 2026-03-15
--
-- Bug: DEFAULT 1 (inteiro) faz novos usuários nascerem como "soft-deleted"
-- silenciosamente, impedindo login.
--
-- Abordagem: trigger AFTER INSERT que zera o DEFAULT errado.
-- Não recria a tabela (evita problemas com views/FKs dependentes).
-- O schema continua mostrando DEFAULT 1 mas em prática é sempre NULL.
-- ============================================================

-- PASSO 1: Corrigir usuários existentes que podem ter deleted_at = 1
UPDATE usuarios
SET deleted_at = NULL
WHERE typeof(deleted_at) = 'integer'
  AND CAST(deleted_at AS INTEGER) = 1;

-- PASSO 2: Trigger que neutraliza o DEFAULT 1 em todos os novos INSERTs
-- Dispara AFTER INSERT quando deleted_at chegar como inteiro 1
CREATE TRIGGER IF NOT EXISTS trg_fix_usuarios_deleted_at_default
AFTER INSERT ON usuarios
WHEN NEW.deleted_at = '1' OR (typeof(NEW.deleted_at) = 'integer' AND CAST(NEW.deleted_at AS INTEGER) = 1)
BEGIN
  UPDATE usuarios SET deleted_at = NULL WHERE id = NEW.id;
END;

-- Verificação
SELECT
  'usuarios.deleted_at bug mitigado' AS status,
  COUNT(*) AS total,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS ativos,
  SUM(CASE WHEN deleted_at = '1' OR (typeof(deleted_at) = 'integer' AND CAST(deleted_at AS INTEGER) = 1) THEN 1 ELSE 0 END) AS falso_deletados
FROM usuarios;
