-- source_reference: Controle de Voos operational creation/fueling requirements reviewed 2026-09-18.
-- operational_decision: canonical tenant catalogs own flight types, contracts and onboard roles; Natureza is retained only as a hidden legacy compatibility field.
-- dry_run_required: validate additive tables/columns, tenant uniqueness, seed catalogs and legacy compatibility locally before remote apply.
-- rollback_plan_required: additive schema; recover through D1 Time Travel on failed apply or forward-compensate application usage without dropping historical columns.

CREATE TABLE IF NOT EXISTS cv_contratos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (ativo IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_contratos_empresa_codigo
  ON cv_contratos (empresa_id, codigo)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cv_contratos_empresa_ativo
  ON cv_contratos (empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS cv_funcoes_bordo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (ativo IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_funcoes_bordo_empresa_codigo
  ON cv_funcoes_bordo (empresa_id, codigo)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cv_funcoes_bordo_empresa_ativo
  ON cv_funcoes_bordo (empresa_id, ativo)
  WHERE deleted_at IS NULL;

ALTER TABLE cv_voos ADD COLUMN numero_voo TEXT;
ALTER TABLE cv_voos ADD COLUMN numero_db TEXT;
ALTER TABLE cv_voos ADD COLUMN contrato_id INTEGER REFERENCES cv_contratos(id);
ALTER TABLE cv_voo_tripulantes ADD COLUMN funcao_bordo_id INTEGER REFERENCES cv_funcoes_bordo(id);

CREATE INDEX IF NOT EXISTS idx_cv_voos_empresa_contrato_data
  ON cv_voos (empresa_id, contrato_id, data_programacao)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_funcao_bordo
  ON cv_voo_tripulantes (empresa_id, funcao_bordo_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cv_voo_abastecimentos_empresa_etapa
  ON cv_voo_abastecimentos (empresa_id, etapa_id)
  WHERE deleted_at IS NULL AND etapa_id IS NOT NULL;

-- Natureza remains a legacy NOT NULL FK in cv_voos. New UI does not expose it;
-- new flights use this neutral tenant-scoped compatibility row instead of PETROBRAS.
INSERT OR IGNORE INTO cv_naturezas_voo (empresa_id, codigo, nome, descricao, ativo, ordem)
SELECT empresa_id, 'OPERACIONAL', 'Operacional', 'Compatibilidade interna do Controle de Voos', 1, 0
FROM (
  SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL
  UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL
  UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL
);
UPDATE cv_naturezas_voo
SET nome = 'Operacional', descricao = 'Compatibilidade interna do Controle de Voos', ativo = 1, updated_at = datetime('now')
WHERE codigo = 'OPERACIONAL' AND deleted_at IS NULL;

-- Initial editable flight-type catalog requested for operations.
INSERT OR IGNORE INTO cv_tipos_voo (empresa_id, codigo, nome, descricao, ativo, ordem)
SELECT empresa_id, 'CONTRATO', 'Contrato', 'Voo executado em contrato', 1, 10 FROM (SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL);
INSERT OR IGNORE INTO cv_tipos_voo (empresa_id, codigo, nome, descricao, ativo, ordem)
SELECT empresa_id, 'SPOT', 'Spot', 'Voo spot', 1, 20 FROM (SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL);
INSERT OR IGNORE INTO cv_tipos_voo (empresa_id, codigo, nome, descricao, ativo, ordem)
SELECT empresa_id, 'MANUTENCAO', 'Manutenção', 'Voo de manutenção', 1, 30 FROM (SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL);
INSERT OR IGNORE INTO cv_tipos_voo (empresa_id, codigo, nome, descricao, ativo, ordem)
SELECT empresa_id, 'TREINAMENTO', 'Treinamento', 'Voo de treinamento', 1, 40 FROM (SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL);
INSERT OR IGNORE INTO cv_tipos_voo (empresa_id, codigo, nome, descricao, ativo, ordem)
SELECT empresa_id, 'AEROMEDICO', 'Aeromédico', 'Voo aeromédico', 1, 50 FROM (SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL);
UPDATE cv_tipos_voo SET ativo = 1, updated_at = datetime('now')
WHERE codigo IN ('CONTRATO','SPOT','MANUTENCAO','TREINAMENTO','AEROMEDICO') AND deleted_at IS NULL;

-- Initial editable onboard-role catalog requested for operations.
INSERT OR IGNORE INTO cv_funcoes_bordo (empresa_id, codigo, nome, ativo, ordem)
SELECT empresa_id, 'EXAMINADOR', 'Examinador', 1, 10 FROM (SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL);
INSERT OR IGNORE INTO cv_funcoes_bordo (empresa_id, codigo, nome, ativo, ordem)
SELECT empresa_id, 'INSTRUTOR', 'Instrutor', 1, 20 FROM (SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL);
INSERT OR IGNORE INTO cv_funcoes_bordo (empresa_id, codigo, nome, ativo, ordem)
SELECT empresa_id, 'COMANDANTE', 'Comandante', 1, 30 FROM (SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL);
INSERT OR IGNORE INTO cv_funcoes_bordo (empresa_id, codigo, nome, ativo, ordem)
SELECT empresa_id, 'COPILOTO', 'Copiloto', 1, 40 FROM (SELECT empresa_id FROM cv_aeroportos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_voos WHERE deleted_at IS NULL UNION SELECT empresa_id FROM cv_tipos_voo WHERE deleted_at IS NULL);
UPDATE cv_funcoes_bordo SET ativo = 1, updated_at = datetime('now')
WHERE codigo IN ('EXAMINADOR','INSTRUTOR','COMANDANTE','COPILOTO') AND deleted_at IS NULL;
