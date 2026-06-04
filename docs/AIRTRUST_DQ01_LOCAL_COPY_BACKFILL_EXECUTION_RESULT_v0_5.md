# AirTrust — DQ01 Local-Copy Backfill Execution Result v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `c3f11d5`  
**Target:** `local-copy`  
**Approval id:** `DQ01-LOCALCOPY-20260604-FILIPE`  
**Modo:** execução controlada local-copy. Sem D1 remoto. Sem staging. Sem produção. Sem deploy. Sem `MIG-01`. Sem `0389`.

## 1. Veredito

```text
DQ-01 = LOCAL_COPY_BACKFILL_VALIDATED_READY_FOR_STAGING
MIG-01 = WAITING_FOR_DQ_STAGING_OR_CONTROLLED_DECISION
```

Este resultado não fecha `DQ-01` como resolvido em ambiente real. Ele valida uma execução controlada em `local-copy` e deixa o próximo avanço dependente de staging aprovado ou decisão formal equivalente.

## 2. Ambiente e artefatos

| Item | Evidência |
|---|---|
| Target usado | `local-copy` |
| Staging disponível | não |
| DB evidence | `worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite` |
| Snapshot pré-janela | `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/dq01-local-copy-pre-window-20260604T172927Z.sqlite` |
| Snapshot SHA-256 | `51ed357a365c420ff05e18a5bb37c4cde7a96a86c5c9376ff9dc923557b67a3d` |
| Rollback | `docs/controlled-execution/dq01-rollback-plan-20260604.md` |
| Safe command readonly | `bash scripts/run-dq01-local-copy-backfill-readonly.sh` |
| Safe command mutante | `bash scripts/run-dq01-local-copy-backfill-apply.sh` |

## 3. Gates

Com o safe command mutante revisado:

- `bash scripts/controlled-execution-gate.sh` -> `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/dq01-controlled-backfill-gate.sh` -> `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/audit-data-quality-readiness.sh` -> `PASS`

## 4. Diagnóstico pré

Contagens agregadas, sem PII:

| Check | Status pré | Count pré | Ação |
|---|---:|---:|---|
| `funcionario_duplicado_tenant` | PASS | 0 | nenhuma |
| `funcionario_sem_empresa` | PASS | 0 | nenhuma |
| `qualificacao_duplicada` | WARN | 45 | remanescente; exige decisão de negócio |
| `qualificacao_planejada_orfa` | PASS | 0 | nenhuma |
| `escala_sem_tenant_valido` | PASS | 0 | nenhuma |
| `alocacao_sem_escala_valida` | WARN | 2 | remanescente; exige decisão de negócio |
| `alocacao_duplicada` | WARN | 2 | remanescente; exige decisão de negócio |
| `status_divergente` | PASS | 0 | nenhuma |
| `registro_ativo_deleted_at_inconsistente` | WARN | 17 | corrigir status/ativo de registros soft-deleted |

Checks com cobertura parcial por schema local:
- `empresa_sem_admin` -> SKIPPED, coluna `u.role` ausente no snapshot local
- `usuario_sem_empresa` -> SKIPPED, coluna `u.ativo` ausente no snapshot local
- `usuario_multiplas_empresas_sem_primaria` -> SKIPPED, coluna `ue.is_current` ausente no snapshot local
- `sessao_simulador_sem_participantes` -> SKIPPED, tabelas de simuladores ausentes no snapshot local
- `frms_jornada_sem_dados_minimos` -> SKIPPED, tabela `frms_jornadas` ausente no snapshot local

Resumo pré:

```text
PASS=5 WARN=4 FAIL=0 SKIPPED=5
```

## 5. Execução

Comando executado:

```bash
bash scripts/run-dq01-local-copy-backfill-apply.sh
```

Resultado:

```text
PLAN | soft_delete_status_alignment | candidates=17
APPLIED | soft_delete_status_alignment | changed=17
REMAINING | soft_delete_status_alignment | count=0
DQ01_LOCAL_COPY_BACKFILL_APPLY=COMPLETED
```

Domínio afetado:
- `funcionarios`

Mutação feita:
- registros com `deleted_at IS NOT NULL` e `status` ainda ativo passaram para `status = 'INATIVO'`, `ativo = 0` e `updated_at = datetime('now')`.

## 6. Diagnóstico pós

Contagens agregadas, sem PII:

| Check | Status pós | Count pós | Resultado |
|---|---:|---:|---|
| `registro_ativo_deleted_at_inconsistente` | PASS | 0 | corrigido |
| `qualificacao_duplicada` | WARN | 45 | remanescente |
| `alocacao_sem_escala_valida` | WARN | 2 | remanescente |
| `alocacao_duplicada` | WARN | 2 | remanescente |

Resumo pós:

```text
PASS=6 WARN=3 FAIL=0 SKIPPED=5
```

## 7. Rollback

Rollback validado em cópia separada do snapshot, sem destruir o DB pós-backfill:

```text
PRAGMA integrity_check = ok
soft_delete_status_alignment candidates in rollback copy = 17
```

## 8. Restrições confirmadas

- D1 remoto: não usado
- Staging: não tocado
- Produção: não tocada
- Deploy: não executado
- `MIG-01`: não executado
- `0389`: não aplicada
- Migration nova: não criada
- Migration histórica: não editada
- PII/secrets: não expostos nos docs ou logs de resultado

## 9. Handoff para Bloco 2

`MIG-01` não deve iniciar como rebaseline pleno apenas com evidência de `local-copy`. O próximo bloco precisa de uma decisão explícita:

1. promover `DQ-01` para staging aprovado e repetir diagnóstico/backfill, ou
2. aceitar formalmente a execução local-copy como decisão de controle limitada e manter `MIG-01` em janela separada com seu próprio target/snapshot/rollback/approval.
