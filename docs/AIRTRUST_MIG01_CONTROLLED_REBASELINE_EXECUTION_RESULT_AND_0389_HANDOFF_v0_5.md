# AirTrust - MIG01 Controlled Rebaseline Execution Result And 0389 Handoff v0.5

**Data:** 2026-06-04
**Branch:** `main`
**HEAD base:** `ff27b29`
**Target:** `staging`
**Approval id:** `MIG01-STAGING-20260604-FILIPE`
**Modo:** rebaseline controlado de artefato a partir do snapshot SQLite local de `staging`. Sem D1 remoto novo. Sem deploy. Sem apply da `0389`. Sem producao. Sem edicao de migrations historicas.

## 1. Veredito

```text
MIG-01 = RESOLVED_FOR_CONTROLLED_SCOPE
RBAC_SUPPORT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION
AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION
```

O `MIG-01` foi executado no escopo controlado aprovado: gerar e validar um baseline SQL de schema a partir do snapshot de `staging` ja validado apos `DQ-01`, preservando a cadeia historica intacta e removendo o ledger operacional `d1_migrations` do artefato de baseline.

## 2. Ambiente e artefatos

| Item | Evidencia |
|---|---|
| Target usado | `staging` |
| Ambiente Worker | `airtrust-api-staging` |
| DB evidence | `worker-airtrust/wrangler.toml:[env.staging].d1_databases:DB=airtrust-db-staging:id=b7f50907-c110-45f5-ad17-e97ea47f2826` |
| Target evidence doc | `docs/controlled-execution/mig01-staging-target-evidence-20260604.md` |
| Snapshot pre-MIG | `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-post-window-20260604T191117Z.sqlite` |
| Rollback | `docs/controlled-execution/mig01-staging-rollback-plan-20260604.md` |
| Safe command | `bash scripts/run-mig01-staging-rebaseline.sh` |
| Baseline SQL gerado | `docs/controlled-execution/mig01-staging-schema-baseline-20260604.sql` |
| Summary gerado | `docs/controlled-execution/mig01-staging-rebaseline-summary-20260604.txt` |
| Baseline SHA-256 | `1e18e9271a8ada1b49a6d97921d07b43c5372a80ad541e94b0f2d08a53f4659c` |

## 3. Gates

- `bash scripts/controlled-execution-gate.sh` -> `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/mig01-controlled-rebaseline-gate.sh` -> `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/audit-migration-chain-readiness.sh` -> `PASS`

## 4. Diagnostico pre-MIG

Diagnostico read-only sobre o snapshot local de `staging`:

| Check | Resultado |
|---|---:|
| `PRAGMA integrity_check` | `ok` |
| Tabelas candidatas ao baseline, excluindo `d1_migrations` | `225` |
| Indices | `585` |
| Triggers | `21` |
| Views | `10` |
| Objetos de schema candidatos | `841` |
| Entradas no ledger `d1_migrations` do snapshot | `4` |
| Objetos da `0389` no snapshot | `0` |

Ledger encontrado no snapshot:

```text
0000_production_schema.sql
0003_create_usuarios.sql
0370_create_escala_voo_diaria_justificativas.sql
0371_create_escala_voo_diaria_publicacoes.sql
```

Cadeia canonica local:

```text
canonical_sql_files=361
duplicate_prefix_groups=30
non_standard_files=3
regular_max_prefix=389
sentinel_count=1
```

Riscos preservados e documentados:

- `0058 -> 0059` segue como risco historico de replay limpo;
- `0354 -> 0387` permanece reconciliado por baseline/bootstrap documentado;
- os 30 prefixos duplicados e 3 nomes fora do padrao continuam guardados por teste, sem edicao historica;
- a `0389` existe localmente como proxima migration de Audit/RBAC, mas nao foi aplicada nem incluida no baseline desta janela.

## 5. Execucao

Comando executado:

```bash
bash scripts/run-mig01-staging-rebaseline.sh
```

Resultado:

```text
MIG01_STAGING_REBASELINE=COMPLETED
TABLES=225
INDEXES=585
TRIGGERS=21
VIEWS=10
SCHEMA_OBJECTS=841
D1_MIGRATIONS_EXCLUDED=YES
OBJECTS_0389_INCLUDED=NO
REMOTE_D1=NO
DEPLOY=NO
PRODUCTION=NO
HISTORICAL_MIGRATIONS_EDITED=NO
```

Efeito real:

- baseline SQL de schema gerado a partir do snapshot de `staging`;
- nenhuma mutation remota;
- nenhuma migration aplicada;
- nenhuma migration historica editada;
- nenhum dado de linha exportado;
- nenhum log com PII.

## 6. Diagnostico pos-MIG

O baseline gerado foi replayado em SQLite limpo.

| Check | Resultado |
|---|---:|
| Replay local do baseline | `PASS` |
| `PRAGMA integrity_check` no replay | `ok` |
| Tabelas no replay | `225` |
| Indices no replay | `585` |
| Triggers no replay | `21` |
| Views no replay | `10` |
| `d1_migrations` no replay | `0` |
| Objetos da `0389` no replay | `0` |

Comparacao pre/pos:

- contagens estruturais preservadas;
- ledger `d1_migrations` removido do artefato, como esperado;
- `0389` ausente antes e depois;
- baseline replayavel em banco limpo.

## 7. Rollback

Rollback remoto nao foi necessario porque nao houve D1 remoto nem mutation funcional.

Rollback aplicavel:

- remover/reverter `docs/controlled-execution/mig01-staging-schema-baseline-20260604.sql`;
- remover/reverter `docs/controlled-execution/mig01-staging-rebaseline-summary-20260604.txt`;
- restaurar status de `MIG-01` para `READY_FOR_CONTROLLED_REBASELINE_AFTER_DQ` se qualquer validacao futura invalidar este baseline;
- manter o snapshot pre-MIG como fonte de verdade para nova tentativa.

## 8. Restricoes confirmadas

- D1 remoto: nao usado nesta janela MIG
- Producao: nao tocada
- Deploy: nao executado
- DQ novo: nao executado
- `0389`: nao aplicada
- Migration historica: nao editada
- Dados de linha/PII: nao exportados

## 9. Handoff para Bloco 3

O proximo bloco grande e a aplicacao controlada da `0389` / schema `Audit v2` + `RBAC/Suporte v2`, usando target controlado, snapshot, rollback, approval e safe command proprios.

Status de entrada para o Bloco 3:

```text
MIG-01 = RESOLVED_FOR_CONTROLLED_SCOPE
RBAC_SUPPORT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION
AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION
0389 = NOT_APPLIED
DEPLOY = NOT_EXECUTED
PRODUCTION = NOT_TOUCHED
```
