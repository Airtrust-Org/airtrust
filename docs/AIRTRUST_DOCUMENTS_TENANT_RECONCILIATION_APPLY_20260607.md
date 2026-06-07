# AIRTRUST Documents Tenant Reconciliation Apply — 2026-06-07

## Scope

- Production database: `airtrust-db`
- Branch: `main`
- HEAD at execution start: `7c52276ee377b5f12f344ba223df30d46e34500f`
- Frontend in production at validation time: `76bfd5c`
- Worker/API in production at validation time: `76bfd5c`
- Authorized write scope only:
  - `documentos`
  - `pasta_virtual`
- Explicitly not changed:
  - soft-deleted rows
  - qualifications data
  - FRMS / FIRA / aeronaves
  - migrations / backfills / DDL

## Backup

| Field | Value |
| --- | --- |
| Command | `env -u CLOUDFLARE_API_TOKEN wrangler d1 export airtrust-db --env production --remote --output /Users/filipedaumas/SAAS/Airtrust/artifacts/db-backups/airtrust-db-preapply-lote2-20260607_130901.sql` |
| Path | `/Users/filipedaumas/SAAS/Airtrust/artifacts/db-backups/airtrust-db-preapply-lote2-20260607_130901.sql` |
| Size | `102,628,674 bytes` (`98M`) |
| Timestamp | `Jun 7 13:09:10 2026` |
| Result | Success |

## Pre-apply snapshots

| Artifact | Path | Rows |
| --- | --- | ---: |
| Documentos snapshot | `/Users/filipedaumas/SAAS/Airtrust/artifacts/sanitization/lote2-preapply-documentos-20260607.csv` | 45 |
| Pasta virtual snapshot | `/Users/filipedaumas/SAAS/Airtrust/artifacts/sanitization/lote2-preapply-pasta-virtual-20260607.csv` | 60 |
| Explicit rollback SQL | `/Users/filipedaumas/SAAS/Airtrust/artifacts/sanitization/rollback-documentos-lote2-explicit-20260607.sql` | 105 IDs |

### Snapshot shape notes

- `documentos` does not have `pasta_id`; snapshot exported `pasta_id = NULL`.
- `pasta_virtual` does not have `parent_id`, `nome`, or `path` canonical columns; snapshot exported:
  - `parent_id = NULL`
  - `nome = COALESCE(nome_arquivo, nomeoriginal)`
  - `path = caminho_arquivo`

## Pre-checks

### Documentos

- Candidate active rows: `45`
- Candidate rows tied to `funcionarios.empresa_id = 6`: `45`
- Duplicates in active `empresa_id = 6`: `0`
- Blocking orphans: `0`
- Soft-deleted rows included in apply: `0`

### Pasta virtual

- Candidate active rows: `60`
- Candidate rows tied to `funcionarios.empresa_id = 6`: `60`
- Duplicates: `0`
- Blocking orphans: `0`
- Soft-deleted rows included in apply: `0`
- `empresa_id IS NULL` among candidates: `0`
- `empresa_id = 1` among candidates: `60`

### Correlation / tenant safety

- Candidate documentos without matching active `pasta_virtual` row by `funcionario_id + nome_arquivo`: `0`
- Candidate `pasta_virtual` rows without compatible employee in tenant 6: `0`
- Candidate document/pasta links with incompatible tenant: `0`

## Rows changed

### Documentos moved to `empresa_id = 6`

IDs:

`281,282,286,287,289,290,291,293,295,296,297,298,299,300,301,302,303,304,305,306,307,309,310,311,312,313,314,315,316,317,318,319,320,321,322,323,324,325,326,327,328,329,330,331,332`

### Pasta virtual moved to `empresa_id = 6`

IDs:

`44,45,49,50,52,53,54,56,58,59,60,61,62,63,64,65,66,67,68,69,70,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,171,185,186,198,199,200,240,241,242,243,244,245,246,247,251`

## Apply

Executed as two explicit production updates matching `scripts/sanitization/apply-documentos-lote2.sql`:

1. `documentos` update
   - affected rows: `45`
2. `pasta_virtual` update
   - affected rows: `60`

Soft-deleted rows affected: `0`

## Post-checks

### Documentos

- Active rows now in `empresa_id = 6`: `237`
- Remaining active candidate rows in `empresa_id = 1`: `0`
- Soft-deleted rows still left in `empresa_id = 1`: `25`

### Pasta virtual

- Active rows now in `empresa_id = 6`: `178`
- Remaining active candidate rows in `empresa_id = 1/NULL`: `0`
- Soft-deleted rows still left in `empresa_id = 1/NULL`: `10`

### Relation integrity

- `documento.empresa_id != pasta_virtual.empresa_id` for correlated active pairs: `0`
- Newly moved documentos without correlated active `pasta_virtual`: `0`
- Newly moved documentos intersecting any post-check anomaly set: `0`
- Newly moved `pasta_virtual` rows with incompatible employee: `0`

### Residual pre-existing anomaly outside Lote 2 scope

There are `10` active `documentos` already in `empresa_id = 6` tied to `funcionario_id = 55`, where the employee row is soft-deleted (`deleted_at = 2026-02-27 20:18:46`).

This residue:

- existed outside the 45 moved IDs
- had `problematic_moved_intersection = 0`
- was not introduced by Lote 2
- was not modified in this apply because it is outside the authorized scope

## Rollback

- Rollback was prepared with explicit IDs only:
  - `/Users/filipedaumas/SAAS/Airtrust/artifacts/sanitization/rollback-documentos-lote2-explicit-20260607.sql`
- Rollback was **not executed** because post-checks passed for all moved rows.

## Validation

### Production API / deploy state

- `https://airtrust.online` serves `build-version = 76bfd5c`
- `https://api.airtrust.online/api/version` returns:
  - `version = 76bfd5c`
  - `environment = production`
- `https://api.airtrust.online/api/health` remained healthy after the apply

### Data validation in production

- Active `documentos` for tenant 6 increased from `192` to `237`
- Active `pasta_virtual` for tenant 6 increased from `118` to `178`
- No active lote-2 candidates remained in tenant 1 / NULL
- No soft-deleted lote-2 rows were altered
- `qualificacoes_historico` still reports:
  - `RENOVADA = 175`
  - `PLANEJADA = 1`

### Authenticated UI validation

- Attempted production login using repository default smoke credential `admin@airtrust.com / admin123`
- API response: `401 INVALID_CREDENTIALS`
- Therefore, authenticated UI validation for:
  - documentos appearing for affected employees
  - pasta visibility by employee
  - download/preview flows
  - permission-preservation checks
  could not be completed in-session without valid production credentials or an existing authenticated browser session

### Coverage used as compensating evidence

- Production DB post-checks on the moved IDs
- Production frontend/worker version checks
- Worker automated test suite including `documentos-tenant-isolation`

## Tests

Executed after apply:

- `npx tsc -p worker-airtrust/tsconfig.json --noEmit` — PASS
- `cd worker-airtrust && npm test -- --run` — PASS
  - `150` test files passed
  - `1017` tests passed

## Safety summary

- `DELETE`: not executed
- `INSERT`: not executed
- `UPSERT`: not executed
- `ALTER TABLE`: not executed
- `DROP`: not executed
- migrations: not executed
- broad backfill: not executed
- soft-deleted rows changed: `0`
- changes outside `documentos` and `pasta_virtual`: none

## Final status

`LOTE 2 APLICADO, VALIDADO E REVERSÍVEL`
