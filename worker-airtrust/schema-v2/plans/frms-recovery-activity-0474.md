# FRMS Recovery Activity V1 — Schema V2 Plan

## Change
`0474_frms_recovery_activity_v1.sql`

## Purpose
Add tenant-scoped, additive persistence for classifying days with no SIGVOOS flight activity and for storing evidence of physiological recovery.

## Safety posture
- No existing FRMS table is altered.
- No canonical effectiveness score is changed.
- `effectiveness_delta_pct` is constrained to NULL in V1.
- A no-flight day is never automatically classified as rest.
- Unknown activity remains explicitly UNKNOWN.
- A crew report that a flight occurred but is absent from SIGVOOS is stored as `FLIGHT_NOT_IN_SOURCE`; it never becomes recovery evidence and must remain a source-quality discrepancy.
- Numerical recovery credit is deferred until longitudinal calibration against sleep, KSS and readiness/PVT data.

## Data model
1. `frms_recovery_activity_day`
   - one active classification per employee/day;
   - differentiates off-duty, home/hotel standby, onsite standby, administrative/training, duty travel, mixed, other, reported SIGVOOS source gap and unknown;
   - records whether immediate callout was required and approximate duty interval.

2. `frms_recovery_activity_segment`
   - optional segments for mixed days;
   - preserves a concise timeline without creating a full timekeeping system.

3. `frms_recovery_assessment`
   - stores the evidence state UNKNOWN/LIMITED/PARTIAL/STRONG/CONFIRMED;
   - links sleep/check-in/readiness evidence;
   - stores consecutive qualifying recovery nights;
   - does not allow a numerical effectiveness modifier in V1.

## Runtime follow-up
- The fatigue check-in should ask for the previous day's activity only when SIGVOOS has no flight hours for that employee/day.
- The activity prompt must include `Houve voo, mas não aparece no sistema`; that answer maps to `FLIGHT_NOT_IN_SOURCE`, keeps recovery UNKNOWN and opens a data-quality discrepancy instead of granting recovery.
- SIGVOOS remains canonical for flight time, sectors and landing counts.
- REDEMET/METAR remains canonical weather evidence for configured aerodromes/stations.
- Recovery V1 is evidence/observability only; promotion into the canonical effectiveness formula requires a separately governed model revision.

## Rollback
Application rollback is sufficient because the schema is additive and inert until runtime code writes/reads it. Destructive schema cleanup, if ever required, must be a separately reviewed operation after confirming no retained audit evidence is needed.
