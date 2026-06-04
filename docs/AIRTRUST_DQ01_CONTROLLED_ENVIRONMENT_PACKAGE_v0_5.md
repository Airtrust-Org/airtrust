# AirTrust — DQ01 Controlled Environment Package v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `6df87e5`  
**Modo:** `local-copy` controlado. Sem backfill executado. Sem D1 remoto. Sem deploy. Sem `MIG-01`. Sem `0389`. Sem produção.

## 1. Veredito

```text
DQ-01 = READY_FOR_CONTROLLED_BACKFILL_EXECUTION
```

O pacote operacional rastreável abaixo completa o contrato mínimo para uma futura janela controlada de `DQ-01` em `local-copy`. Esta etapa **não executou backfill**; apenas materializou target, snapshot, rollback, approval id e safe command revisado.

## 2. Artefatos do pacote

| Item | Evidência |
|---|---|
| Target | `local-copy` |
| Approval id | `DQ01-LOCALCOPY-20260604-FILIPE` |
| DB evidence | `worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite` |
| Target evidence doc | `docs/controlled-execution/dq01-target-evidence-20260604.md` |
| Snapshot path | `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/dq01-local-copy-pre-window-20260604T171817Z.sqlite` |
| Snapshot hash | `51ed357a365c420ff05e18a5bb37c4cde7a96a86c5c9376ff9dc923557b67a3d` |
| Rollback plan | `docs/controlled-execution/dq01-rollback-plan-20260604.md` |
| Safe command reviewed | `bash scripts/run-dq01-local-copy-backfill-readonly.sh` |

## 3. Safe command

Comando aprovado nesta etapa:

```bash
bash scripts/run-dq01-local-copy-backfill-readonly.sh
```

Por que ele é seguro:
- o wrapper é `local-copy` only;
- ele invoca apenas `scripts/validation/run-data-quality-local.sh`;
- o runner copia o banco para um snapshot temporário antes de auditar;
- o SQL auditado é `SELECT-only`;
- não há `deploy`, `D1 remote`, `rebaseline` ou mutação de dados.

Importante:
- este é o **comando inicial revisado** para a janela controlada;
- o comando mutante de backfill real permanece fora desta etapa e exigirá aprovação separada antes de qualquer escrita.

## 4. Exports canônicos do gate

```bash
export AIRTRUST_CONTROLLED_TARGET="local-copy"
export AIRTRUST_CONTROLLED_APPROVAL="DQ01-LOCALCOPY-20260604-FILIPE"
export AIRTRUST_DB_PATH="worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite"
export AIRTRUST_CONTROLLED_SNAPSHOT_PATH="worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/dq01-local-copy-pre-window-20260604T171817Z.sqlite"
export AIRTRUST_CONTROLLED_ROLLBACK_PATH="docs/controlled-execution/dq01-rollback-plan-20260604.md"
export AIRTRUST_CONTROLLED_SAFE_COMMAND="bash scripts/run-dq01-local-copy-backfill-readonly.sh"
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

- nenhum backfill real foi executado;
- o lote mutante e suas contagens pré/pós ainda precisam de aprovação explícita em janela separada;
- se a execução precisar sair de `local-copy` para `staging`, um pacote equivalente deverá ser materializado para esse target.

## 7. Próximo passo

Rerodar os mesmos gates na abertura da janela e, só então, aprovar o comando mutante de `DQ-01` por lote controlado, mantendo `MIG-01`, `0389`, deploy e qualquer D1 remoto fora do escopo.
