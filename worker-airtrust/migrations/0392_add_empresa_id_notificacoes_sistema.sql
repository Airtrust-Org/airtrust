-- Migration 0392: add tenant scope to notificacoes_sistema
-- empresa_id stays nullable: NULL means intentional global/platform notification.

ALTER TABLE notificacoes_sistema ADD COLUMN empresa_id INTEGER;

UPDATE notificacoes_sistema
SET empresa_id = (
  SELECT f.empresa_id
  FROM funcionarios f
  WHERE f.id = notificacoes_sistema.funcionario_id
)
WHERE funcionario_id IS NOT NULL
  AND empresa_id IS NULL;

UPDATE notificacoes_sistema
SET empresa_id = CAST(json_extract(dados, '$.empresa_id') AS INTEGER)
WHERE empresa_id IS NULL
  AND dados IS NOT NULL
  AND json_extract(dados, '$.empresa_id') IS NOT NULL;

UPDATE notificacoes_sistema
SET empresa_id = (
  SELECT ue.empresa_id
  FROM usuarios_empresas ue
  WHERE ue.usuario_id = notificacoes_sistema.user_id
  ORDER BY ue.empresa_id
  LIMIT 1
)
WHERE empresa_id IS NULL
  AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notificacoes_sistema_empresa_lida_created
ON notificacoes_sistema(empresa_id, lida, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificacoes_sistema_global_lida_created
ON notificacoes_sistema(lida, created_at DESC)
WHERE empresa_id IS NULL;
