-- Reconcile the FAP06/IFR check-qualification rule for AW139/S-76 session
-- models, resolved entirely by canonical code and tenant-safe joins — no
-- hardcoded production IDs. See docs/operations/rollbacks/0449_rollback.sql
-- for the rollback (deliberately NOT in this directory: Wrangler discovers
-- every .sql file here as an applicable migration, and a same-directory
-- rollback file could be applied as the "next" migration, silently undoing
-- this fix in the same pipeline run).
--
-- FAIL-CLOSED ON EXACT BASELINE, NOT "SMART" IDEMPOTENCY. This migration
-- has no persistent ledger of which rows it touched. Without one, a
-- second execution cannot tell "a link this migration created" apart from
-- "a link that already existed for some other reason" or "an is_check
-- flag someone else already corrected" — so it must not guess. The
-- migration only ever writes when the database is in EXACTLY the audited
-- pre-migration state (verified below); any other state — already
-- applied, partially applied, or drifted — aborts. The D1 migrations
-- runner already guarantees a migration file runs at most once; this
-- preflight is the defense for the case of a manual re-run outside that
-- runner, or of hand-editing having moved the database into an
-- unexpected state since the audit.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: read-only production audit (2026-07-27). The specific
--   numeric IDs found during that audit (empresa_id 6; qualificacoes_tipos
--   164/114/79/78; modelos_sessao 105/109/115/121/111/117/153/135/142/144)
--   are cited here ONLY as audit evidence for the codes/roles below — none
--   of them appear as literals in the executable statements. Every target
--   row is re-resolved at execution time by canonical code + tenant-safe
--   join, and the migration aborts if that resolution disagrees with a
--   single, unique row, or if the resolved rows are not in exactly the
--   audited pre-migration state.
-- operational_decision: two independent, additive-only fixes, applied
--   only when the exact pre-migration baseline holds:
--   1. Classify FAP6-139 and IFR-SK76 as Check-type qualifications
--      (is_check 0 -> 1), matching every sibling FAP (FAP05.2-139,
--      FAP06-76, IFR-139, FAP13-139, FAP14-139).
--   2. Add the 8 FAP06+IFR check-links the canonical rule requires:
--      AW139 inicial (A139-I-12/12) and periodico (A139-P-04/04-C{1,2,3}-CHECK)
--        get FAP6-139 (IFR-139 already present, verified as an invariant).
--      AW139 semestral (A139-S-02/02-C{1,2,3}) get nothing added — verified
--        as never having FAP6-139 (forbidden state).
--      SK76 inicial (SK76-I-12/12) gets FAP06-76 + IFR-SK76 (had none).
--      SK76 periodico (SK76-P-CHECK) gets IFR-SK76 (FAP06-76 already
--        present, verified as an invariant).
--      SK76 semestral (SK76-S-02/02) gets IFR-SK76 only (had none).
-- dry_run_required: run once against a local D1 copy seeded with exactly
--   the audited baseline (see the migration test suite) — must succeed.
--   Running it again against the now-changed database must abort with
--   "migration ja aplicada ou estado divergente", performing zero writes.
-- rollback_plan_required: docs/operations/rollbacks/0449_rollback.sql.
--   Resolves the same tenant/codes dynamically, validates the exact
--   post-migration state before removing anything, and aborts on drift.

-- Resolve the tenant from evidence, not a literal: the empresa that
-- currently has all 10 AW139/S-76 check-session models as their current
-- version. This is the same set of models this migration touches, so a
-- unique match here really is "the correct tenant for this fix" — not a
-- name we picked ahead of time.
CREATE TABLE IF NOT EXISTS _0449_tenant (empresa_id INTEGER PRIMARY KEY);
DELETE FROM _0449_tenant;
INSERT INTO _0449_tenant (empresa_id)
SELECT ms.empresa_id
FROM modelos_sessao ms
JOIN modelos_sessao_versionamento msv
  ON msv.modelo_id = ms.id AND msv.empresa_id = ms.empresa_id AND msv.is_current = 1
WHERE msv.codigo_canonico IN (
  'A139-I-12/12',
  'A139-P-04/04-C1-CHECK', 'A139-P-04/04-C2-CHECK', 'A139-P-04/04-C3-CHECK',
  'A139-S-02/02-C1', 'A139-S-02/02-C2', 'A139-S-02/02-C3',
  'SK76-I-12/12', 'SK76-P-CHECK', 'SK76-S-02/02'
)
GROUP BY ms.empresa_id
HAVING COUNT(DISTINCT msv.codigo_canonico) = 10;

CREATE TABLE IF NOT EXISTS _0449_preflight_tenant_guard (id INTEGER PRIMARY KEY CHECK(id = 1));
CREATE TRIGGER IF NOT EXISTS _0449_preflight_tenant_validate
BEFORE INSERT ON _0449_preflight_tenant_guard
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM _0449_tenant) <> 1
    THEN RAISE(ABORT, '0449 preflight: tenant nao resolvido de forma unica pelos 10 codigos de check AW139/S-76') END;
END;
INSERT INTO _0449_preflight_tenant_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0449_preflight_tenant_validate;
DROP TABLE IF EXISTS _0449_preflight_tenant_guard;

-- Resolve every model role by canonical code, scoped to the resolved
-- tenant. The PRIMARY KEY on role means a code that somehow resolved
-- twice would already fail the INSERT; the count check below catches a
-- code resolving zero times.
CREATE TABLE IF NOT EXISTS _0449_models (role TEXT PRIMARY KEY, modelo_id INTEGER NOT NULL);
DELETE FROM _0449_models;
INSERT INTO _0449_models (role, modelo_id)
SELECT role, modelo_id FROM (
  SELECT 'AW_INI' AS role, 'A139-I-12/12' AS codigo_canonico
  UNION ALL SELECT 'AW_PER_C1', 'A139-P-04/04-C1-CHECK'
  UNION ALL SELECT 'AW_PER_C2', 'A139-P-04/04-C2-CHECK'
  UNION ALL SELECT 'AW_PER_C3', 'A139-P-04/04-C3-CHECK'
  UNION ALL SELECT 'AW_SEM_C1', 'A139-S-02/02-C1'
  UNION ALL SELECT 'AW_SEM_C2', 'A139-S-02/02-C2'
  UNION ALL SELECT 'AW_SEM_C3', 'A139-S-02/02-C3'
  UNION ALL SELECT 'SK_INI', 'SK76-I-12/12'
  UNION ALL SELECT 'SK_PER', 'SK76-P-CHECK'
  UNION ALL SELECT 'SK_SEM', 'SK76-S-02/02'
) targets
JOIN modelos_sessao_versionamento msv
  ON msv.codigo_canonico = targets.codigo_canonico
 AND msv.is_current = 1
 AND msv.empresa_id = (SELECT empresa_id FROM _0449_tenant)
JOIN modelos_sessao ms ON ms.id = msv.modelo_id AND ms.empresa_id = msv.empresa_id;

-- Resolve every qualification role by canonical code, scoped to the same
-- tenant, excluding soft-deleted qualification-type rows.
CREATE TABLE IF NOT EXISTS _0449_quals (role TEXT PRIMARY KEY, qual_id INTEGER NOT NULL, is_check INTEGER NOT NULL);
DELETE FROM _0449_quals;
INSERT INTO _0449_quals (role, qual_id, is_check)
SELECT role, qt.id, qt.is_check FROM (
  SELECT 'AW_FAP06' AS role, 'FAP6-139' AS codigo
  UNION ALL SELECT 'AW_IFR', 'IFR-139'
  UNION ALL SELECT 'SK_FAP06', 'FAP06-76'
  UNION ALL SELECT 'SK_IFR', 'IFR-SK76'
) targets
JOIN qualificacoes_tipos qt
  ON qt.codigo = targets.codigo
 AND qt.empresa_id = (SELECT empresa_id FROM _0449_tenant)
 AND qt.deleted_at IS NULL;

-- Every pair this migration will link, tagged with whether it is allowed
-- to already be active pre-migration ('baseline', must be true) or must
-- be completely absent pre-migration ('new', any trace — active or
-- soft-deleted — means drift and aborts).
CREATE TABLE IF NOT EXISTS _0449_pairs (
  role TEXT PRIMARY KEY,
  modelo_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('baseline', 'new'))
);
DELETE FROM _0449_pairs;
INSERT INTO _0449_pairs (role, modelo_id, qualificacao_tipo_id, kind)
SELECT 'BASE_AW_IFR_' || m.role, m.modelo_id, (SELECT qual_id FROM _0449_quals WHERE role = 'AW_IFR'), 'baseline'
FROM _0449_models m WHERE m.role IN ('AW_INI', 'AW_PER_C1', 'AW_PER_C2', 'AW_PER_C3');

INSERT INTO _0449_pairs (role, modelo_id, qualificacao_tipo_id, kind)
SELECT 'BASE_SK_FAP06', (SELECT modelo_id FROM _0449_models WHERE role = 'SK_PER'), (SELECT qual_id FROM _0449_quals WHERE role = 'SK_FAP06'), 'baseline';

INSERT INTO _0449_pairs (role, modelo_id, qualificacao_tipo_id, kind)
SELECT 'NEW_AW_FAP06_' || m.role, m.modelo_id, (SELECT qual_id FROM _0449_quals WHERE role = 'AW_FAP06'), 'new'
FROM _0449_models m WHERE m.role IN ('AW_INI', 'AW_PER_C1', 'AW_PER_C2', 'AW_PER_C3');

INSERT INTO _0449_pairs (role, modelo_id, qualificacao_tipo_id, kind)
SELECT 'NEW_SK_INI_FAP06', (SELECT modelo_id FROM _0449_models WHERE role = 'SK_INI'), (SELECT qual_id FROM _0449_quals WHERE role = 'SK_FAP06'), 'new';

INSERT INTO _0449_pairs (role, modelo_id, qualificacao_tipo_id, kind)
SELECT 'NEW_SK_IFR_' || m.role, m.modelo_id, (SELECT qual_id FROM _0449_quals WHERE role = 'SK_IFR'), 'new'
FROM _0449_models m WHERE m.role IN ('SK_INI', 'SK_PER', 'SK_SEM');

CREATE TABLE IF NOT EXISTS _0449_preflight_resolution_guard (id INTEGER PRIMARY KEY CHECK(id = 1));
CREATE TRIGGER IF NOT EXISTS _0449_preflight_resolution_validate
BEFORE INSERT ON _0449_preflight_resolution_guard
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM _0449_models) <> 10
    THEN RAISE(ABORT, '0449 preflight: nem todos os 10 modelos de check resolveram de forma unica no tenant') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM _0449_quals) <> 4
    THEN RAISE(ABORT, '0449 preflight: nem todos os 4 codigos de qualificacao resolveram de forma unica no tenant') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM _0449_pairs) <> 13
    THEN RAISE(ABORT, '0449 preflight: resolucao interna dos pares alvo incompleta') END;

  -- Exact flag baseline: both target flags must still be 0. Either one
  -- already 1 means "already applied" or "fixed by something else" —
  -- either way, not this migration's baseline to write over. This is the
  -- fail-closed replacement for treating "already 1" as a no-op.
  SELECT CASE WHEN (SELECT is_check FROM _0449_quals WHERE role = 'AW_FAP06') <> 0
    THEN RAISE(ABORT, '0449 preflight: migration ja aplicada ou estado divergente (FAP6-139.is_check != 0)') END;
  SELECT CASE WHEN (SELECT is_check FROM _0449_quals WHERE role = 'SK_IFR') <> 0
    THEN RAISE(ABORT, '0449 preflight: migration ja aplicada ou estado divergente (IFR-SK76.is_check != 0)') END;
  SELECT CASE WHEN (SELECT is_check FROM _0449_quals WHERE role = 'AW_IFR') <> 1
    THEN RAISE(ABORT, '0449 preflight: IFR-139.is_check != 1 (baseline nao corresponde ao auditado)') END;
  SELECT CASE WHEN (SELECT is_check FROM _0449_quals WHERE role = 'SK_FAP06') <> 1
    THEN RAISE(ABORT, '0449 preflight: FAP06-76.is_check != 1 (baseline nao corresponde ao auditado)') END;

  -- Baseline pairs (IFR-139 on the 4 AW139 checks, FAP06-76 on
  -- SK76-P-CHECK) must be active exactly as audited.
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM _0449_pairs p
    JOIN modelos_sessao_checks msc
      ON msc.modelo_id = p.modelo_id AND msc.qualificacao_tipo_id = p.qualificacao_tipo_id AND msc.deleted_at IS NULL
    WHERE p.kind = 'baseline'
  ) <> (SELECT COUNT(*) FROM _0449_pairs WHERE kind = 'baseline')
    THEN RAISE(ABORT, '0449 preflight: baseline pre-existente (IFR-139/FAP06-76) nao esta ativo como esperado') END;

  -- Every "new" pair must be COMPLETELY ABSENT — no active row (would
  -- mean already applied or drift) and no soft-deleted row (would mean
  -- history exists and needs explicit human reconciliation, not an
  -- automatic INSERT over it).
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM _0449_pairs p
    JOIN modelos_sessao_checks msc
      ON msc.modelo_id = p.modelo_id AND msc.qualificacao_tipo_id = p.qualificacao_tipo_id AND msc.deleted_at IS NULL
    WHERE p.kind = 'new'
  ) <> 0 THEN RAISE(ABORT, '0449 preflight: migration ja aplicada ou estado divergente (vinculo-alvo ja ativo)') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM _0449_pairs p
    JOIN modelos_sessao_checks msc
      ON msc.modelo_id = p.modelo_id AND msc.qualificacao_tipo_id = p.qualificacao_tipo_id AND msc.deleted_at IS NOT NULL
    WHERE p.kind = 'new'
  ) <> 0 THEN RAISE(ABORT, '0449 preflight: vinculo soft-deleted encontrado para um par alvo; exige reconciliacao explicita, nao aplicado automaticamente') END;

  -- Forbidden state: FAP06 (either aircraft) must never be active on a
  -- semestral check model — "não renovar FAP06 no check semestral".
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM _0449_models m
    JOIN modelos_sessao_checks msc
      ON msc.modelo_id = m.modelo_id
     AND msc.qualificacao_tipo_id IN (
           (SELECT qual_id FROM _0449_quals WHERE role = 'AW_FAP06'),
           (SELECT qual_id FROM _0449_quals WHERE role = 'SK_FAP06')
         )
     AND msc.deleted_at IS NULL
    WHERE m.role IN ('AW_SEM_C1', 'AW_SEM_C2', 'AW_SEM_C3', 'SK_SEM')
  ) <> 0 THEN RAISE(ABORT, '0449 preflight: FAP06 encontrada ativa em um check semestral (estado proibido)') END;

  -- Forbidden state: cross-aircraft contamination. AW139 models must
  -- never carry a SK76-only FAP and vice versa.
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM _0449_models m
    JOIN modelos_sessao_checks msc
      ON msc.modelo_id = m.modelo_id
     AND msc.qualificacao_tipo_id IN (
           (SELECT qual_id FROM _0449_quals WHERE role = 'SK_FAP06'),
           (SELECT qual_id FROM _0449_quals WHERE role = 'SK_IFR')
         )
     AND msc.deleted_at IS NULL
    WHERE m.role IN ('AW_INI', 'AW_PER_C1', 'AW_PER_C2', 'AW_PER_C3', 'AW_SEM_C1', 'AW_SEM_C2', 'AW_SEM_C3')
  ) <> 0 THEN RAISE(ABORT, '0449 preflight: FAP de S-76 vinculada a modelo AW139 (cross-aircraft)') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM _0449_models m
    JOIN modelos_sessao_checks msc
      ON msc.modelo_id = m.modelo_id
     AND msc.qualificacao_tipo_id IN (
           (SELECT qual_id FROM _0449_quals WHERE role = 'AW_FAP06'),
           (SELECT qual_id FROM _0449_quals WHERE role = 'AW_IFR')
         )
     AND msc.deleted_at IS NULL
    WHERE m.role IN ('SK_INI', 'SK_PER', 'SK_SEM')
  ) <> 0 THEN RAISE(ABORT, '0449 preflight: FAP de AW139 vinculada a modelo S-76 (cross-aircraft)') END;
END;
INSERT INTO _0449_preflight_resolution_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0449_preflight_resolution_validate;
DROP TABLE IF EXISTS _0449_preflight_resolution_guard;

-- Fix 1: classify FAP6-139 and IFR-SK76 as Check-type qualifications. The
-- preflight above already proved both are exactly 0, so this is a
-- deliberate 0->1 transition, not a defensive no-op.
UPDATE qualificacoes_tipos SET is_check = 1, updated_at = datetime('now')
WHERE id = (SELECT qual_id FROM _0449_quals WHERE role = 'AW_FAP06');

UPDATE qualificacoes_tipos SET is_check = 1, updated_at = datetime('now')
WHERE id = (SELECT qual_id FROM _0449_quals WHERE role = 'SK_IFR');

-- Fix 2: add the 8 missing FAP links. The preflight above already proved
-- every one of these pairs is completely absent (no active row, no
-- soft-deleted row), so a plain INSERT is safe.
INSERT INTO modelos_sessao_checks (modelo_id, qualificacao_tipo_id)
SELECT modelo_id, qualificacao_tipo_id FROM _0449_pairs WHERE kind = 'new';

DROP TABLE IF EXISTS _0449_pairs;
DROP TABLE IF EXISTS _0449_models;
DROP TABLE IF EXISTS _0449_quals;
DROP TABLE IF EXISTS _0449_tenant;
