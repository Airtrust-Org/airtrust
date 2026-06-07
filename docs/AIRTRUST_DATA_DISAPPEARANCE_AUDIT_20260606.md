# Airtrust Data Disappearance Audit - 2026-06-06

## Scope

Audit focused on false-zero and disappearing-data risks in production read paths after the stabilization diff:

- Planned trainings consolidation.
- Simulator session detail schema compatibility.
- Management counters fail-closed behavior.
- Release version observability.
- Qualification renewal counter shown as `Renovadas 0`.

No migrations, backfills, manual production writes, destructive git commands, forced pushes, or data mutations were executed.

## Executive Result

`Renovadas 0` is a confirmed false zero for production tenant `empresa_id = 6`.

Production D1 has active renewed qualification history records, but one API variant hard-coded `renovadas: 0` and the remaining renewal stats counted only `renovada = 1`. That missed records where renewal was represented by persisted status (`RENOVADA`/`RENOVADO`) or by the renewal link (`renovacao_de`).

The backend contract now uses one functional rule across list filters, simple stats, extended stats, and serialized row status.

## Functional Rule

An active renewed qualification is:

```sql
qh.deleted_at IS NULL
AND UPPER(COALESCE(qh.status, '')) NOT IN ('CANCELADA', 'CANCELADO')
AND (
  COALESCE(qh.renovada, 0) = 1
  OR UPPER(COALESCE(qh.status, '')) IN ('RENOVADA', 'RENOVADO')
  OR qh.renovacao_de IS NOT NULL
)
```

If a local or older D1 schema does not have `renovacao_de`, the route detects that with `PRAGMA table_info(qualificacoes_historico)` and omits only the link predicate. It does not run DDL.

## Production Read-Only Evidence

Remote D1 command target:

```bash
cd worker-airtrust
npx wrangler d1 execute airtrust-db --remote --command "<read-only SQL>"
```

Schema evidence:

- `qualificacoes_historico.renovada` exists as `INTEGER DEFAULT 0`.
- `qualificacoes_historico.status` exists as `TEXT`.
- `qualificacoes_historico.renovacao_de` exists as nullable renewal link.
- Wrangler metadata reported `rows_written: 0` and `changed_db: false` for audit reads.

Tenant `empresa_id = 6` status counts:

| Status | Count |
| --- | ---: |
| `NULL` | 438 |
| `CONCLUIDA` | 77 |
| `RENOVADA` | 66 |
| `PLANEJADA` | 5 |
| `CANCELADA` | 4 |

Tenant `empresa_id = 6` renewal breakdown:

| Metric | Count |
| --- | ---: |
| Total history rows | 590 |
| Active rows | 538 |
| Active by `renovada = 1` | 146 |
| Active by `status IN ('RENOVADA','RENOVADO')` | 58 |
| Active by `renovacao_de IS NOT NULL` | 14 |
| Active by functional OR rule | 160 |

The overlap between those predicates explains why the OR rule is `160`, not the sum of the individual rows.

Top renewed qualification codes for tenant `empresa_id = 6`:

| Code | Renewed |
| --- | ---: |
| `D3` | 21 |
| `E2` | 11 |
| `IFR-139` | 9 |
| `FAP14-139` | 8 |
| `CMA` | 8 |
| `C` | 8 |
| `FAP14-76` | 7 |
| `FAP06-76` | 7 |
| `E5` | 7 |
| `E4` | 7 |
| `E1` | 7 |
| `B` | 7 |

## Local D1 Evidence

Local Miniflare D1 files were inspected under:

```text
worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/
```

One local DB had `qualificacoes_historico` with 584 rows, but it did not have the `renovacao_de` column. For that local DB:

| Metric | Count |
| --- | ---: |
| Total history rows | 584 |
| Rows for `empresa_id = 6` | 542 |
| Renewed by compatible rule without `renovacao_de` | 51 |

This validated the need for a read-time column guard rather than unconditional SQL against `qh.renovacao_de`.

## Root Cause

The false zero risk was in `worker-airtrust/src/routes/qualificacoes/historico.ts`:

- `/historico/stats-extended` returned `renovadas: 0` in live and materialized fallback paths.
- `/historico` and `/historico/stats` counted renewal only with `qh.renovada = 1`.
- The `RENOVADA` list filter also matched only `renovada = 1`.
- Row serialization derived `status: RENOVADA` only from `renovada`, so rows linked by `renovacao_de` could be counted incorrectly by clients.

## Fix Applied

Backend changes:

- Added a shared renewal SQL predicate builder.
- Added read-only `PRAGMA table_info(qualificacoes_historico)` detection for `renovacao_de`.
- Applied the functional renewal rule to:
  - `/historico` filters.
  - `/historico` stats.
  - `/historico/stats`.
  - `/historico/stats-extended`.
  - extended category stats.
  - row status serialization.
- Removed hard-coded `renovadas: 0` from `stats-extended`.
- Avoided returning stale materialized daily rows for this endpoint by calculating the response from live data and only using the materialized table as best-effort fill.

Contract tests added:

- `worker-airtrust/src/__tests__/routes/qualificacoes-historico-renovadas.test.ts`
  - Asserts `stats-extended` returns calculated `renovadas`.
  - Asserts SQL includes flag, status, and `renovacao_de` predicates when the column exists.
  - Asserts SQL remains valid when local D1 does not have `renovacao_de`.
  - Asserts `/historico?statuses=RENOVADA` serializes a row with `renovacao_de` as `status: RENOVADA`.

## Related Stabilization Verified

Planned trainings:

- Consolidated output distinguishes `TURMA`, `SIMULADOR`, and `QUALIFICACAO_PLANEJADA`.
- Individual planned qualification rows linked to simulator sessions are not duplicated in the consolidated feed.
- Contract tests cover route shape and compatibility.

Session detail:

- `GET /simuladores/sessoes/:id` tolerates older schemas without `aeronave_id` and `tipo_dispositivo`.
- Contract tests cover schema-compatible session detail.

Management counters:

- Management cards now fail closed with error/retry state instead of rendering silent zero on API failure.
- UI contract test covers the error path.

Release version:

- Worker version routes sanitize placeholder `managed-by-script`.
- Frontend reads the served `index.html` build meta version instead of relying on the deleted source `public/manifest.json`.
- Tests cover deployment/version helper behavior.

## Verification

Final successful gates:

```bash
npx tsc --noEmit
cd worker-airtrust && npx tsc -p tsconfig.json --noEmit
npm run lint
npm run build
npm run test:run
npm run test:worker
```

Observed results:

- `npm run test:run`: 66 files passed, 636 tests passed.
- `npm run test:worker`: 149 files passed, 1011 tests passed.

## Residual Work

Authenticated browser validation, production deployment, post-deploy API/UI reconciliation, and cache purge are still release steps. They should be executed only after the reviewed commit is pushed and deployment credentials/session state are confirmed.
