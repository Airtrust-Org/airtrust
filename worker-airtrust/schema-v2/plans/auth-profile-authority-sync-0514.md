# auth-profile-authority-sync-0514

## Objective
Close the production release blocker `AUTH_MULTI_PROFILE_AUTHORITY_NOT_READY` without a user-specific grant and prevent the same drift from recurring.

`usuarios_empresas.role` remains a compatibility/default tenant role. `usuarios_empresas_perfis` is the explicit multi-profile authority. Every non-empty legacy/default role must therefore be represented by an explicit profile row for the same `(usuario_id, empresa_id)`.

## Change
- Run a generic, idempotent `INSERT OR IGNORE ... SELECT` to reconcile role rows created after Schema V2 change 0475.
- Add an `AFTER INSERT` trigger on `usuarios_empresas` that mirrors the already-provided legacy/default role into `usuarios_empresas_perfis`.
- Add an `AFTER UPDATE OF role` trigger with the same invariant.
- Preserve every pre-existing additional profile. The change never deletes a profile and never invents a role that is not already present in `usuarios_empresas.role`.

## Safety
- No email, name, user-specific ID, tenant-specific ID or literal privilege grant is encoded in the SQL.
- `INSERT OR IGNORE` respects `UNIQUE(usuario_id, empresa_id, perfil)` and is idempotent.
- No cross-tenant lookup is performed: the profile row uses exactly `NEW.usuario_id`, `NEW.empresa_id`, and `NEW.role` from the same membership row.
- No `DELETE`, no destructive schema alteration, no role normalization and no automatic removal of existing multi-profile grants.
- Existing inactive explicit profiles are not reactivated by this change.

## Preflight
1. Production baseline V2 is active.
2. Change 0514 is not in the Schema V2 ledger.
3. `usuarios_empresas` and `usuarios_empresas_perfis` exist.
4. The multi-profile table has `UNIQUE(usuario_id, empresa_id, perfil)`.
5. Schema V2 reconciliation 0475 is already recorded.

## Postconditions
1. Exactly one 0514 ledger row exists.
2. Both authority-sync triggers exist.
3. There are zero non-empty `usuarios_empresas.role` rows without an equivalent explicit profile row.
4. There are zero profile rows whose `(usuario_id, empresa_id)` membership does not exist for a profile matching a legacy role.

## Rollback
The governed apply workflow captures a D1 recovery point before mutation. If the atomic apply or postconditions fail, use the workflow recovery point. After a successful release, do not drop triggers ad hoc; any reversal must be a separately reviewed forward compensation because new membership writes may have relied on the invariant.
