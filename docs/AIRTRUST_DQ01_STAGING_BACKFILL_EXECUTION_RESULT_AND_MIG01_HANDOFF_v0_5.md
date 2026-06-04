# AirTrust — DQ01 Staging Backfill Execution Result And MIG01 Handoff v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `5c4c690`  
**Target:** `staging`  
**Approval id:** `DQ01-STAGING-20260604-FILIPE`  
**Modo:** execução controlada em `staging`, com D1 remoto apenas para snapshot/export e apply do `DQ-01`. Sem deploy. Sem `MIG-01`. Sem `0389`. Sem produção.

## 1. Veredito

```text
DQ-01 = RESOLVED_FOR_CONTROLLED_SCOPE
MIG-01 = READY_FOR_CONTROLLED_REBASELINE_AFTER_DQ
```

O `DQ-01` foi executado e validado no target oficial `staging`. O lote autorizado desta janela encontrou `0` candidatos para `soft_delete_status_alignment` em `funcionarios`, portanto o apply remoto foi um no-op controlado, ainda assim coberto por snapshot, rollback, gates e diagnóstico pré/pós.

## 2. Ambiente e artefatos

| Item | Evidência |
|---|---|
| Target usado | `staging` |
| Ambiente Worker | `airtrust-api-staging` |
| DB evidence | `worker-airtrust/wrangler.toml:[env.staging].d1_databases:DB=airtrust-db-staging:id=b7f50907-c110-45f5-ad17-e97ea47f2826` |
| Target evidence doc | `docs/controlled-execution/dq01-staging-target-evidence-20260604.md` |
| Snapshot pré-janela SQL | `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-pre-window-20260604T190420Z.sql` |
| Snapshot pré-janela SQLite | `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-pre-window-20260604T190420Z.sqlite` |
| Snapshot pré SHA-256 | `fb609db3c6783d0a101e17204eb85244a1d375a599a3c66a37ed8d96b42f8f1b` |
| Snapshot pós-janela SQL | `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-post-window-20260604T191117Z.sql` |
| Snapshot pós-janela SQLite | `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-post-window-20260604T191117Z.sqlite` |
| Snapshot pós SHA-256 | `fb609db3c6783d0a101e17204eb85244a1d375a599a3c66a37ed8d96b42f8f1b` |
| Rollback | `docs/controlled-execution/dq01-staging-rollback-plan-20260604.md` |
| Safe command readonly | `bash scripts/run-dq01-staging-backfill-readonly.sh` |
| Safe command mutante | `bash scripts/run-dq01-staging-backfill-apply.sh` |

## 3. Gates

- `bash scripts/controlled-execution-gate.sh` -> `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/dq01-controlled-backfill-gate.sh` -> `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/audit-data-quality-readiness.sh` -> `PASS`

## 4. Diagnóstico pré

Contagens agregadas, sem PII, sobre o snapshot pré-janela de `staging`:

| Check | Status pré | Count pré |
|---|---:|---:|
| `funcionario_duplicado_tenant` | PASS | 0 |
| `funcionario_sem_empresa` | PASS | 0 |
| `qualificacao_duplicada` | PASS | 0 |
| `qualificacao_planejada_orfa` | PASS | 0 |
| `escala_sem_tenant_valido` | PASS | 0 |
| `alocacao_sem_escala_valida` | PASS | 0 |
| `alocacao_duplicada` | PASS | 0 |
| `status_divergente` | PASS | 0 |
| `registro_ativo_deleted_at_inconsistente` | PASS | 0 |

Checks com cobertura parcial no schema atual de `staging`:

- `empresa_sem_admin` -> SKIPPED, coluna `u.role` ausente
- `usuario_sem_empresa` -> SKIPPED, coluna `u.ativo` ausente
- `usuario_multiplas_empresas_sem_primaria` -> SKIPPED, coluna `ue.is_current` ausente
- `sessao_simulador_sem_participantes` -> SKIPPED, tabelas `simulador_sessoes` e `simulador_sessao_participantes` ausentes
- `frms_jornada_sem_dados_minimos` -> SKIPPED, tabela `frms_jornadas` ausente

Resumo pré:

```text
PASS=9 WARN=0 FAIL=0 SKIPPED=5
DECISION=SKIPPED (partial schema coverage)
```

## 5. Execução

Comando executado:

```bash
bash scripts/run-dq01-staging-backfill-apply.sh
```

Resultado:

```text
PLAN | soft_delete_status_alignment | candidates=0
APPLIED | soft_delete_status_alignment | changed=0
REMAINING | soft_delete_status_alignment | count=0
DQ01_STAGING_BACKFILL_APPLY=COMPLETED
```

Domínio afetado:

- `funcionarios`

Efeito real:

- nenhum registro precisou ser alterado no lote autorizado desta janela;
- o apply foi um no-op controlado, com validação de contagem entre snapshot pré-janela e target remoto antes da execução.

## 6. Diagnóstico pós

Contagens agregadas, sem PII, sobre o snapshot pós-janela de `staging`:

| Check | Status pós | Count pós |
|---|---:|---:|
| `funcionario_duplicado_tenant` | PASS | 0 |
| `funcionario_sem_empresa` | PASS | 0 |
| `qualificacao_duplicada` | PASS | 0 |
| `qualificacao_planejada_orfa` | PASS | 0 |
| `escala_sem_tenant_valido` | PASS | 0 |
| `alocacao_sem_escala_valida` | PASS | 0 |
| `alocacao_duplicada` | PASS | 0 |
| `status_divergente` | PASS | 0 |
| `registro_ativo_deleted_at_inconsistente` | PASS | 0 |

Resumo pós:

```text
PASS=9 WARN=0 FAIL=0 SKIPPED=5
DECISION=SKIPPED (partial schema coverage)
```

Comparação pré/pós:

- nenhuma divergência de contagem;
- nenhum candidato novo ou remanescente para `soft_delete_status_alignment`;
- snapshots pré e pós ficaram com o mesmo SHA-256, coerente com apply `changed=0`.

## 7. Rollback

Rollback permaneceu aplicável durante toda a janela:

- dump SQL pré-janela materializado e hash verificado;
- snapshot SQLite derivado restaurado localmente com `PRAGMA integrity_check = ok`;
- plano remoto de restauração versionado em `docs/controlled-execution/dq01-staging-rollback-plan-20260604.md`.

Rollback executado nesta janela:

- não

## 8. Exceções aceitas

- `5` checks ficaram `SKIPPED` por cobertura parcial do schema atual de `staging`;
- esta janela resolve o **escopo controlado de `DQ-01`** para o lote autorizado em `funcionarios`;
- a cobertura parcial remanescente permanece documentada como trilha separada em `DQ-02`, não como bloqueio desta execução controlada.

## 9. Restrições confirmadas

- D1 remoto: usado apenas em `staging`
- Produção: não tocada
- Deploy: não executado
- `MIG-01`: não executado
- `0389`: não aplicada
- Migration nova: não criada
- Migration histórica: não editada
- PII/secrets: não expostos nos docs ou logs desta janela

## 10. Handoff para Bloco 2

`DQ-01` está fechado para o escopo controlado desta trilha. O próximo bloco grande recomendado é:

1. materializar pacote próprio de `MIG-01` com snapshot/rollback/approval/safe-command;
2. executar `MIG-01 controlled rebaseline` em janela separada;
3. manter `Audit v2` e `RBAC/Suporte v2` fora desta janela, sem aplicar `0389` aqui.
