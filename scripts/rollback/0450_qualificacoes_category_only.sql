-- Manual rollback only. Abort before running if any row has drifted since
-- migration 0450. Only restores qualificacoes_tipos columns — does NOT touch
-- qualificacoes_categorias (0450 never created or modified any categoria row).
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: mirrors migration 0450 which captured each target tipo's
--   pre-migration state (categoria, categoria_id, formato_id) in
--   qualificacoes_category_only_0450_rollback. Every reversion resolves the
--   original values from that snapshot table.
-- operational_decision: Reverse the 0450 migration by restoring categoria,
--   categoria_id and formato_id from the snapshot, only if every captured
--   tipo is still in the expected post-0450 state (categoria = 'EAD',
--   formato_id IS NULL, not soft-deleted). Fail closed on any drift.
--   After rollback, the snapshot table is retained as audit evidence.
-- dry_run_required: run once against the post-0450 local D1 copy — must
--   succeed. Verify the restored values match the pre-0450 baseline hashes.
-- rollback_plan_required: this file is the rollback plan. After execution,
--   re-apply 0450 to return to the category-only state.

----------------------------------------
-- VALIDATION 1: every snapshot entry must still reference an existing,
-- non-deleted tipo in the expected post-0450 state.
----------------------------------------
DROP TABLE IF EXISTS _qco_0450_rollback_guard1;
CREATE TABLE _qco_0450_rollback_guard1 (valid INTEGER NOT NULL CHECK (valid = 1));
INSERT INTO _qco_0450_rollback_guard1 (valid)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
    FROM qualificacoes_category_only_0450_rollback rb
    LEFT JOIN qualificacoes_tipos qt
      ON CAST(qt.id AS TEXT) = rb.qualificacao_tipo_id
     AND qt.empresa_id = rb.empresa_id
   WHERE qt.id IS NULL                          -- tipo ausente
      OR qt.deleted_at IS NOT NULL              -- soft-deleted
      OR UPPER(TRIM(COALESCE(qt.categoria, ''))) <> 'EAD'  -- categoria divergente
      OR qt.categoria_id IS NOT rb.categoria_id_alvo       -- categoria_id divergente
      OR qt.formato_id IS NOT NULL              -- formato_id foi restaurado externamente
) THEN 1 ELSE 0 END;

----------------------------------------
-- VALIDATION 2: row counts must match exactly.
----------------------------------------
DROP TABLE IF EXISTS _qco_0450_rollback_guard2;
CREATE TABLE _qco_0450_rollback_guard2 (valid INTEGER NOT NULL CHECK (valid = 1));
INSERT INTO _qco_0450_rollback_guard2 (valid)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM qualificacoes_category_only_0450_rollback)
  =
  (SELECT COUNT(*)
     FROM qualificacoes_category_only_0450_rollback rb
     JOIN qualificacoes_tipos qt
       ON CAST(qt.id AS TEXT) = rb.qualificacao_tipo_id
      AND qt.empresa_id = rb.empresa_id
    WHERE qt.deleted_at IS NULL
      AND UPPER(TRIM(COALESCE(qt.categoria, ''))) = 'EAD'
      AND qt.categoria_id = rb.categoria_id_alvo
      AND qt.formato_id IS NULL)
THEN 1 ELSE 0 END;

----------------------------------------
-- RESTORE: set categoria, categoria_id, formato_id back to pre-0450 values.
----------------------------------------
UPDATE qualificacoes_tipos
   SET categoria_id = (
         SELECT rb.categoria_id_anterior
           FROM qualificacoes_category_only_0450_rollback rb
          WHERE rb.empresa_id = qualificacoes_tipos.empresa_id
            AND rb.qualificacao_tipo_id = CAST(qualificacoes_tipos.id AS TEXT)
       ),
       categoria = (
         SELECT rb.categoria_anterior
           FROM qualificacoes_category_only_0450_rollback rb
          WHERE rb.empresa_id = qualificacoes_tipos.empresa_id
            AND rb.qualificacao_tipo_id = CAST(qualificacoes_tipos.id AS TEXT)
       ),
       formato_id = (
         SELECT rb.formato_id_anterior
           FROM qualificacoes_category_only_0450_rollback rb
          WHERE rb.empresa_id = qualificacoes_tipos.empresa_id
            AND rb.qualificacao_tipo_id = CAST(qualificacoes_tipos.id AS TEXT)
       ),
       updated_at = datetime('now')
 WHERE EXISTS (
   SELECT 1
     FROM qualificacoes_category_only_0450_rollback rb
    WHERE rb.empresa_id = qualificacoes_tipos.empresa_id
      AND rb.qualificacao_tipo_id = CAST(qualificacoes_tipos.id AS TEXT)
 );

-- Snapshot table is retained as audit evidence.
-- To clean up after reviewing: DROP TABLE IF EXISTS qualificacoes_category_only_0450_rollback;

DROP TABLE IF EXISTS _qco_0450_rollback_guard2;
DROP TABLE IF EXISTS _qco_0450_rollback_guard1;
