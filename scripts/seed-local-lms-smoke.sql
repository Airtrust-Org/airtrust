PRAGMA foreign_keys = OFF;

-- source_reference: EAD reconciliation incident / local LMS smoke fixture.
-- operational_decision: Seed only the canonical tenant-6 EAD category and type.
-- dry_run_required: YES — this file is consumed only by the resettable local smoke database.
-- rollback_plan_required: YES — scripts/setup-local-lms-smoke-db.sh --reset recreates the fixture.

INSERT OR IGNORE INTO empresas (
  id,
  nome,
  razao_social,
  codigo,
  email,
  ativo,
  created_at,
  updated_at,
  deleted_at
) VALUES (
  6,
  'AirTrust LMS Smoke',
  'AirTrust LMS Smoke Local',
  'lms-smoke',
  'lms-smoke@example.invalid',
  1,
  datetime('now'),
  datetime('now'),
  NULL
);

UPDATE empresas
SET ativo = 1,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE id = 6;

INSERT OR IGNORE INTO funcionarios (
  id,
  empresa_id,
  nome,
  email,
  matricula,
  cargo,
  departamento,
  status,
  ativo,
  created_at,
  updated_at,
  deleted_at
) VALUES (
  5,
  6,
  'LMS Smoke User',
  'lms-smoke-user@example.invalid',
  'LMS-SMOKE-001',
  'Piloto',
  'Treinamento',
  'ATIVO',
  1,
  datetime('now'),
  datetime('now'),
  NULL
);

UPDATE funcionarios
SET empresa_id = 6,
    status = 'ATIVO',
    ativo = 1,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE id = 5;

-- The LMS smoke course is deliberately EAD. Keep its local fixture aligned
-- with the production invariant: an EAD type must point to the canonical EAD
-- category before any completion is allowed to mint a qualification history.
INSERT INTO qualificacoes_categorias (
  id,
  empresa_id,
  nome,
  codigo,
  descricao,
  cor,
  ativo,
  created_at,
  updated_at,
  deleted_at
) VALUES (
  13,
  6,
  'EAD',
  'EAD',
  'Synthetic canonical EAD category used only by the LMS smoke job.',
  '#EABA0C',
  1,
  datetime('now'),
  datetime('now'),
  NULL
)
ON CONFLICT(id) DO UPDATE SET
  empresa_id = excluded.empresa_id,
  nome = excluded.nome,
  codigo = excluded.codigo,
  descricao = excluded.descricao,
  cor = excluded.cor,
  ativo = excluded.ativo,
  deleted_at = NULL,
  updated_at = datetime('now');

INSERT OR IGNORE INTO qualificacoes_tipos (
  id,
  empresa_id,
  codigo,
  nome,
  descricao,
  categoria,
  categoria_id,
  formato_id,
  carga_horaria,
  validade,
  ativo,
  created_at,
  updated_at,
  deleted_at
) VALUES (
  26,
  6,
  'LMS-SMOKE-EAD',
  'LMS Smoke EAD',
  'Synthetic local qualification used only by the LMS smoke job.',
  'EAD',
  13,
  (
    SELECT id
    FROM qualificacoes_formatos
    WHERE empresa_id = 6
      AND deleted_at IS NULL
      AND UPPER(TRIM(codigo)) = 'EAD'
    LIMIT 1
  ),
  1,
  12,
  1,
  datetime('now'),
  datetime('now'),
  NULL
);

UPDATE qualificacoes_tipos
SET empresa_id = 6,
    categoria = 'EAD',
    categoria_id = 13,
    formato_id = (
      SELECT id
      FROM qualificacoes_formatos
      WHERE empresa_id = 6
        AND deleted_at IS NULL
        AND UPPER(TRIM(codigo)) = 'EAD'
      LIMIT 1
    ),
    ativo = 1,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE id = 26;

INSERT OR IGNORE INTO usuarios (
  email,
  password_hash,
  nome,
  perfil,
  funcionario_id,
  active,
  created_at,
  updated_at,
  deleted_at
) VALUES (
  'admin@airtrust.com',
  '$2b$12$sY.Kzb1oiR74WEXj8fwN7ucKeOGDjAFLW2GE5geQ8qlmUDilYvOsW',
  'Admin LMS Smoke',
  'ADMIN',
  5,
  1,
  datetime('now'),
  datetime('now'),
  NULL
);

UPDATE usuarios
SET password_hash = '$2b$12$sY.Kzb1oiR74WEXj8fwN7ucKeOGDjAFLW2GE5geQ8qlmUDilYvOsW',
    perfil = 'ADMIN',
    funcionario_id = 5,
    active = 1,
    deleted_at = NULL,
    updated_at = datetime('now')
WHERE lower(email) = lower('admin@airtrust.com');

INSERT OR IGNORE INTO usuarios_empresas (
  usuario_id,
  empresa_id,
  role,
  is_primary,
  created_at
)
SELECT id, 6, 'admin', 1, datetime('now')
FROM usuarios
WHERE lower(email) = lower('admin@airtrust.com');

UPDATE usuarios_empresas
SET is_primary = CASE WHEN empresa_id = 6 THEN 1 ELSE 0 END,
    role = CASE WHEN empresa_id = 6 THEN 'admin' ELSE role END
WHERE usuario_id = (
  SELECT id FROM usuarios WHERE lower(email) = lower('admin@airtrust.com') LIMIT 1
);

PRAGMA foreign_keys = ON;
