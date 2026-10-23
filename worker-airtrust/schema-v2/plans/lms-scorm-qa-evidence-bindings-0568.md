# Schema V2 0568 — F5 SCORM QA synthetic binding (staging only)

This *draft* adds the missing D1 contract for the already-integrated
`readScormQaBackendEvidence()`. One immutable inactive candidate ZIP is
bound to one disposable QA enrollment and its current cycle. It never
imports the 43 private ZIPs, activates content, certifies an assessment,
edits learner progress, or authorizes a database change.

## Boundaries
- Only `lms_scorm_qa_evidence_bindings`, indexes and integrity triggers.
- Insert checks VALIDATED inactive package, same tenant/course and live cycle.
- Exactly one ACTIVE synthetic binding per tenant/enrollment, expiring by time.
- Package/tenant/cycle/release/approval/expiry identity is immutable.
- Launch and commit SHA witnesses can only be written once, with the commit
  matching the launched candidate. Revocation/expiry is irreversible; no DELETE.
- D1 rejects non-hexadecimal lower-case-only SHA256/SHA1 identifiers and
  requires the executor's canonical 36-character lowercase UUID `run_id`.
  Length-only hashes must never become binding evidence.
- Expiration is validated by SQLite `julianday()` for ISO-8601 UTC and
  SQLite datetime inputs. Lexicographic TEXT comparisons of mixed formats
  are forbidden in both insertion guards and Worker protected readback.
- The binding row is not proof that the browser really launched or committed:
  protected F0 execution and backend readback must establish that separately.

## Mandatory governance — NOT EXECUTED
Staging-only. Apply by a newly reviewed, hash-pinned Schema V2 staging workflow,
under `airtrust-staging-mutations-and-scorm-qa` and an explicit F0 grant.
Verify base tables/columns, absence of this change in the ledger, staging D1
target, reviewed SHA and eight gates. Capture D1 recovery point. No raw remote
SQL, no production apply, no broad secret or cross-tenant test data.

Postchecks: table, columns, 2 indexes, 3 triggers and change ledger exist;
binding count zero; courses, candidates, enrollments, cycles, SCORM progress,
qualification history counts unchanged. Recovery only through governed
compensation/recovery. Do not infer apply from manifest presence.

Next: separately provision exact Worker staging grant, synthetic tenant,
readback secret, private ZIP and F0 runtime adapter/receipts. Until then F5
remains blocked. Tests are offline SQLite, not Cloudflare/browser evidence.

`python3 scripts/__tests__/test_scorm_qa_binding_schema_0568.py`
