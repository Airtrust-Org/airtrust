-- Category is the sole functional classification for qualification types.
-- Legacy format columns/tables are intentionally retained for compatibility.
-- This migration does NOT create or modify any qualificacoes_categorias rows.
--
-- Active-record policy: only active (ativo = 1) Categorias and Formatos are
-- used to resolve canonical EAD classification. Inactive records are ignored.
-- Tipos that are not soft-deleted but have ativo = 0 are still migrated if
-- they are linked to an active EAD Formato — they remain valid catalog entries.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: read-only production audit (2026-07-27). For each tenant
--   that has active qualificacoes_tipos linked to an active EAD-coded format
--   (qualificacoes_formatos.codigo = 'EAD'), the canonical EAD category is
--   resolved dynamically per tenant — no hardcoded IDs. Every target row is
--   re-resolved at execution time by tenant-safe join on qualificacoes_formatos
--   and qualificacoes_categorias.
-- operational_decision: Migrate the qualificacoes classification from dual
--   (categoria + formato) to single (categoria only). For types currently
--   linked to EAD format, set categoria -> 'EAD', categoria_id -> canonical
--   EAD category, formato_id -> NULL. The rollback snapshot captures the
--   previous state for safe reversion. Histories, certificates, enrolments
--   and LMS courses are untouched. Does NOT create or modify any categoria row.
-- dry_run_required: run once against a local D1 copy seeded with the audited
--   baseline (see the migration test suite) — must succeed. Running it again
--   against the now-changed database must be a no-op (zero rows updated,
--   zero rows inserted, zero updated_at changes).
-- rollback_plan_required: scripts/rollback/0450_qualificacoes_category_only.sql.
--   Resolves the same tenant/codes dynamically from the rollback snapshot,
--   validates the exact post-migration state before reverting, and aborts on
--   drift (any tipo that was changed outside this migration).

-- Persistent snapshot for rollback. qualificacao_tipo_id is TEXT (UUID since migration 0031).
CREATE TABLE IF NOT EXISTS qualificacoes_category_only_0450_rollback (
  empresa_id INTEGER NOT NULL,
  qualificacao_tipo_id TEXT NOT NULL,
  categoria_id_anterior INTEGER,
  categoria_anterior TEXT,
  formato_id_anterior INTEGER,
  categoria_id_alvo INTEGER NOT NULL,
  PRIMARY KEY (empresa_id, qualificacao_tipo_id)
);

----------------------------------------
-- PRECHECK 1: no duplicate active EAD categories per tenant
----------------------------------------
DROP TABLE IF EXISTS _qco_0450_precheck1;
CREATE TABLE _qco_0450_precheck1 (valid INTEGER NOT NULL CHECK (valid = 1));
INSERT INTO _qco_0450_precheck1 (valid)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
    FROM qualificacoes_categorias qc
   WHERE qc.deleted_at IS NULL
     AND qc.ativo = 1
     AND UPPER(TRIM(qc.nome)) = 'EAD'
   GROUP BY qc.empresa_id
  HAVING COUNT(*) > 1
) THEN 1 ELSE 0 END;

----------------------------------------
-- PRECHECK 2: every tenant with EAD-format types MUST have exactly 1 active EAD category
----------------------------------------
DROP TABLE IF EXISTS _qco_0450_precheck2;
CREATE TABLE _qco_0450_precheck2 (valid INTEGER NOT NULL CHECK (valid = 1));
INSERT INTO _qco_0450_precheck2 (valid)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
    FROM (
      SELECT qt.empresa_id
        FROM qualificacoes_tipos qt
        JOIN qualificacoes_formatos qf
          ON qf.id = qt.formato_id
         AND qf.empresa_id = qt.empresa_id
         AND qf.deleted_at IS NULL
         AND qf.ativo = 1
       WHERE qt.deleted_at IS NULL
         AND UPPER(TRIM(qf.codigo)) = 'EAD'
       GROUP BY qt.empresa_id
    ) targets
    LEFT JOIN (
      SELECT qc.empresa_id, COUNT(*) AS cnt
        FROM qualificacoes_categorias qc
       WHERE qc.deleted_at IS NULL
         AND qc.ativo = 1
         AND UPPER(TRIM(qc.nome)) = 'EAD'
       GROUP BY qc.empresa_id
    ) cats ON cats.empresa_id = targets.empresa_id
   WHERE cats.cnt IS NULL OR cats.cnt <> 1
) THEN 1 ELSE 0 END;

----------------------------------------
-- RESOLVE current targets (this run only)
----------------------------------------
DROP TABLE IF EXISTS _qco_0450_targets;
CREATE TABLE _qco_0450_targets (
  empresa_id INTEGER NOT NULL,
  qualificacao_tipo_id TEXT NOT NULL,
  categoria_id_alvo INTEGER NOT NULL,
  PRIMARY KEY (empresa_id, qualificacao_tipo_id)
);

INSERT INTO _qco_0450_targets (empresa_id, qualificacao_tipo_id, categoria_id_alvo)
SELECT qt.empresa_id,
       CAST(qt.id AS TEXT),
       qc.id
  FROM qualificacoes_tipos qt
  JOIN qualificacoes_formatos qf
    ON qf.id = qt.formato_id
   AND qf.empresa_id = qt.empresa_id
   AND qf.deleted_at IS NULL
   AND qf.ativo = 1
  JOIN qualificacoes_categorias qc
    ON qc.empresa_id = qt.empresa_id
   AND qc.deleted_at IS NULL
   AND qc.ativo = 1
   AND UPPER(TRIM(qc.nome)) = 'EAD'
 WHERE qt.deleted_at IS NULL
   AND UPPER(TRIM(qf.codigo)) = 'EAD';

-- No targets means nothing to do — clean exit (idempotent).
-- If there are targets, proceed below.

----------------------------------------
-- SNAPSHOT: capture pre-migration state for rollback (only for THIS run's targets)
----------------------------------------
INSERT OR IGNORE INTO qualificacoes_category_only_0450_rollback (
  empresa_id, qualificacao_tipo_id, categoria_id_anterior, categoria_anterior, formato_id_anterior, categoria_id_alvo
)
SELECT qt.empresa_id,
       CAST(qt.id AS TEXT),
       qt.categoria_id,
       qt.categoria,
       qt.formato_id,
       t.categoria_id_alvo
  FROM qualificacoes_tipos qt
  JOIN _qco_0450_targets t
    ON t.empresa_id = qt.empresa_id
   AND t.qualificacao_tipo_id = CAST(qt.id AS TEXT)
 WHERE qt.deleted_at IS NULL;

----------------------------------------
-- APPLY: set categoria->'EAD', categoria_id->canonical, formato_id->NULL
-- Only touches rows that are in this run's target set AND still in the expected state.
----------------------------------------
UPDATE qualificacoes_tipos
   SET categoria_id = (
         SELECT t.categoria_id_alvo
           FROM _qco_0450_targets t
          WHERE t.empresa_id = qualificacoes_tipos.empresa_id
            AND t.qualificacao_tipo_id = CAST(qualificacoes_tipos.id AS TEXT)
       ),
       categoria = 'EAD',
       formato_id = NULL,
       updated_at = datetime('now')
 WHERE deleted_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM _qco_0450_targets t
      WHERE t.empresa_id = qualificacoes_tipos.empresa_id
        AND t.qualificacao_tipo_id = CAST(qualificacoes_tipos.id AS TEXT)
   );

-- Cleanup auxiliary tables
DROP TABLE IF EXISTS _qco_0450_targets;
DROP TABLE IF EXISTS _qco_0450_precheck2;
DROP TABLE IF EXISTS _qco_0450_precheck1;
