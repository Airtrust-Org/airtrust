-- Schema V2 0560 — immutable simulator check evidence DELETE guard.
-- Additive only: no updates, backfills, deletes, or cross-tenant modifications.
-- Companion to 0554. Confirmed, rejected, annulled and draft evidence must
-- remain append-only for audits; revisions use a separate signed fiche.
CREATE TRIGGER IF NOT EXISTS trg_checks_individuais_delete_guard
BEFORE DELETE ON sessoes_checks_resultados_individuais
BEGIN
  SELECT RAISE(ABORT, 'INDIVIDUAL_CHECK_DELETE_FORBIDDEN');
END;
