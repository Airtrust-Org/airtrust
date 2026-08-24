# Production Schema V2 plan — SIGVOOS shadow/parallel 0467

## Objective

Create the additive, non-operational SIGVOOS shadow/parallel V1 schema in production using the reviewed Schema V2 path. This does not change the canonical FRMS source, run a SIGVOOS sync, backfill data, or activate any shadow result operationally.

## Preconditions

- exact production release SHA is current GitHub `main` and explicitly authorized;
- GCB is green for that exact SHA;
- production D1 schema contract is green;
- baseline `production-d1-baseline-v2-20260714` is ACTIVE;
- change `sigvoos-shadow-parallel-0467` is absent from `airtrust_schema_changes_v2`;
- fresh governed production recovery point/backup evidence exists.

## Reviewed operation

Create only `sigvoos_shadow_runs`, `sigvoos_shadow_legs`, `sigvoos_shadow_leg_history`, `sigvoos_shadow_comparisons` and their reviewed indexes. All DDL is additive/idempotent. No row backfill or operational FRMS mutation is included.

## Postconditions

- four shadow tables exist;
- required `empresa_id` tenant key is present;
- active leg identity index is UNIQUE;
- comparison/run indexes exist;
- exact Schema V2 ledger row matches file hash, plan hash, baseline and production SHA;
- production schema contract remains green.

## Rollback

Capture D1 Time Travel immediately before apply. For an application regression, roll back Worker/Pages and leave unused additive tables inert. Restore the recovery point only for partial/corrupt schema apply. Never improvise destructive cleanup.
