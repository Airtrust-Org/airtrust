# frms-v2-historical-backfill-0499

## Objective

Restore Costa do Sol historical FRMS continuity by applying the already-reviewed FRMS Parametric V2 policy to the 2026 operational history, without changing any approved coefficient.

## Scope

- Tenant: Costa do Sol Táxi Aéreo (`empresa_id=6`) only.
- Profile: `HELICOPTER_OFFSHORE` only.
- Policy effectivity: from `2026-01-01` onward.
- Historical recalculation ledger: `2026-01-01` through `2026-09-16`.
- Parameters are copied from the active generic `FRMS_OPERATIONAL_POLICY_V2` revision created by 0498.

## Safety

- No physical schema changes.
- No coefficient is hardcoded into runtime calculation logic by this change.
- The generic V2 revision remains active and unchanged for other tenants.
- The tenant revision wins only for empresa 6 by the existing tenant-first resolver.
- Historical derived rows are rebuilt separately by the governed historical-reprocessing workflow after backup, disposable dry-run and D1 Time Travel recovery point capture.
- Recovery credit is recalculated only where historical recovery evidence already exists; missing evidence never creates synthetic credit.

## Apply

1. Deploy the historical-resolution-safe Worker/Pages first.
2. Validate the exact reviewed manifest and production baseline.
3. Verify the Costa do Sol profile assignment and the active generic V2 source revision.
4. Apply 0499 atomically with the Schema V2 ledger row.
5. Verify parameter parity between source V2 and tenant V2.
6. Execute the governed historical backfill for empresa 6 / 2026-01-01..2026-09-16.

## Compensation

The new tenant revision is immutable evidence. If operational rollback is required, restore derived rows using the historical-reprocess ledger and create a forward compensating configuration revision; do not mutate prior revision evidence.
