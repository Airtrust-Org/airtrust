-- 0513_qualification_areas.sql
-- Separates qualification classification area from employee organizational sector.
-- Training compliance remains the canonical source for who must hold each qualification.
-- source_reference: user-approved AirTrust qualification-classification decision (2026-09-26): Operações, Manutenção, QSMS and Segurança Operacional; Compliance remains applicability SSOT.
-- operational_decision: migrate only deterministic legacy model-sector classifications; ambiguous or unmapped models remain unclassified for manual review.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/qualification-areas-0513.md

CREATE TABLE IF NOT EXISTS qualificacoes_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_areas_codigo_active
  ON qualificacoes_areas(empresa_id, codigo COLLATE NOCASE)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_areas_nome_active
  ON qualificacoes_areas(empresa_id, nome COLLATE NOCASE)
  WHERE deleted_at IS NULL;

ALTER TABLE qualificacoes_tipos
  ADD COLUMN area_id INTEGER REFERENCES qualificacoes_areas(id);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_empresa_area
  ON qualificacoes_tipos(empresa_id, area_id)
  WHERE deleted_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_qualificacoes_tipos_area_tenant_insert
BEFORE INSERT ON qualificacoes_tipos
FOR EACH ROW WHEN NEW.area_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM qualificacoes_areas qa
     WHERE qa.id = NEW.area_id
       AND qa.empresa_id = NEW.empresa_id
       AND qa.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'qualificacoes_tipos: area fora do tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_qualificacoes_tipos_area_tenant_update
BEFORE UPDATE OF empresa_id, area_id ON qualificacoes_tipos
FOR EACH ROW WHEN NEW.area_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM qualificacoes_areas qa
     WHERE qa.id = NEW.area_id
       AND qa.empresa_id = NEW.empresa_id
       AND qa.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'qualificacoes_tipos: area fora do tenant') END;
END;

-- Initial qualification-area catalog approved for Costa do Sol (tenant 6).
INSERT OR IGNORE INTO qualificacoes_areas(empresa_id,codigo,nome,descricao,ativo)
SELECT id,'OPERACOES','Operações','Qualificações vinculadas ao domínio operacional',1 FROM empresas WHERE id = 6
UNION ALL
SELECT id,'MANUTENCAO','Manutenção','Qualificações vinculadas ao domínio de manutenção',1 FROM empresas WHERE id = 6
UNION ALL
SELECT id,'QSMS','QSMS','Qualificações vinculadas a QSMS',1 FROM empresas WHERE id = 6
UNION ALL
SELECT id,'SEGURANCA_OPERACIONAL','Segurança Operacional','Qualificações vinculadas à segurança operacional',1 FROM empresas WHERE id = 6;

-- Backfill only when the legacy sector classification resolves unambiguously to one area.
-- Tripulação is intentionally classified as Operações. CTM maps to Manutenção and Qualidade maps to QSMS.
WITH legacy_area_map AS (
  SELECT
    qts.tipo_id,
    CASE
      WHEN UPPER(TRIM(COALESCE(s.codigo,''))) IN ('TRI','OPERACOES','OPERACOES_CS','OPS')
        OR UPPER(TRIM(COALESCE(s.nome,''))) IN ('TRIPULAÇÃO','TRIPULACAO','OPERAÇÕES','OPERACOES')
        THEN 'OPERACOES'
      WHEN UPPER(TRIM(COALESCE(s.codigo,''))) IN ('MAN','MANUTENCAO','CTM')
        OR UPPER(TRIM(COALESCE(s.nome,''))) IN ('MANUTENÇÃO','MANUTENCAO','CTM')
        THEN 'MANUTENCAO'
      WHEN UPPER(TRIM(COALESCE(s.codigo,''))) IN ('QSMS','QUA','QUALIDADE')
        OR UPPER(TRIM(COALESCE(s.nome,''))) IN ('QSMS','QUALIDADE')
        THEN 'QSMS'
      WHEN UPPER(TRIM(COALESCE(s.codigo,''))) IN ('SEGURANCA_OPERACIONAL','SGSO')
        OR UPPER(TRIM(COALESCE(s.nome,''))) IN ('SEGURANÇA OPERACIONAL','SEGURANCA OPERACIONAL')
        THEN 'SEGURANCA_OPERACIONAL'
      ELSE NULL
    END AS area_codigo
  FROM qualificacoes_tipos_setores qts
  INNER JOIN setores s
    ON s.id = qts.setor_id
   AND s.empresa_id = qts.empresa_id
   AND s.deleted_at IS NULL
  WHERE qts.empresa_id = 6
    AND qts.deleted_at IS NULL
), resolved AS (
  SELECT tipo_id, MIN(area_codigo) AS area_codigo
    FROM legacy_area_map
   GROUP BY tipo_id
  HAVING COUNT(*) = COUNT(area_codigo)
     AND COUNT(DISTINCT area_codigo) = 1
)
UPDATE qualificacoes_tipos
   SET area_id = (
     SELECT qa.id
       FROM resolved r
       JOIN qualificacoes_areas qa
         ON qa.empresa_id = 6
        AND qa.codigo = r.area_codigo
        AND qa.deleted_at IS NULL
      WHERE r.tipo_id = qualificacoes_tipos.id
      LIMIT 1
   ),
       updated_at = datetime('now')
 WHERE empresa_id = 6
   AND deleted_at IS NULL
   AND area_id IS NULL
   AND id IN (SELECT tipo_id FROM resolved);