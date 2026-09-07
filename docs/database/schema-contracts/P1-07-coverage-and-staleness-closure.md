# HEALTH P1-07 / issue #485 — schema-contract coverage + staleness closure

- **Status:** `CODE-CLOSED / OPS-PROOF-PENDING`
- **Date:** 2026-09-07
- **Reconciled against:** `origin/main` `c0b8cb5a` (`fix(schema-v2): fail closed on non-atomic table rebuilds (#497)`)
- **Scope:** read + code only. No migration applied, no remote write, no
  fabricated snapshot, no production change.

## 1. What was wrong

`production-d1-baseline-v2.json` covered a narrow, correct slice (13
simulator-session / `d1_migrations` tables, PRODUCTION_CONFIRMED against the
2026-07 read-only snapshot) but had **no linkage** to the 25 Schema V2 change
files that accreted under `worker-airtrust/schema-v2/changes/` afterwards. A new
Schema V2 change — including one altering a contract-scoped table — could land
with the contract silently unchanged. There was also no explicit statement of
baseline provenance and no distinction between "prepared" and "applied".

## 2. Inventory of the existing contract

| Group | Tables | Contract state |
|---|---|---|
| Simulator session lifecycle | `simuladores`, `simulador_agendamentos`, `sessoes_participantes`, `simulador_atribuicoes_curriculares`, `simulador_agendamento_segmentos`, `simulador_segmento_atribuicoes`, `simulador_segmento_participantes`, `modelos_sessao`, `modelos_sessao_manobras`, `fichas_sessao`, `fichas_sessao_manobras`, `fichas_sessao_instrutor_meta` | `PRODUCTION_CONFIRMED` (structural rule + `schema_hash`), snapshot `2026-07-29T00:22:49Z` |
| Migration ledger | `d1_migrations` | `PRODUCTION_CONFIRMED` |
| Out-of-contract (governance tables) | `airtrust_schema_baselines_v2`, `airtrust_schema_changes_v2` | acknowledged, not asserted |

No Schema V2 change since the baseline touches any of the 13 scoped tables — the
contract's structural half is **not stale**; its *coverage* half was missing.

## 3. Inventory + classification of Schema V2 changes since the baseline

Full machine-checked detail is in `schema_v2_since_baseline` in the contract.
Every entry is `coverage = OUT_OF_CONTRACT_SCOPE` (none touch the 13 scoped
tables). Provenance split (see `provenance.state_definitions`):

### PRODUCTION_CONFIRMED (2) — in-repo evidence exists

| Change | Tables | Evidence |
|---|---|---|
| `0472_frms_operational_readiness.sql` | `frms_readiness_assessment`, `frms_readiness_vigilance_trial` | 0475 plan: "the last governed change is `frms-operational-readiness-0472`" |
| `0475_usuarios_empresas_perfis_reconciliation.sql` | `usuarios_empresas_perfis` | 0475 plan: table "exists in production (147 rows)" (read-only confirmed) |

### REMOTE_APPLY_PENDING (16) — reviewed manifest wires `Apply Schema Change V2`, dispatch not confirmed here

`0438` (RDV workflow), `0451` (cron state), `0454` reconcile-existing,
`0467`/`0468` (SIGVOOS shadow), `0469` (LMS completion diag), `0470` (cert hash
index), `0474` (FRMS recovery), `0476` (FRMS PVT-B v2), `0481`/`0482` (training
dependency), `0483`/`0484`/`0485`/`0486` (eDB persistence), `0487`
(`qualificacoes_renovacoes`).

> `0487` prepared, governed, preflight/postcondition scripts wired — **not
> applied**. `0483`–`0486` likewise.

### REPO_EXPECTED (7) — DDL in repo, no reviewed manifest, no live-DB claim

`0452` (operational-domain RBAC), `0454` base statement, `0456` (LMS H5P),
`0457` (qualification-category ↔ LMS triggers), `0459` (SK76 denominator),
`0460` (simulator future planning), `ead-category-reconciliation-executor-0453`.

### Runtime-critical but not structurally covered

`runtime_critical_uncovered` in the contract lists `usuarios_empresas_perfis`
(multi-profile authorization authority, fail-closed, production-live) and
`qualificacoes_renovacoes` (P1-26). Both are blocked on an authorized read-only
production structural snapshot that does not exist in-repo — `OPS-PROOF-PENDING`,
not a code gap.

## 4. What this PR added (code-closed)

- `provenance` block: baseline state, snapshot timestamp, inspection method,
  the four state definitions, and an explicit "not asserted outside scoped
  tables" note.
- `staleness_guard` block: changes dir, manifests dir, `schema_v2_digest`,
  last-reconciled marker, policy text.
- `schema_v2_since_baseline`: all 25 changes classified (`change_file`,
  `sha256`, DDL `targets`, `domain`, `coverage`, `governance_state`,
  `reviewed_manifest`, `evidence` where applicable).
- `runtime_critical_uncovered`: the two tables above with `blocked_on`.
- `src/schema-contract/contractStaleness.mjs`: DDL target extraction (indexes /
  triggers resolve to their `ON` table; scratch/guard tables filtered), digest,
  and `evaluateStaleness()`.
- `checkSchemaContract.ts`: `--staleness`-only mode + staleness merged into the
  `--production` / `--snapshot` runs (the `Apply Schema Change V2` workflow now
  enforces it before and after a production apply).
- `scripts/schema-contract/check-contract-staleness.mjs` +
  `npm run guard:schema-contract-staleness`, wired into `npm run lint` and into
  the `build-content-gates` CI job (`node --test
  scripts/__tests__/schema-contract-staleness.test.mjs`).
- Tests: `src/__tests__/schema-contract/contract-staleness.test.ts` (22 cases,
  incl. "a scoped-table change that is not `REFLECTED_IN_CONTRACT` fails") and
  the `node:test` gate. Existing structural + hash tests unchanged and green.

## 5. What remains — OPS-PROOF-PENDING (not a code gap)

Refreshing `schema_hash` / the structural snapshot and promoting
`runtime_critical_uncovered` tables to verified rules needs an **authorized
read-only production window** (`wrangler d1 execute airtrust-db --env production
--remote`, SELECT/PRAGMA only). No Cloudflare production credentials are
available in this environment, so that step is left pending and must not be
faked. The staleness/provenance risk that #485 was about is now controlled in
code and CI.

## 6. Closure criteria (issue #485)

| Criterion | State |
|---|---|
| documented coverage of current critical tables | ✅ `schema_v2_since_baseline` + `runtime_critical_uncovered` |
| explicit baseline provenance | ✅ `provenance` block + 4 states |
| staleness / delta guard | ✅ `check-contract-staleness.mjs`, lint + CI |
| tests that fail on an unreflected critical schema change | ✅ `STALENESS_SCOPED_TABLE_CHANGED` cases |
| official CI green | ⏳ verified on the PR |
| remote snapshot refresh | ⏳ `OPS-PROOF-PENDING` (authorization required) |
