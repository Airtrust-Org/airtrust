# Governed staging Schema V2 0554 — simulator individual checks

This PR changes only the existing **staging** apply allowlist and its checks. It does not apply migrations or publish Worker/Pages.

- Change: `simulator-individual-check-evidence-0554`; code/manifest were integrated by PR #1553, and this workflow pins the reviewed SQL and plan hashes.
- Require an explicit new authorization for **staging**, a trusted open same-repository candidate PR (e.g. #1558 while still open), its exact release SHA, all 8 Actions gates, and manual confirmation `AIRTRUST_STAGING_SCHEMA_V2`.
- The pinned staging D1 cannot be production. Existing staging concurrency lock is shared with runtime deploys and LMS/SCORM operations; do not overlap the 0557 front.
- Preflight: active baseline, absent 0554 ledger/table, and four source tables. Capture Time Travel recovery bookmark **before** applying the exact reviewed SQL+ledger bundle.
- Postconditions: SHA/hash-specific ledger, one new table, three indexes, six tenant/immutable triggers and zero evidence rows. Neither legacy session results nor FAP is backfilled.
- Production change 0553 is **not** applied by this staging workflow.
- Deploy runtime #1558 only after schema application and exact environment identity are confirmed, then perform authenticated A-approved, B-rejected, C-pending with FAP, Compliance, history, expiry and PDF verification.
