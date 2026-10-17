# AirTrust — staging candidate: LMS Cycle Evidence Schema V2 0557

> Review-only release coordination document. **Not an apply instruction and not production authorization.**

## Source authority and candidate

This release-candidate PR is intentionally **kept OPEN** through the governed schema apply and staging Worker deploy. The exact candidate SHA is the PR HEAD validated by all eight required GitHub Actions checks; **never infer it from main after main advances**, and never reuse a stale SHA.

Implementation: merged PR #1546, canonical merge SHA `6cd0790851605a190a524d3c2daf588d75bbac68`.

Reviewed Schema V2 contract (versioned and immutable):
- `change_id`: `lms-cycle-evidence-0557`
- `baseline_id`: `production-d1-baseline-v2-20260714`
- `file_path`: `worker-airtrust/schema-v2/changes/0557_lms_cycle_evidence_archive.sql`
- `file_hash`: `6df04a3d9fa5f3975a914d978600ac00f492438c02655deb211893f208a32b8e`
- `plan_path`: `worker-airtrust/schema-v2/plans/lms-cycle-evidence-0557.md`
- `plan_hash`: `88aae6f702d95c63abeb00aa25f5a6a754ef49c68bf945bba780757efbec5751`
- `manifest`: `worker-airtrust/schema-v2/lms-cycle-evidence-0557.json`

## Required serialized staging sequence

1. Confirm the governing workflow from PR #1557 is **merged** into trusted `main`, and this candidate PR is open, same-repository, mergeable with eight exact-SHA gates green. Confirm there are no other staging D1/Worker/SCORM QA mutations in progress. Preserve candidate SHA.
2. Via `.github/workflows/staging-lms-cycle-evidence-0557.yml`, dispatch manually on `main` with exact reviewed candidate PR number, candidate SHA, confirmation `AIRTRUST_STAGING_SCHEMA_V2`, choice `lms-cycle-evidence-0557`, and explicit release reason. This workflow verifies baseline, unapplied change, physical columns/tables, D1 target ID, SQL/plan hashes, trusted SHA and actor authorization before any D1 mutation.
3. Require a verified staging D1 Time Travel recovery bookmark, exact bundle application only once, Schema V2 ledger entry with candidate SHA/hash, and postconditions for SCORM/xAPI row conservation, FK, immutable triggers, UNIQUE archive, indexes and zero involuntary backfill. **A failed or ambiguous apply must not be retried without a read-only state/ledger reconciliation and independent review.** Do not use ad hoc SQL or legacy migration workflow.
4. **Only after Schema V2 0557 is physically applied and verified** on `airtrust-db-staging-baseline-20260701`, release staging Worker (and Pages when needed for provenance parity) by the official `.github/workflows/deploy-staging.yml`, pinned to the **same candidate SHA**, `apply_migrations=false`, under `airtrust-staging-mutations-and-scorm-qa`. Confirm `/api/version` SHA, Worker version ID, bundle provenance, protected LMS auth, and staging frontend version.
5. Run official `.github/workflows/staging-lms-scorm-qa.yml` (requires the exact Worker and Pages SHA) and relevant Training Compliance lifecycle QA when its own schema prerequisites are satisfied. Validate exclusively synthetic records: first launch, progress save/suspend/reload/resume, evaluation fail/pass, manual finalize, qualification/one historical certificate, edition reset, old xAPI/SCORM preservation, 2 concurrent resets, tenant isolation, cancelled reactivation, idempotency/rollback and PDF issuance/retrieval across login. Certificate creation may be pending after course completion: do not label PDF issued until verified.
6. Record SHA, PRs, runs, Time Travel recovery anchor (private workflow evidence, not user logs), applied ledger IDs/hash and postchecks in central issue #776. The merge of code, schema apply, staging deploy and QA acceptance are separate milestones.

## Hard blocks

- **DO NOT publish a Worker containing PR #1546 unless 0557 is already applied and verified in the same environment.** This applies to other concurrent release fronts too.
- No production deploy or D1 apply without fresh, explicit and SHA/artefact/scope-specific production authorization.
- No administrative write to real LMS enrollments, learning history, qualifications, certificates or R2.
- This candidate contains all currently integrated changes as of its base; inspect additions made by unrelated fronts before staging runtime deployment. Do not assume Schema V2 0553/0554 Player 3 applied merely because filenames exist.
- If the trusted main advances while this PR remains open, do not silently change candidate SHA. A release candidate is immutable once staging schema preflight/review begins.

**Control owner:** AirTrust central coordination, issue #776; implementation PR #1546; schema staging workflow PR #1557.
