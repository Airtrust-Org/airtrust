-- Migration: 0226_restore_costa_do_sol_and_user_tenant_enforcement
-- Data: 2026-03-03
-- Objetivo:
--   1) Garantir que a empresa Costa do Sol (id=6) exista e esteja ativa
--   2) Consolidar dados operacionais para empresa 6 (empresa_id NULL/1 -> 6)
--   3) Garantir vínculo usuário x empresa para TODOS os usuários ativos
--   4) Marcar empresa 6 como primária para os usuários

BEGIN TRANSACTION;

-- 1) Garantir empresa Costa do Sol ativa
INSERT INTO empresas (
  id,
  nome,
  codigo,
  cnpj,
  plano,
  max_funcionarios,
  max_storage_mb,
  ativo,
  created_at,
  updated_at,
  deleted_at
)
VALUES (
  6,
  'Costa do Sol Táxi Aéreo',
  'cds',
  '00.000.000/0001-00',
  'enterprise',
  1000,
  10240,
  1,
  datetime('now'),
  datetime('now'),
  NULL
)
ON CONFLICT(id) DO UPDATE SET
  nome = excluded.nome,
  codigo = COALESCE(NULLIF(empresas.codigo, ''), excluded.codigo),
  ativo = 1,
  deleted_at = NULL,
  updated_at = datetime('now');

-- 2) Consolidar dados para empresa 6
UPDATE funcionarios            SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE setores                 SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE funcoes                 SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE aeronaves               SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE modelos_aeronave        SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE qualificacoes_historico SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE qualificacoes_tipos     SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE documentos              SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE fichas_sessao           SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE modelos_sessao          SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE tipos_sessao            SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE simulador_agendamentos  SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE pasta_virtual           SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE arquivos                SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE certificados_templates  SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE importacoes_log         SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE empresa_certificado_config SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE empresa_config          SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE empresas_config         SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- 3) Garantir vínculo usuário x empresa (empresa 6)
INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary)
SELECT
  u.id,
  6,
  CASE
    WHEN UPPER(COALESCE(u.perfil, '')) = 'ADMIN' THEN 'admin'
    WHEN UPPER(COALESCE(u.perfil, '')) = 'GESTOR' THEN 'manager'
    WHEN UPPER(COALESCE(u.perfil, '')) = 'INSTRUTOR' THEN 'instructor'
    WHEN UPPER(COALESCE(u.perfil, '')) = 'EDITOR' THEN 'editor'
    WHEN UPPER(COALESCE(u.perfil, '')) = 'USUARIO' THEN 'viewer'
    ELSE 'viewer'
  END AS role,
  1
FROM usuarios u
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM usuarios_empresas ue
    WHERE ue.usuario_id = u.id
      AND ue.empresa_id = 6
  );

-- 4) Tornar empresa 6 primária para os usuários que a possuem
UPDATE usuarios_empresas
SET is_primary = CASE WHEN empresa_id = 6 THEN 1 ELSE 0 END
WHERE usuario_id IN (
  SELECT DISTINCT usuario_id FROM usuarios_empresas WHERE empresa_id = 6
);

COMMIT;
