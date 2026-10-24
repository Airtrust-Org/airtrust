# FRMS QA 999013 — proposal for a governed four-case data repair

**NOT AN EXECUTION AUTHORIZATION.** Review-only branch. No D1 write, no reseed, no migration applied, no rollout, and no production scope.

## Current proof
- [Read-only workflow #39076290801](https://github.com/Airtrust-Org/airtrust/actions/runs/39076290801): `0/4` canonical cases; `LEGACY_FIXTURE_PROVEN_READY_FOR_REVIEW`, `4/4` legacy matches, `4/4` target journeys present with `MANUAL` provenance; `writes=0`.
- The prior full historical generator is fixed in PR #1550, but its changed source cannot migrate already-seeded D1 rows. The 4 cases still require remediation.
- This PR adds a **deterministic, non-executable** SQL proposal builder that compiles exactly four conditional journey updates and four conditional case-link updates. The case creation date and original audit fields remain unchanged. No operator can invoke apply with this tool.

## Pre-authorization stop conditions
1. Re-check live `main`, DB UUID and named staging tenant `999013`; verify 14 synthetic employees and the QA login identity remains intact. Match exact 4 legacy cases and 4 target journeys, no existing treatment/closure, and no non-QA provenance.
2. Prepare a protected **encrypted per-row preimage** of the 8 rows, including `updated_at` and original values, with checksums. DO NOT upload plaintext snapshots or print full rows. Retention limited, authorized access only.
3. Document SHA of source and rendered SQL, SQL review/allowlist, one transaction with assertion that every expected row changed exactly once, abort/rollback on any mismatch, and a separate inverse CAS for exactly those rows. No `LIKE` update or delete.
4. Capture staging D1 Time Travel recovery bookmark immediately before mutation and reserve the staging D1 write lock with coordination issue #776. Do not restore a shared D1 globally if other writes occurred.
5. Obtain **new explicit approval for staging UUID, eight exact IDs, SHA, SQL hash, transaction/recovery mechanism and compensating procedure.** User request to prepare a repair is not itself approval to apply.
6. Only then create/review an executing workflow through official D1 governance. The buildReviewPlan module is **not** such a workflow. Schema V2 migration tool must not be abused for a data-only repair, but D1 data-write governance remains mandatory.

## QA acceptance after separate approved apply
- Repeat the official read-only preflight and require 4/4, `READONLY_ACCEPTANCE_READY`.
- Confirm runtime Worker and Pages deployed artifact hashes; authenticate as QA operations, inspect all 4 cases and their source/causes.
- Test report/maintenance and real EVD -> FRMS dated tripulante navigation, then a separately governed case lifecycle (assignment, mitigation, follow-up, effectiveness and closure), preserving audit history.
- IMA V3 scientific coefficients remain shadow awaiting FRMS/GAGEF approval under issue #1476.
