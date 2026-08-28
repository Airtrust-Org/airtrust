# Schema V2 plan — ANAC public-data synchronization 0476

## Objective

Persist the state, audit trail and tenant-scoped minimized aircraft projection needed for automatic synchronization of official ANAC public data, beginning with the Registro Aeronáutico Brasileiro (RAB).

## Scope

Additive only:

- `anac_public_sync_state`: one global state row per ANAC public source, including active content hash, conditional-request metadata, last success/failure and freshness counters;
- `anac_public_sync_runs`: append-only execution history without operational payload values or personal data;
- `anac_rab_aircraft_cache`: minimized RAB projection only for aircraft already registered in an AirTrust tenant.

The migration intentionally does **not** persist the complete RAB dataset in D1 and does not copy owner/operator names, CPF/CNPJ, addresses or lien/free-text fields.

## Promotion invariant

A newly downloaded ANAC payload becomes the active source version only after:

1. successful HTTP retrieval or a trusted 304 response;
2. content-size and JSON-structure validation;
3. minimum/relative record-count validation;
4. normalization and registration-index construction;
5. construction of the tenant fleet subset;
6. successful persistence of the tenant-scoped cache and global source state.

If any step fails, the previous active version remains authoritative inside AirTrust.

## R2 policy

The sync service may persist a **minimized** snapshot containing source metadata and normalized AirTrust-relevant aircraft projections. The full upstream RAB payload is not retained by default because it contains public personal data that is unnecessary for the AirTrust use case.

## Tenant and security invariants

- global source state contains no tenant operational data;
- every `anac_rab_aircraft_cache` row contains `empresa_id` and `aeronave_id` from the existing tenant-scoped `aeronaves` table;
- application reads must bind authenticated `empresa_id`;
- public source data never overwrites `aeronaves` automatically;
- differences are evidence for human review and operational alerts, not silent mutation commands.

## Rollout

1. Validate SQL and Worker typecheck in CI.
2. Merge only after all required gates are green.
3. Apply 0476 in staging through the governed Schema V2 workflow.
4. Enable `ANAC_PUBLIC_SYNC_ENABLED=true` only in staging.
5. Run at least one manual/scheduled RAB synchronization and verify state, run history, minimized R2 snapshot and tenant isolation.
6. Observe at least one repeated run demonstrating `NOT_MODIFIED` or `UNCHANGED` behavior.
7. Enable production only in a separate reviewed configuration change after staging evidence is accepted.

Creation or merge of this plan does not authorize a remote migration or production activation.

## Rollback / compensation

Disable `ANAC_PUBLIC_SYNC_ENABLED`. Existing AirTrust aircraft data remains untouched because the integration is advisory/read-only. The additive sync/cache tables may be retained for audit evidence. Dropping them requires a separate explicit migration.

## Postconditions

- sync state and append-only run history tables exist;
- tenant-scoped RAB cache exists with composite primary key `(empresa_id, aeronave_id)`;
- no existing `aeronaves` row is modified by the migration;
- no full RAB or owner/operator personal-data table is introduced.
