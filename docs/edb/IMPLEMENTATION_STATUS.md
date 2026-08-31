# eDB / Diário de Bordo Digital — Implementation Status

Status: **operational core implemented; schema 0477–0480 applied to staging only; PR #110 Draft/unmerged; production eDB inactive**.

Branch: `feat/edb-operational-core-0477`  
Draft PR: #110

## 1. Regulatory posture

The AirTrust eDB remains a development/staging capability. Nothing in this branch claims ANAC authorization, homologation, acceptance or permission to replace the operator's currently valid official logbook process.

Current regulatory baseline used by the design:

- ANAC Resolução nº 773, de 25/06/2025, effective 01/01/2026 — current Diário de Bordo regulation; it revoked Resolução nº 457/2017;
- ANAC Resolução nº 458, de 20/12/2017, compiled text — computerized systems for mandatory records and acceptance;
- ANAC Portaria nº 3.220/SPO/SAR, de 15/10/2019, as currently published/compiled — eDB reference model.

Important 2026-08-30 regulatory reconciliation:

- Resolução 773 art. 4 requires digital-logbook use to be submitted to ANAC and subject to the computerized-system rules;
- Resolução 458 art. 3 requires explicit authorization for the scope and provides alternative security-demonstration routes;
- Resolução 458 art. 7 requires records to remain available for inspection or eventual transmission according to the applicable scope;
- Resolução 773 art. 15 treats digital sharing as a separate mechanism that can exempt SREV requirements;
- Portaria nº 9.705/STI/2022 was revoked by Portaria nº 10.761/STI/2023 and is not used as a current universal requirement for connection to ANAC's database.

No official accepted endpoint/payload/credential/acceptance contract has been established in this work. External transmission therefore remains disabled and `ANAC_SYNCED` remains fail-closed.

## 2. Internal completion versus ANAC sharing

The internal immutable record lifecycle is now treated as:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED`

`OPERATOR_SIGNED` is the AirTrust-side completion point for the record/evidence flow. This does **not** mean the system is approved for official use; ANAC authorization/acceptance of the system remains a separate activation gate.

The schema reserves an external integration track:

`OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

This track is optional/acceptance-dependent, not a required user action for an internally completed record. `readyForAnacQueue` means eligibility if an authorized external adapter later applies; it does not mean transmission is mandatory or enabled.

The shadow readiness card now reflects this separation and reports the flow as internally complete after valid operator signature rather than leaving an artificial mandatory `ANAC_SYNC` action.

## 3. Governed schema changes — staging only

The following migrations were applied to the pinned staging D1 through the official `Deploy Staging (Official)` path from exact schema release SHA `5e6df4e1fc3b633a260c705c53fe1deca63ad382`, run #39 / `33269772056`:

- `0477_edb_operational_core.sql`;
- `0478_edb_anac_receipt_integrity.sql`;
- `0479_edb_relational_integrity.sql`;
- `0480_edb_diary_lifecycle_integrity.sql`.

No production migration was applied by this workstream.

Each migration has a pinned Schema V2 manifest and reviewed executable SQL. CI verifies the migration and Schema V2 copies remain equivalent.

## 4. Canonical source architecture

The eDB reuses Controle de Voos rather than creating a parallel operational registry.

Canonical regulatory semantics live on:

- `cv_voo_etapas` — day/night/total time, actual/simulated/unclassified IFR, landings, cycles, pre-engine-start fuel, POB, regulatory cargo and occurrences;
- `cv_voo_tripulantes` — explicit regulatory crew-function code and provenance.

No silent semantic promotion is permitted: `starts` ≠ cycles; `pax` ≠ POB; legacy payload ≠ regulatory cargo; unclassified IFR ≠ actual/simulated IFR; landing counters ≠ cycles; RDV divergence ≠ maintenance discrepancy.

## 5. Preflight and postflight boundaries

Before flight:

1. capture aircraft and maintenance situation;
2. persist immutable technical snapshot;
3. hash canonical snapshot with SHA-256;
4. obtain PIC technical acknowledgement bound to the exact snapshot/flight/company.

After flight:

1. complete explicit regulatory semantics on the canonical stage;
2. validate crew and required flight fields;
3. verify acknowledged technical situation;
4. construct the final record server-side from canonical sources;
5. persist immutable revision;
6. obtain PIC final-record signature;
7. obtain operator/designated-person signature.

The client cannot submit arbitrary flight JSON and turn it into regulated history. Corrections create new immutable revisions and require new postflight signatures.

## 6. Persistence and integrity

Implemented foundations include:

- diary and volume lifecycle;
- immutable technical snapshots and PIC acknowledgements;
- immutable final revisions;
- target/hash-bound signatures;
- discrepancy → deferment/corrective action → RTS evidence;
- cryptographic audit chain;
- internal ANAC outbox/receipt persistence for a future accepted adapter;
- integrity incidents and reconstitution evidence;
- correction-by-superseding-revision;
- optimistic concurrency and fail-closed scope checks.

## 7. Staging-shadow API and RBAC

`/api/edb` is guarded by:

- `ENVIRONMENT=staging`;
- explicit positive numeric tenant allowlist in `EDB_SHADOW_PILOT_TENANTS`;
- rejection of `all`;
- production fail-closed behavior.

Administrative eDB data/diary/maintenance actions require manager access. PIC preflight acknowledgement and final signature require the authenticated employee to be actually assigned as PIC on the source flight. Operator signature requires manager access.

The UI exposes only a minimal eDB shadow card in Controle de Voos and clearly states that it is staging-only and not the official logbook.

## 8. Isolated persisted-lifecycle validation

PR #110 contains a dedicated `eDB Isolated Persisted Lifecycle` workflow with two local-only jobs:

1. **isolated SQLite persisted lifecycle** — full persisted evidence lifecycle with no remote side effects;
2. **Cloudflare local D1 schema + immutability** — 0477–0480 applied through Wrangler `--local` to a dummy local D1 configuration, including a deliberate forbidden-update test.

Both paths run without remote D1 writes, production actions or ANAC transmission.

## 9. Consolidated staging full-lifecycle QA

The parallel QA work originally tracked as Draft PR #184 was superseded without source change by PR #186 because of a Draft→Ready connector limitation. PR #186 was merged to canonical `main` as `0a5e25a3e7126c97046f5bfd8a848cebd40483a3`.

It installs the governed **eDB Staging Full Synthetic Lifecycle** workflow and scripts. The workflow:

- is staging-only and manual;
- fails closed before write unless numeric tenant 6 is absent or exactly the reserved synthetic tenant `edb_pilot_smoke`;
- creates deterministic synthetic Controle de Voos/RDV data only;
- exercises diary/volume, regulatory stage, PIC function, preflight snapshot/ack, revision/signatures, correction, discrepancy/deferment/corrective action/RTS, audit, integrity incident/reconstitution and closure;
- deliberately stops signed revisions at `OPERATOR_SIGNED`;
- never queues/syncs/transmits to ANAC;
- soft-deletes only exact mutable synthetic canonical fixtures and never bypasses immutable eDB triggers/evidence.

That QA infrastructure is now part of `main` and is already incorporated into the #110 branch through a real merge commit.

## 10. Remote staging provenance limitation

PR #110 remains unmerged, and canonical `main` does not contain `worker-airtrust/src/routes/edb-shadow.ts`. A later official staging Worker deployment from `main` can therefore replace a previously deployed #110/eDB Worker.

The current Actions history reviewed in this front includes a later staging Worker release from canonical main rather than the #110 branch. Consequently the full synthetic lifecycle workflow must **not** be treated as runnable against an arbitrary current staging Worker merely because the schema exists.

Before any governed full-lifecycle dispatch, `/api/version` and source provenance must prove the exact staging Worker contains the reviewed #110 eDB runtime. If it does not, the correct sequence is an official staging-only Worker release of the exact reviewed #110 HEAD with migrations disabled, followed by the governed lifecycle dispatch.

The connected GitHub tool surface used by this session does not expose a workflow-dispatch action. No push-trigger workaround or weakened guard is introduced to manufacture a run.

## 11. Current CI checkpoint

Before the latest regulatory-readiness correction, exact HEAD `4d9d39f252bbfd86b18dabeb8ec67d5e98473814` had all 12 checks green, including fast CI, heavy CI, PR Check, `airtrust-gcb`, isolated SQLite lifecycle and Cloudflare local-D1 parity.

The current branch contains the subsequent regulatory-readiness/UI/documentation correction described above; its latest HEAD must be treated as a new checkpoint and all required checks must pass again before the branch is considered frozen-green.

## 12. Production posture

No #110 eDB Worker code or schema has been activated in production by this workstream.

No production 0477–0480 migration has been applied here. No ANAC external transmission has been performed. The operator's currently valid official logbook process remains authoritative.

## 13. Remaining controlled gates

1. close fast/heavy/PR/eDB-isolation CI on the current #110 HEAD;
2. keep #110 synchronized with canonical `main` by merge commit only if `main` advances;
3. obtain an exact reviewed #110 staging Worker release before attempting the governed full synthetic lifecycle workflow;
4. execute that staging-only workflow only through its existing guarded manual dispatch and retain immutable synthetic evidence as designed;
5. determine the intended Resolução 458 acceptance path with ANAC and obtain the current onboarding/interface material applicable to that path;
6. freeze the accepted signature/security architecture;
7. require explicit production approval before any production schema/Worker activation or replacement of the official logbook process.

FRMS/LMS and PR #137 / migration 0438 are separate fronts and are not consolidated into this eDB lifecycle work.
