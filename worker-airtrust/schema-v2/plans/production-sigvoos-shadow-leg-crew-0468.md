# Production Schema V2 plan — SIGVOOS shadow leg crew 0468

## Objective

Create the additive tenant-scoped `sigvoos_shadow_leg_crews` schema in production. This extends the shadow comparison model only and does not write FRMS operational tables or activate shadow data.

## Preconditions

- `0467` schema is present and validated;
- exact production release SHA is current GitHub `main` and explicitly authorized;
- GCB is green for that exact SHA;
- production D1 schema contract is green;
- baseline `production-d1-baseline-v2-20260714` is ACTIVE;
- change `sigvoos-shadow-leg-crew-0468` is absent from `airtrust_schema_changes_v2`;
- fresh governed production recovery point/backup evidence exists.

## Reviewed operation

Create only `sigvoos_shadow_leg_crews`, UNIQUE active identity index `(empresa_id, leg_id, crew_identity_key)`, and funcionario lookup index. No backfill or SIGVOOS sync is included.

## Postconditions

- table exists with required tenant/leg/crew keys;
- active identity index is actually UNIQUE and covers the expected columns in order;
- funcionario lookup index exists;
- exact Schema V2 ledger row matches reviewed hashes/baseline/SHA;
- production schema contract remains green.

## Rollback

Capture D1 Time Travel immediately before apply. Application rollback leaves the additive table inert. Restore the recovery point only for partial/corrupt schema apply; destructive cleanup is a separate governed action.
