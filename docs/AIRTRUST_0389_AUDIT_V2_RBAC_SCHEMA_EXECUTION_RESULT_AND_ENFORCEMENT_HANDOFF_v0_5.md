# AirTrust - 0389 Audit v2 + RBAC Support Schema Execution Result And Enforcement Handoff v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `ffc96ad`  
**Target:** `staging`  
**Approval id:** `SCHEMA0389-STAGING-20260604-FILIPE`  
**Modo:** schema controlado. Sem deploy. Sem producao. Sem reexecucao de `DQ-01` ou `MIG-01`. Sem enforcement amplo. Sem remocao de fallback legado.

## 1. Veredito

```text
RBAC_SUPPORT_V2 = SCHEMA_APPLIED_READY_FOR_GRADUAL_ENFORCEMENT
AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION
```

`RBAC_SUPPORT_V2` avancou porque a `0389` foi aplicada e validada em `staging`.

`AUDIT_V2` permaneceu conservador porque o diagnostico remoto confirmou `AUDIT_EVENTS_V2_EXISTS=0` em `staging`; portanto, nao ha base para marcar o stream como schema-applied neste ambiente sem extrapolar o escopo aprovado.

## 2. Ambiente e artefatos

| Item | Evidencia |
|---|---|
| Target usado | `staging` |
| Ambiente Worker | `airtrust-api-staging` |
| DB evidence | `worker-airtrust/wrangler.toml:[env.staging].d1_databases:DB=airtrust-db-staging:id=b7f50907-c110-45f5-ad17-e97ea47f2826` |
| Snapshot pre-0389 | `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/0389-staging-pre-window-20260604T200000Z-schema.sql` |
| Rollback | `docs/controlled-execution/0389-staging-rollback-plan-20260604.md` |
| Target evidence | `docs/controlled-execution/0389-staging-target-evidence-20260604.md` |
| Gate especifico | `scripts/0389-controlled-schema-gate.sh` |
| Read-only wrapper | `scripts/run-0389-staging-schema-readonly.sh` |
| Apply wrapper | `scripts/run-0389-staging-schema-apply.sh` |
| Safe command | `bash scripts/run-0389-staging-schema-apply.sh` |

## 3. Gates e checks

- `bash scripts/controlled-execution-gate.sh` -> `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/0389-controlled-schema-gate.sh` -> `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
- `bash scripts/run-0389-staging-schema-readonly.sh` pre -> `PASS`
- `bash scripts/run-0389-staging-schema-readonly.sh` pos -> `PASS`

## 4. Diagnostico pre-0389

Estado remoto antes do apply:

```text
USER_PLATFORM_ROLES_EXISTS=0
SUPPORT_ACCESS_GRANTS_EXISTS=0
SUPPORT_ACCESS_SESSIONS_EXISTS=0
AUDIT_EVENTS_V2_EXISTS=0
OBJECTS_0389_COUNT=0
D1_MIGRATIONS_ROWS=4
LEDGER_0389_ROWS=0
```

Ledger remoto encontrado:

```text
0000_production_schema.sql
0003_create_usuarios.sql
0370_create_escala_voo_diaria_justificativas.sql
0371_create_escala_voo_diaria_publicacoes.sql
```

## 5. Execucao

Comando executado:

```bash
bash scripts/run-0389-staging-schema-apply.sh
```

Resultado:

```text
SCHEMA_0389_STAGING_APPLY=COMPLETED
PRE_OBJECTS_0389_COUNT=0
POST_OBJECTS_0389_COUNT=9
POST_LEDGER_0389_ROWS=0
```

## 6. Diagnostico pos-0389

Estado remoto apos o apply:

```text
USER_PLATFORM_ROLES_EXISTS=1
SUPPORT_ACCESS_GRANTS_EXISTS=1
SUPPORT_ACCESS_SESSIONS_EXISTS=1
AUDIT_EVENTS_V2_EXISTS=0
OBJECTS_0389_COUNT=9
D1_MIGRATIONS_ROWS=4
LEDGER_0389_ROWS=0
USER_PLATFORM_ROLES_ROWS=0
SUPPORT_ACCESS_GRANTS_ROWS=0
SUPPORT_ACCESS_SESSIONS_ROWS=0
```

Estrutura confirmada:

- `user_platform_roles`
  - 11 colunas
  - indices: `idx_user_platform_roles_active_unique`, `idx_user_platform_roles_lookup`
  - 3 FKs para `usuarios`
- `support_access_grants`
  - 12 colunas
  - indices: `idx_support_access_grants_active_unique`, `idx_support_access_grants_lookup`
  - 4 FKs para `usuarios`/`empresas`
- `support_access_sessions`
  - 10 colunas
  - indices: `idx_support_access_sessions_active`, `idx_support_access_sessions_request`
  - 2 FKs para `usuarios`/`empresas`

Observacao de ledger:

- `d1_migrations` permaneceu em `4`;
- `0389` nao foi registrada no ledger porque a janela executou o SQL diretamente para garantir apply isolado da migration, sem consumir fila historica inesperada.

## 7. Validacao de helpers e contratos

Validacoes locais executadas:

- `platform-roles-support-access-schema.test.ts` -> `PASS`
- `platform-access.test.ts` -> `PASS`
- `record-legacy-and-canonical-audit.test.ts` -> `PASS`
- `migration-governance.test.ts` -> `PASS`
- `npm run test:worker` -> `PASS` (`131` arquivos, `868` testes)
- `npx tsc --noEmit` -> `PASS`
- `git diff --check` -> `PASS`
- `npm run ops:guard` -> `PASS` com `2` warnings historicos inventariados
- `npm run preflight` -> `NOT_AVAILABLE`

Leituras validadas:

- dual-read entre papel persistido e fallback legado `userId===1`;
- `support_read_only` continua sem poder mutar;
- `support_elevated` continua exigindo grant `elevated`;
- helper legado + canônico continua preservando a trilha legada se o writer v2 falhar controladamente.

## 8. Restricoes confirmadas

- enforcement amplo: nao ligado
- fallback legado: nao removido
- deploy: nao executado
- producao: nao tocada
- `DQ-01`: nao executado nesta janela
- `MIG-01`: nao executado nesta janela

## 9. Handoff para o proximo bloco

Bloco seguinte permitido por esta janela:

1. enforcement runtime gradual de `RBAC_SUPPORT_V2`;
2. paridade operacional de `AUDIT_V2`, condicionada antes ao fechamento do gap `AUDIT_EVENTS_V2_EXISTS=0` em `staging`;
3. sem remover o fallback legado ate que o dual-read tenha validacao operacional suficiente.
