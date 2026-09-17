# frms-parametric-v2-0498

## Objective

Activate the reviewed parameterized FRMS V2 for the governed `HELICOPTER_OFFSHORE` profile while preserving the prior immutable revision for audit and keeping the schema additive.

## Data model

- Bootstrap the recovery activity/evidence tables when a selectively migrated environment skipped 0474.
- Add calendar-year rolling fields to `frms_acumulo_rolling`.
- Add recovery-credit, IMC-evidence and V2 flight-hour audit fields.
- Create a new active `FRMS_OPERATIONAL_POLICY_V2` revision by copying the complete effective offshore parameter set, then add the reviewed V2 coefficients.
- Supersede the prior offshore revision only after the new revision and parameters have been created.

## Safety / rollout

- Deploy the V2-compatible Worker and Pages before applying this schema change. The Worker contains a pre-0498 rolling-persistence fallback and treats absent recovery evidence as unavailable.
- The change is tenant/profile governed; profiles other than `HELICOPTER_OFFSHORE` are not activated by this change.
- Existing historical factorization rows remain attributable to their original `config_revision_id` / model version.
- Missing METAR remains incomplete evidence and is never converted to VMC.
- Recovery/HV credits are component-scoped and cannot offset unrelated penalties.

## Apply

1. Verify exact main SHA and successful production release gates.
2. Capture the governed D1 Time Travel recovery point.
3. Validate the active Schema V2 baseline and manifest hashes.
4. Apply `0498_frms_parametric_v2.sql` atomically with the Schema V2 ledger row.
5. Verify the new revision is the sole active `HELICOPTER_OFFSHORE` V2 revision and the prior revision is superseded.
6. Verify recovery tables/new columns exist and run FRMS read-only/smoke checks.

## Rollback / compensation

The physical schema changes are additive and should normally remain in place. If the V2 policy must be withdrawn after a successful apply, deploy a forward compensating governed revision derived from the prior reviewed parameter set rather than mutating historical revision data. If the atomic schema apply itself fails, use the captured D1 Time Travel recovery point under the production recovery procedure.
