# controle-voos-leg-operational-weights-0501

## Objective

Persist the operational weight breakdown required by the Pilot App/RDV for each flight leg without inventing average aircraft weights, and expose the exact empty weight from the aircraft cadastro.

## Data model and semantics

- Add `peso_vazio` and `unidade_peso` to `aeronaves`.
- Add per-leg `peso_passageiros`, `peso_bagagem`, `peso_tripulacao`, `peso_vazio`, `peso_total`, `unidade_peso` and `observacoes` to `cv_voo_etapas`.
- Keep the existing `payload` field canonical in kilograms; the Pilot App converts it to the selected operational weight unit only for total-weight calculation.
- `peso_total` is derived from exact aircraft empty weight + crew + passengers + baggage + payload + initial fuel, with explicit unit conversion.
- The final fuel of one leg must equal the initial fuel of the next leg; the application enforces this both locally and during offline sync.
- Do not backfill aircraft empty weight from model averages. Existing aircraft remain NULL until an authorized user enters the exact value.
- Ensure Costa do Sol (`empresa_id=6`) has the active `PETROBRAS` flight-nature catalog entry.

## Safety / rollout

- The schema change is additive and tenant isolation is unchanged.
- Apply Schema V2 0501 before deploying the Worker that selects the new columns. The currently deployed Worker does not depend on them, so schema-first is backward compatible.
- No remote ad-hoc SQL is allowed. Use the governed Schema V2 workflow with exact SHA, manifest hashes, recovery point and ledger.
- Existing operational records are preserved; no destructive update or data rewrite is performed.
- Aircraft empty weight is intentionally not guessed. Until an aircraft has its exact empty weight and unit configured, Pilot App total weight remains unavailable.

## Apply

1. Verify the exact main SHA and all eight required GitHub Actions release gates.
2. Capture the governed D1 recovery point.
3. Validate the Schema V2 baseline, SQL hash and plan hash.
4. Apply `0501_controle_voos_leg_operational_weights.sql` atomically and record the Schema V2 ledger entry.
5. Verify the new columns on `aeronaves` and `cv_voo_etapas`, plus the active tenant-6 `PETROBRAS` nature row.
6. Deploy the compatible Worker/Pages through the official release workflow.
7. Validate a real multi-leg Pilot App draft: stage tabs, exact aircraft empty weight, total-weight calculation and final-fuel → next-initial-fuel continuity.

## Rollback / compensation

The physical columns are additive and should normally remain after an application rollback. Revert application use through a forward code change. If the Petrobras catalog row later requires a semantic change, use a reviewed tenant-scoped forward Schema V2 change rather than deleting it ad hoc. If atomic schema application fails, restore via the captured D1 recovery point.
