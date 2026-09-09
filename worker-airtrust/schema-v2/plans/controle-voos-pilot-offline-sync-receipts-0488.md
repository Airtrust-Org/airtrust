# Schema V2 plan — Pilot Offline Sync Receipts (0488)

## Objective
Create the durable, tenant-scoped idempotency receipt table required by the AirTrust Pilot App offline synchronization contract.

The table exists only to remember the canonical outcome of a client operation and prevent duplicate application after reconnect/retry. It does not authorize a flight, does not replace the signed offline lease, and does not make a local RDV an official eDB record.

## Table
- `cv_offline_sync_receipts`

## Data and tenant invariants
- additive-only change; no backfill and no existing row mutation;
- every receipt is scoped by `empresa_id`;
- `client_operation_id` is unique only inside a tenant through the named unique index `uq_cv_offline_sync_receipts_empresa_operation` on `(empresa_id, client_operation_id)`;
- runtime must validate tenant, current user, current crew membership, capabilities, flight state and optimistic versions before accepting a command;
- the table stores `payload_hash` only, never the operational request payload;
- a repeated `client_operation_id` with the same `payload_hash` replays the prior safe result;
- a repeated `client_operation_id` with a different hash is a permanent conflict/security error and must never apply;
- `device_id` is diagnostic/provenance context, not a standalone authentication factor;
- result status is constrained to `accepted`, `conflict`, `rejected_retriable` or `rejected_permanent`;
- receipts are not soft-deleted because they are the idempotency history.

## Runtime gating
The worker route remains fail-closed unless `PILOT_OFFLINE_SYNC_ENABLED=true`.

Merging this schema bundle does not imply that the table exists in any remote D1 database and does not authorize enabling the flag.

## Rollout
1. Merge only after all required repository gates are green for the exact SHA.
2. Validate the reviewed SQL against a disposable local SQLite/D1-compatible database.
3. Keep `PILOT_OFFLINE_SYNC_ENABLED` disabled.
4. Apply only through the governed Schema V2 workflow using change ID `controle-voos-pilot-offline-sync-receipts-0488` for an explicitly authorized environment/SHA.
5. Verify table, unique constraint/indexes and exact Schema V2 ledger row.
6. Enable runtime synchronization only in a separately authorized release after schema postconditions are green.
7. Validate idempotent retry, cross-tenant denial, stale-version conflict and duplicate-operation/hash mismatch in staging before any production enablement.

No generic migration-chain replay is permitted.

## Recovery / rollback
Application rollback is to keep `PILOT_OFFLINE_SYNC_ENABLED` disabled and stop accepting sync commands.

The table is additive and should be retained if any receipt has been written, because deleting it can re-enable duplicate mutation on later retries. Physical removal is therefore not part of this change and would require a separately reviewed destructive/archival change.

No staging or production apply is authorized by this plan.
