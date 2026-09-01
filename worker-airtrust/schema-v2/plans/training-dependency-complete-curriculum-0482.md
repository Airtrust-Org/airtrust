# Schema V2 plan — Training Dependency Complete Curriculum (0482)

## Change
`0482_training_dependency_complete_curriculum.sql`

## Objective
Correct the follow-up behavior of the training-dependency planning introduced by 0481 without rewriting the already-applied 0481 migration.

A dependency-generated `treinamentos_planejados` row is a durable qualification-level obligation and audit anchor. It must not be treated as a one-session simulator plan. The current Simulator Planning V2 pipeline resolves the complete current curriculum from `modelos_sessao`, preserves curricular order, pairs compatible Periodic/Semiannual sessions, and schedules every remaining session.

0482 makes that contract explicit in dependency snapshots:

- `materialization_strategy = TRAINING_PLAN_REQUIRED`;
- `curriculum_model_ids` contains every active session model for the destination qualification in curricular order;
- `curriculum_total_sessions` records the complete count;
- `participants[0].session_model_ids` is enriched from one model to the complete active curriculum.

## Existing open obligations
The migration updates only open dependency-generated simulator obligations. It does not create qualifications, training completions, participants, or historical backfill. Finalized/cancelled rows are not rewritten.

## Future obligations
An `AFTER INSERT` trigger enriches every future dependency-generated planning seed created by the 0481 dispatcher. The trigger is tenant-scoped through the new row's `empresa_id` and destination qualification and only uses active, non-deleted `modelos_sessao`.

The persisted snapshot is descriptive/auditable. Simulator Planning V2 remains authoritative for resolving the complete current curriculum at proposal time so later reviewed curriculum changes do not leave the planner using a stale one-session snapshot.

## Materialization safety
Runtime code fails closed when a raw dependency seed reaches direct CAE materialization. It returns `TRAINING_PLAN_REQUIRED` instead of silently materializing the first model. The seed must first be expanded by Simulator Planning V2 into all remaining curricular sessions.

## CAE time selection
The same release adds an explicit training-quality preference after CAE availability is uploaded:

1. business hours (`08:00–18:00`);
2. other daytime hours (`06:00–22:00`);
3. night/cross-midnight only as fallback.

Expiry, equipment, roster eligibility, no-overlap and curricular ordering remain hard constraints. The time-of-day policy is a preference among otherwise eligible slots, never a reason to schedule beyond a deadline.

## Safety posture
- No change to historical `qualificacoes_historico`.
- No retroactive training creation.
- No tenant-crossing query.
- Existing completed/cancelled dependency plans remain untouched.
- Active model resolution is deterministic by `ordem_no_treinamento`, then model id.
- Direct partial materialization of a dependency seed is fail-closed.
- Remote execution remains separately governed.

## Validation
Tests must prove:

- dependency planning resolves every current session model, not only the first one;
- direct raw dependency-seed materialization is rejected with `TRAINING_PLAN_REQUIRED`;
- the scheduler prefers business hours over night even if the night slot is later;
- daytime outside business hours beats night;
- night remains usable when no compatible daytime option exists;
- existing roster, deadline and pairing constraints remain enforced.

## Recovery / compensation
The reviewed rollback drops only `trg_training_dependency_plan_enrich`. Snapshot enrichment already written to open obligations is intentionally retained because it is non-destructive metadata and removing it would recreate the partial-curriculum hazard.

If production behavior must be disabled, use `scripts/rollback/0482_training_dependency_complete_curriculum.sql` through the governed schema-change process. No generated training or historical qualification data is deleted.
