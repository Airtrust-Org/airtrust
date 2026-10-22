# Schema V2 0566 - Append-only in-place SCORM edition handoff

## Purpose
The learner stays enrolled in the SAME current cycle and opens the ACTIVE course package.
Before the first write of new-edition SCORM state, the Worker must atomically
archive previous CMI, enrollment progress, score, attempts and diagnostic rows.
No old pass, certification, score or completion may be copied to the new edition.
Position mapping is navigational only unless topic equivalence is independently approved.

## Changes
Add table lms_scorm_edition_handoffs with tenant/enrollment/cycle/target SHA
uniqueness, immutable triggers and database checks for current cycle, active
catalog package and tenant/employee ownership. This SQL performs NO backfill,
reset, import, seed, or R2 write. Package SHA and immutable prefixes remain
bound to the original audit evidence. Legacy source SHA may be null and cannot
be represented as verified.

## Deploy order and authorizations
Assign dedicated staging and production candidate SHA, plan/hash/manifest,
backup/Time Travel, schema ledger and recovery point, official Schema V2 apply
and postconditions BEFORE enabling any dependent Worker feature. Do not run raw
remote SQL. No launch or commit behavior is changed by this schema alone.
Production requires exact scoped authorization for schema/runtime/assets.

## Preconditions and postconditions
Preflight: baseline valid; archive table/unique constraints not present;
lms_matriculas, lms_matricula_ciclos, lms_cursos,
lms_scorm_package_versions and lms_progresso_scorm present.
Postcheck: new table/index/triggers exist, prior row counts and hashes
unchanged, inserted count zero, ledger records exact manifest hashes.
Recovery: preserve immutable audit evidence; rollback by disabling new
feature and restoring pre-change Worker behavior, NEVER DROP evidence.

## Runtime transition contract (separate implementation gate)
Server-authenticated explicit handoff only on tenant-owned active enrollment.
Resolve current cycle and active package from Worker/D1 (never browser input);
validate both package hashes, reviewed equivalence if any; compute a read-only
navigation anchor. D1.batch must insert the immutable snapshot before any
reset of active CMI, scoring and diagnostic projections, with a transaction
operation nonce, idempotency and postcheck. Old attempt/xAPI evidence must
not contribute to completion of new edition. Reopening the active package
must not load the historical suspend_data as if it belonged to current SHA.
Until that writer, launch/commit/response and Chromium/WebKit tests exist,
the feature stays OFF and PR remains DRAFT.

## Tests and release gate
Tenant crossing; spoofed active hash; cancelled/completed enrollment;
concurrent handoff same cycle; idempotency; SQL rollback; future re-edition;
CFIT 32/37 and 37/37, Ethics 2/61; SCORM 1.2/2004 and external exam policy.
No learner data or certificate may be changed without independent approval.
