# controle-voos-flight-justifications-0506

## Objective

Add the governed operational explanation flow for planning deviation requested for Controle de Voos. The Coordination plans departure and arrival/duration; after the pilot records the realized legs, any positive excess of realized flight time over planned flight time must be explained by registered justification codes. Each selected justification carries minutes, and the total must equal the positive deviation before the pilot can finalize the operational RDV.

## Data model

- Add tenant-scoped catalog `cv_justificativas_voo` with code, name, description, active flag and ordering.
- Add `cv_voo_justificativas` linked to one flight and one catalog justification, with explicit positive minutes.
- Keep one canonical row per flight + justification code; repeated offline snapshots update the same row.
- Existing flights are not rewritten and no default justification catalog entries are invented. The operator will register the official codes.

## Application behavior

- Coordination keeps canonical `horario_previsto_partida` and `horario_previsto_chegada`; the UI also exposes a calculated/editable `Tempo total de voo`.
- Editing planned arrival recalculates duration; editing duration recalculates arrival.
- Pilot App displays planned time, realized time and positive deviation.
- If realized time exceeds planned time, the pilot selects one or more registered justifications and assigns minutes to each.
- Finalization is blocked unless the active justification-minute sum equals the positive deviation exactly.
- When realized time is equal to or below plan, no justification is required.
- Justifications are included in the encrypted offline draft and canonical offline-sync snapshot.

## Safety / tenant isolation

Both tables are tenant-scoped. Database triggers reject cross-tenant flight or catalog references. Catalog management remains manager/admin only through the existing Controle de Voos catalog-management RBAC. Pilot sync resolves catalog codes only inside the authenticated tenant.

## Rollout order

1. Verify exact `main` SHA and all eight release gates.
2. Apply 0506 to staging through the governed migration path and validate tables/indexes/triggers.
3. Deploy Worker + Pages to staging from the same SHA.
4. Validate real workflow: plan 01:30, record 01:45, register 15 minutes of justifications, confirm 14/16 minutes block and 15 minutes permits finalization.
5. Production requires a new explicit authorization for the exact SHA, Schema V2 0506, Worker and Pages.

## Rollback / compensation

The schema is additive. On failed apply use the captured D1 recovery point. After successful use, retain the tables during application rollback; older Workers ignore them. Do not drop historical justification rows remotely.
