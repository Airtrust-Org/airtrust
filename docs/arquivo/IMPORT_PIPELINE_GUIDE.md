# Import Pipeline Guide (Staging → Principal)

This document describes the canonical import flow for Funcionários and Qualificações data into D1 (SQLite) using validation, deduplication, and idempotent ETL.

## Overview

- Source files or integrations write raw rows to staging tables: `import_funcionarios_staging`, `import_qualificacoes_staging`.
- Zod DTOs validate and normalize in-memory before insert into principal tables.
- ETL applies dedup/upsert rules and persists to canonical tables: `funcionarios`, `qualificacoes_historico`.
- Canonical fields:
  - Funcionários: `matricula`, `cpf`, `nome`, `email` (+ optional: `telefone`, `funcao`, `cargo`, `setor`, `codigo_anac`).
  - Qualificações Histórico: `funcionario_id`, `qualificacao_id`, `data_conclusao`, `data_vencimento`, `validade_meses`, `codigo`, `categoria`, `numero_certificado`, `status`, `observacoes`, `arquivo_url` (+ optional extras).
- Status is persisted for simple queries: `VALIDA`, `VENCIDA`, `PROXIMA_VENCIMENTO`.

## Validation (Zod)

Located at `worker-airtrust/src/schemas/importSchemas.ts`:

- `FuncionarioStagingSchema`: enforces required identity fields and normalizes `matricula`, `cpf`.
- `QualificacaoStagingSchema`: requires `funcionario_matricula`, `qualificacao_codigo`; dates are optional ISO strings.
- `validateBatch(schema, rows)`: returns `{ valid, errors }`.

## ETL Execution

Code: `worker-airtrust/src/scripts/etlImport.ts`.

- Funcionários

  1. Load unimported rows from `import_funcionarios_staging`.
  2. Validate with Zod; build `matricula → funcionario_id` map.
  3. Deduplicate by `matricula` (case-insensitive). Mark duplicates in staging with `validation_errors=['DUPLICATE_MATRICULA']` and `imported=1`.
  4. Insert new rows into `funcionarios`; mark staging as `imported=1`.

- Qualificações

  1. Load unimported rows from `import_qualificacoes_staging`.
  2. Validate with Zod; map `matricula → funcionario_id` and `codigo → qualificacao_id`.
  3. Skip rows with missing references; write `validation_errors=['REF_NOT_FOUND']`.
  4. Insert into `qualificacoes_historico` with canonical columns.

- Orchestrator: `runFullImport(db, { dryRun?: boolean })` runs both in order.

## Idempotency & Safety

- Staging rows have `imported` flag and `validation_errors`.
- Inserts are executed only when references exist and no duplicate by key.
- Triggers maintain `updated_at` on principal tables.
- Indices for performance:
  - `funcionarios(matricula)`, `funcionarios(cpf)`, `funcionarios(ativo)`
  - `qualificacoes_historico(funcionario_id, qualificacao_id)`, `qualificacoes_historico(data_vencimento)`, `qualificacoes_historico(status)`, `qualificacoes_historico(codigo)`, `qualificacoes_historico(categoria)`, `qualificacoes_historico(numero_certificado)`

## Running Locally

- Using Wrangler against remote D1 binding:

```bash
# Inspect pending rows in staging
wrangler d1 execute $DB --command "SELECT COUNT(*) FROM import_funcionarios_staging WHERE imported=0"
wrangler d1 execute $DB --command "SELECT COUNT(*) FROM import_qualificacoes_staging WHERE imported=0"
```

- Programmatic ETL (example within Worker context):

```ts
import { runFullImport } from './worker-airtrust/src/scripts/etlImport';
// db is the D1 binding (Env.DB)
await runFullImport(DB, { dryRun: false });
```

## Migration Notes

- The legacy view `qualificacoes_historico_v` was removed. Queries must use `qualificacoes_historico` and canonical columns `data_conclusao` and `data_vencimento`.
- Ensure consumers select with `WHERE deleted_at IS NULL` and order by `data_vencimento DESC` where applicable.

## Troubleshooting

- Rows not importing:
  - Check staging `validation_errors` JSON.
  - Verify `funcionario_matricula` and `qualificacao_codigo` exist in principal tables.
- Performance:
  - Validate indices exist on D1. Re-run migrations `0095–0097` if needed.
- Consistency:
  - Use `worker-airtrust/scripts/schema-sanity-check.sh` and `test-qualificacoes-integracao.sh` (updated for table).
