# Staging plan — pending migrations 0467-0469 (SIGVOOS shadow + LMS Completion Diagnostics)

## Scope

Apply only the still-unapplied migrations among:

- `0467_sigvoos_shadow_parallel_v1.sql`;
- `0468_sigvoos_shadow_leg_crew_v1.sql`;
- `0469_lms_completion_pendencias_snapshots.sql`.

Use the official staging D1 through `.github/workflows/deploy-staging.yml`. The remote `d1_migrations` ledger decides idempotently which entries are already present; do not assume historical application state and do not replay the generic migration chain.

This plan does not authorize production.

## Changes

All three migrations are additive DDL only.

### 0467 — SIGVOOS shadow/parallel V1
Creates the non-operational shadow tables used for read-only comparison with SIGVOOS:

- `sigvoos_shadow_runs`;
- `sigvoos_shadow_legs`;
- `sigvoos_shadow_leg_history`;
- `sigvoos_shadow_comparisons`.

These tables do not become FRMS operational authority.

### 0468 — SIGVOOS shadow leg crew V1
Creates `sigvoos_shadow_leg_crews` and tenant-scoped indexes to associate crew members with physical shadow legs. It does not read or write FRMS operational tables.

### 0469 — LMS Completion Diagnostics snapshots
Creates:

- `lms_completion_diagnostics_snapshots`;
- unique index `idx_lms_completion_diag_unique` on `(empresa_id, matricula_id, curso_id, tentativa)`;
- lookup index `idx_lms_completion_diag_matricula` on `(empresa_id, matricula_id)`.

The stored JSON is informational and does not become an authority for SCORM completion, score, qualification or certificate generation.

## Preconditions

1. Release SHA is the exact reviewed GitHub PR head or current merged `main` accepted by the staging release guard.
2. GCB canonical gates are green for that exact SHA.
3. Target is exactly `airtrust-db-staging-baseline-20260701` / `bf9963f4-eb12-439b-a830-20bbf577ac22`.
4. Production DB ID `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae` remains blocked.
5. Ledger preflight includes `0467,0468,0469` and reports no ambiguous or registered-but-missing state.
6. A fresh verified staging D1 backup is created by the governed workflow before writes.
7. Each migration is executed one at a time through `apply-approved-migration-with-recovery-point.sh`, which captures a D1 Time Travel recovery point and atomically records the `d1_migrations` ledger entry.
8. Exact migration filenames are explicitly passed in `approved_migrations` in chain order (`0467` before `0468`; `0469` is independent).

## Apply

First query the remote ledger. For each of `0467`, `0468`, `0469`:

- ledger count `1`: validate postconditions and do not rewrite;
- ledger count `0`: apply exactly that migration once;
- any other/ambiguous state: stop fail-closed.

If both `0467` and `0468` are missing, apply `0467` before `0468`.

No generic migration-chain replay is allowed.

## Postconditions

Require the specialized read-only validators to return `POSTCONDITIONS_OK`:

- `scripts/staging/validate-0467-postconditions.sh`;
- `scripts/staging/validate-0468-postconditions.sh`;
- `scripts/staging/validate-0469-postconditions.sh`.

After schema validation, deploy Worker and frontend from the same release SHA and run staging smoke plus focused SIGVOOS shadow/FRMS gate and LMS Diagnostics V1 validation.

## Compensation / rollback

The preferred application rollback is **not** ad-hoc destructive DDL.

Because the changes are additive, the safe first response to an application regression is:

1. roll Worker/frontend back to the previous coherent staging release;
2. leave additive tables inert;
3. confirm previous release health.

If schema application itself is partial/corrupted, use the verified staging backup / D1 Time Travel recovery point produced by the governed workflow. Do not improvise manual remote DDL.

Any destructive cleanup of shadow/diagnostic data is a separate governed database action.

## Production

Production requires reviewed Schema V2 bundles, the exact final production SHA, a fresh production backup, individual application/postconditions and explicit authorization for that exact SHA. Successful staging application does not itself authorize production.
