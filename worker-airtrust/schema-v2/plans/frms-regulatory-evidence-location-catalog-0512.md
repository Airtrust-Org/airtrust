# frms-regulatory-evidence-location-catalog-0512

## Objective
Close the residual FRMS governance gaps without asserting an undocumented operator decision. The change attaches a controlled, hashable regulatory-source manifest to tenant 6's active `HELICOPTER_OFFSHORE` profile and seeds only the operational locations observed in recent realized Controle de Voos legs.

## Regulatory safety
- The source manifest records RBAC 117 EMD 01, Lei 13.475/2017 and ACT Costa do Sol 2025/2027 traceability.
- `rbac117_appendices` remains an empty array. `appendix_selection_status` is `UNCONFIRMED_OPERATOR_SELECTION`.
- The change does **not** claim an ANAC-accepted GRF/SGRF and does not infer Appendix B or C from the profile name, RBAC 135 status or helicopter/offshore operation.
- B/C-only cumulative rules remain fail-closed until controlled operator-specific evidence is registered.

## Location catalogue
- `SBME`: `AERODROME`, timezone `America/Sao_Paulo`, weather source `REDEMET`, station `SBME`.
- `9PGB`, `9PGS`, `9PGF`, `9PHK`, `9PSS`, `9PUF`: `HELIDECK`, timezone `America/Sao_Paulo`, weather source `NONE`.
- Coordinates are intentionally omitted. They are unnecessary for current FRMS resolution and avoid promoting duplicate/conflicting navigation-source coordinates to meteorological truth.
- Helidecks never fall back to an unrelated aerodrome METAR.

## Provenance
- Source manifest: `docs/regulatory/frms/costa-do-sol-frms-regulatory-source-manifest-2026-09-27.json`.
- Source manifest SHA-256: `c66536dba033f7854e2e1702418d1dbb4d4b45dc59e03dfa4cf949b645ec35cc`.
- Third-party source documents are not committed; their official URLs and reviewed byte hashes are recorded in the manifest.

## Preconditions
1. Production baseline `production-d1-baseline-v2-20260714` is active.
2. This change has not been applied.
3. Tenant 6 has exactly one active `HELICOPTER_OFFSHORE` profile in the expected pre-0512 documentary state.
4. The seven target location codes do not already have active FRMS catalogue rows.
5. Controle de Voos contains the seven observed ICAO codes used as the operational source.

## Postconditions
1. The active regulatory profile points to the controlled source manifest and its exact SHA-256.
2. B/C remains explicitly unselected and GRF/SGRF evidence remains explicitly undocumented/unapproved in AirTrust.
3. Exactly seven active tenant-scoped FRMS location rows exist with the reviewed classifications/timezone/weather policy.
4. No historical journey, flight or check-in row is rewritten.

## Rollback / compensation
The production workflow must create its governed recovery point before apply. If apply or validation fails, restore that recovery point. After a successful release, do not issue ad-hoc remote UPDATE/DELETE statements; any change in appendix selection, GRF evidence or location policy requires a new reviewed forward Schema V2 change.
