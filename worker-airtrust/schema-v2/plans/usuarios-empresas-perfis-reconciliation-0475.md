# Schema V2 plan — usuarios_empresas_perfis governance reconciliation 0475

## Objective

Bring the multi-profile structure `usuarios_empresas_perfis` under the governed
Schema V2 ledger **without** claiming that the earlier ungoverned migration 0473
was applied through Schema V2.

Confirmed read-only state before this plan:

- `usuarios_empresas_perfis` **exists in production** (147 rows), DDL identical
  to 0473; the lookup index exists; the generic role backfill already ran.
- `airtrust_schema_changes_v2` has **no row** for 0473 — the last governed
  change is `frms-operational-readiness-0472`.
- The table is **absent in staging** (`airtrust-db-staging-baseline-20260701`),
  which tracks migrations via the legacy `d1_migrations` table.
- Migration 0473 additionally embedded three user-specific role grants
  (GESTOR / INSTRUTOR / ALUNO for one individual). Those three rows already
  exist in production.

## Scope

Idempotent, additive only:

- `CREATE TABLE IF NOT EXISTS usuarios_empresas_perfis (...)` — same columns and
  `UNIQUE(usuario_id, empresa_id, perfil)` as 0473;
- `CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_perfis_lookup`;
- `INSERT OR IGNORE ... SELECT usuario_id, empresa_id, role, 1 ... FROM
  usuarios_empresas WHERE role IS NOT NULL AND role != ''` — the generic,
  deterministic backfill only.

Explicitly **not** in scope, by decision:

- no user/email/name-specific DML;
- no mass profile-casing normalization;
- no `DELETE`;
- no `UPDATE` of existing profile rows;
- no activation / deactivation of any profile;
- the pre-existing three individual grants are left exactly as they are.

Migration 0473 stays immutable as the historical record of what was applied.

## Tenant and security invariants

- Every application read/write of `usuarios_empresas_perfis` binds `empresa_id`
  from the authenticated tenant context; a `usuario_id` / `empresa_id` supplied
  by a client is never sufficient on its own.
- The tenant administrative role continues to come from `usuarios_empresas.role`.
  Additional session profiles are derived from real employee links
  (`instrutores_simulador`, `lms_matriculas`) by the backend resolver; the
  `airtrust_session_role` cookie only transports a preference and is
  re-validated on every request — it is never an elevation credential.
- The backfill copies only `usuarios_empresas.(usuario_id, empresa_id, role)`
  rows, so it cannot introduce a cross-tenant association: `empresa_id` is
  carried verbatim from the same source row.
- Profile-string casing is not touched here. `normalizeAirtrustRole` /
  `normalizeSessionRole` map every currently observed value
  (`ADMIN`, `admin`, `ADMINISTRADOR`, `GESTOR`, `manager`, `INSTRUTOR`,
  `instructor`, `ALUNO`, `student`, `member`, `viewer`) to a supported
  canonical `SessionRole` via an **explicit** rule (none rely on the
  `USUARIO` catch-all fallback). `UNKNOWN_PROFILE_VALUES = 0`.

## Rollout

1. Validate the SQL locally against the current Schema V2 baseline
   (`production-d1-baseline-v2-20260714`) in both states:
   fresh database (no table) and a snapshot equivalent to the existing
   production state.
2. Merge only after the required CI gates are green.
3. Apply to **staging** through the governed staging schema workflow for the
   exact reviewed SHA, then deploy the same release-candidate Worker + frontend
   and run the auth/RBAC + minimal LMS smoke.
4. Apply to **production** only through the governed `Apply Schema Change V2`
   workflow, for an explicitly authorized SHA, after a D1 Time Travel recovery
   point.

No remote migration is authorized by creation of this plan.

## Rollback / compensation

The structure is already live and depended on by the running Worker. There is
nothing to drop as an automatic rollback. Preferred compensation for an
application-level problem is to disable the multi-profile read/write path in the
Worker and keep the additive table. Any destructive removal of data requires a
separate explicit data-governance authorization.

## Postconditions

- `usuarios_empresas_perfis` exists with the `UNIQUE(usuario_id, empresa_id, perfil)` constraint.
- `idx_usuarios_empresas_perfis_lookup` exists.
- Every `usuarios_empresas` row with a non-empty `role` has a matching
  `(usuario_id, empresa_id, role)` profile row.
- A second apply is a no-op: no duplicate profile rows, no schema change.
- No profile row is deleted; no existing profile row's `perfil` or `ativo` is changed.
- No profile row exists whose `(usuario_id, empresa_id)` pair crosses tenants
  relative to its source `usuarios_empresas` row.
- `airtrust_schema_changes_v2` gains exactly one row for
  `usuarios-empresas-perfis-reconciliation-0475` (added by the governed apply
  builder), and none for `0473`.
