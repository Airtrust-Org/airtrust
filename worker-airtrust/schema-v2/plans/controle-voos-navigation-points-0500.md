# controle-voos-navigation-points-0500

## Objective

Create the canonical Controle de Voos navigation-point catalog for Costa do Sol (`empresa_id=6`) from the reviewed Flight Preview waypoint PDF and make origin/destination references searchable by the source aerodrome code or by ICAO code.

## Reviewed source

- Source: `CORDERNADAS.pdf` / Flight Preview Waypoints List, printed 2026-09-17 17:07.
- PDF SHA-256: `8b58d4f279c12548b7aefaefeac4274d559c1e848f7dee005f09f592799d19fd`.
- Extracted CSV: `worker-airtrust/data/controle-voos/waypoints-flight-preview-2026-09-17.csv`.
- CSV SHA-256: `63a6bc6bca8136491ebba1ff2034abb9912311a23a2db764f987ea089377554c`.
- Cardinality: 3,714 source records; 30 zero-coordinate records; 166 records without numeric elevation.

## Data model and semantics

- Add `cv_pontos_navegacao` as the source-preserving canonical catalog with tenant scope, source provenance, DMS and decimal coordinates, elevation, magnetic variation, operational-use and review flags.
- Preserve the source primary identifier in `codigo`; the product UI labels this field **Aeródromo**.
- Store ICAO separately in `codigo_icao`. ICAO tokens embedded in the source name are removed from `nome` after extraction.
- Every extracted ICAO beginning with `9P` is classified as `plataforma`, per the reviewed operational interpretation.
- Synchronize operational landing points into existing `cv_aeroportos` without changing existing IDs, so current `cv_voos` foreign keys remain valid.
- Add indexes for tenant-scoped primary-code and ICAO lookup.
- Do not import records with `00°00'00" / 000°00'00"` into the origin/destination compatibility catalog.

## Application behavior

- Coordination origin/destination lookup accepts Aeródromo, ICAO or name.
- Pilot self-service text input resolves an active tenant catalog item by Aeródromo or ICAO before any temporary fallback is created.
- If one ICAO resolves to multiple active records, self-service fails closed and requires the Aeródromo identifier to disambiguate; no arbitrary row is selected.

## Safety / rollout

- Change is additive; no table rebuild or destructive delete is used.
- All imported rows are scoped to `empresa_id=6` and API reads remain tenant-scoped.
- Existing `cv_aeroportos` IDs are preserved by the tenant/code upsert.
- Post-apply SQL guards verify source cardinality, invalid-coordinate count, missing-elevation count and compatibility-catalog population.
- Apply only through the governed Schema V2 workflow after the exact release SHA is on `main`, all required release gates are green, and an approved recovery point exists.

## Post-apply validation

1. Confirm 3,714 source rows for `FLIGHT_PREVIEW_PDF_2026-09-17` under tenant 6.
2. Confirm 345 rows with `codigo_icao LIKE '9P%'` and all of them have `tipo='plataforma'`.
3. Confirm no imported `nome` still contains its extracted `9Pxx` ICAO token.
4. Confirm `SBME` retains/enriches its existing `cv_aeroportos` ID.
5. Confirm `FPAG` resolves as Aeródromo `FPAG`, ICAO `9PLG`, name `ANITA GARIBALDI`.
6. Confirm tenant isolation and origin/destination lookup by both `FPAG` and `9PLG`.

## Rollback / compensation

The physical schema additions should remain if rollout must be reverted. Disable/revert application use through a forward code change. If imported tenant-6 data must be withdrawn, use a reviewed forward Schema V2 compensation keyed by `fonte='FLIGHT_PREVIEW_PDF_2026-09-17'`; do not issue ad-hoc remote SQL. If the atomic apply itself fails, recover with the captured D1 recovery point under the production recovery procedure.
