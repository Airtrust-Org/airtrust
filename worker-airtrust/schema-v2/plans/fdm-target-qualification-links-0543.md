# FDM target qualification links 0543

## Proven incident and authority
Governed read-only production preflight [run #37835816744](https://github.com/Airtrust-Org/airtrust/actions/runs/37835816744), after protected release `a9693e2b27ca8ac1628f50b03c061445e19101eb`, confirmed LMS courses **71** and **72** active, published, SCORM-launchable but `qualification_link_matches=false` for both. Exactly one active tenant-6 model exists for each of `FDM-TRIPULACAO` and `FDM-MECANICO`. Training Management explicitly authorized correcting **only** these two course-to-qualification bindings (pasted continuation dated 2026-10-08). This is not permission to execute other data writes or deploy unrelated code.

## Fixed scope
- Tenant `empresa_id=6`, exact course IDs 71 and 72, column `lms_cursos.qualificacao_tipo_id` only.
- Course 71 receives the ID of the unique active tenant-6 qualification whose `codigo` is `FDM-TRIPULACAO`; course 72 similarly `FDM-MECANICO`.
- No insert of models, course rename, publication/activation, `gerar_qualificacao_ao_concluir` change, SCORM package or R2 write, enrollment, progress, status, certificate, qualification history, assessment, audit history rewrite, or other tenants.
- Course 13 remains archived, all 32 canceled historic enrollments unchanged; course 73 is excluded. The six excluded staff and five previously soft-deleted rows remain excluded.
- A separate reviewed and authorized governed FDM historical transfer workflow handles the future 11+10 enrollments and administrative equivalences; this migration does not execute that transfer.

## Preconditions — fail closed
1. Exact source main SHA and all eight GitHub CI gates green; Schema V2 manifest, SQL/plan hashes and canonical baseline.
2. Existing production baseline active and 0536/0541 recorded as applied; 0543 not applied.
3. Exactly one active tenant-6 qualification each for the two approved codes.
4. Exactly two corresponding active published SCORM courses with launch prefix/file, exactly those IDs.
5. Exactly zero existing enrollments across target courses 71 and 72; if new enrollments appear, stop and review.
6. Both existing links differ from their expected types; if already repaired, stop without a redundant migration.
7. Approved Time Travel recovery point, serialized database writes and environment controls.
8. This plan does **not** waive the separate current, SHA-specific production approval required by the AirTrust release contract.

## Apply and validation
Apply only via `.github/workflows/apply-schema-change-v2.yml` with `change_id=fdm-target-qualification-links-0543`, immutable SHA and confirmation. Existing workflow performs baseline verification, reviewed hashes, guarded preflight, D1 Time Travel and atomic ledger write. The new postcondition requires exactly one proper target per approved course and no new target enrollment. Conduct tenant-scoped read-only API preflight afterward. If either link fails validation, stop the subsequent transfer; preserve audit evidence.

## Compensation / rollback
No ad-hoc undo SQL. Recovery by approved D1 Time Travel only if appropriate to the isolated incident and after considering unrelated concurrent writes. Otherwise a new reviewed forward-only Schema V2 compensation change is required, preserving qualification and enrollment auditability. Never rewrite historical evidence or issue certificates as compensation.
