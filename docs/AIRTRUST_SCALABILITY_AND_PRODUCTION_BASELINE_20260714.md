# AIRTRUST_SCALABILITY_AND_PRODUCTION_BASELINE_20260714

Date: 2026-07-14

## Scope

- Repository: `airtrustsystem-alt/airtrust`
- Audit branch: `audit/airtrust-scalability-baseline-20260714`
- Audit HEAD: `22bd96b229f078d28ebca7e298ad543811f6cc53`
- Production baseline lineage reviewed: PRs `#278`, `#293`, `#304`, `#315`, `#316`, `#317`, `#318`
- Explicit exclusions respected in this execution:
  - no deploy
  - no production write
  - no migration apply
  - no `d1_migrations` mutation

## Executive Verdict

- General verdict: partial GO for audit baseline, NO_GO for any new functional rollout
- Current operational risk: medium
- GO/NO-GO for new functionality: `NO_GO`
- GO/NO-GO for deploy: `NO_GO`
- GO/NO-GO for session 109/110 repair: `NO_GO_NOT_NEEDED_CURRENT_STATE`

## Schema V2 Status

- Contract file: `docs/database/schema-contracts/production-d1-baseline-v2.json`
- Canonical hash expected: `f3a1a2fa2ef07c50660d4c8180bd2bd9dcb98e5423317f7c20ea6d4c9ba787d7`
- Local checker result against audited snapshot: `PASS`
- Local checker result against default local structural snapshot: `PASS`
- Production checker result (`--production`, read-only): `PASS`
- Returned production hash: `f3a1a2fa2ef07c50660d4c8180bd2bd9dcb98e5423317f7c20ea6d4c9ba787d7`
- Ledger V2 status: baseline V2 present in repo and production checker compatible with current production shape
- `d1_migrations`: no alteration performed

### Contract Confirmations

- Present and used:
  - `simuladores.aeronave_codigo`
  - `simuladores.codigo_aeronave`
  - `simulador_agendamentos.empresa_id`
  - `simulador_agendamentos.modo_compartilhado`
  - `modelos_sessao.tipo_sessao_id`
  - `fichas_sessao.atribuicao_curricular_id`
  - `fichas_sessao.segmento_atribuicao_id`
- Confirmed absent from production shape assumptions:
  - `sessoes_participantes.empresa_id`
  - `simuladores.empresa_id`
  - `modelos_sessao.tipo_sessao_codigo`

## Shared Session Generator Status

### Confirmed

- The shared-session creation route no longer returns `success: true` when ficha generation fails.
- The repair endpoint is protected by real RBAC (`requireRole('admin')`).
- The generator remains tenant-scoped on the authoritative tables and uses the real production schema assumptions.
- Validation happens before the write batch for mandatory ficha generation inputs.
- Batch write path is fail-closed and tested against partial-write rollback behavior.
- Re-execution remains idempotent.
- Tenant 8 isolation is covered by focused tests.

### Corrected In This Audit

- The shared-session generator preserves idempotency on the canonical active key while using a fresh `crypto.randomUUID()` for each creation attempt.
- This keeps legitimate recreations possible after soft delete, because production enforces global uniqueness on `fichas_sessao.uuid` even when prior rows are soft-deleted.

### Tests Executed

- `node --experimental-strip-types scripts/schema-contract/check-schema-contract.ts --contract docs/database/schema-contracts/production-d1-baseline-v2.json`
- `node --experimental-strip-types scripts/schema-contract/check-schema-contract.ts --contract docs/database/schema-contracts/production-d1-baseline-v2.json --snapshot docs/database/production-schema-snapshot-20260714/structural-snapshot.json`
- `node --experimental-strip-types scripts/schema-contract/check-schema-contract.ts --contract docs/database/schema-contracts/production-d1-baseline-v2.json --production`
- `npm --prefix worker-airtrust test -- src/__tests__/routes/simuladores-shared-session-ficha-generator.test.ts src/__tests__/routes/simuladores-shared-session-routes.test.ts`
- `npm test -- src/__tests__/schema-contract/check-schema-contract.test.ts`

### Results

- Shared-session focused worker tests: `33/33` passed
- Root schema-contract tests: `17/17` passed

## Sessions 109 And 110 (Sanitized, Read-Only)

State observed in production on 2026-07-14:

| sessao_id | empresa_id | status | participantes | segmentos | atribuicoes | gera_ficha | fichas | simulador_id | template_id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 109 | 6 | AGENDADO | 2 | 2 | 2 | 2 | 2 | 11 | 85 |
| 110 | 6 | AGENDADO | 2 | 2 | 2 | 2 | 2 | 11 | 84 |

Segment windows:

| sessao_id | segmento_id | ordem | inicio | fim | finalidade_codigo | atribuicoes_no_segmento | participantes_no_segmento |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 109 | 13 | 1 | 20:40 | 21:40 | OUTRO | 2 | 2 |
| 109 | 14 | 2 | 21:40 | 22:40 | OUTRO | 2 | 2 |
| 110 | 11 | 1 | 18:40 | 19:40 | OUTRO | 2 | 2 |
| 110 | 12 | 2 | 19:40 | 20:40 | OUTRO | 2 | 2 |

Curricular/model mapping:

| sessao_id | modelo_codigo | atribuicoes | fichas_existentes |
| --- | --- | --- | --- |
| 109 | `A139-P-02/04-C2` | 1 | 1 |
| 109 | `EXA-02/02` | 1 | 1 |
| 110 | `A139-P-01/04-C2` | 1 | 1 |
| 110 | `EXA-01/02` | 1 | 1 |

Ficha maneuver counts:

| sessao_id | ficha_id | atribuicao_curricular_id | manobras |
| --- | --- | --- | --- |
| 109 | 237 | 12 | 33 |
| 109 | 238 | 13 | 33 |
| 110 | 239 | 10 | 33 |
| 110 | 240 | 11 | 33 |

Ficha timestamps:

| sessao_id | ficha_id | created_at | updated_at |
| --- | --- | --- | --- |
| 109 | 237 | `2026-07-14 13:44:27` | `2026-07-14 13:44:27` |
| 109 | 238 | `2026-07-14 13:44:27` | `2026-07-14 13:44:27` |
| 110 | 239 | `2026-07-14 13:44:37` | `2026-07-14 13:44:37` |
| 110 | 240 | `2026-07-14 13:44:37` | `2026-07-14 13:44:37` |

### Dry-Run Logical Repair Result

- Session `109`: zero ficha creations pending
- Session `110`: zero ficha creations pending
- Each ficha-eligible assignment already resolves to an existing ficha through the same canonical key used by the repair logic
- Therefore, as of 2026-07-14, the repair endpoint would create nothing for `109` or `110`

### Ficha Provenance

- Read-only evidence available:
  - `created_at` is present for fichas `237` to `240`
  - no matching rows were found in `audit_logs` for `simulador_agendamentos` or `fichas_sessao`
  - no matching rows were found in `audit_events_v2` for `simulador_agendamentos` or `fichas_sessao`
- Commit/version responsible: not confirmed from read-only database evidence
- Origin classification: `PROVENIENCIA_DAS_FICHAS_NAO_CONFIRMADA`

## CI / Workflow / Release Gates

- `apply-schema-change-v2.yml` enforces:
  - branch must be `main`
  - exact `expected_sha`
  - production confirmation token
  - file-path restriction to a single SQL file under `worker-airtrust/schema-v2/`
  - pre-apply schema contract validation
  - baseline existence check
  - change-id uniqueness check
  - post-apply schema contract validation
- Residual issue:
  - `.github/workflows/deploy-airtrust.yml` still exposes legacy `run_migrations` input, but it hard-fails when set to `true` with `LEGACY_MIGRATION_RUNNER_DISABLED_USE_SCHEMA_V2`

## Repository Governance

- Repo visibility: public
- `main` branch protection: not enabled via GitHub branch protection API
- `CODEOWNERS`: absent
- Required checks/reviews: not enforced by branch protection in the current GitHub configuration

### PR Classification

- `#313`: close as superseded
  - rationale: later merged fixes `#315` and `#316` cover the production schema incompatibilities more completely
- `#305`: do not merge in current form; close and rework or rebase behind current governance
  - rationale: the branch remains open while the current baseline explicitly blocks remote apply/write workflows for this incident path

## Files Changed In This Audit

- `worker-airtrust/src/routes/simuladores-shared-session-ficha-generator.ts`
- `worker-airtrust/src/__tests__/routes/simuladores-shared-session-ficha-generator.test.ts`
- `docs/AIRTRUST_REPOSITORY_SANITIZATION_20260714.md`
- `docs/AIRTRUST_SCALABILITY_AND_PRODUCTION_BASELINE_20260714.md`

## Remaining Blockers

- Full staging rehearsal of the end-to-end Schema V2 apply workflow was not executed because that would cross into write-capable territory.
- Repository governance is still below the expected operational bar until branch protection and required checks are enforced.
- Recent critical commits reviewed for this incident do show PR provenance, but the repository still lacks preventive branch-governance controls.

## Next Operational Step

1. Close or supersede PR noise (`#313`, and rework decision for `#305`).
2. Enable branch protection on `main` with required checks and required reviews.
3. Keep using Schema Contract V2 as the authoritative production shape.
4. Treat sessions `109` and `110` as verified-repaired in the current production state; no repair action should be scheduled unless a fresh read-only check shows regression.
