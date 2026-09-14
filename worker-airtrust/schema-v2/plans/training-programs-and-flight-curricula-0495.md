# Schema V2 plan — Training Programs and Flight Curricula (0495)

## Objective
Separate the qualification identity from the program used to obtain or renew it.

A single qualification can therefore have distinct **Initial**, **Periodic/Recurring**, **Semiannual**, **Upgrade** or **Specific** programs, each with its own workload and curriculum. Initial is a one-time program; once the employee has completed the qualification, subsequent normal renewals resolve to the recurring program.

## Scope and invariants
- `treinamento_programas` is tenant-scoped and belongs to one `qualificacoes_tipos` row;
- `treinamento_programa_modelos` stores ordered curriculum membership by program and optional cycle;
- current physical session models are resolved by canonical code through `modelos_sessao_versionamento`;
- program workload is authoritative for new planned qualification history and certificates, while the history snapshot remains immutable evidence;
- legacy history is not reclassified or bulk-backfilled because old `tipo_treinamento` values may have been inferred;
- Initial may point to a next recurring program; recurring and semiannual programs point to themselves;
- shared session models are allowed across programs when operationally intentional;
- cross-tenant qualification/program/model references fail closed.

## Initial Costa do Sol seed
- AW139 `G1`: Initial 24 h / 12 sessions and Periodic with the existing C1/C2/C3 rotation;
- AW139 `G1-SEM`: Semiannual program retaining the existing C1/C2/C3 rotation;
- SK76 `G2`: Initial 24 h / 12 sessions and Periodic with the existing C1/C2/C3 rotation;
- SK76 `G2-SEM`: new semiannual flight qualification/program using the existing two SK76 semiannual session models and a +6 month dependency from G2;
- CRM `D3`: Initial 16 h and Periodic 8 h as separate programs under the same qualification;
- every other active VOO qualification receives at least one program based on its current workload metadata.

## Runtime rollout
1. Merge only after migration, route, planning, certificate/history and UI tests pass for the exact SHA.
2. Apply 0495 through the governed Schema V2 workflow before deploying Worker/Pages.
3. Validate Currículos de Voo shows every active VOO qualification program, including AW139 Initial, SK76 Initial and SK76 Semiannual.
4. Validate AW139/SK76 Initial curricula are 12 ordered sessions and recurring curricula still resolve 2026=C2, 2027=C3, 2028=C1.
5. Validate a newly planned Initial writes `tipo_treinamento=INICIAL`, the program id and the Initial workload; its next renewal resolves Periodic.
6. Validate CRM Initial/Periodic certificates use 16 h/8 h respectively from the persisted history snapshot.
7. Production deploy requires an exact-SHA release window and recovery point.

## Rollback
The schema is additive. Runtime can stop reading program tables and fall back to 0493/legacy fields. Existing program rows and history references remain audit evidence. Destructive table/column removal or historical rewriting requires a separate reviewed migration.
