-- MIGRATION 0186: Checks usam qualificacao_codigo (SSOT em qualificacoes_tipos.codigo)
-- Data: 2026-01-13
-- Objetivo:
-- - Adicionar ponte direta tipos_check.qualificacao_codigo -> qualificacoes_tipos.codigo
-- - Backfill a partir de qualificacao_tipo_id (legado) e/ou match por codigo

-- 1) Adicionar coluna nova
ALTER TABLE tipos_check ADD COLUMN qualificacao_codigo TEXT COLLATE NOCASE;

-- 2) Backfill por qualificacao_tipo_id (se existir e estiver preenchido)
UPDATE tipos_check
SET qualificacao_codigo = (
  SELECT UPPER(qt.codigo)
  FROM qualificacoes_tipos qt
  WHERE qt.id = tipos_check.qualificacao_tipo_id
    AND qt.deleted_at IS NULL
  LIMIT 1
)
WHERE qualificacao_codigo IS NULL
  AND qualificacao_tipo_id IS NOT NULL
  AND deleted_at IS NULL;

-- 3) Backfill por match de codigo (quando tipos_check.codigo == qualificacoes_tipos.codigo)
UPDATE tipos_check
SET qualificacao_codigo = UPPER(codigo)
WHERE qualificacao_codigo IS NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM qualificacoes_tipos qt
    WHERE UPPER(qt.codigo) = UPPER(tipos_check.codigo)
      AND qt.deleted_at IS NULL
  );

-- 4) Índice para consultas
CREATE INDEX IF NOT EXISTS idx_tipos_check_qualificacao_codigo
  ON tipos_check(qualificacao_codigo)
  WHERE deleted_at IS NULL;

-- 5) Auditoria
INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_novos)
VALUES ('system', 'MIGRATION', '0186', json_object(
  'migration', '0186_checks_use_qualificacao_codigo',
  'timestamp', datetime('now'),
  'description', 'Checks agora usam qualificacao_codigo (SSOT via qualificacoes_tipos.codigo)'
));
