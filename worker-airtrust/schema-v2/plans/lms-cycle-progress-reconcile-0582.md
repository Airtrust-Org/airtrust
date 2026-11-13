# AirTrust LMS — Schema V2 0582: two stale cycle progress snapshots

## Scope and provenance
Issue #2215, master #776; owner authorized production correction. D1 tenant 6 only.
The code-level prevention was merged in PR #2253 at b505dd1fef370f08eea7d6ac231767f1db45609f.
Run 0582 ONLY after the official Worker+Pages release containing PR #2253 is live.
This bundle is a one-time data reconciliation, not a schema model change.

## Reviewed exact snapshots
- Enrollment #1390 / PPTX course #22 / employee #3 is EM_ANDAMENTO 2%, start 2026-11-13 01:43:21, current cycle #2671 is NAO_INICIADO 0% with no start. Set cycle to EM_ANDAMENTO 2% and that same start time.
- Enrollment #2057 / SCORM course #68 / employee #35 is EM_ANDAMENTO 5%, current cycle #2305 is EM_ANDAMENTO 2%. Only raise its cycle to 5%.
- Enrollment #385 / SCORM course #34 / employee #88 is EM_ANDAMENTO 58%, current cycle #508 is EM_ANDAMENTO 100%. DO NOT CHANGE the cycle or interpret its 100% as course completion. This snapshot is an essential precondition and regression guard.

## Safety contract
- Precondition requires exactly three known tenant-scoped enrollment/cycle snapshots.
- Fail-closed JSON precondition and postcondition, with no fallback; D1 official file batch and immutable Schema V2 ledger.
- Two append-only audit_logs records with old and new values, action LMS_CYCLE_PROGRESS_RECONCILED_0582.
- Change only status/progresso_pct/data_inicio/updated_at of cycle 2671 and progresso_pct/updated_at of cycle 2305; leave 508 and all other rows untouched.
- Preserve score_final, tentativas, qualificacao_historico_id, SCORM CMI/suspend_data, assessment, status terminal, course, employee, certificate and qualification history.
- Only the governed apply-schema-change-v2.yml runner may apply after eight official gates, production schema baseline check and D1 Time Travel recovery point. Never run SQL manually on production.
- If any state drifts (learner activity, new cycle, tenant, data), abort and re-review; do not force-write or retry blindly.

## Local proof / postflight
Run test scripts/schema-v2/__tests__/lms-cycle-progress-reconcile-0582.test.mjs with Node 24 SQLite (positive, preflight-drift and idempotency denial).
Review hash-bound manifest; CI 8/8.
After official apply, read production D1 company 6 to confirm #1390/#2671 2% EM_ANDAMENTO; #2057/#2305 5% EM_ANDAMENTO; #385/#508 still 100% EM_ANDAMENTO, no qualification created; exactly two new audit records, ledger applied once.
If readback fails, preserve the Time Travel bookmark and investigate recovery before further writes.
