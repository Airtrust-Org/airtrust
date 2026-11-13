# Production LMS synthetic QA cleanup — Schema V2 0581

## Owner decision and proven production scope

On 2026-11-12 the proprietor explicitly authorized **permanent removal** of all QA LMS synthetic employees except the single canonical employee `QA-LMS-202611`. The owner wants only the QA **test results** retained, not the obsolete synthetic users, enrollments or qualification histories. This explicitly supersedes a prior proposal to soft-delete QA fixtures.

Production tenant 6 was inspected by read-only D1 queries. Exactly 29 QA identities were found; 28 excess test employees have IDs 194–221, linked to user IDs 162–189. The one canonical identity is protected. Production LMS test workflow was temporarily disabled to prevent new provisioning; restore it only after the one-identity implementation is validated.

Affected synthetic records at preflight: 409 LMS enrollments, 409 cycles, 143 SCORM progress, 144 qualification histories, 28 users, 28 membership/profile/invitation rows, 132 generated certificate documents in D1 and R2, 132 pasta virtual records, 415 in-app notifications, 14 notification logs, 326 refresh tokens (volatile). Of 409 enrollment statuses, 80 are CONCLUIDO, 58 EM_ANDAMENTO, 255 NAO_INICIADO, and 16 CANCELADO. These status counts do not independently prove complete pedagogy and certificates.

**Preserved QA results**: `docs/qa/lms-synthetic-production-snapshot-20261112.json` records per-course/status statistics for 52 courses, with zero real PII. Independent browser artifacts remain the authority for actual user-visible pass/fail.

## Preconditions and guards

1. No synthetic worker execution concurrent with this cleanup; disable the production QA workflow until fixed.
2. Current `main` SHA explicitly authorized for this 0581 cleanup; all eight official gates pass, main branch protection intact, Schema V2 baseline active.
3. Read-only preflight `scripts/schema-v2/validate-lms-qa-0581.mjs preflight` confirms exact 28 identities, exact employee/user mapping, tenant 6, canonical user, expected course records, document ownership, valid R2 keys, stable snapshot and zero unreviewed additional references.
4. A valid D1 Time Travel recovery point is captured by `apply-schema-change-v2.yml` immediately before mutation.
5. The protected environment provides both D1 migration and Worker/R2 scoped tokens. Confirm R2 capability via exact-key GET-only preflight before D1 write; never broaden token access or prefix-delete. Upload the exact 132-key manifest as a protected, run-bound GitHub Actions artifact with seven-day retention before any D1 mutation.
6. The SQL file and plan are immutable and hash-bound by Schema V2, with ledger entry bound to the specific `main` commit.

## Apply, R2 and audit policy

All D1 writes are handled by the reviewed Schema V2 executor, not local ad-hoc Wrangler. The fixed 0581 SQL removes only exact 28 synthetic employees/users and their verified dependent domain rows; it never touches the canonical QA employee or any other tenant/employee. Break only the synthetic LMS enrollment/cycle/qualification circular pointers first; no session-scoped deferred-key assumption. Preserve existing technical security audit logs (`audit_logs`, `auditoria`, `auditoria_avancada_v2`) as immutable operational records, not LMS employee histories. No real staff training records are altered.

Immediately after the D1 ledger and postconditions, delete **only** the exact 132 synthetic R2 certificate objects enumerated by authenticated D1 ownership and checked before the write. Validate each key with GET/404 readback. No broad R2 prefix purge. If the original runner fails after D1 commit, dispatch the protected production-lms-qa-r2-resume-0581.yml with original run ID and SHA; it verifies D1 ledger, company scope and immutable source artifact and idempotently retries only the same exact keys.

## Acceptance

- Exactly one active QA LMS employee and its single learner user remain in tenant 6.
- All 28 previous QA employees and 28 accounts are physically absent; zero of their enrollments, cycles, qualifications, progress, notifications, documents, invitations, memberships and refresh tokens remain.
- Preserved QA course results and independent browser test reports remain accessible. Test outcomes are not fabricated/reassigned.
- Global foreign-key check remains clean, schema contract still passes; other tenants and real staff unchanged.
- R2 132 synthetic PDF objects have been deleted and absence verified.
- New production QA E2E uses the same canonical identity for every course/browser; the admin-only, tenant-6, canonical-identity-checked /qa-novo-ciclo route uses the existing atomic LMS renewal service to archive prior evidence for terminal completions, while EM_ANDAMENTO resumes without resetting.

## Recovery and constraints

If preflight, SHA, gates, R2 capability, or backup guards fail, stop before D1 mutation. If a postcondition fails, stop immediately and preserve exact failure evidence; restore using the approved recovery process only after determining concurrent business writes. A D1 restore may overwrite subsequent business data, so do not initiate restore automatically. R2 object deletion is intentionally after D1 confirmation and is not undone by D1 Time Travel; no R2 deletion is permitted before all D1 checks succeed. Interrupted R2 deletion resumes via the immutable manifest (seven-day retention). New QA tests may resume only after the canonical one-user workflow and Worker route are deployed and proven.
