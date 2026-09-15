# Schema V2 plan — Training Program Session Durations (0496)

## Objective
Complete the missing simulator-session durations discovered by the post-production 0495 audit, without changing the training-program workloads or curriculum identities.

The approved operational duration is **120 minutes per session** for AW139 Initial, SK76 Initial and SK76 Semiannual. The correction must make those curricula plannable by the simulator planning engine, which intentionally fails closed when any required session has no positive duration.

## Scope and invariants
- tenant 6 only;
- target programs are `G1:INICIAL`, `G2:INICIAL` and `G2-SEM:SEMESTRAL`;
- exact target cardinality is 12 + 12 + 2 current canonical models;
- only `NULL`, zero or negative `duracao_estimada` values are filled;
- an existing positive value different from 120 aborts the migration instead of being overwritten;
- all 26 target current models must end at 120 minutes;
- resulting totals are AW139 Initial 1440 minutes, SK76 Initial 1440 minutes and SK76 Semiannual 240 minutes;
- no historical qualification or certificate snapshot is rewritten.

## Runtime compatibility correction
The associated runtime change makes “has ever completed this qualification” compatible with legacy imported qualification history. A past realization counts when it has a non-future `data_conclusao` and a recognized realized status (`CONCLUIDA`, `CONCLUIDO`, `RENOVADA`, `VALIDA`, `VÁLIDA`, `VENCIDA` and near-expiry compatibility statuses) or the legacy blank status used by completed-history imports. Planned and cancelled rows do not count.

This preserves the intended lifecycle: **Initial once → Periodic on subsequent renewals**, including employees whose older imported history predates explicit status normalization.

## Rollout
1. Run migration fixture tests, training-program SQL compatibility tests, planning tests, certificate tests, Worker typecheck and relevant E2E.
2. Run production read-only preflight to prove 12+12+2 mappings, the expected missing durations and no conflicting positive duration.
3. Apply 0496 through the governed Schema V2 production workflow with a D1 recovery point.
4. Deploy Worker and Pages from the exact reviewed SHA.
5. Post-check that all three curricula have valid 120-minute sessions and that legacy completed employees resolve to Periodic rather than Initial.

## Rollback
Use the governed D1 recovery point if the data correction itself must be reverted. Do not issue a reverse migration that recreates missing duration values. The runtime compatibility change can be rolled back independently if necessary, without altering historical rows.
