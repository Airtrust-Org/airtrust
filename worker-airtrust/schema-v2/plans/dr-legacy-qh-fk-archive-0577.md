# dr-legacy-qh-fk-archive-0577 — independent archival and FK remediation

## Evidence and root cause

Official read-only D1 drill #42725711349 on SHA `7dda6d96a1ac8e97b719e3b6917a548a7e6cf4b3` restored 482,075,688 bytes to disposable SQLite. `PRAGMA integrity_check=ok`; all **525** FK violations are `_backup_qh_tmp → funcionarios_backup` (FK #0). This exact historical residue is documented in June 2026. `funcionarios_backup` no longer exists; runtime routes and schema dependencies to the scratch table were not found in previous audits. Do not infer new production data corruption.

## Scope

Retire **only** the orphaned non-runtime historical scratch table `_backup_qh_tmp` from the active schema. Before doing so, preserve all its original rows in **two separate forms**:

1. A restore-verified, privately stored standalone SQLite plus exact SQL dump **outside D1 and outside Git**, produced using `scripts/production/prepare-legacy-qh-archive-offline.mjs` against an authorized disposable restoration. Store in independent durable, access-controlled storage, retain SHA-256 and demonstrate a successful independent restore. This package contains historical qualification information and may contain personal data; never upload plaintext to GitHub artifacts, comments or logs. Existing D1 drill deletes its temporary raw dump, so the archive must be captured from a **new, separately governed export** before cleanup. A D1 Time Travel timestamp alone is insufficient as independent storage.
2. An in-D1 non-runtime table `_archive_qh_fk_20261110` copied with `CREATE TABLE ... AS SELECT *` for local forward recovery. The archived copy has no broken reference to the already absent `funcionarios_backup`.

Only after both protections are proven may `_backup_qh_tmp` be dropped by the reviewed Schema V2 workflow. Do not alter any operational qualifications, enrollment, FRMS, tenant, user or RBAC data.

## Hard prerequisites — FAIL CLOSED

- Exact reviewed SHA, branch `main`, schema V2 baseline active, change not already applied; production protected-environment approval.
- Written owner approval for this **specific destructive D1 migration**, referencing `changeId=dr-legacy-qh-fk-archive-0577` and exact SHA.
- Independent archive artifact exists with `archive-evidence.json`, its SQL and standalone SQLite files, hashes verified, secure durable destination and tested restore; separate record in issue #2155 with **only metadata**, not row-level data.
- Production environment must have `D1_LEGACY_QH_ARCHIVE_SHA256` as a 64-char hex attestation of that stored SQL file, configured only **after** the external copy is checked. This is an operational interlock, not a replacement for validating the actual copy.
- Production environment must separately have `D1_LEGACY_QH_ARCHIVED_ROWSET_SHA256` equal to the SHA-256 of the canonical JSON encoding of the 525 rows from the encrypted independent archive. The production preflight reads the live rowset, recomputes its fingerprint, and **refuses the DROP if even one value changed** since archival. This attestation must be set only after the archive is independently decrypted and restored.
- Latest read-only D1 preflight: exactly 525 source rows, 525 FK violations globally, *all* on child `_backup_qh_tmp`, parent `funcionarios_backup`, FK #0, parent absent, no dependent views/triggers/other schema objects, destination archive and guard tables absent.
- Capture pre-change D1 Time Travel recovery point. Respect schema concurrency mutex and eight release gates.
- Never treat an unknown count, change in schema, missing archive proof or inconsistent row fingerprint as permission to proceed.

## Reviewed change

SQL file: `worker-airtrust/schema-v2/changes/0577_dr_legacy_qh_fk_archive.sql`. First execute an in-transaction row-count `CHECK (=525)` guard, copy every column and record into a new in-D1 non-FK archive, then drop only the original scratch table. The guard table is removed after the operation.

## Postconditions

- Exactly 525 archived rows and identical ordered rowset fingerprint compared with before the migration, **without emitting row values**.
- `_backup_qh_tmp` and its transient count guard absent, `_archive_qh_fk_20261110` present.
- `PRAGMA integrity_check=ok`; global `PRAGMA foreign_key_check` returns 0 and no new schema dependency is introduced.
- One matching Schema V2 ledger row; production app health checks and qualified historical records unaffected.
- Repeat full D1 export and disposable restore under a separately authorized maintenance window, and explicitly verify integrity. This is necessary before declaring DR recovery homologated.

## Recovery

- If preflight fails: no mutation; fix cause and propose a new reviewed candidate.
- If application fails: stop further changes, retain exact logs without personal data, use the captured D1 Time Travel recovery timestamp in the governed incident process. Do **not** overwrite unrelated transactions without explicit recovery authorization.
- If a legacy row is later required: restore it from the independent encrypted archive or the in-D1 archive through an separately reviewed data migration. Never recreate the historically invalid FK.
- The independent archive must not be deleted because the in-D1 archive exists. Retain and periodically verify recoverability.

## Isolation and access

This plan does not modify other AirTrust modules, requires no Worker/Pages deployment for the DDL itself and must never be bundled with another executor's migration. No shortcuts around branch protection, Schema V2 ledger, environment approval or production rollback governance.
