# training-compliance-nr20-modality-repair-0531

## Objective

Complete the reviewed NR-20 modality outcome of Schema V2 change `training-compliance-matrix-alignment-0526` without deleting or recreating existing Compliance requirements.

## Incident evidence

Production application of 0526 in GitHub Actions run `37231357958` applied and ledgered the reviewed change, but its specialized post-validation failed at `nr20-missing expected=0 found=4`.

Read-only inspection showed four pre-existing active tenant-6 NR-20 function requirements:

- Mecânico;
- Auxiliar de Manutenção;
- Auxiliar de Suprimentos;
- Supervisor de Suprimentos.

All four retained `modalidade_requerida = NULL`.

The 0526 change intentionally preserved active target function rules and then used `INSERT OR IGNORE` to create any missing rules with `modalidade_requerida='HIBRIDO'`. The active unique key does not include modality, so those existing rows suppressed the inserts and retained their previous null modality.

NR-35, NR-26, AVSEC and the specific-condition catalog were checked read-only after the failed postcondition and were already aligned with the reviewed 0526 outcome.

## Forward change

Update only active, non-deleted tenant-6 NR-20 `FUNCAO` requirements for the exact reviewed 0526 audience so that `modalidade_requerida='HIBRIDO'`.

The repair:

- preserves existing requirement ids;
- creates no new requirement rows;
- creates no LMS enrollment, completion, qualification history or designation;
- does not alter qualification validity or duration metadata;
- does not touch another tenant;
- does not broaden the reviewed NR-20 audience.

## Preconditions

Production execution requires:

1. the canonical Schema V2 baseline is active;
2. `training-compliance-matrix-alignment-0526` is ledgered exactly once;
3. `training-compliance-nr20-modality-repair-0531` is not yet ledgered;
4. the tenant-6 active NR-20 model exists exactly once;
5. the four reviewed active target functions and their four active NR-20 function requirements exist;
6. all four currently require repair because they are not yet `HIBRIDO`.

Staging requires 0526 to be present in its migration ledger and permits the target rows to be already correct, making 0531 a safe idempotent no-op there.

## Validation

After application:

- the 0531 governance ledger entry exists;
- the reviewed target function count remains four;
- exactly four active reviewed NR-20 function requirements remain;
- zero reviewed target requirements are missing `HIBRIDO`;
- the complete 0526 production/staging postcondition suite passes, restoring the gate that failed in run `37231357958`.

## Rollback / compensation

Forward-only. Do not restore a D1 snapshot over newer unrelated data. If the reviewed NR-20 modality decision changes later, create a new governed compensating Schema V2 change.

The official production workflow must capture a D1 Time Travel recovery point before the write.
