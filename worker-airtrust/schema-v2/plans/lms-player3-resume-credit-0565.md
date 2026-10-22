# Schema V2 0565 — Player 3 administrative resume credit ledger

## Status and scope

**REVIEW-ONLY candidate. Do not apply to staging or production until a code
review approves this exact SQL and plan hash, the trusted executor verifies a
fresh phase-specific grant, and the staging environment reviewer approves the
run.** This change adds an append-only, tenant-scoped audit ledger and a
transaction-local intent table. It does not update `lms_matriculas`, cycle
records, SCORM state, scores, answers, attempts, qualifications, or certificates.

The ledger can record a position-only administrative equivalence credit after
the worker has verified the encrypted T0/T1 decision, original archive hash,
destination edition, latest source watermarks, manager permission and a
distinct second reviewer. It never represents a lesson event or an assessment
result. The writer must consume its deferred-FK intent in the same D1 batch;
an orphan intent aborts commit. Idempotency is pinned by the immutable Front C
decision key. Update/delete triggers retain every applied decision.

## Required prerequisites

- Same staging database and active Schema V2 baseline `production-d1-baseline-v2-20260714`.
- Exact 0558 Native evidence and 0561 catalog activation changes applied and
  ledgered on this database with their reviewed hashes.
- The version-pinned destination enrollment binding exists for the exact
  tenant, course, matrícula, current cycle and published edition.
- `usuarios_empresas_perfis` confirms an active `GESTOR` manager and a distinct
  active reviewer with an allowed tenant profile. The Worker additionally
  verifies the authenticated reviewer permissions; caller-supplied booleans
  are not authorization.
- The T1 row watermark and SCORM commit time still match the source; the source
  archive and sealed inventory stay in private custody.

Any missing table, drift, inactive cycle, stale watermark, cross-tenant actor,
non-published edition, duplicate decision with different fields or existing
target table is a STOP. Never repair drift ad hoc.

## Apply and recovery

Apply only through the trusted Schema V2 workflow on `main`, for one exact PR
HEAD and this one `change_id`, after SHA-bound review, phase-specific staging
grant, environment approval, clean eight-gate CI, mutex acquisition and a new
D1 Time Travel bookmark. The workflow must verify the manifest and exact SQL
and plan SHA-256 values before apply, pin staging DB UUID, refuse the
production DB, and verify all new tables, index and triggers plus an empty
resume-credit ledger and zero leftover intents afterward.

The change is additive. Do not drop the ledger or its triggers to roll back.
If application or postconditions are uncertain, preserve the Time Travel
bookmark and stop writes; recover only under the reviewed operator procedure.
If a decision is wrong, append a separately reviewed compensating decision;
never edit or delete the original row.

## Local proof

`src/__tests__/migrations/lms-player3-resume-credit-0565.test.ts` exercises
positive scope, dual approval, cross-tenant denial, stale cycle, wrong edition,
position-only constraints, immutable history, uniqueness and unchanged source
enrollment. `src/__tests__/services/lms-player3-resume-credit-writer.test.ts`
exercises one-batch intent consumption and exact idempotent replay. These local
tests do not prove staging application, T0/T1 authenticity, browser acceptance
or production readiness.
