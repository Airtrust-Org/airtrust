-- Deterministic, tenant-scoped resolution of each canonical manoeuvre code
-- (codigo_canonico) to exactly one manobra_id for a given matrix version.
-- Purely additive: does not touch modelos_sessao, manobras, or any table
-- created by migration 0440.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: reconciliação read-only do tenant 6 (301 códigos
--   canônicos das matrizes AW139/S-76 x catálogo manobras), sem carga de
--   dados de catálogo nesta migration.
-- operational_decision: registrar a resolução (reuse ou create) por código
--   canônico + versão de matriz, para o executor nunca depender de JOIN
--   aproximado por texto ao vincular manobras aos modelos.
-- dry_run_required: nenhum dado é inserido por esta migration; a tabela é
--   populada apenas pelo executor de importação (apply-simuladores-matriz-import).
-- rollback_plan_required: DROP dos índices e da tabela abaixo; nenhuma outra
--   tabela é afetada.

CREATE TABLE IF NOT EXISTS simuladores_matriz_manobra_resolution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  versao_matriz TEXT NOT NULL,
  codigo_canonico TEXT NOT NULL,
  manobra_id INTEGER NOT NULL,
  resolution_type TEXT NOT NULL CHECK(resolution_type IN (
    'EXACT_UNIQUE', 'FORMAL_ALIAS', 'LEGACY_EQUIVALENT',
    'TRUE_MISSING', 'COLLISION', 'CROSS_TENANT_ONLY'
  )),
  source_hash TEXT NOT NULL CHECK(length(source_hash) = 64),
  import_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (manobra_id) REFERENCES manobras(id),
  FOREIGN KEY (import_uuid) REFERENCES simuladores_matriz_imports(uuid)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_matriz_manobra_resolution_codigo
  ON simuladores_matriz_manobra_resolution(empresa_id, versao_matriz, codigo_canonico);

CREATE INDEX IF NOT EXISTS idx_matriz_manobra_resolution_empresa
  ON simuladores_matriz_manobra_resolution(empresa_id);
CREATE INDEX IF NOT EXISTS idx_matriz_manobra_resolution_versao
  ON simuladores_matriz_manobra_resolution(versao_matriz);
CREATE INDEX IF NOT EXISTS idx_matriz_manobra_resolution_codigo
  ON simuladores_matriz_manobra_resolution(codigo_canonico);
CREATE INDEX IF NOT EXISTS idx_matriz_manobra_resolution_manobra
  ON simuladores_matriz_manobra_resolution(manobra_id);
CREATE INDEX IF NOT EXISTS idx_matriz_manobra_resolution_import
  ON simuladores_matriz_manobra_resolution(import_uuid);

-- A resolution row is an audited historical fact once written: only the
-- import that created it may exist, and it is never rewritten in place.
CREATE TRIGGER IF NOT EXISTS trg_matriz_manobra_resolution_imutavel
BEFORE UPDATE ON simuladores_matriz_manobra_resolution
BEGIN
  SELECT RAISE(ABORT, 'resolução de manobra é imutável; nova versão de matriz exige nova linha');
END;

-- Reused (EXACT_UNIQUE/FORMAL_ALIAS/LEGACY_EQUIVALENT) or newly created
-- (TRUE_MISSING/COLLISION/CROSS_TENANT_ONLY) manobra must always belong to
-- the same tenant as the resolution row.
CREATE TRIGGER IF NOT EXISTS trg_matriz_manobra_resolution_mesmo_tenant
BEFORE INSERT ON simuladores_matriz_manobra_resolution
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM manobras m WHERE m.id = NEW.manobra_id AND m.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'manobra_id pertence a tenant diferente da resolução') END;
END;
