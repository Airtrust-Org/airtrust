# auth-profile-orphan-cleanup-0522

## Objective
Close the production release blocker `AUTH_MULTI_PROFILE_AUTHORITY_NOT_READY` by removing stale explicit tenant-profile rows whose tenant membership no longer exists, and prevent recurrence at the database boundary.

## Change
- Reassert the 0514 generic backfill from `usuarios_empresas.role` into the explicit profile authority and its INSERT/role-update triggers. This is idempotent in production and closes staging parity where 0514 was not a canonical staging migration.
- Delete only `usuarios_empresas_perfis` rows for which the same `(usuario_id, empresa_id)` no longer exists in `usuarios_empresas`.
- Add an `AFTER DELETE` trigger on `usuarios_empresas` that removes explicit profiles for exactly the deleted membership pair.
- Preserve all profiles belonging to an existing tenant membership.

## Safety
- No user, e-mail, name, tenant or role literal is encoded in the SQL.
- Backfill copies only the role already present on the same tenant membership; it invents no new privilege.
- Cleanup is tenant-pair scoped and deterministic.
- No membership row, user row, role assignment for an existing membership, token, sector assignment or training record is modified.
- The delete trigger only reacts to a membership deletion that has already been authorized by the application path.
- Reapplying the SQL is idempotent.

## Preflight
1. Production baseline V2 is active.
2. Schema V2 change `auth-profile-authority-sync-0514` is recorded in production.
3. `usuarios_empresas` and `usuarios_empresas_perfis` exist.
4. The explicit profile table retains `UNIQUE(usuario_id, empresa_id, perfil)`.
5. Production has no legacy/default role backfill gaps; staging may have gaps before 0522 and must have none afterward.

## Postconditions
1. Exactly one 0522 Schema V2 ledger row exists.
2. The insert, role-update and delete-sync triggers exist.
3. No explicit profile row exists without the same tenant membership pair.
4. No legacy/default tenant role is missing its matching explicit profile row.

## Rollback
The governed Schema V2 workflow must capture a D1 recovery point before mutation. If application or postconditions fail, restore that recovery point. After a successful release, reverse only through a reviewed forward compensation; do not recreate stale profile authority ad hoc.
