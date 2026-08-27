# Production Schema V2 plan — resilient cron state 0451

## Objective

Create the additive durable state required by the already-deployed resilient cron router. Production currently lacks `cron_job_state`, `cron_job_items`, and `cron_job_runs`, so the Worker intentionally falls back to the legacy scheduled handler. This change activates the reviewed resumable-job path without changing SIGVOOS credentials, FRMS authority, schedules, or existing business data.

## Preconditions

- exact production release SHA is current GitHub `main` and explicitly authorized;
- required GitHub gates are green for that exact SHA;
- production D1 schema contract is green;
- baseline `production-d1-baseline-v2-20260714` is ACTIVE;
- change `cron-resilience-state-0451` is absent from `airtrust_schema_changes_v2`;
- `cron_job_state`, `cron_job_items`, and `cron_job_runs` are absent before apply;
- fresh D1 Time Travel recovery point is captured by the governed workflow.

## Reviewed operation

Create only `cron_job_state`, `cron_job_items`, `cron_job_runs` and their reviewed indexes. All DDL is additive and idempotent. There is no backfill and no INSERT, UPDATE, DELETE, FRMS recalculation, SIGVOOS sync, credential change, schedule change, or other business-row mutation in the reviewed SQL bundle.

## Postconditions

- the three cron state tables exist with the reviewed columns and constraints;
- the lease, last-success, pending-item, run-lookup, and outcome indexes exist;
- the exact Schema V2 ledger row matches file hash, plan hash, baseline and production SHA;
- production schema contract remains green;
- subsequent ten-minute/daily cron executions may populate durable job state through normal Worker runtime behavior;
- if any resilient job fails, existing router error handling remains in force.

## Rollback

The workflow captures D1 Time Travel immediately before apply. Because this change is additive, a Worker rollback may leave the tables inert without destructive cleanup. Use D1 Time Travel only for a partial/corrupt schema apply or proven data-impact incident; never improvise DROP statements in production.
