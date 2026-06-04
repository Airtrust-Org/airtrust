# AirTrust — Release Gate Residual Reconciliation v0.5

**Data:** 2026-06-04
**Branch:** `main`
**HEAD base:** `6990b2c2fd60b56a4d425097e7da65b8a3988825`
**Modelo:** Sonnet 4.6, esforço alto
**Bloco:** Bloco 6.1 — Release Gate Residual Reconciliation (pós-auditoria final Opus)
**Restrições:** sem deploy, sem produção mutante, sem migration/apply, sem DQ/MIG, sem remoção de fallback legado, sem enforcement amplo

---

## 1. Veredito executivo

```text
RELEASE_GATE = READY_WITH_CONDITIONS
PRODUCTION_SCHEMA_STATE = VERIFIED_MISSING_AUDIT_RBAC_SCHEMA
AUTHENTICATED_SMOKE = BLOCKED_BY_MISSING_EPHEMERAL_CREDENTIAL
CYCLE_CLOSURE = CYCLE_CLOSED_FOR_CONTROLLED_SCOPE_PENDING_RELEASE_GATE
```

O ciclo está fechado para o escopo controlado. O estado de schema de produção foi confirmado por leitura read-only. A única condição objetiva restante para avançar para `READY_FOR_CONTROLLED_RELEASE` é a execução do smoke autenticado com credencial efêmera.

---

## 2. Estado Git

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `6990b2c2fd60b56a4d425097e7da65b8a3988825` |
| origin/main | `6990b2c2fd60b56a4d425097e7da65b8a3988825` |
| Divergência | `0 0` |
| Working tree | limpo (git diff --check PASS) |
| Untracked históricos | 9 docs `AIRTRUST_OPUS_*` e `AIRTRUST_MEMORY_*` — fora do escopo, não incorporados |

---

## 3. Parte 1 — Reconciliação documental

### 3.1 Status stale corrigido

`LOCAL_AUDIT_CLOSURE = COMPLETE_WITH_ENVIRONMENT_BLOCKERS` estava stale.

**Status correto para este bloco:**

```text
CYCLE_CLOSURE = CYCLE_CLOSED_FOR_CONTROLLED_SCOPE_PENDING_RELEASE_GATE
```

Justificativa: DQ-01, MIG-01, 0389 e 0385 (audit_events_v2) foram aplicados ou validados em staging. Enforcement gradual de RBAC/Suporte v2 está ativo em escopo controlado. O ciclo de auditoria principal está fechado — o que falta é apenas o release gate operacional (smoke autenticado + deploy target).

### 3.2 Ambiguidade 0385/0389 produção x staging — RESOLVIDA

**Situação anterior:** docs mencionavam "0385 aplicada em produção (Sprint X.5)" mas também "0385 aplicada em staging (Bloco 4)", gerando ambiguidade sobre o estado de produção.

**Verificação read-only executada neste bloco:**

```sql
SELECT name FROM sqlite_master WHERE type='table'
AND name IN ('audit_events_v2','user_platform_roles','support_access_grants','support_access_sessions');
```

**Resultado confirmado (produção `airtrust-db`):**

```text
audit_events_v2:        EXISTS   ← 0385 foi aplicada em produção (X.5) ✔
user_platform_roles:    ABSENT   ← 0389 apenas em staging
support_access_grants:  ABSENT   ← 0389 apenas em staging
support_access_sessions: ABSENT  ← 0389 apenas em staging
```

**Conclusão:** ambiguidade resolvida. A migration `0385_audit_events_v2.sql` foi de fato aplicada em produção no Sprint X.5. A migration `0389_platform_roles_support_access_foundation.sql` foi aplicada **apenas em staging**. O código em produção é fail-safe para tabelas 0389 ausentes (verificado em [platform-access.ts](../worker-airtrust/src/lib/rbac/platform-access.ts) e [platform-support.ts](../worker-airtrust/src/middleware/platform-support.ts) — ambos usam `hasTable()` antes de qualquer query/insert).

### 3.3 Implicação para release

Um deploy code-only do HEAD para produção é seguro:
- `audit_events_v2` já existe em produção → writer canônico funcional
- Tabelas 0389 ausentes em produção → `resolvePlatformAccessState` retorna `source: 'none'` para não-admins; tenant admins short-circuit antes das novas tabelas
- `platform-support` middleware: sessões de suporte não persistidas (tabela ausente), mas trilha legada preservada
- Enforcement gradual de RBAC/Suporte v2 permanece **não funcional em produção** até 0389 ser aplicada em produção sob janela controlada separada — comportamento esperado e seguro

---

## 4. Parte 2 — Estado de schema de produção (read-only)

```text
PRODUCTION_SCHEMA_STATE = VERIFIED_MISSING_AUDIT_RBAC_SCHEMA
```

| Tabela | Status em produção | Migration origem |
|---|---|---|
| `audit_events_v2` | **EXISTS** | `0385_audit_events_v2.sql` (Sprint X.5) |
| `user_platform_roles` | **ABSENT** | `0389_*.sql` (somente staging) |
| `support_access_grants` | **ABSENT** | `0389_*.sql` (somente staging) |
| `support_access_sessions` | **ABSENT** | `0389_*.sql` (somente staging) |

Comando executado (read-only, sem mutation, sem PII):

```bash
npx wrangler d1 execute airtrust-db --env production --remote --json --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('audit_events_v2','user_platform_roles','support_access_grants','support_access_sessions');"
```

Autenticação wrangler: OAuth Token (filipe.daumas@icloud.com). Sem alteração de dados.

---

## 5. Parte 3 — Smoke autenticado

```text
AUTHENTICATED_SMOKE = BLOCKED_BY_MISSING_EPHEMERAL_CREDENTIAL
```

Variáveis ausentes nesta sessão:
- `AIRTRUST_AUTH_TOKEN` — não configurado
- `AIRTRUST_EXPECTED_EMPRESA_ID` — não configurado
- `AIRTRUST_EXPECTED_EMPRESA_CODIGO` — não configurado

Histórico: smoke autenticado executado anteriormente com `PASS=11 FAIL=0 SKIPPED=2` (OPS-05, docs/AIRTRUST_OPERATIONAL_READINESS_EVIDENCE_v0_5.md). Nenhuma regressão de código foi introduzida desde então.

**Condição para avançar para `READY_FOR_CONTROLLED_RELEASE`:**
Fornecer credencial efêmera read-only + empresa esperada e executar:
```bash
AIRTRUST_AUTH_TOKEN=<token> \
AIRTRUST_EXPECTED_EMPRESA_ID=<id> \
AIRTRUST_PUBLIC_ONLY=NO \
bash scripts/smoke-authenticated-operational.sh
```

---

## 6. Parte 4 — Residuais LOW aceitos

| ID | Classificação | Justificativa |
|---|---|---|
| RES-01 | `ACCEPTED_LOW_RISK_DOCUMENTED` | Decorative joins `empresa_id IS NULL OR` em escalas-conflitos/templates/sigvoos-frms ancoradas em `em.empresa_id`; rows null-empresa são globais/sem-dono; sem vazamento cross-tenant nomeado |
| DQ-02 | `BACKLOG_CONTROLLED_SCOPE` | 5 checks SKIPPED por schema parcial de staging; não bloqueia release controlado; bloqueia GO externo amplo |
| STATUS-02 | `BACKLOG_CONTROLLED_SCOPE` | Status residual em cron/alertas/EVD; não afeta release controlado; bloqueia escala |
| PERF-01/02/03 | `REQUIRES_LOAD_TEST_FOR_EXTERNAL_SCALE` | Guards locais e allowlists congeladas; sem load test amplo; ok para escala atual |
| MULTI-04 | `ACCEPTED_PARTIAL_MITIGATED` | `escala_alocacoes` sem coluna própria; JOIN `escalas_mensais` garante escopo; migration P3 opcional |
| RBAC-01 | `ACCEPTED_PARTIAL_MITIGATED` | `userId===1` centralizado em `platform-access.ts`; guard arquitetural ativo; remoção aguarda migration |

Nenhum LOW residual foi alterado. Todos mantidos como backlog/accepted.

---

## 7. Parte 5 — Validações executadas

| Comando | Resultado | Observação |
|---|---|---|
| `git diff --check` | **PASS** | sem conflitos/whitespace |
| `npm run ops:guard` | **PASS** | 2 warnings históricos inventariados |
| `npm run preflight` | **NOT_AVAILABLE** | script inexistente em package.json |
| `cd worker-airtrust && npx tsc --noEmit --pretty false` | **PASS** | sem erros TypeScript |
| `npm run test:worker` | **PASS** | 133 arquivos, 874 testes |
| `bash scripts/audit-data-quality-readiness.sh` | **PASS** | readonly_checks=14 |
| `bash scripts/audit-migration-chain-readiness.sh` | **PASS** | canonical_sql_files=361, regular_max_prefix=389 |
| `npm run guard:tracked-secrets` | **OK** | sem secrets versionados |
| Staging D1 read-only wrapper | **VALIDATED_IN_BLOCK_5** | não re-executado (env/approval não set); Bloco 5 passou PASS |
| Production D1 read-only schema check | **PASS** | schema verificado — ver §4 |
| Smoke autenticado | **BLOCKED** | BLOCKED_BY_MISSING_EPHEMERAL_CREDENTIAL |
| Smoke público staging (AIRTRUST_PUBLIC_ONLY=YES) | **VALIDATED_IN_BLOCK_5** | PASS=3 FAIL=0 SKIPPED=0 |

---

## 8. Status final do release gate

```text
RELEASE_GATE = READY_WITH_CONDITIONS
```

**Condições pendentes:**

1. **Smoke autenticado efêmero** (única condição objetiva restante):
   - Fornecer `AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE` + `AIRTRUST_EXPECTED_EMPRESA_ID`
   - Executar `smoke-authenticated-operational.sh` em modo não-public
   - Critério de aceite: `PASS >= 10, FAIL = 0`

2. **Protocolo de deploy controlado** (a executar no momento do release):
   - Snapshot pré-deploy da produção (schema + tabelas críticas)
   - Approval ID nominal
   - Smoke pós-deploy (público + autenticado read-only)
   - Rollback documentado
   - Monitoramento de erros/latência nos hotspots

**O que NÃO bloqueia o release controlado:**
- Tabelas 0389 ausentes em produção (código fail-safe comprovado)
- Enforcement gradual inerte em produção (comportamento correto sem 0389)
- DQ-02, STATUS-02, PERF-01/02/03 (backlog controlado)
- Load test amplo (backlog para cliente externo)

**Após smoke autenticado PASS, próximo status:**
```text
RELEASE_GATE = READY_FOR_CONTROLLED_RELEASE
```

---

## 9. Condições antes do deploy controlado

Sequência exata:

```text
1. AUTHENTICATED_SMOKE = PASS
   └── bash scripts/smoke-authenticated-operational.sh (com credencial efêmera + empresa esperada)

2. DEPLOY_SNAPSHOT = RECORDED
   └── Schema-only snapshot da produção antes do deploy

3. DEPLOY_APPROVAL = NOMINAL
   └── Approval ID (ex: DEPLOY-PROD-20260604-FILIPE)

4. DEPLOY_EXECUTE = CONTROLLED
   └── npm run deploy (Worker + Pages, sem --commit-dirty)
   └── Manter fallback legado ativo
   └── Não aplicar 0389 em produção nesta janela

5. SMOKE_POST_DEPLOY = PASS
   └── Smoke público + autenticado pós-deploy
   └── Critério de abort: FAIL > 0 ou 5xx em rota crítica

6. ROLLBACK_CRITERION
   └── Regressão de auth/tenant, falha de audit writer, ou erro em rotas de certificados
```

---

## 10. O que NÃO foi feito

- Sem alteração de arquivos de código
- Sem commit de código
- Sem push (este documento será commitado separado)
- Sem deploy
- Sem produção mutante (apenas SELECT read-only em `sqlite_master`)
- Sem DQ/MIG
- Sem migration/apply
- Sem dados reais expostos
- Sem tokens/cookies expostos
- Sem remoção de fallback legado
- Sem enforcement amplo

---

**Fim do documento.** Gerado em 2026-06-04 (Bloco 6.1). Status canônico:
`RELEASE_GATE = READY_WITH_CONDITIONS` | `PRODUCTION_SCHEMA_STATE = VERIFIED_MISSING_AUDIT_RBAC_SCHEMA` | `AUTHENTICATED_SMOKE = BLOCKED_BY_MISSING_EPHEMERAL_CREDENTIAL`
