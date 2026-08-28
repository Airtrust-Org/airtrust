# Schema V2 plan — FRMS PVT-B V2 + Operational Load V1 (0476)

## Change
`0476_frms_pvtb_v2_operational_load.sql`

## Objective
Support two FRMS changes with a single additive migration:

1. **PVT-B V2 baseline isolation.** The vigilance test moves to the published
   PVT-B paradigm (`airtrust-pvtb-v2`). Individual readiness baseline is now
   computed per `protocol_version`, so historical `airtrust-vigilance-v1`
   sessions never contribute to a v2 baseline. A partial index
   `idx_frms_readiness_baseline_protocol` backs that query. The
   `protocol_version` column itself already exists (migration 0472).

2. **Operational Load V1 persistence.** Eight nullable columns on
   `frms_fatorizacao_jornada` store the landings + observed-temperature
   contribution to the canonical effectiveness score
   (`OPERATIONAL_POLICY_V1` — AirTrust internal, versioned, conservative
   coefficients; not ICAO/IOGP prescribed).

## Safety posture
- Additive only: one `CREATE INDEX IF NOT EXISTS` and eight
  `ALTER TABLE ... ADD COLUMN` on an existing table. No table is dropped, no
  column is altered or removed, no row is rewritten.
- New columns default to NULL. The FRMS pipeline backfills them the next time it
  recomputes each journey; stored effectiveness history is not changed by the
  migration itself.
- Recovery tables (`frms_recovery_*`) are untouched; their
  `effectiveness_delta_pct` stays NULL — Operational Load is a separate
  dimension.
- A missing METAR is never stored as 0 °C: `operational_load_temperature_max_c`
  stays NULL and `operational_load_weather_quality = 'INCOMPLETE'`.

## Rollback
Application rollback is sufficient. The index and columns are inert until the
worker writes/reads them. Any later destructive cleanup must be a separately
reviewed operation.
