-- ============================================================
-- MIGRATION 0461: Pin refresh_tokens to the empresa (tenant) they
-- were issued for.
--
-- source_reference: P0-AUTH-001 hardening — auth refresh route audit
--   (worker-airtrust/src/routes/auth.ts, POST /api/auth/refresh) found
--   refresh_tokens has no empresa_id and refresh re-derives the tenant
--   from current usuarios_empresas.is_primary state on every call.
-- operational_decision: add empresa_id to refresh_tokens and revoke
--   (not delete) pre-existing rows lacking it, forcing re-login for
--   sessions whose original tenant cannot be retroactively proven.
-- dry_run_required: yes; run the UPDATE as a SELECT COUNT(*) first in
--   each environment to confirm the expected number of legacy sessions
--   being revoked before applying.
-- rollback_plan_required: yes; run in this exact order (verified locally
--   against a disposable SQLite file — dropping the column first errors
--   with "no such column: empresa_id" while the index still references it):
--     DROP INDEX idx_refresh_tokens_empresa;
--     ALTER TABLE refresh_tokens DROP COLUMN empresa_id;  -- SQLite 3.35+
--   The revoked_at UPDATE is not reversible (by design — those sessions
--   must re-authenticate), so rollback only restores the schema, not the
--   revoked sessions.
--
-- STATUS as of the select-empresa session-scoping follow-up (same branch):
--   this migration is STILL NOT APPLIED in any environment. Until it is,
--   worker-airtrust/src/routes/auth.ts detects the missing empresa_id
--   column at runtime (hasRefreshTokensEmpresaIdColumn) and falls back to
--   re-deriving the tenant from resolveUserEmpresaId() on refresh — the
--   pre-existing, documented-limitation behavior. P0-AUTH-001 is only
--   FULLY closed (refresh tokens hard-pinned to their issuing tenant, with
--   no re-derivation fallback) once this migration is applied. The related
--   select-empresa fix (no longer mutating is_primary globally, minting a
--   session-scoped token pair instead) does NOT depend on this migration
--   and is already fully active regardless of whether it's applied.
--
-- P0-AUTH-001 hardening: today refresh_tokens has no empresa_id
-- column, so POST /api/auth/refresh re-derives the tenant on every
-- call via resolveUserEmpresaId(), which reads the user's CURRENT
-- usuarios_empresas.is_primary state. If is_primary flips after the
-- session was created (e.g. via POST /api/auth/select-empresa from a
-- different session, which mutates is_primary globally), a refresh
-- of the ORIGINAL session can silently resolve to a different
-- empresa than the one it was issued for.
--
-- This migration adds empresa_id to refresh_tokens so each session
-- can be pinned at issuance time and refreshed against that same
-- pinned value forever, independent of later changes to the user's
-- other tenant memberships.
--
-- Existing rows predate this column and therefore cannot have their
-- original tenant retroactively proven. They are REVOKED here (not
-- deleted) so the affected sessions are forced to re-authenticate
-- and receive a freshly pinned token, rather than being silently
-- treated as belonging to whatever empresa they get resolved to.
--
-- NOT APPLIED as part of this change. Apply manually per CLAUDE.md:
--   Local:
--     wrangler d1 execute airtrust-db --config worker-airtrust/wrangler.dev.toml \
--       --local --file=worker-airtrust/migrations/0461_refresh_tokens_empresa_id.sql
--   Remote (requires explicit authorization):
--     AIRTRUST_ALLOW_PROD_DB_WRITE=YES \
--     AIRTRUST_CONFIRM_PROD_DB_WRITE="I understand this may modify production data" \
--     bash scripts/apply-migration-production.sh \
--       worker-airtrust/migrations/0461_refresh_tokens_empresa_id.sql
-- ============================================================

ALTER TABLE refresh_tokens ADD COLUMN empresa_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_empresa ON refresh_tokens(empresa_id);

-- Force re-login for any pre-existing session: its original tenant
-- cannot be proven, so it must not be silently pinned or silently
-- allowed to keep re-deriving the tenant on refresh.
UPDATE refresh_tokens
   SET revoked_at = COALESCE(revoked_at, datetime('now'))
 WHERE empresa_id IS NULL
   AND revoked_at IS NULL;
