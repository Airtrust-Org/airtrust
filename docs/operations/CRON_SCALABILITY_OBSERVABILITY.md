# Cron scalability, rate limiting and Worker observability

Base reviewed: `c3259a7967412c4a4219beba095f4b5515fb71b9`.

## Job map

| Block | Trigger | Scope / potential volume | Error isolation | Resume / idempotency | Regulatory or operational impact |
|---|---|---|---|---|---|
| Daily alerts | `0 8 * * *` | global orchestration | handler-level | existing deterministic alerts | qualification compliance visibility |
| LMS deadline reminders | daily and 08h window | keyset by enrollment, 100 discovery / 100 processing | item ledger | cursor + deterministic notification ID | training completion |
| EAD automatic renewal | every 10 min and daily | keyset by qualification history, 100 discovery / 50 processing | item ledger; duplicate enrollment does not abort batch | cursor + durable item + unique-key repair | qualification renewal; validity contract remains external to this PR |
| SIGVOOS dispatch | every 10 min | 25 tenants per page | tenant lease | tenant cursor, one operational day at a time | FRMS source completeness |
| SIGVOOS ingest | configured UTC hour per tenant | one tenant/day | tenant lease and persisted failure event | watermark and staged FRMS handoff | FRMS source completeness |
| FRMS reprocess | after SIGVOOS | 25 crew items per batch | item-level | durable queue | fatigue calculations |
| Domain events | every 10 min | 25 active tenants × 7 modules; 50 events/module | module and tenant errors continue | tenant keyset cursor; cycle reset only after final page | cross-module consistency |
| Cron health | every 10 min and daily | max 250 state scopes | read-only | n/a | detects delayed, partial or stalled jobs |
| Backups | 03h daily, 04h Sunday, 05h first day | global | legacy handler | orchestrator contract | recovery capability |
| Qualification notifications | daily legacy block | all active tenants/configurations | tenant loop continues | notification log prevents recent duplicates | regulatory warning delivery |
| SGSO in-app queue | daily legacy block | 100 oldest pending rows | row-level | queue status / retries | safety reporting |
| SGSO SLA enqueue | daily legacy block | overdue reports and barriers | block-level | existing duplicate checks | safety SLA |
| Daily FRMS checks | daily | global audit + active crew | sub-block errors continue | existing deterministic alerts | operational safety |
| Weekly qualification summary | Monday daily execution | current qualifications ≤90 days | block-level | daily notification | compliance summary |
| Stats, latency aggregation and purge | daily legacy execution | global aggregate / configured tables | table/block-level | daily keys / age predicate | operational housekeeping |

The ten-minute trigger no longer invokes the broad legacy maintenance handler. It runs only bounded resilient jobs and the health snapshot. Non-resilient backup triggers remain delegated unchanged; daily generic maintenance remains delegated once per day.

## Cursor and lease model

State is stored in the existing migration `0451_cron_job_resilience_state.sql`:

- `cron_job_state`: one row per job/scope, cursor, watermarks, current lease and aggregate success/failure state;
- `cron_job_items`: deterministic item ledger with attempts, retry availability and terminal status;
- `cron_job_runs`: execution history with outcome, duration, counts and cursor transition.

Leases are owner-guarded and expire. Checkpoints only succeed for the current owner while the lease is valid. Processing errors in one tenant do not prevent later tenants from running.

## Subrequest budget

The runner uses explicit preventive limits:

- D1 operations: 700 per execution;
- external calls: 20 per execution;
- D1 reserve: 30 operations;
- external reserve: 2 calls.

The limits are intentionally below platform ceilings and reserve capacity for checkpoint, run finalization and lease release. Each run records planned, executed, remaining and stop reason. Bounded jobs checkpoint before the reserve is consumed and return `PARTIAL` for the next cycle.

## Rate-limiter degradation

Authentication prefixes (`login`, `auth-*`) are fail-closed:

- only `CF-Connecting-IP` is accepted;
- `X-Forwarded-For` is ignored;
- missing/invalid IP returns a generic `503`;
- D1 failure returns a generic `503` in staging/production;
- no shared `unknown` bucket exists.

Non-critical routes may use the in-memory complementary limiter if D1 is unavailable. Missing IP receives a request-scoped key instead of a global bucket. This behavior is explicitly classified as fail-open-with-local-protection.

## Metric model

Metrics are structured JSON logs because the repository does not currently declare an Analytics Engine binding. The event contract contains only operational fields:

- route template, method, status, latency;
- operation category (`auth`, `upload`, `certificate`, `lms_completion`, `qualification_renewal`, `cron`, `rate_limit`);
- internal scope key when already available;
- error category;
- processed, failed, pending, retry and partial counts;
- D1 operation and external-call counts;
- cursor and preventive stop reason.

The sanitizer drops keys or values that can contain CPF, name, e-mail, tokens, cookies, passwords, certificate content, raw messages or payloads. Query strings and opaque identifiers are not logged.

## Detectable alert signals

The cron health snapshot marks:

- repeated failures;
- expired/stuck lease;
- backlog and exhausted retries;
- delayed job;
- stale `RUNNING` execution;
- cursor without progress;
- tenant scope not progressing.

HTTP metrics expose 401, 403, 429 and 5xx increases to log-based alerting. Rate-limiter unavailability emits a dedicated structured event. Existing structured cron errors remain detectable for EAD enrollment, certificate routes, backups, SIGVOOS divergence and channel failures. No paid external alerting dependency is introduced.

## Administrative status

`GET /api/system/operations/cron` is authenticated and no-cache.

- persisted platform administrators see the global state;
- tenant administrators see only `empresa:<id>` scopes and global ledger items whose internal `empresa_id` matches their tenant;
- raw payloads, error messages, lease owner identifiers and personal data are not returned.

The response includes last execution, success/failure, cursor, watermarks, processed/pending counts, duration, failure code and lease expiry.

## Migration and operations

No new migration is required. Migration `0451` and its governed rollback already provide the required state tables. This change does not apply migrations, access remote data, deploy, create temporary workflows or merge the branch.

## Residual risks

- The daily legacy qualification notification, SGSO SLA, weekly summary, global audit and housekeeping blocks are still daily bounded-by-frequency rather than individually cursorized. They no longer run every ten minutes, but high-volume growth should be split into dedicated durable jobs in a follow-up.
- D1 operation counts for domain-event consumers are conservative accounting estimates because the existing consumer API does not expose its exact internal statement count.
- Analytics Engine can replace or complement log metrics only after an approved binding and retention contract exists.
