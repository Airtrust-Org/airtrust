# Schema V2 plan — Training Dependency Planning (0481)

## Change
`0481_training_dependency_planning.sql`

## Objective
Create a generic, tenant-scoped relationship between a completed source qualification and a future destination simulator-training obligation.

The first approved rule is for `empresa_id = 6`:

- source: AW139 Periódico, qualification `G1` (`qualificacoes_tipos.id = 33`);
- destination: AW139 Semestral, qualification `G1-SEM` (`qualificacoes_tipos.id = 106`);
- interval: 6 months;
- effective from: `2026-08-31`.

A completion before the effective date is not eligible, and the migration performs no historical backfill. Existing completed training records remain unchanged.

## Generic configuration
`treinamento_dependencias` stores:

- tenant (`empresa_id`);
- source and destination qualification type IDs;
- configurable interval in months (`1..60`);
- start/end effective dates;
- active flag and audit timestamps.

The relation is intentionally data-driven. A future 7-month or other equipment rule requires a reviewed configuration row, not a code fork.

Tenant guard triggers fail closed if either qualification type belongs to another company.

## Materialization behavior
When `qualificacoes_historico` is inserted as `CONCLUIDA` or transitions to `CONCLUIDA`, the database checks active dependency rules for that exact tenant/source/date and writes one idempotent row to `treinamento_dependencia_eventos`. A single dispatcher trigger owns materialization, avoiding divergent logic between INSERT and UPDATE completion paths.

For each eligible event it creates, idempotently:

1. one `treinamentos_planejados` destination proposal;
2. one participant link for the employee;
3. one simulator-planning audit record.

The planning key is deterministic:
`DEPENDENCIA:<rule_id>:<source_history_id>:<employee_id>`.

The target date is the source completion date plus `intervalo_meses`, clamped to the last valid day of the target month. Example: `2026-08-31 + 6 months = 2027-02-28`.

The proposal remains in the existing simulator-planning workflow (`planejamento_origem = SIMULADOR_QUINZENA`, status `PROPOSTO`). The current preservation flag `planejamento_editado_manualmente = 1` is deliberately reused as a recalc lock so the generic recalculation routine cannot delete or replace the dependency-anchored obligation before operational review. The snapshot and audit record explicitly identify `TRAINING_DEPENDENCY` as the generator.

If the completed source qualification is later date-corrected, the dependency event is updated idempotently. The hard deadline is recalculated from the corrected completion date. If the proposal still has the original automatic date, that date moves with the corrected deadline. If a human has already changed the proposed date, the human date is preserved; when it now falls after the corrected deadline the record receives an explicit conflict observation and audit entry.

No simulator, instructor, CAE slot, or final approval is assigned by the trigger. Existing approval/revalidation rules still apply before materialization of simulator sessions.

## Safety posture
- Additive schema: new configuration/event tables, indexes, and triggers only.
- Migration-time preflight fails closed unless company 6 still has `G1` at id 33, `G1-SEM` at id 106, and at least one current destination session model; the approved rule is then post-validated before the migration can complete.
- No UPDATE/DELETE of historical qualification rows.
- No migration-time backfill.
- Idempotent retry behavior through the existing tenant/planning-key unique contract.
- Tenant isolation enforced both in rule configuration and trigger predicates.
- No new public/admin API or RBAC surface is introduced.
- Existing manually planned/operational simulator records are not modified.
- Remote application remains separately governed and is not implied by merging this change.

## Validation
The migration regression test proves:

- a pre-existing completion is not backfilled;
- AW139 `G1 -> G1-SEM` produces exactly one proposal at 6 months;
- month-end clamping (`31 Aug -> 28 Feb`);
- repeated completion updates remain idempotent;
- a completion before `2026-08-31` does not create a proposal;
- another configured relation works with a 7-month interval;
- cross-tenant configuration is rejected;
- a corrected source completion recalculates the derived hard deadline;
- an untouched automatic proposal follows the corrected deadline;
- a human-adjusted proposal date is preserved and flagged if it is now later than the corrected deadline.

## Recovery / compensation
Before any remote apply, capture the normal governed recovery point/backup for the target D1.

If the behavior must be disabled after application, use the reviewed compensation file
`scripts/rollback/0481_training_dependency_planning.sql` through the applicable governed schema-change process. It disables the configured rules and drops the two completion triggers plus the event dispatcher trigger. It intentionally does **not** delete already-created simulator proposals or historical records; those remain auditable and must be handled explicitly if business review requires cancellation.

Dropping the configuration table or deleting generated plans is intentionally excluded from rollback because that would be destructive and should be a separate reviewed schema/data change.
