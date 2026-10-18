# Schema V2 0561 — Native catalog activation and atomic enrollment intent (CANDIDATE, NO APPLY)

## Scope and authorization
This is a **non-deployable** review candidate derived from the historical 0555 REVIEW-ONLY rehearsal. It is **not** approval to dispatch or run SQL. It creates a tenant-scoped immutable Native activation marker and deferred intent gates for new course enrollment and edition/cycle pinning. It replaces narrowly scoped 0558/0559 triggers that use the physical `native` course type, preserving the legacy CHECK that currently accepts `scorm` rather than rebuilding `lms_cursos`. No historical SCORM course, enrollment, score, qualification, certificate or document is updated by this change.

## Preconditions (must all be observed in target staging D1, read-only)
- Apply officially reviewed and approved 0558 and 0559 first; confirm their exact `change_id`, file hashes, baseline, 4+2 empty tables, expected 0558/0559 triggers, FKs and indexes. An unchanged SQL file in Git is not evidence of D1 application.
- Validate the full **actual staging** catalog CHECK, user/employee/tenant, active course, lms_matriculas and lms_matricula_ciclos schemas against trigger requirements. Snapshot `sqlite_master`, `PRAGMA foreign_key_check`, schema ledger and existing course/matricula/cycle/SCORM/qualification counts. Any schema drift or existing Native records: STOP.
- Confirm names absent: `lms_native_catalog_activation`, `lms_native_enrollment_intents`, `lms_native_uncommittable_intent_guard`; no course is activated by this DDL. Existing SCORM package assets/versions and historical enrollments must be unchanged.
- Obtain reviewer signoff on exact SHA/fileHash/planHash, tenant, change_id, staging D1 database ID, recovery D1 Time Travel and official workflow. **No official 0561 staging workflow entrypoint has yet been integrated into trusted main.**
- Keep every Native tenant feature flag OFF and preserve the production and historical SCORM routes. Separately audit admin/cron/runtimes for marker exclusion and capability token/asset scope; the marker is not authorization to enroll or publish a course.

## Physical and transaction invariants
- The immutable activation table may mark **only newly created empty SCORM-physical** courses with no SCORM package version or pre-existing enrollment. A marked course cannot become a legacy SCORM course when a UI flag is disabled.
- Native enrollment must insert, bind and consume a transient intent **within one atomic transaction** that also creates matrícula, current cycle and immutable edition pin. A deferred FK to an unfillable sentinel aborts orphan intents at commit.
- Marked courses prohibit legacy course retarget, SCORM version insertion, lifecycle/identity rewrites and ungoverned completion. Trigger replacements preserve tenant, employee, current cycle, published edition and sequential receipt rules from 0558 and 0559.
- A rollback is **never** an unaudited DROP after Native evidence exists. Any failed apply uses the approved recovery/compensation procedure; prior to apply, verify complete staging D1 snapshot and no concurrent staging migrations/deploy/QA.

## Offline rehearsal and future postcheck
Run `test_native_atomic_enrollment_pinning_rehearsal.py`, `test_native_completion_intent_rehearsal.py` and `test_player3_terminal_intent_rehearsal.py` on synthetic SQLite, with FK enabled; these tests do **not** establish real staging D1 compatibility. Post-apply, demand exact ledger provenance, 3 new tables, expected triggers, no marker rows, unchanged original SCORM/qualifications, no FK violations, and explicit 0562 dependency before terminal certification.

**Current disposition: REVIEW-ONLY / DO NOT APPLY. No staging SQL, Worker/Pages deploy or course activation is authorized here.**
