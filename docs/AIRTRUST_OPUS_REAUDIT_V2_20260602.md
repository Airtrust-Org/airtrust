# AirTrust — Reauditoria Opus v2 (pós-hardening)

- **Data:** 2026-06-02
- **Repositório:** `/Users/filipedaumas/SAAS/Airtrust`
- **Branch:** `main`
- **HEAD auditado:** `e6d773eb9e973a4f5b35fdee87da67fbbe1e9381` (== `origin/main`, árvore limpa de *tracked*)
- **Modo:** read-only. Nenhum código alterado, nenhum commit/push/deploy/migration, nenhum DB remoto tocado.
- **Método:** cada achado anterior foi reverificado no código/linha e nos testes. Achados de "fail-open" e "cross-tenant" foram confirmados pelo código e pelos testes que os exercitam, não pelos relatórios de correção.

> **Aviso de método:** `CONFIRMADO` = verifiquei o código/linha e/ou o teste que o cobre. `RESIDUAL` = mitigado no caminho principal, mas resta um vetor secundário. `HIPÓTESE` = sem evidência conclusiva.

---

## 1. Resumo executivo

**O AirTrust está melhor que na auditoria anterior?**
Sim, de forma substantiva. Os dois achados de maior impacto da auditoria anterior — reset admin cross-tenant (P0) e fail-open de fadiga FRMS (P1) — estão **mitigados no código e cobertos por testes dedicados**. Os fluxos de isolamento de tenant (alocações de escala), a transição simulador→qualificação e a integridade das métricas do dashboard também ganharam guardas e testes de regressão.

**Algum P0 permanece?**
**Não.** Não há P0 ativo. O reset admin agora exige `tenant_scope` válido, valida suporte de coluna `empresa_id` e escopa **todas** as queries por `empresa_id`. Além disso, `/api/admin/*` está protegido no mount por `auth() + requireRole('admin')` (index.ts:836).

**Algum P1 permanece?**
**Não há P1 de código ativo.** Resta **um P1 de origem parcialmente mitigado** (scripts de DB/deploy): a superfície npm foi blindada, mas há caminhos secundários de foot-gun (deploy sujo via `deploy:all` e scripts shell destrutivos sem wrapper). São P2 na prática (exigem invocação manual + credencial wrangler), não vetores P0/P1 exploráveis remotamente.

**Pode seguir para novas features?**
**Sim.** Nenhum P0/P1 ativo bloqueia evolução. Recomenda-se fechar os resíduos P2 de deploy/scripts em paralelo (baixo esforço).

**Qual risco ainda exige migration/schema?**
Nenhum de forma **obrigatória**. `escala_alocacoes` continua sem coluna `empresa_id` própria e sem `UNIQUE` parcial — o isolamento é garantido por JOIN com `escalas_mensais` (enforçado e testado). A migration de denormalização + `UNIQUE` permanece como **defesa em profundidade opcional (P3)**, não como pré-requisito.

**Qual risco ainda exige credencial/smoke autenticado?**
A validação **funcional** autenticada em produção (login + leitura real de escala/FRMS/simulador + fail-safe FRMS) continua **pendente por credencial**. O script existe e é write-safe; falta apenas `AIRTRUST_AUTH_TOKEN`/`AIRTRUST_COOKIE`.

---

## 2. Matriz de remediação dos achados anteriores

| Achado original | Sev. orig. | Status atual | Evidência | Risco residual | Próxima ação |
|---|---|---|---|---|---|
| #1 Admin reset cross-tenant sem `empresa_id` | P0 | **MITIGADO** | `routes/admin.ts:124-177` (`resolveTenantScope`, `validateTenantScopeSupport`), todas as queries com subquery `WHERE empresa_id = ?` (`:252,262,275,288,417,427,550`); guard `tenant_scope_required` (403). Mount `index.ts:836` `requireRole('admin')`. Teste: `admin-reset-tenant-scope.test.ts`. | Nenhum explorável. | — |
| #2 FRMS fail-open (sono→8h, apto=1) | P1 | **MITIGADO** | `frms-fadiga-checkin.ts:258-297` (`normalizeFitForDutyPayload`→`missing`→400; `validateCheckinPayloadCompleteness`→400). Schema exige `fit_for_duty`. Testes: `frms-fadiga-checkin.fail-safe.test.ts`, `fail-open-hardening.test.ts`. | Caminho de **estimativa** (`/daily-fatigue` não preenchido) ainda usa 8h/06:00, **mas** marcado `not_submitted` / `data_source:default_estimate` / `fit_for_duty:null` / `requires_operational_review:true` → fail-safe. **P3 cosmético.** | Documentar semântica de estimativa. |
| #3 `escala_alocacoes` sem `empresa_id` | P1 | **MITIGADO (sem migration)** | CRUD e overlap escopados por JOIN `escalas_mensais` (`em.empresa_id = ?`). Teste: `escalas-alocacoes-tenant-scope.test.ts` (list/read/create/update/delete cross-tenant → 404; overlap ignora outro tenant). | Sem coluna `empresa_id` própria e sem `UNIQUE` parcial → risco estrutural se um futuro query esquecer o JOIN. | **P3:** migration de `empresa_id` denormalizado + `UNIQUE(...) WHERE deleted_at IS NULL`. |
| #4 Scripts `db:qualificacoes:*` remotos/destrutivos | P1 | **PARCIALMENTE MITIGADO** | `package.json` → `run-production-db-script.sh` com allowlist (3 arquivos), `AIRTRUST_ALLOW_PROD_DB_WRITE=YES`, frase de confirmação exata, branch=main, árvore limpa, `HEAD==origin/main`. | **N2 (P2):** dezenas de scripts shell ainda rodam `wrangler d1 execute --remote` **sem** o wrapper (ex.: `purge-qualificacoes-cascade.sh`, `aplicar-correcoes-db.sh`, `apply-seed-data.sh`, `cleanup-backup-tables.sh` com `DROP TABLE`). Não estão em npm, mas são foot-guns. | Mover destrutivos para o wrapper ou mover para `scripts/legacy/` com `set -e` + confirmação. |
| #5 `deploy:pages` com `--commit-dirty=true` | P2 | **PARCIALMENTE MITIGADO** | `deploy:pages` agora roda `preflight-clean-deploy.sh` (main + árvore limpa + `HEAD==origin/main`) e **removeu** `--commit-dirty`. `preflight` validado (exit 0). | **N1 (P2):** `deploy:all` → `build-and-deploy.sh:48` **ainda** usa `--commit-dirty=true`; idem `scripts/legacy/deploy-full-automated.sh:79`. | Remover `--commit-dirty=true` desses dois caminhos ou rotear por preflight. |
| #6 Simulador PLANEJADA→CONCLUÍDA não sincroniza qualificação | P1/SUSPEITA | **MITIGADO** | `simuladores-shared.ts` (`sincronizarQualificacoesDaSessaoConcluida` com `empresa_id`; `criarQualificacoesPlanejadas` com conflito unique). Teste: `simuladores-qualificacoes-transition.test.ts` (6 casos: conclui, não duplica, tenant-scope 6 vs 9, CANCELADA recria, data passada bloqueia). | Nenhum relevante. | — |
| #7 Dashboard/métricas sem cobertura | P2 | **MITIGADO** | Rota propaga `empresaId` (`dashboard-metrics-integrity.test.ts`). Serviço com `empresa_id = ?`, `deleted_at IS NULL`, `status IN ('CONCLUIDA','CONCLUIDO')`, exclusão de `CANCELADA` (`services/dashboard-metrics-integrity.test.ts`). | Outras métricas executivas (compliance score, demanda) não têm o mesmo teste de contrato. | **P3:** estender testes de contrato às demais métricas. |
| #8 Smoke autenticado pendente | — | **PENDÊNCIA OPERACIONAL** | `smoke-authenticated-operational.sh`: public-only OK; autenticado exige credencial; writes `SKIPPED` por padrão; prod exige frase exata; FRMS fail-safe espera 400/422. | Sem credencial não há validação funcional autenticada ponta-a-ponta. | Fornecer `AIRTRUST_AUTH_TOKEN`/`AIRTRUST_COOKIE` e rodar uma vez. |

---

## 3. Novos achados ou regressões

| ID | Sev. | Módulo | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|
| N1 | **P2** | Deploy | `scripts/build-and-deploy.sh:48` `--commit-dirty=true` (via npm `deploy:all`); `scripts/legacy/deploy-full-automated.sh:79`. | Caminho alternativo de deploy publica build de árvore suja, contornando o `preflight` do caminho principal. | Remover `--commit-dirty=true` ou inserir `preflight-clean-deploy.sh` nesses scripts. |
| N2 | **P2** | DB/Ops | Vários scripts com `wrangler d1 execute --remote` sem wrapper: `purge-qualificacoes-cascade.sh`, `aplicar-correcoes-db.sh`, `apply-seed-data.sh` (prod), `cleanup-backup-tables.sh` (`DROP TABLE`), `limpar_duplicatas.sh`, `reset-manobras-completo.sh`. | Operações destrutivas em produção disparáveis manualmente sem allowlist/confirmação dupla/checagem de árvore. | Padronizar destrutivos atrás de `run-production-db-script.sh` ou isolar em `scripts/legacy/`. |
| N3 | **P3** | Admin/Manutenção | `routes/admin.ts:663` `POST /backfill-session-checks` chama `backfillSessionChecks(c.env.DB)` **sem `empresa_id`** (opera DB-wide). | **Admin-gated** (index.ts:836), idempotente e não-destrutivo (só preenche linhas faltantes de fichas já APROVADAS) → não é vulnerabilidade, mas não respeita tenant-scope. | Receber/aplicar `empresa_id` no backfill (defesa em profundidade). |
| N4 | **P3** | DB/Ops | `run-production-db-script.sh:83` usa `--remote` **sem** `--env production`. | Ambiguidade do binding de DB alvo (pode atingir o DB default em vez do `production`). Não é risco de segurança; é risco de no-op/alvo errado. | Confirmar binding e, se necessário, fixar `--env production`. |

Nenhuma regressão de contrato frontend/cliente foi identificada: as correções endureceram validações (FRMS 400 em payload incompleto) e propagaram tenant, sem mudar formatos de resposta de sucesso. Os testes (588 worker + 478 frontend) passam.

---

## 4. Status dos gates

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npm run build` | **PASS** (exit 0) |
| `npm run test:run` (frontend) | **PASS** — 478 passed, 3 skipped (50 arquivos) |
| `npm run test:worker` | **PASS** — 588 passed (79 arquivos) |
| `scripts/preflight-clean-deploy.sh` | **PASS** (exit 0; untracked = warning) |
| Smoke public-only (`AIRTRUST_PUBLIC_ONLY=YES`) | **PASS** |
| Smoke production read-only | **PASS** (web/dashboard/version 200) |
| `GET /api/version` | **PASS** — `2026-06-02T00:17:14Z-e6d773e` (production) |
| `GET /api/health` | **PASS** — `healthy` (database ok 126ms, storage ok 153ms) |
| Smoke autenticado funcional | **PENDENTE** — requer credencial |

Produção confirmada rodando `e6d773e` (== HEAD auditado).

---

## 5. Decisão final

**B — seguir operação e features, resolvendo os resíduos P2 de deploy/scripts em paralelo.**

Justificativa: não há P0 nem P1 de código ativo; os achados críticos anteriores estão mitigados **e testados**. Os únicos resíduos (N1/N2) são foot-guns operacionais que exigem invocação manual + credencial wrangler — não bloqueiam features, mas são baratos de fechar e reduzem risco de erro humano em produção. A migration de `escala_alocacoes` é opcional (P3), não condicionante.

> Não é necessário escalar para **C** (bloquear deploys): o caminho de deploy principal (`deploy` / `deploy:pages`) já está blindado por preflight; apenas o atalho `deploy:all` precisa ser alinhado.

---

## 6. Próximas 5 ações recomendadas

1. **Fechar dirty-deploy residual (N1, P2):** remover `--commit-dirty=true` de `build-and-deploy.sh:48` e `legacy/deploy-full-automated.sh:79`, ou roteá-los pelo `preflight-clean-deploy.sh`.
2. **Blindar scripts destrutivos (N2, P2):** mover `purge-qualificacoes-cascade.sh`, `aplicar-correcoes-db.sh`, `apply-seed-data.sh`, `cleanup-backup-tables.sh` para trás do wrapper `run-production-db-script.sh` (allowlist + confirmação dupla) ou para `scripts/legacy/`.
3. **Rodar o smoke autenticado uma vez** com credencial dedicada (token de service-account read-only) para fechar a pendência funcional; documentar o resultado.
4. **Migration opcional de defesa em profundidade (P3):** `escala_alocacoes.empresa_id` denormalizado + `UNIQUE(escala_id, funcionario_id, funcao, quinzena_id) WHERE deleted_at IS NULL` — apenas após autorização.
5. **Tenant-scope no backfill (N3) + confirmar `--env production` no wrapper (N4):** ajustes pequenos de robustez, sem urgência.

---

### Confirmação final
Nenhum código foi alterado. Nenhum commit, push, deploy, migration ou alteração de banco foi executado. Nenhum DB remoto foi tocado (apenas `GET /api/version` e `GET /api/health` read-only). Este relatório é um arquivo **untracked** em `docs/` e não foi commitado.
