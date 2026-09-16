# training-compliance-aircraft-scope-0497

## Objective

Allow a training compliance rule to be optionally restricted to an aircraft model while preserving the existing organizational scope (company, sector, function, sector+function, or individual).

## Data model

- Add nullable `treinamento_requisitos.aeronave_modelo`.
- `NULL` means the rule applies to every aircraft, preserving all existing rules.
- Non-null values are normalized model labels (for example `AW139` or `SK76`).
- Employee applicability is derived from the existing `funcionarios_aeronaves -> aeronaves` relationship, allowing one employee to match multiple models.

## Safety / tenant

- No existing row is rewritten.
- Existing organizational scope checks and tenant/RBAC controls remain authoritative.
- Application code validates the selected model against an aircraft belonging to the active tenant.
- The unique active-rule index is extended with `aeronave_modelo` so different aircraft models may carry distinct rules for the same organizational scope.

## Apply

1. Capture the governed D1 recovery point required by Schema V2.
2. Validate baseline and manifest hashes.
3. Apply `0497_training_compliance_aircraft_scope.sql`.
4. Verify the new column and indexes.
5. Run compliance route tests, including a dual-aircraft employee.

## Rollback / compensation

This is an additive column change. If application behavior must be reverted, deploy code that ignores `aeronave_modelo`; existing rows remain valid because the column is nullable. A destructive column removal is intentionally not part of routine rollback.
