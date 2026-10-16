# FRMS V3 — KSS prospective field provenance (2026-10-16)

## Cause
The operational check-in accepts an explicit KSS 1–9, otherwise derives KSS from `sleepiness_level`, otherwise stores 5. Legacy `frms_fadiga_checkin.kss_score` does not distinguish these cases. PR #1496 correctly treats retrospective KSS origin as UNKNOWN. A number in D1 alone is not proof that the crew answered KSS.

## Change (forward-only, additive)
Authenticated check-in now derives provenance server-side: `CREW_REPORTED` (explicit KSS in submitted request), `DERIVED` (only sleepiness input) or `DEFAULTED` (neither). Each `CHECKIN_CRIADO` / `CHECKIN_ATUALIZADO` row in existing tenant-scoped `frms_fadiga_evento` includes `kss_field_provenance` and `kss_field_provenance_version=CHECKIN_SERVER_V1`; the same fields are exposed in the submission response and write audit. No new question, no stored score duplicated, no migrations, no change to operational fatigue score, PVT, daily risk, flight decision, historical check-in or FRMS V3 research endpoint.

## Safety and scientific boundary
- `CREW_REPORTED` here means the KSS field was present in an authenticated request. It is **not** proof of a human UI interaction or clinically validated measurement.
- Events are appended per create/update; **missing/failed/ambiguous/legacy event evidence stays UNKNOWN**, never inferred from `report_source` or numeric KSS.
- The event table does not enforce unique ordered submissions per check-in. Any future read must resolve a deterministic latest valid event with tenant + checkin joins, reject ambiguity and account for partial failure. Do not count the event alone as scientific validation.
- Research coorte percentages remain NULL for verified KSS until a privacy-reviewed, authenticated, tenant-scoped reader and prospective sample validation are implemented. No historical backfill.
- Historical real-data studies still require explicit company, fixed 30/60/90-day window, end-month and privacy approval (issue #1476). Current score and operational UI remain unchanged. Staging QA must verify a real create/update transaction and event persistence with an authorized synthetic account before claiming end-to-end success.

## Test contract
Explicit KSS 1/5/9, explicit priority, sleepiness 0/10, default/malformed input, versioned source metadata, no additional sensitive values. For scientific IMA: sleep/wake timeline, KSS/PVT cohort, model calibration, human operational acceptance and SHA-specific release authorization remain separate gates.

https://github.com/Airtrust-Org/airtrust/issues/1476
