# Production D1 schema contract

`production-d1-baseline-v2.json` is the governed contract between the AirTrust
runtime/CI and the **real** production D1 schema. It exists because the July 2026
audit proved that the production schema diverges materially from both the
`d1_migrations` ledger and `DATABASE_SCHEMA.md` (see
[`../production-schema-snapshot-20260714/README.md`](../production-schema-snapshot-20260714/README.md)).

The contract has two independent jobs:

| Job | Checked against | Runner |
|---|---|---|
| **Structure** — the 13 scoped tables still have the columns/indexes the runtime relies on | a read-only production snapshot (or a stored structural snapshot) | `check-schema-contract.ts --production` / `--snapshot` |
| **Provenance & staleness** — no Schema V2 change landed in the repo without the contract being reconciled | the repository tree only (no DB) | `check-schema-contract.ts --staleness` and `check-contract-staleness.mjs` |

A snapshot can match the 13 scoped tables perfectly while the contract is still
**stale** against newer Schema V2 work. That is exactly the gap HEALTH P1-07 /
[issue #485](https://github.com/Airtrust-Org/airtrust/issues/485) closed.

## What the contract asserts — and what it deliberately does not

- `scoped_tables`, `tables{}`, `schema_hash` are **PRODUCTION_CONFIRMED** for the
  13 simulator-session / `d1_migrations` tables, and **only** as of
  `provenance.snapshot_generated_at`.
- Every other table is **not** asserted as production truth. A migration or
  Schema V2 file existing in the repo is never, by itself, evidence that it is in
  production. `prohibited_assumptions` encodes this.
- `runtime_critical_uncovered` lists tables that *should* eventually get a
  verified structural rule but cannot yet, because no authorized read-only
  production snapshot covers them. Each entry names what it is blocked on.

## Provenance states

`provenance.state_definitions` is authoritative. Summary:

| State | Meaning |
|---|---|
| `REPO_EXPECTED` | DDL is in the repo. No claim about any live database. |
| `STAGING_APPLIED` | Applied + verified on staging D1. Needs an in-repo `evidence` pointer. |
| `PRODUCTION_CONFIRMED` | Observed in production read-only, or an ACTIVE `airtrust_schema_changes_v2` row. Needs an in-repo `evidence` pointer. |
| `REMOTE_APPLY_PENDING` | A reviewed manifest wires it for `Apply Schema Change V2`, but the dispatch has not run / is not confirmed here. **Preparation is not application.** |

`0487` being *prepared and governed* is `REMOTE_APPLY_PENDING`, not applied.
`0483`–`0486` likewise.

## The staleness guard

`scripts/schema-contract/check-contract-staleness.mjs` (also `npm run
guard:schema-contract-staleness`, also `--staleness` on the main checker) fails
CI when any of the following is true:

1. a `*.sql` under `worker-airtrust/schema-v2/changes/` has no entry in
   `schema_v2_since_baseline` (`STALENESS_UNCLASSIFIED_CHANGE`);
2. an entry's `sha256` / `targets` no longer match the file
   (`STALENESS_CONTENT_DRIFT`, `STALENESS_TARGET_DRIFT`);
3. `staleness_guard.schema_v2_digest` does not recompute from disk
   (`STALENESS_DIGEST_MISMATCH`);
4. a change's DDL touches a `scoped_tables` table but the entry is not
   `REFLECTED_IN_CONTRACT` (`STALENESS_SCOPED_TABLE_CHANGED`) — this forces a
   real `tables{}` / `relevant_indexes` / `schema_hash` update;
5. an entry claims `REFLECTED_IN_CONTRACT` for a table not in `scoped_tables`
   (`STALENESS_FALSE_COVERAGE`);
6. a reviewed manifest exists but `governance_state` is `REPO_EXPECTED`
   (`STALENESS_GOVERNANCE_FLOOR`);
7. an `APPLIED` state has no existing `evidence` file
   (`STALENESS_MISSING_EVIDENCE`);
8. an entry references a file that is not on disk (`STALENESS_ORPHAN_ENTRY`);
9. `coverage` / `governance_state` use a non-canonical value
   (`STALENESS_INVALID_ENUM`).

## Reconciling the contract when you add a Schema V2 change

1. Add the reviewed SQL under `worker-airtrust/schema-v2/changes/`.
2. Run `npm run guard:schema-contract-staleness`. It prints the calculated
   digest and every unmet requirement.
3. Add one entry to `schema_v2_since_baseline` with `change_file`, `sha256`,
   `targets` (the DDL tables, minus scratch/guard tables), `domain`, `coverage`,
   `governance_state`, `reviewed_manifest`.
4. If the DDL touches a scoped table: update `tables{}` / `relevant_indexes`,
   regenerate `schema_hash` from a fresh snapshot, and set `coverage` to
   `REFLECTED_IN_CONTRACT`.
5. Update `staleness_guard.schema_v2_digest` to the calculated value and bump
   `last_reconciled_at` / `last_reconciled_against`.
6. `npm run guard:schema-contract-staleness` and
   `npx vitest run src/__tests__/schema-contract/` must pass.

## Refreshing the structural half (needs authorization)

Regenerating `schema_hash` / the structural snapshot requires an approved
read-only production window (`wrangler d1 execute airtrust-db --env production
--remote` with **SELECT/PRAGMA only**). Until then, structural coverage stays at
the July snapshot and `runtime_critical_uncovered` items remain
`OPS-PROOF-PENDING`. See
[`P1-07-coverage-and-staleness-closure.md`](./P1-07-coverage-and-staleness-closure.md).
