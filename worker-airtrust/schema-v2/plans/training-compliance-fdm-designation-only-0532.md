# training-compliance-fdm-designation-only-0532

## Objective

Align tenant-6 Training Compliance with the Training Manager decision that `FDM-EAD` is required only for employees formally designated to the FDM/HFDM team.

## Cause

The reviewed matrix reconciliation currently keeps a broad function audience for `FDM-EAD` (including CTM, Maintenance, flight crew and safety roles) and uses `FDM_EQUIPE` only as an exception. A real employee review on 2026-10-05 showed that this broad rule creates enrollments for people who are not members of the FDM team.

The current operational decision is narrower and more specific: FDM, LOSA, eDB and similar program-specific training are designation-based.

## Forward change

For tenant 6:

1. deactivate every active `FDM-EAD` requirement that is not tied to the active `FDM_EQUIPE` condition;
2. preserve an existing active `FDM_EQUIPE` conditional requirement;
3. create that conditional requirement only if it is missing;
4. do not create, cancel or modify LMS enrollments in this schema change;
5. do not alter completion evidence or qualification history.

A separate governed enrollment reconciliation must run only after this matrix change is integrated and applied.

## Preconditions

- the canonical Schema V2 baseline is active;
- `training-compliance-matrix-alignment-0526` is ledgered;
- the active tenant-6 `FDM-EAD` qualification exists exactly once;
- active `FDM_EQUIPE` condition exists exactly once;
- this change is not yet ledgered.

## Postconditions

- exactly one active tenant-6 `FDM-EAD` qualification remains;
- exactly one active `FDM_EQUIPE` condition remains;
- at least one active `FDM-EAD` requirement exists for `FDM_EQUIPE`;
- zero active `FDM-EAD` requirements exist without `FDM_EQUIPE`;
- no LMS enrollment is written by the schema change.

## Rollback / compensation

Forward-only. Do not restore an old D1 snapshot over newer unrelated data. If the FDM applicability decision changes, create a new governed compensating Schema V2 change. The official production workflow must capture a D1 Time Travel recovery point before apply.
