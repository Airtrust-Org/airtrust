# Governed 81 historical LMS enrollment restorations — Costa do Sol

## Authority and audit

- Issue #1376, source event `2026-10-10 19:10:05` UTC, `empresa_id=6`.
- Read-only production audit identified 96 canceled matrícula/cycle pairs, no later matrícula audit entries at review time.
- Only 81 currently mandatory combinations are to be recovered: FDM-TRIPULACAO 11, MNT_MCQ 23, MNT_MGM 23, MNT_MOM 24.
- Prior matrícula status: 65 `CONCLUIDO`, one `EM_ANDAMENTO`, 15 `NAO_INICIADO`; 5 further historic completed cancellations remain for separate individual review, and 10 NR-26 unstarted cancellations are retained.
- Original dry-run candidate digest on 2026-10-10: `26cbbe823aaf69bf99556b7a13fd1d15e7879d17efa7bcbc71f4d94b298b1770`. Do not use that old digest in place of a reviewed same-SHA workflow artifact if live data changes.

## Limits

Restore existing `lms_matriculas.status` and the corresponding single current `lms_matricula_ciclos.status` to the exact original values in the recorded audit event. Record a per-matrícula scoped restoration audit row. Do not change SCORM/xAPI data, completions, certificates, qualification history, progress or dates, rights, other tenants, archived cycles, LMS courses or notifications. Never call the LMS manual matrícula endpoint because it can reset a new cycle and notify users.

## Preconditions

1. Candidate SHA on current `main`; eight required green GitHub Actions checks; no concurrent production enrollment repair (shared concurrency group).
2. Dry-run workflow on the identical SHA, producing sanitized artifact with 96 event rows, 81 eligible, 5 in review, 10 deliberately retained, and hash/count evidence. Human review of its summary.
3. A fresh explicit production authorization pinned to this SHA, workflow and restoration scope, plus environment approval and `apply` confirmation.
4. D1 production-only credentials from GitHub secrets; official D1 Time Travel recovery point before apply. Before remote mutation, `AUDIT_QUERY` must still return exactly 96 canceled enrollments, exactly 81 eligible original IDs and canceled current cycles, 15 noneligible canceled, with no later matrícula audit event for that set.
5. Abort on any identity, status, cycle or requirement drift. Candidate IDs are used only in the private ephemeral SQL file, not in Git, artifacts or logs.

## Execution and postconditions

The workflow uses `wrangler d1 execute --remote --file` for one reviewed SQL batch; D1 remote multi-statement SQL processing is transactional. SQL pre/postconditions are part of the batch. The executor then reads the 96 matrícula/cycle pairs again and confirms exactly 81 matching the source original status and 15 unchanged canceled. Store only redacted counts, reviewed hash, run and SHA. Never send e-mail.

## Recovery

Before apply, record D1 Time Travel timestamp (or bookmark if supported by the official release workflow). If mutation or postcondition fails, halt; inspect Cloudflare/Actions status. Do not blindly revert the entire D1 database if unrelated production writes occurred after the timestamp. Use reviewed forward-only compensation with original IDs and proven pre-state or a separately governed isolated Time Travel restoration. Preserve all history and evidence.

## Validation evidence

Focused unit tests and a SQLite synthetic positive+negative batch test cover restoration, identity/status drift, extra audit events, no new LMS cycles and untouched nonmandatory enrollments. Staging D1 does not currently include the source maintenance qualification model; a production write is blocked until official QA and any required staging fixture/schema setup are reviewed. Synthetic tests do not themselves constitute a production deploy.
