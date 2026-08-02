# Reviewed Schema V2 Plan — 0438 RDV Coordination Workflow

> **Status:** preparation only — not authorized for execution  
> **Target:** production D1 `airtrust-db`  
> **Baseline:** `production-d1-baseline-v2-20260714`  
> **Proposed change ID:** `0438-rdv-coordination-workflow-production`  
> **Source:** `worker-airtrust/migrations/0438_controle_voos_rdv_coordenacao_workflow.sql`

## Objective

Bring the production schema into compatibility with the already-mounted RDV coordination workflow without replaying the historical migration chain and without creating another untracked physical schema change.

The source migration is additive, but it is not a single-column change. It adds workflow columns to `cv_rdv_operacional`, creates append-only review/approval structures, alert and refuelling structures, triggers, indexes, and a uniqueness constraint over active flight stages. The production apply must therefore be treated as a reviewed schema bundle, not as an ad-hoc `wrangler d1 execute --file` command.

## Current Incident Condition

The production readiness audit dated 2026-08-02 reported that the schema markers introduced by 0438 are absent while the Worker mounts routes that query them. The same audit reported `cv_rdv_operacional` with zero rows, which lowers data-conversion risk but does not eliminate partial-apply, uniqueness, trigger, or ledger risks.

The existing raw production migration wrapper is deliberately blocked for 0438. Raw execution does not append the reviewed Schema V2 ledger row and would reproduce the schema/ledger divergence already observed in staging.

## Required Artifacts Before Dispatch

The production workflow must not be dispatched until a separate reviewed PR contains all of the following:

1. An exact reviewed SQL bundle at:
   `worker-airtrust/schema-v2/changes/0438_controle_voos_rdv_coordenacao_workflow.sql`.
2. A manifest at:
   `worker-airtrust/schema-v2/0438-rdv-coordination-workflow-production.json`.
3. SHA-256 hashes in the manifest matching this plan and the exact SQL bundle.
4. Automated verification that the bundle is equivalent to the reviewed source migration or explicitly documents every intentional delta.
5. Read-only preflight evidence from production and from a staging database equivalent to the production baseline.
6. Focused authenticated tests of the RDV workflow after the schema change in staging.

## Production Preflight — Read Only

All checks below must pass immediately before dispatch:

### 1. Schema state is fully absent, never partial

Verify the following markers together:

- `cv_rdv_operacional.workflow_status`;
- `cv_rdv_operacional.versao`;
- table `cv_rdv_aprovacoes`;
- table `cv_rdv_revisoes`;
- table `cv_rdv_alertas`;
- table `cv_voo_abastecimentos`;
- index `idx_cv_voo_etapas_empresa_voo_numero_unique`.

Allowed state before apply: every marker absent.  
NO-GO state: any mixture of present and absent markers. A partial state requires a dedicated incident investigation and must not be reconciled by merely inserting a ledger row.

### 2. Active stage numbering is unique

The preflight query embedded in 0438 must return zero rows:

```sql
SELECT empresa_id, voo_id, numero_etapa, COUNT(*) AS quantidade
FROM cv_voo_etapas
WHERE deleted_at IS NULL
GROUP BY empresa_id, voo_id, numero_etapa
HAVING COUNT(*) > 1;
```

Any result is NO-GO. Do not deduplicate automatically as part of this schema apply.

### 3. Existing operational volume is recorded

Record aggregate counts, without extracting row content, for:

- `cv_rdv_operacional`;
- `cv_voo_etapas`;
- active `cv_voo_etapas`;
- any existing table whose name starts with `cv_rdv_`.

A non-zero `cv_rdv_operacional` count does not automatically block the apply, but it requires explicit review of defaults, trigger behavior, and rollback implications.

### 4. Ledger state is clean

Confirm that `airtrust_schema_changes_v2` contains no row for `0438-rdv-coordination-workflow-production` and that the active baseline is exactly `production-d1-baseline-v2-20260714`.

The legacy `d1_migrations` table is diagnostic context only for this change. Do not fabricate a historical 0438 entry before the physical schema is applied.

## Staging Validation

Do not rely only on a staging database where 0438 was previously applied manually without a ledger entry. Validate the reviewed bundle against a clean disposable database recreated from the production baseline or another environment whose preflight proves every 0438 marker absent.

Minimum staging sequence:

1. Run all read-only preflight checks.
2. Build the combined SQL with `scripts/schema-v2/build-reviewed-schema-apply.mjs`.
3. Apply the exact reviewed bundle.
4. Run schema postconditions.
5. Run the focused Worker tests for RDV workflow and stages.
6. Execute an authenticated smoke covering create/read/transition behavior with synthetic staging data.
7. Confirm tenant isolation for every created RDV support record.
8. Confirm a second application is rejected by the Schema V2 ledger guard.

## Production Apply Path

Only `.github/workflows/apply-schema-change-v2.yml` may apply this change to production.

Dispatch requirements:

- ref is `main`;
- `expected_sha` equals the immutable merged `main` SHA containing the reviewed artifacts;
- `change_id` is `0438-rdv-coordination-workflow-production`;
- the protected `production` environment approves the run;
- the dedicated D1 migration token is available;
- the workflow's pre-contract check passes;
- D1 Time Travel recovery information is captured;
- schema SQL and the Schema V2 ledger row are submitted in the same combined file.

## Postconditions

The run is successful only when all of these conditions hold:

1. Every required 0438 schema marker is present.
2. `cv_rdv_operacional.workflow_status` defaults to `rascunho`.
3. `cv_rdv_operacional.versao` defaults to `1`.
4. The workflow-status and version validation triggers exist.
5. RDV approvals and revisions reject cross-tenant parent links.
6. Append-only tables reject `UPDATE` as designed.
7. The active-stage uniqueness index exists.
8. `airtrust_schema_changes_v2` contains exactly one row matching the reviewed change ID, baseline, file hash, plan hash, and GitHub SHA.
9. The production schema contract passes after apply.
10. An authenticated production smoke confirms the real RDV route no longer fails because of missing 0438 objects.

A healthy `/api/health` response is not accepted as functional validation.

## Failure and Recovery

The workflow captures a D1 Time Travel recovery point before apply. If the SQL submission fails or postconditions reveal a partial state:

- stop Worker/Pages release activity related to the RDV workflow;
- preserve the exact failing SHA, workflow run, recovery timestamp, and schema-marker results;
- do not insert or edit ledger rows manually to make the run appear complete;
- determine whether Time Travel restore or a reviewed compensating change is safer;
- validate the recovered schema and the real functional case before closing the incident.

## Explicit Non-Actions

This preparation does not:

- authorize production execution;
- write to D1 or R2;
- reconcile historical `d1_migrations` entries;
- backfill unrelated notification records;
- add `empresa_id` to shared simulator tables;
- deploy Worker or Pages;
- declare the RDV workflow operationally validated.
