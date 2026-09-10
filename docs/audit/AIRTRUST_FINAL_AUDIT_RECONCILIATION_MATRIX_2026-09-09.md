# AirTrust — Final Audit Reconciliation Matrix — 2026-09-09

## Scope

This closeout consolidates prior AirTrust technical, security, health, LMS/SCORM, FRMS, SGSO, layout/UX, CI/CD, schema and production-readiness audits.

Explicitly excluded from this closeout:

- `/pilot`
- issue #580
- active Pilot implementation PRs
- new Pilot/eDB-shadow product work

Those items are being handled by a separate workstream and are not audit residuals for this closeout.

## Classification rules

- **CLOSED** — implemented/integrated and backed by code, CI, governed run or functional evidence.
- **GOVERNED-MIGRATION-PENDING** — reviewed code/migration exists, but the required production remote application remains an explicit governed operation.
- **ADMIN-BLOCKED** — requires repository/provider owner/admin action or proof unavailable to the engineering integration.
- **EXTERNAL-BLOCKED** — depends on regulator/OEM/third-party source or contract.
- **ACCEPTED-DEBT** — non-blocking technical/architectural debt with no demonstrated operational defect.
- **OPEN** — actionable internal defect still requiring engineering work.

## Reconciled matrix

| ID | Finding | Final classification | Evidence / disposition |
|---|---|---|---|
| #414 | F4-03 historical data integrity repair | **CLOSED** | Governed production repair run `34363175176`; exactly six rows repaired; recovery point and postconditions verified. |
| #484 | Schema V2 rebuild atomic / audit persistence | **CLOSED** | Integrated remediation and schema bundle evidence. |
| #485 | Schema contract / staleness guard | **CLOSED** | Contract staleness guard integrated; current A-02 change is reconciled through the same mechanism. |
| #486 | Bundle gate / critical-path bundle | **CLOSED** | Bundle gate integrated. |
| #487 | Isolate staging `migrations_dir` | **CLOSED** | Infrastructure/runner isolation completed. This issue is not migration 0487. |
| 0487 | `qualificacoes_renovacoes` Schema V2 migration | **CLOSED / PRODUCTION_CONFIRMED** | Governed apply already completed; production preflight run `34177475204` PASS; issue #494 closed; repository evidence recorded in `docs/audit/evidence/0487-qualificacoes-renovacoes-applied-verified-2026-09-09.md`. |
| #489 | Tracked R2 credential sanitization / regression guard | **CLOSED** | Code/repository sanitization guard integrated. Administrative rotation/history response remains separately tracked by #500. |
| #493 | Independent monitoring / alert delivery proof | **CLOSED** | PR #585 and run `34379941583`; delivery proof exercised through #586. |
| #496 | Layout/UX residual staging QA | **CLOSED** | Governed staging run `34400338267` passed the residual N-03/N-07/N-09 checks and cleanup. |
| #455 | FRMS offshore baseline traceability blocker | **CLOSED** | #573 made unapproved cycle parameters fail closed; unproved 15-day value no longer affects operational calculation. |
| #265 | Simulator FOLGA closeout | **CLOSED** | Authenticated production read-only proof; `roster_policy=FOLGA`; `PREVIEW_ONLY`; zero writes; no eligible paired sample existed and no synthetic production data was fabricated. |
| F1-06 | Tenant guard by statement/query | **CLOSED** | Statement-based tenant guard integrated; semantic remediation associated with PR #524. |
| F1-17 | Public invite validation rate limiting | **CLOSED** | Tenant/auth hardening integrated. |
| F5-08 | SCORM runtime bearer isolation | **CLOSED** | PR #564; reusable access bearer removed from SCORM runtime path. |
| F5-09 | SCORM progress / `suspend_data` guardrails | **CLOSED** | Current `lms-progress-guardrails.ts` and regression coverage enforce limits/fail-safe behavior. |
| F5-10 | SCORM launch resource selection | **CLOSED** | Correct SCO/resource launch path integrated. |
| F5-12 | Certificate eligibility status | **CLOSED** | PR #605; certificates fail closed unless qualification has a canonical completed status. |
| F5-14 | Tenant-scoped LMS cycle resets | **CLOSED** | Tenant-scoped reset logic and tests integrated. |
| F6-13 | FRMS rolling snapshot persistence atomicity | **CLOSED** | PR #603; soft-delete + replacement write made atomic with `DB.batch()`. |
| F8-18 | Structured logger tenant context | **CLOSED** | `LogContext` includes `empresaId`; structured logging migration associated with PR #523. |
| F8-19 | Frontend retry/backoff | **CLOSED** | 429/503 backoff/retry behavior integrated. |
| SGSO sequence | Sequential protocol race | **CLOSED** | PR #602; sequence reservation uses atomic `UPDATE ... RETURNING` across current/legacy path. |
| AuthContext / QueryCache | Frontend auth/query stability | **CLOSED** | Remediation integrated and regression-tested. |
| Dynamic RBAC | Employee/qualification/operational writes | **CLOSED** | Dynamic tenant-aware role guards integrated. |
| Schema 0488 | Pilot offline sync receipts | **OUT OF THIS AUDIT CLOSEOUT** | Belongs to the separate `/pilot` workstream; not counted as an audit residual here. |
| A-02 / #610 | Employee natural keys tenant-scoped | **CLOSED / PRODUCTION_CONFIRMED** | Staging proof completed through runs `34485516078`, `34489086943`, `34492291184` and `34492881316`. Explicitly authorized production Schema V2 run `34498650094` passed dedicated preflight, recovery-point capture, atomic schema+ledger apply, exact ledger verification, full schema revalidation and `A02_NATURAL_KEYS_0489_PRODUCTION_POSTCONDITIONS=PASS`. Production evidence: `docs/audit/evidence/a02-0489-production-applied-verified-2026-09-10.md`. |
| #91 | eDB cycles / IFR semantics source | **CLOSED / SOURCE_CONFIRMED** | IFR real/simulated semantics are established by Costa do Sol MGO. The later review of Costa do Sol `MNL-MNT-001` MGM Rev. 10 supplies the missing flight-cycle definition: a flight stage is a flight cycle composed of one takeoff and one landing in sequence. ANAC requires flight cycles separately from landings. Existing AirTrust explicit regulatory-source contracts/tests preserve fail-closed behavior and never promote `starts` or landing count by inference. Evidence: `docs/regulatory/edb/EDB_CYCLES_COSTA_DO_SOL_MGM_REV10_SOURCE_DECISION_20260910.md`. |
| A-06 | Redundant indexes cleanup | **ACCEPTED-DEBT** | Historical list reduced to four local-bootstrap candidates. No remote coexistence proof; destructive 0490 removed. Future cleanup requires read-only `sqlite_master` evidence per target. |
| #500 | R2 credential rotation + Git history response | **ADMIN-BLOCKED** | Code sanitization is closed; provider credential rotation/revocation, workload cutover verification, provider log review and Git-history incident response require owner/admin authority. |
| P1-04 / #611 | GitHub branch/environment protection administrative proof | **ADMIN-BLOCKED** | `main` is confirmed protected and required checks are visible; full bypass/force-push/deletion and Environment reviewer/protection proof is unavailable to the current integration. |
| #93 | ANAC eDB homologation contract / credentials | **EXTERNAL-BLOCKED** | Requires current ANAC API contract, homologation access/auth, DTOs/endpoints and acceptance semantics before any regulated integration can proceed. |
| ARCH-01 | SQL/repository-pattern consolidation | **ACCEPTED-DEBT** | Architectural cleanup; current tenant/runtime guards mitigate operational risk. |
| PERF-01 | Large bundles / residual N+1 opportunities | **ACCEPTED-DEBT** | Performance debt; no current release-blocking functional defect demonstrated. |
| SUP-01 | Full platform migration to Supabase | **ACCEPTED-DEBT** | Strategic architecture decision; current Cloudflare/D1 platform remains the supported baseline. |

## Closeout counts after A-02 production confirmation and #91 source resolution

```text
OPEN_INTERNAL=0
GOVERNED_MIGRATION_PENDING=0
ADMIN_BLOCKED=2
EXTERNAL_BLOCKED=1
ACCEPTED_DEBT=4
```

### GOVERNED_MIGRATION_PENDING

- **None.** A-02 / 0489 completed the explicitly authorized production Schema V2 apply and all required postconditions in run `34498650094`.

### ADMIN_BLOCKED

- **#500** — provider credential rotation/revocation + workload cutover verification + access-log review + Git-history incident response.
- **#611 / P1-04** — remaining GitHub branch-protection/ruleset and staging/production Environment administrative proof beyond the access level of the current integration.

### EXTERNAL_BLOCKED

- **#93 only.** Current ANAC eDB API contract, homologation credentials/procedure and acceptance semantics remain unavailable.

### CLOSED SOURCE BLOCKER

- **#91** — Costa do Sol flight-cycle semantics are now grounded in the controlled MGM Rev. 10. The runtime remains explicit-source/fail-closed; engine starts and landing counts are not silently promoted.

### ACCEPTED_DEBT

- **A-06** — redundant index optimization pending real remote evidence.
- **ARCH-01** — repository/SQL architectural consolidation.
- **PERF-01** — non-blocking performance optimization.
- **SUP-01** — strategic platform migration deferred.

## Decision

The audited engineering scope has reached:

**ZERO OPEN INTERNAL AUDIT FINDINGS**

and

**ZERO GOVERNED MIGRATIONS PENDING**

A-02 / 0489 is production-confirmed with exact Schema V2 ledger provenance and dedicated production postconditions. The prior #91 external semantic-source gap is also resolved by the controlled Costa do Sol maintenance source while preserving fail-closed runtime behavior.

Two administrative blockers and one external ANAC integration-contract blocker remain separately tracked because they require owner/admin authority or authoritative third-party input. Accepted debt remains non-blocking and does not represent a demonstrated release defect.
