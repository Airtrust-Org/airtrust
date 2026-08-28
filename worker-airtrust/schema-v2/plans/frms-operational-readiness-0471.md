# Schema V2 plan — FRMS operational readiness persistence 0471

## Objective

Persist the brief objective vigilance assessment used by FRMS operational readiness while preserving the existing daily fatigue check-in as the canonical subjective record.

## Scope

Additive only:

- `frms_readiness_assessment`: one active tenant-scoped readiness assessment per employee/reference day, optionally linked to `frms_fadiga_checkin`; same-day re-evaluations soft-delete the previous assessment so the baseline is never double-counted; each assessment snapshots the median reaction-time/lapse-rate baseline from up to the 5 valid sessions strictly before its reference date, plus current-vs-baseline deltas;
- `frms_readiness_vigilance_trial`: raw per-stimulus outcomes for auditability and later scoring recalculation;
- indexes scoped by `empresa_id`.

The migration does **not** alter existing FRMS fatigue scores, operational status, FRAT logic, employee data, or historical check-ins.

## Tenant and security invariants

All application reads/writes must bind `empresa_id` from authenticated tenant context. A `funcionario_id`, `checkin_id`, or `assessment_id` received from a client is never sufficient on its own to select or mutate a row.

Raw trials are operational FRMS data and must follow the same authorization boundary as fatigue check-ins.

## Rollout

1. Validate SQL locally against the current Schema V2 baseline.
2. Merge only after required CI gates are green.
3. Apply only through the governed Schema V2 workflow for the authorized environment/SHA.
4. Validate table/index existence and tenant-isolation tests before enabling write traffic.

No remote migration is authorized by creation of this plan.

## Rollback / compensation

Preferred compensation is to disable the readiness write/read path and retain the additive tables for forensic/audit continuity.

Dropping the tables would destroy collected assessment data and therefore requires a separate explicit data-governance authorization; it is not an automatic rollback step.

## Postconditions

- both tables exist;
- unique person/day and check-in constraints are active;
- trial sequence uniqueness is active per tenant/assessment;
- existing `frms_fadiga_checkin` rows and behavior are unchanged.
