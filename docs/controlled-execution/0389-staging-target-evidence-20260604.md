# AirTrust - 0389 Staging Target Evidence - 2026-06-04

**Data:** 2026-06-04  
**Branch:** `main`  
**Target:** `staging`  
**Environment:** `airtrust-api-staging`  
**DB binding:** `DB`  
**DB name:** `airtrust-db-staging`  
**DB id:** `b7f50907-c110-45f5-ad17-e97ea47f2826`  
**Migration alvo:** `worker-airtrust/migrations/0389_platform_roles_support_access_foundation.sql`

## 1. Escopo aprovado

- aplicar somente a `0389`;
- target controlado: `staging`;
- sem producao;
- sem deploy;
- sem reexecucao de `DQ-01`;
- sem reexecucao de `MIG-01`;
- sem enforcement runtime amplo;
- sem remocao do fallback legado `userId===1`.

## 2. Base de entrada

- `DQ-01 = RESOLVED_FOR_CONTROLLED_SCOPE`
- `MIG-01 = RESOLVED_FOR_CONTROLLED_SCOPE`
- snapshot/base pos-MIG de referencia:
  - `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-post-window-20260604T191117Z.sqlite`
- handoff de entrada:
  - `docs/AIRTRUST_MIG01_CONTROLLED_REBASELINE_EXECUTION_RESULT_AND_0389_HANDOFF_v0_5.md`

## 3. Evidencia operacional

Target validado por configuracao rastreada em `worker-airtrust/wrangler.toml`:

```toml
[env.staging]
name = "airtrust-api-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "airtrust-db-staging"
database_id = "b7f50907-c110-45f5-ad17-e97ea47f2826"
```

## 4. Comandos aprovados para a janela

- gate generico:
  - `bash scripts/controlled-execution-gate.sh`
- gate especifico:
  - `bash scripts/0389-controlled-schema-gate.sh`
- diagnostico read-only:
  - `bash scripts/run-0389-staging-schema-readonly.sh`
- apply controlado:
  - `bash scripts/run-0389-staging-schema-apply.sh`

## 5. Restricoes

- `production` explicitamente proibido;
- logs sem PII;
- apenas schema da `0389` entra no apply;
- qualquer bloqueio de gate aborta a janela.
