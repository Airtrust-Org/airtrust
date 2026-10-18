# AirTrust Schema V2 0563 — Pilot Offline Fueling Identity

**Status: REVIEW-ONLY, DO NOT APPLY.** A migrated table is necessary before
the associated Worker runtime may be deployed. There is no trusted-main
workflow allowlist or authorization for 0563 at this checkpoint.

## Root cause and physical contract
The Pilot app sends cumulative, versioned RDV snapshots. Operation receipts
identify the command, not its individual fueling records. A new valid
client_operation_id with a fresh RDV version previously inserted the same
fueling again. Add a nullable client_local_id to cv_voo_abastecimentos,
unique per (empresa_id, voo_id, client_local_id) including soft-deleted
fuelings. Keep historical/manual entries NULL: never guess identity or
backfill. Prevent client IDs being changed after acceptance.

## Atomic behavior
The Worker looks up only a previously recorded client_local_id in the same
tenant and flight. The same identifier with identical evidence is skipped
without adding a row. A changed payload for a previously accepted identifier
returns HTTP409 before writing the new RDV snapshot and directs the user
to Coordination. Independent fuelings with equal supplier, volume, timestamp
and invoice but different client IDs remain distinct. The existing flight
and RDV CAS, receipt integrity, D1.batch transaction and unique index are
preserved. DB constraint failure must never bypass transaction rollback.

## Preflight
Verify versioned original 0438 table, nullable column absent, new index
and triggers absent, FK and tenant guard invariants, Schema V2 ledger
baseline production-d1-baseline-v2-20260714, hashes of this SQL/plan and
source SHA. Confirm eight exact GitHub gates, reviewed change_id, approved
staging database UUID, exclusive lock and verified D1 Time Travel bookmark.
Do not dispatch via ad-hoc Wrangler, desktop terminal, or legacy migrations.

## Testing and staging order
Miniflare synthetic D1 suite must prove two distinct accepted operations
with the same physical client identity produce ONE row and TWO receipts;
changed identity payload yields 409 with zero write; different identifiers
but identical values yield TWO rows. Cross-tenant, stale CAS, lost reply,
idempotent retry and stage delete protections must remain green.

Once 0563 is reviewed/authorized and its entrypoint integrated into trusted
main, apply via governed Schema V2 workflow, verify one ledger entry, exact
hashes, one nullable column, unique partial index, two immutable guards, no
change to old row counts, FK check and protected tenant boundaries. Only
then stage Worker/Pages built from the exact approved SHA and test real
offline vault/outbox/iPad and Android journeys. No production promotion
without staging proof and exact release authorization.

## Recovery
Disable PILOT_OFFLINE_SYNC_ENABLED if postconditions fail; preserve already
accepted identities and receipts. Never DROP the index or reset event IDs
after operational use. Any destructive recovery requires independently
authorized compensation and Time Travel provenance.
