# 0574 — LMS PPTX server-validated slide evidence

## Motivation
Course #22 “Regras de Ouro — Petrobras” is a qualifying PPTX. The existing
UI saves client-owned progress but the canonical completion gate correctly
rejects it with `CONTENT_EVIDENCE_REQUIRED` (issue #1213).

## Contract
- Add an immutable, additive `lms_pptx_slide_evidences` table. No historical backfill.
- Scope every event by tenant, employee, enrollment, active cycle, R2 asset
  fingerprint and authoritative course slide count.
- Accept only authenticated learner-owned ordered slide observations, one at
  a time, with a minimum server-observed inter-event time. Progress is
  idempotent and restart/reopen derives coverage only from persisted events.
- A changed R2 etag or course metadata invalidates prior edition evidence,
  without deleting it.
- Completion and qualification remain blocked until server-owned coverage
  has been verified; client `progresso_pct` is never proof.
- No messages, notifications, automatic re-enrollment or retroactive credit.

## Risk & release
Authentication, tenant isolation and D1 writes are security-sensitive.
Use dedicated SQLite and browser tests; stage Schema V2 before staging
Worker/Pages, verify with a real enrolled test learner. Production requires a
reviewed manifest, backup/recovery, approved Schema V2 apply, eight gates,
and a distinct SHA-specific release authorization.
