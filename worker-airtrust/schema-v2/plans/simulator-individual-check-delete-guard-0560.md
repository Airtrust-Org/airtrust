# Schema V2 0560 — delete protection for simulator check evidence

## Scope and cause
Schema V2 0554 protects signed CONFIRMADO/ANULADO records from UPDATE but does not prevent physical DELETE of any individual evidence. This additive change closes the gap without altering 0554 or its reviewed SHA256. Every participant, tenant, approval, rejection, draft and annulment is preserved by a database-level trigger.

## Dependencies and exact contract
- Requires 0554 applied and verified first **in the same D1 environment**. No implicit application of 0553, LMS 0557, Native 0558/0559 or any data mutation.
- Adds only `trg_checks_individuais_delete_guard` on `sessoes_checks_resultados_individuais`. No table, index, history, certificate, Compliance, LMS or PDF rewrites. Existing six 0554 triggers remain unchanged (seven total after 0560).
- No privileged DELETE bypass: operator recovery/retention must go through a separately reviewed compensating migration with explicit RBAC, tenant scoping, legal retention checks and authorization. No remote SQL or escape valve is included.

## Governed preflight
Confirm exact SHA/manifest/fileHash/planHash, baseline `production-d1-baseline-v2-20260714`, approved environment, allowed D1 binding and 8 release gates; verify 0554 exact ledger row and individual evidence table and six existing triggers. Require 0560 absent from ledger and new trigger absent. Validate zero anomalous cross-tenant evidence and no unapproved parallel Schema V2 dispatch, especially LMS 0557 and Native 0558/0559. Never read or log PII.

## Apply and recovery
Capture a verified D1 Time Travel bookmark **before** write. Apply only through a reviewed and authorized Schema V2 workflow for the exact target, `simulator-individual-check-delete-guard-0560`, exact candidate SHA and hashed SQL/plan; no ad-hoc `wrangler d1 execute --remote`. If any guard fails, abort without proceeding to Worker/Pages. Restoration uses the governed recovery plan and preserves current evidence; never DROP trigger/table by direct SQL.

## Postconditions and testing
Verify exact ledger baseline/hash/SHA, table unchanged, three indexes, seven named triggers including the DELETE guard, and record counts unchanged. Prove in isolated SQLite that DELETE is rejected for CONFIRMADO (approved/rejected), ANULADO, RASCUNHO and cross-tenant evidence; UPDATE confirmed and annulled remains blocked, no rows lost and only valid signed new-fiche reassessment can append. No backfill and no rewriting qualification history or audit rows.

## Release boundary
Do not deploy the simulator individual-evidence runtime until both 0554 and 0560 are physically applied and verified in the *same* staging D1 and staging Worker+Pages release is authorized. Production requires its own explicit SHA/artifact/change/target authorization. Versioned schema is not evidence of remote application.
