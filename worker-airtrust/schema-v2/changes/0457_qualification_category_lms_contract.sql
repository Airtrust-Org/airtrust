-- Migration 0457: canonical qualification-category LMS contract.
-- source_reference: structural audit of qualification model categories.
-- operational_decision: category identity is the tenant-scoped FK; names are presentation/snapshots.
-- dry_run_required: yes; review all diagnostics before governed application.
-- rollback_plan_required: yes; scripts/rollback/0457_qualification_category_lms_contract.sql.
-- remote_application: prohibited by this PR; use the official Schema V2 workflow only after review.

ALTER TABLE qualificacoes_categorias
  ADD COLUMN lms_integrada INTEGER NOT NULL DEFAULT 0 CHECK (lms_integrada IN (0, 1));

-- Abort instead of guessing when the existing active catalog is ambiguous.
CREATE TABLE qualification_category_0457_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO qualification_category_0457_guard (ok)
SELECT CASE
  WHEN EXISTS (
    SELECT 1
      FROM qualificacoes_categorias
     WHERE ativo = 1 AND deleted_at IS NULL
     GROUP BY empresa_id, UPPER(TRIM(nome))
    HAVING COUNT(*) > 1
  )
  OR EXISTS (
    SELECT 1
      FROM qualificacoes_categorias
     WHERE ativo = 1 AND deleted_at IS NULL
     GROUP BY empresa_id, UPPER(TRIM(codigo))
    HAVING COUNT(*) > 1
  )
  OR EXISTS (
    SELECT 1
      FROM qualificacoes_categorias
     WHERE ativo = 1
       AND deleted_at IS NULL
       AND (
         UPPER(TRIM(COALESCE(codigo, ''))) = 'EAD'
         OR UPPER(TRIM(COALESCE(nome, ''))) = 'EAD'
       )
     GROUP BY empresa_id
    HAVING COUNT(*) > 1
  ) THEN 0
  ELSE 1
END;

DROP TABLE qualification_category_0457_guard;

-- Backfill only the unique active candidate already evidenced by stable code
-- or the historical EAD name. Runtime stops using the name after this flag is
-- available.
UPDATE qualificacoes_categorias AS qc
   SET lms_integrada = 1,
       updated_at = datetime('now')
 WHERE qc.ativo = 1
   AND qc.deleted_at IS NULL
   AND (
     UPPER(TRIM(COALESCE(qc.codigo, ''))) = 'EAD'
     OR UPPER(TRIM(COALESCE(qc.nome, ''))) = 'EAD'
   )
   AND (
     SELECT COUNT(*)
       FROM qualificacoes_categorias candidate
      WHERE candidate.empresa_id = qc.empresa_id
        AND candidate.ativo = 1
        AND candidate.deleted_at IS NULL
        AND (
          UPPER(TRIM(COALESCE(candidate.codigo, ''))) = 'EAD'
          OR UPPER(TRIM(COALESCE(candidate.nome, ''))) = 'EAD'
        )
   ) = 1;

CREATE UNIQUE INDEX ux_qualificacoes_categorias_normalized_name_active
  ON qualificacoes_categorias(empresa_id, UPPER(TRIM(nome)))
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE UNIQUE INDEX ux_qualificacoes_categorias_normalized_code_active
  ON qualificacoes_categorias(empresa_id, UPPER(TRIM(codigo)))
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE UNIQUE INDEX ux_qualificacoes_categorias_lms_integrada_active
  ON qualificacoes_categorias(empresa_id)
  WHERE lms_integrada = 1 AND ativo = 1 AND deleted_at IS NULL;

CREATE INDEX idx_qualificacoes_categorias_lms_integrada
  ON qualificacoes_categorias(empresa_id, lms_integrada, ativo, deleted_at);

-- Category code is the stable business key; display names may change.
CREATE TRIGGER trg_qualification_category_code_immutable_0457
BEFORE UPDATE OF codigo ON qualificacoes_categorias
WHEN UPPER(TRIM(COALESCE(NEW.codigo, ''))) <> UPPER(TRIM(COALESCE(OLD.codigo, '')))
BEGIN
  SELECT RAISE(ABORT, 'QUALIFICATION_CATEGORY_CODE_IMMUTABLE');
END;

-- An active catalog entry cannot disappear while active models still refer to
-- it. Legacy text-only references are included until reconciliation finishes.
CREATE TRIGGER trg_qualification_category_deactivation_guard_0457
BEFORE UPDATE OF ativo, deleted_at ON qualificacoes_categorias
WHEN OLD.ativo = 1
 AND OLD.deleted_at IS NULL
 AND (COALESCE(NEW.ativo, 0) <> 1 OR NEW.deleted_at IS NOT NULL)
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM qualificacoes_tipos qt
       WHERE qt.empresa_id = OLD.empresa_id
         AND qt.deleted_at IS NULL
         AND qt.ativo = 1
         AND (
           qt.categoria_id = OLD.id
           OR (
             qt.categoria_id IS NULL
             AND UPPER(TRIM(COALESCE(qt.categoria, ''))) = UPPER(TRIM(OLD.nome))
           )
         )
    )
    THEN RAISE(ABORT, 'QUALIFICATION_CATEGORY_IN_USE')
  END;
END;

-- Every new/changed model must use an active category from the same tenant.
CREATE TRIGGER trg_qualification_type_category_fk_insert_0457
BEFORE INSERT ON qualificacoes_tipos
WHEN NEW.deleted_at IS NULL
BEGIN
  SELECT CASE
    WHEN NEW.categoria_id IS NULL
      OR NOT EXISTS (
        SELECT 1
          FROM qualificacoes_categorias qc
         WHERE qc.id = NEW.categoria_id
           AND qc.empresa_id = NEW.empresa_id
           AND qc.ativo = 1
           AND qc.deleted_at IS NULL
      )
    THEN RAISE(ABORT, 'QUALIFICATION_CATEGORY_INVALID')
  END;
END;

CREATE TRIGGER trg_qualification_type_category_fk_update_0457
BEFORE UPDATE OF categoria_id, empresa_id, deleted_at ON qualificacoes_tipos
WHEN NEW.deleted_at IS NULL
BEGIN
  SELECT CASE
    WHEN NEW.categoria_id IS NULL
      OR NOT EXISTS (
        SELECT 1
          FROM qualificacoes_categorias qc
         WHERE qc.id = NEW.categoria_id
           AND qc.empresa_id = NEW.empresa_id
           AND qc.ativo = 1
           AND qc.deleted_at IS NULL
      )
    THEN RAISE(ABORT, 'QUALIFICATION_CATEGORY_INVALID')
  END;
END;

CREATE TRIGGER trg_qualification_type_category_snapshot_insert_0457
AFTER INSERT ON qualificacoes_tipos
WHEN NEW.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_tipos
     SET categoria = (
       SELECT qc.nome
         FROM qualificacoes_categorias qc
        WHERE qc.id = NEW.categoria_id
          AND qc.empresa_id = NEW.empresa_id
     )
   WHERE id = NEW.id AND empresa_id = NEW.empresa_id;
END;

CREATE TRIGGER trg_qualification_type_category_snapshot_update_0457
AFTER UPDATE OF categoria_id, empresa_id ON qualificacoes_tipos
WHEN NEW.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_tipos
     SET categoria = (
       SELECT qc.nome
         FROM qualificacoes_categorias qc
        WHERE qc.id = NEW.categoria_id
          AND qc.empresa_id = NEW.empresa_id
     )
   WHERE id = NEW.id AND empresa_id = NEW.empresa_id;
END;

-- New history writes require a canonical qualification type and inherit all
-- category snapshots in the same transaction, regardless of the caller.
CREATE TRIGGER trg_qualification_history_category_fk_insert_0457
BEFORE INSERT ON qualificacoes_historico
WHEN NEW.deleted_at IS NULL
BEGIN
  SELECT CASE
    WHEN NEW.qualificacao_id IS NULL
      OR NOT EXISTS (
        SELECT 1
          FROM qualificacoes_tipos qt
          JOIN qualificacoes_categorias qc
            ON qc.id = qt.categoria_id
           AND qc.empresa_id = qt.empresa_id
         WHERE qt.id = NEW.qualificacao_id
           AND qt.empresa_id = NEW.empresa_id
           AND qt.deleted_at IS NULL
           AND qc.ativo = 1
           AND qc.deleted_at IS NULL
      )
    THEN RAISE(ABORT, 'QUALIFICATION_HISTORY_CATEGORY_INVALID')
  END;
END;

CREATE TRIGGER trg_qualification_history_category_fk_update_0457
BEFORE UPDATE OF qualificacao_id, empresa_id, deleted_at ON qualificacoes_historico
WHEN NEW.deleted_at IS NULL
BEGIN
  SELECT CASE
    WHEN NEW.qualificacao_id IS NULL
      OR NOT EXISTS (
        SELECT 1
          FROM qualificacoes_tipos qt
          JOIN qualificacoes_categorias qc
            ON qc.id = qt.categoria_id
           AND qc.empresa_id = qt.empresa_id
         WHERE qt.id = NEW.qualificacao_id
           AND qt.empresa_id = NEW.empresa_id
           AND qt.deleted_at IS NULL
           AND qc.ativo = 1
           AND qc.deleted_at IS NULL
      )
    THEN RAISE(ABORT, 'QUALIFICATION_HISTORY_CATEGORY_INVALID')
  END;
END;

CREATE TRIGGER trg_qualification_history_category_snapshot_insert_0457
AFTER INSERT ON qualificacoes_historico
WHEN NEW.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_historico
     SET categoria_id = (
           SELECT qt.categoria_id
             FROM qualificacoes_tipos qt
            WHERE qt.id = NEW.qualificacao_id
              AND qt.empresa_id = NEW.empresa_id
         ),
         categoria = (
           SELECT qc.nome
             FROM qualificacoes_tipos qt
             JOIN qualificacoes_categorias qc
               ON qc.id = qt.categoria_id
              AND qc.empresa_id = qt.empresa_id
            WHERE qt.id = NEW.qualificacao_id
              AND qt.empresa_id = NEW.empresa_id
         ),
         categoria_codigo = (
           SELECT qc.codigo
             FROM qualificacoes_tipos qt
             JOIN qualificacoes_categorias qc
               ON qc.id = qt.categoria_id
              AND qc.empresa_id = qt.empresa_id
            WHERE qt.id = NEW.qualificacao_id
              AND qt.empresa_id = NEW.empresa_id
         )
   WHERE id = NEW.id AND empresa_id = NEW.empresa_id;
END;

CREATE TRIGGER trg_qualification_history_category_snapshot_update_0457
AFTER UPDATE OF qualificacao_id, empresa_id ON qualificacoes_historico
WHEN NEW.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_historico
     SET categoria_id = (
           SELECT qt.categoria_id
             FROM qualificacoes_tipos qt
            WHERE qt.id = NEW.qualificacao_id
              AND qt.empresa_id = NEW.empresa_id
         ),
         categoria = (
           SELECT qc.nome
             FROM qualificacoes_tipos qt
             JOIN qualificacoes_categorias qc
               ON qc.id = qt.categoria_id
              AND qc.empresa_id = qt.empresa_id
            WHERE qt.id = NEW.qualificacao_id
              AND qt.empresa_id = NEW.empresa_id
         ),
         categoria_codigo = (
           SELECT qc.codigo
             FROM qualificacoes_tipos qt
             JOIN qualificacoes_categorias qc
               ON qc.id = qt.categoria_id
              AND qc.empresa_id = qt.empresa_id
            WHERE qt.id = NEW.qualificacao_id
              AND qt.empresa_id = NEW.empresa_id
         )
   WHERE id = NEW.id AND empresa_id = NEW.empresa_id;
END;

-- Linked LMS courses inherit category/domain from the qualification type and
-- cannot reintroduce the retired formato concept.
CREATE TRIGGER trg_lms_course_qualification_category_fk_insert_0457
BEFORE INSERT ON lms_cursos
WHEN NEW.deleted_at IS NULL AND NEW.qualificacao_tipo_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM qualificacoes_tipos qt
        JOIN qualificacoes_categorias qc
          ON qc.id = qt.categoria_id
         AND qc.empresa_id = qt.empresa_id
       WHERE qt.id = NEW.qualificacao_tipo_id
         AND qt.empresa_id = NEW.empresa_id
         AND qt.deleted_at IS NULL
         AND qc.ativo = 1
         AND qc.deleted_at IS NULL
    )
    THEN RAISE(ABORT, 'LMS_QUALIFICATION_CATEGORY_INVALID')
  END;
END;

CREATE TRIGGER trg_lms_course_qualification_category_fk_update_0457
BEFORE UPDATE OF qualificacao_tipo_id, empresa_id, deleted_at ON lms_cursos
WHEN NEW.deleted_at IS NULL AND NEW.qualificacao_tipo_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM qualificacoes_tipos qt
        JOIN qualificacoes_categorias qc
          ON qc.id = qt.categoria_id
         AND qc.empresa_id = qt.empresa_id
       WHERE qt.id = NEW.qualificacao_tipo_id
         AND qt.empresa_id = NEW.empresa_id
         AND qt.deleted_at IS NULL
         AND qc.ativo = 1
         AND qc.deleted_at IS NULL
    )
    THEN RAISE(ABORT, 'LMS_QUALIFICATION_CATEGORY_INVALID')
  END;
END;

CREATE TRIGGER trg_lms_course_qualification_category_snapshot_insert_0457
AFTER INSERT ON lms_cursos
WHEN NEW.deleted_at IS NULL AND NEW.qualificacao_tipo_id IS NOT NULL
BEGIN
  UPDATE lms_cursos
     SET categoria = (
           SELECT qc.nome
             FROM qualificacoes_tipos qt
             JOIN qualificacoes_categorias qc
               ON qc.id = qt.categoria_id
              AND qc.empresa_id = qt.empresa_id
            WHERE qt.id = NEW.qualificacao_tipo_id
              AND qt.empresa_id = NEW.empresa_id
         ),
         formato_id = NULL,
         dominio_codigo = (
           SELECT COALESCE(qt.dominio_codigo, qc.dominio_codigo)
             FROM qualificacoes_tipos qt
             JOIN qualificacoes_categorias qc
               ON qc.id = qt.categoria_id
              AND qc.empresa_id = qt.empresa_id
            WHERE qt.id = NEW.qualificacao_tipo_id
              AND qt.empresa_id = NEW.empresa_id
         )
   WHERE id = NEW.id AND empresa_id = NEW.empresa_id;
END;

CREATE TRIGGER trg_lms_course_qualification_category_snapshot_update_0457
AFTER UPDATE OF qualificacao_tipo_id, empresa_id ON lms_cursos
WHEN NEW.deleted_at IS NULL AND NEW.qualificacao_tipo_id IS NOT NULL
BEGIN
  UPDATE lms_cursos
     SET categoria = (
           SELECT qc.nome
             FROM qualificacoes_tipos qt
             JOIN qualificacoes_categorias qc
               ON qc.id = qt.categoria_id
              AND qc.empresa_id = qt.empresa_id
            WHERE qt.id = NEW.qualificacao_tipo_id
              AND qt.empresa_id = NEW.empresa_id
         ),
         formato_id = NULL,
         dominio_codigo = (
           SELECT COALESCE(qt.dominio_codigo, qc.dominio_codigo)
             FROM qualificacoes_tipos qt
             JOIN qualificacoes_categorias qc
               ON qc.id = qt.categoria_id
              AND qc.empresa_id = qt.empresa_id
            WHERE qt.id = NEW.qualificacao_tipo_id
              AND qt.empresa_id = NEW.empresa_id
         )
   WHERE id = NEW.id AND empresa_id = NEW.empresa_id;
END;
