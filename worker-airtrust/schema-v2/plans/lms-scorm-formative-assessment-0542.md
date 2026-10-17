# lms-scorm-formative-assessment-0542

## Incident and objective
Enrollment 863 in Costa do Sol: CRM — Gestores — Cargos de Direção Requeridos (RBAC 119), 45/45 slides, package reports training completed but server returns HTTP 409 SCORE_MISSING and preserves enrollment at 99%. The package says assessments are formative/non-eliminatory. Historic course creation defaults SCORM mastery to 70 and canonical validation mandates a score for all qualifying or graded content, causing a mismatch.

## Contract
- Add an explicit server-owned SCORM assessment policy: SCORED (default, fail closed) or FORMATIVE (participation completion).
- FORMATIVE never fabricates a grade; it still requires a real terminal SCORM completion, persisted progress, an authenticated user, valid enrollment/tenant, matching asset session, active package and canonical completion service.
- A graded course with no score continues to fail with SCORE_MISSING; failure/conflict still overrides both modes. H5P is unaffected.
- A new course defaults to SCORED. FORMATIVE is an explicit administrative configuration and is not inferred from browser text, 45/45, or a missing grade.

## Governed preflight — mandatory before any remote write
1. Verify latest main SHA, eight gates, tenant isolation, backup/recovery point, expected production D1 baseline and unapplied 0542.
2. Confirm exactly ONE live tenant-6 SCORM course with the title predicate from the SQL. If 0 or >1, STOP; do not run the migration.
3. Inspect course-to-qualification link, policy/program requirements, enrollment 863 and course content/runtime evidence in read-only mode. Verify formative/non-eliminatory contract is correct and no numeric pass grade is required by the approved program.
4. Confirm no pre-existing `scorm_assessment_policy` column (PRAGMA) and capture counts of completion/qualification/certificates for before-after checks. No fabricated completion or backfill.
5. Compare migration SQL and plan hashes with reviewed Schema V2 manifest; use the official workflow and release-scoped authorization. Do not run ad hoc D1 SQL.

## Application and postconditions
- Apply once through Schema V2 with governed recovery point. Publish compatible Worker/Pages only through authorized workflows; avoid running new Worker against old schema.
- Check column exists with SCORED default for every other course and exactly ONE target CRM course FORMATIVE with no mastery requirement; verify cross-tenant rows unchanged.
- Confirm no historical enrollment, score, qualification or certificate was mutated by the migration.
- In staging, use a new qualifying formative SCORM completion (score missing but genuine completed signal) and an assessed course (missing/below-threshold score rejected), including invalid session, failed, cross-tenant, replay and new-cycle tests.
- Revalidate enrollment 863 from persisted evidence; do not auto-conclude it unless a fresh valid player completion/finish succeeds.

## Rollback/recovery
- Schema migration is forward-only; changing back requires a separate reviewed Schema V2 change and validated impact. Production D1 Time Travel is the emergency restore mechanism. Preserve snapshots and evidence; never bypass score checks or grant qualifications administratively by assumption.
