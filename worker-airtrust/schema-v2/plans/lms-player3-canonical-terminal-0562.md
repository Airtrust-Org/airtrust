# Schema V2 0562 — Native/Player3 terminal intents (CANDIDATE, NO APPLY)

## Scope and authorization
**Non-deployable** review candidate from historical 0556 REVIEW-ONLY terminal rehearsal. The change provides mutually isolated one-transaction intents for Native single-assessment and Player3 module-assessment completion. It **does not** conclude an existing enrollment, create a qualification, generate a certificate or enable a feature flag. Existing SCORM completions remain governed by the legacy canonical writer.

## Prerequisites / STOP conditions
- Before any application, prove that the official 0558 → 0559 → 0561 ledger entries exist for the **same staging DB and baseline**, with approved exact SQL/plan hashes and matching physical schema, triggers, FKs, course CHECK and recovery point. A GitHub merge or green test is insufficient.
- Specifically verify the marker/enrollment intent tables and immutable trigger names created by 0561, the 0559 policy/official attempt tables and canonical LMS history, category and employee columns used by the SQL. Snapshot D1 tables/indexes/triggers and foreign_key_check. Schema drift or data anomalies prohibit application.
- Review with approvers exact `change_id`, SHA, fileHash, planHash, target staging DB, recovery and postcheck. **No official 0562 dispatch choice exists on trusted main.** Do not improvise remote SQL or switch on tenant flags.
- Private authored RC8.1 answers, policy and artifact SHA must be reviewed by training/pedagogy; no original course may be published or certified until its own approval. All 22 course editions remain pending.

## Terminal integrity contract
- Native V1 and Player3 terminal intents are separate authorities. The Worker (not browser grade/postMessage/percentage) verifies exact tenant, employee, current cycle, immutable edition, source/content hash, private bank/policy hashes and every required receipt. A previously failed stage cannot be silently converted to pass.
- Intent insertion and verified proof guard must be the first statements of the **same** atomic D1 batch as completion/qualification/history writes. Intents cannot persist after transaction COMMIT; deferred sentinel FK rejects orphans. Replays must not mint duplicate history or certificates.
- Canonical qualification mapping requires active `lms_integrada` category in the same tenant. PDF generation is post-commit and separately verified from R2 via authenticated stream; a 200 receipt alone is not a certificate. Historical/other-cycle SCORM evidence is not rewritten.
- Ensure all legacy completion paths, background writes, rollback/recovery and certificate reads exclude marked Native; all allowlists default OFF. No production or real learner writes are authorized.

## Rehearsal / future postcheck
Run the existing SQLite candidate tests `test_native_completion_intent_rehearsal.py` and `test_player3_terminal_intent_rehearsal.py` including full 42-unit/8-stage flow, failed stage, forged tenant/actor/receipt and rollback on orphan intent. After an approved apply, confirm exact ledger, new objects and trigger modifications, zero completion intent rows, no SCORM mutation, and six authenticated Chromium/WebKit journeys in staging (including qualification, Compliance and full PDF). No staging evidence has yet been collected.

**Current disposition: REVIEW-ONLY / DO NOT APPLY.**
