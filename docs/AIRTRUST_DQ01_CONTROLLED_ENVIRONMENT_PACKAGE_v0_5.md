# AirTrust — DQ01 Controlled Environment Package v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `c3f11d5`
**Modo:** `local-copy` controlado. Sem D1 remoto. Sem deploy. Sem `MIG-01`. Sem `0389`. Sem produção.

## 1. Veredito

```text
DQ-01 = LOCAL_COPY_BACKFILL_VALIDATED_READY_FOR_STAGING
```

O pacote operacional rastreável abaixo completou o contrato mínimo para uma janela controlada de `DQ-01` em `local-copy`. A janela local-copy foi executada depois com mutação limitada e validada em `docs/AIRTRUST_DQ01_LOCAL_COPY_BACKFILL_EXECUTION_RESULT_v0_5.md`.

## 2. Artefatos do pacote

| Item | Evidência |
|---|---|
| Target | `local-copy` |
| Approval id | `DQ01-LOCALCOPY-20260604-FILIPE` |
| DB evidence | `worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite` |
| Target evidence doc | `docs/controlled-execution/dq01-target-evidence-20260604.md` |
| Snapshot path | `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/dq01-local-copy-pre-window-20260604T172927Z.sqlite` |
| Snapshot hash | `51ed357a365c420ff05e18a5bb37c4cde7a96a86c5c9376ff9dc923557b67a3d` |
| Rollback plan | `docs/controlled-execution/dq01-rollback-plan-20260604.md` |
| Safe command readonly | `bash scripts/run-dq01-local-copy-backfill-readonly.sh` |
| Safe command mutante | `bash scripts/run-dq01-local-copy-backfill-apply.sh` |

## 3. Safe command

Comandos aprovados nesta etapa:

```bash
bash scripts/run-dq01-local-copy-backfill-readonly.sh
bash scripts/run-dq01-local-copy-backfill-apply.sh
```

Por que ele é seguro:
- o wrapper é `local-copy` only;
- ele invoca apenas `scripts/validation/run-data-quality-local.sh`;
- o runner copia o banco para um snapshot temporário antes de auditar;
- o SQL auditado é `SELECT-only`;
- o comando mutante é `local-copy` only, exige approval/snapshot/rollback e corrige apenas alinhamento inequívoco de soft delete em `funcionarios`.

Importante: esta execução não substitui staging aprovado. `RESOLVED_FOR_CONTROLLED_SCOPE` permanece reservado para ambiente real/staging.

## 4. Exports canônicos do gate

```bash
export AIRTRUST_CONTROLLED_TARGET="local-copy"
export AIRTRUST_CONTROLLED_APPROVAL="DQ01-LOCALCOPY-20260604-FILIPE"
export AIRTRUST_DB_PATH="worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite"
export AIRTRUST_CONTROLLED_SNAPSHOT_PATH="worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/dq01-local-copy-pre-window-20260604T172927Z.sqlite"
export AIRTRUST_CONTROLLED_ROLLBACK_PATH="docs/controlled-execution/dq01-rollback-plan-20260604.md"
export AIRTRUST_CONTROLLED_SAFE_COMMAND="bash scripts/run-dq01-local-copy-backfill-apply.sh"
export AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED="YES"
export AIRTRUST_CONTROLLED_ALLOWED_TARGETS="local-copy"
export AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1="NO"
```

## 5. Resultado dos gates

Executado com os exports acima:

- `bash scripts/controlled-execution-gate.sh` => `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/dq01-controlled-backfill-gate.sh` => `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/audit-data-quality-readiness.sh` => `PASS`

## 6. Pendências que continuam fora desta etapa

- staging ainda não foi executado;
- `qualificacao_duplicada`, `alocacao_sem_escala_valida` e `alocacao_duplicada` permanecem como remanescentes que exigem decisão de negócio;
- se a execução precisar sair de `local-copy` para `staging`, um pacote equivalente deverá ser materializado para esse target.

## 7. Próximo passo

Promover `DQ-01` para staging aprovado ou registrar decisão formal equivalente antes de liberar `MIG-01`.
