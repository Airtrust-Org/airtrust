# AirTrust — Audit Closure Executive Summary v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD:** `c12d8bf63c7bc9bede27ad6238459a9d921edb50`
**Modo:** Consolidado. Este resumo inclui sprints documentais e sprints de implementação pontual, incluindo o Sprint V (design), Sprint W (remoção dos DDL runtime já cobertos por migration), Sprint X.5 (apply 0385/0386 + deploy Worker/API), Sprint R04.6 (bootstrap runtime de Documentos removido) e Sprint R04.7 (deploy Worker/API + smoke + R04 = RESOLVED).

> **Addendum 2026-06-04:** o resumo acima permanece válido para o ciclo principal. Os residuais de cleanup de repositório, `.gitignore`, scripts ops e superfície debug/admin foram consolidados separadamente em `docs/AIRTRUST_REPOSITORY_CLEANUP_GOVERNANCE_PUBLIC_SURFACE_v0_5.md`.
>
> **Addendum 2026-06-04 — Audit v2 + RBAC/Suporte Schema Readiness:** a fundação mínima local foi versionada com a migration `0389_platform_roles_support_access_foundation.sql`, helper de dual-read para papéis de plataforma/suporte e helper pequeno de dual-audit legado + v2. Sem apply remoto, sem deploy e sem enforcement amplo. No fechamento local máximo posterior, o status canônico adicional foi consolidado como `RBAC_SUPPORT_V2 = LOCAL_FOUNDATION_COMPLETE_BLOCKED_BY_ENVIRONMENT` e `AUDIT_V2 = LOCAL_FOUNDATION_COMPLETE_BLOCKED_BY_ENVIRONMENT`.
>
> **Addendum 2026-06-04 — Final Local Residual Closure:** os dois resíduos finais de auth/tenant apontados pela auditoria Opus foram corrigidos localmente. `AUTH-RESIDUAL-01 = RESOLVED`, `AUTH-RESIDUAL-02 = RESOLVED`, `AUTH_TENANT = CONFIRMED_CLOSED` e `LOCAL_AUDIT_CLOSURE = COMPLETE_WITH_ENVIRONMENT_BLOCKERS`.

---

## 1. Estado geral

O AirTrust passou por um ciclo intenso de auditoria e remediação. Partimos de uma auditoria geral independente (2026-06-01) que identificou 1 P0 ativo (reset admin cross-tenant), 4 P1 (FRMS fail-open, `escala_alocacoes` sem `empresa_id`, scripts DB destrutivos, fallback `userId===1`), e dezenas de achados P2/P3.

**Hoje, 2026-06-03, o estado é:**

- **Nenhum P0 ativo.** O reset admin cross-tenant foi corrigido e testado.
- **Nenhum P1 de código ativo.** Todos os P1 de runtime foram mitigados ou corrigidos.
- **3 P2 residuais em scripts operacionais** (foot-guns que exigem invocação manual + credencial).
- **Achados abertos remanescentes** continuam sem bloquear piloto interno controlado.
- **Achados parciais** agora incluem os desenhos documentais concluídos do Audit Trail/LGPD v2 e do RBAC/Suporte v2, com readiness gate fechado e ordem de implementação definida, ainda sem runtime.

O código em produção permanece estável; o Sprint W removeu DDL runtime já coberto por migration e foi seguido de deploy do Worker/API.

---

## 2. O que foi resolvido

### Segurança e isolamento de tenant (7 correções críticas)

- **Reset admin cross-tenant** (P0 original): agora exige `tenant_scope` válido e filtra todas as queries por `empresa_id`.
- **7 gaps críticos de tenant isolation em documentos/certificados**: download, stream, export e delete agora verificam `funcionarios.empresa_id` antes de acessar R2.
- **5 gaps altos** de acesso/modificação indevida: corrigidos junto com os críticos.
- **2 gaps médios** de metadado/limpeza residual: corrigidos.
- **Asset gateway**: deny-by-default com classificação por prefixo (público, tenant-scoped, bloqueado).
- **FRMS fail-open**: campos de sono/aptidão agora obrigatórios; payload incompleto retorna 400.
- **`escala_alocacoes`**: todas as queries escopadas por JOIN `escalas_mensais.empresa_id`.

### Governança operacional (4 correções)

- **Deploy com `--commit-dirty=true`** removido do caminho principal.
- **Scripts DB destrutivos** protegidos por wrapper com allowlist, confirmação dupla e branch limpa.
- **Scripts legados** (seed, purge, cleanup, import) bloqueados por padrão.
- **Preflight e ops:guard** implementados como gates de deploy.

### Funcionalidades (6 entregas)

- **Module gating**: menu, rotas diretas e worker protegidos; `/api/auth/empresas` retorna `modulos_ativos` normalizado.
- **Contratos funcionais mínimos** para Hospedagem, SGSO, LMS/EAD e Treinamentos Planejados.
- **DDL runtime removido** de 8 hot paths (preferências, matriz, alertas, convocações, etc.).
- **Status enum centralizado** em `status-codes.ts` com compatibilidade para variantes PT/EN e gênero.
- **Repository pattern** em `dashboardService` (2 queries) e `lmsRelatoriosRepository` (3 queries).
- **RBAC/suporte**: fallback `userId===1` centralizado, helpers canônicos, guard arquitetural.

### Decisões estratégicas (2)

- **Supabase**: NÃO MIGRAR AGORA. HÍBRIDO FUTURO quando gatilhos de escala forem atingidos.
- **Segunda empresa**: CONDITIONAL GO — autorizado apenas piloto interno controlado.

---

## 3. O que ainda está parcial

| Área | O que foi feito | O que falta |
|---|---|---|
| **RBAC/Suporte** | `userId===1` centralizado; Sprint P definiu `platform_admin` e `support_read_only`; Sprint Q definiu dual-read, enforcement e rollback por fases | Migration para `platform_admin` persistido, grants de suporte, shadow dual-read, enforcement runtime e remocao do fallback legado |
| **Audit Trail/LGPD** | Sanitização em `auth.ts`, `admin.ts`, `assets.ts`, `empresas.ts`; Sprint O criou design v2; Sprint Q definiu schema aditivo, canonical writer e rollout audit-first; Sprint R versionou schema; Sprint S criou writer; Sprint X.5 aplicou migration `0385` em produção | Ativar flag, validar paridade, ampliar cobertura dual-write e validação jurídica de retenção |
| **Status Enum** | Helpers centrais em dashboard, simuladores, qualificações e treinamentos | Expandir para cron jobs, alertas e EVD |
| **Migration Integrity** | Sprint AH congelou a governança local, Sprint AI fechou a estratégia de rebaseline controlado, Sprint AK adicionou contrato/runbook/gate e o fechamento final executou o gate existente | Bloqueado por falta de target/snapshot/rollback/aprovação/comando revisado; rebaseline real não executado |
| **Data Quality** | SQL validado, runner local criado, 10 checks executados (5 PASS, 4 WARN, 5 SKIPPED); Sprint AH endureceu caminhos críticos, Sprint AI fechou mapa de backfill, Sprint AJ/AK criaram trilha controlada e o fechamento final executou o gate existente | Bloqueado por falta de target/snapshot/rollback/aprovação/comando revisado; backfill real não executado |
| **DDL Runtime** | Stream residual fechado: R01, R03, R04 e R09 resolvidos | Sprint V inventariou 20 ocorrências; Sprint W removeu os 6 caminhos cobertos (R02, R05, R06, R07, R08, R10); Sprint X.4 versionou `0386` e removeu o fallback de R03; Sprint X.5 aplicou `0386` em produção e deployou o Worker/API. R03 = RESOLVED. Sprint Z0 mapeou integralmente R01 (SIGVOOS), Sprint Z1 criou `0387` e Sprint Z1.1 provou a falha da cadeia limpa na `0354`. Sprint R01.2 criou `scripts/bootstrap-new-environment.sql`; Sprint R01.3 fechou a readiness; Sprint R01.4 removeu `ensureSigvoosTables()`, eliminou 10 call sites e adicionou teste dedicado de ausência de DDL/runtime SIGVOOS. R01 = RESOLVED. Sprint R04.6 removeu o bootstrap runtime de Documentos e Sprint R04.7 executou o deploy/smoke pós-deploy. R04 = RESOLVED. Sprint R09 removeu o ALTER TABLE de `shared.ts`; R09 = RESOLVED. |
| **Repository Pattern** | Piloto em 2 domínios (dashboard, LMS reports) | Expandir gradualmente para lms-cursos, qualificações |
| **Scripts DB** | Wrapper seguro criado para scripts críticos | Scripts shell legados ainda sem wrapper |
| **`escala_alocacoes`** | Tenant-scope por JOIN garantido e testado | Migration opcional P3 para coluna `empresa_id` própria + UNIQUE parcial |

---

## 4. O que permanece aberto

### Bloqueadores para cliente externo

1. **RBAC de plataforma**: o design e a readiness agora existem, mas `userId===1` ainda é o fallback em runtime e os papéis persistidos de plataforma/suporte ainda não existem.
2. **Audit trail**: o desenho v2 já existe, mas os writers ainda não foram padronizados nem migrados; `support_reason` continua ausente no runtime/schema atual.
3. **Data quality**: execução operacional completa pendente (5 checks SKIPPED).
4. **Cobertura de testes beta**: EVD sem cobertura; Hospedagem, SGSO, LMS com cobertura mínima.
5. **Smoke autenticado**: validacao funcional historica existe (PASS=11/11), mas as sessoes OP-1 e OP-2 ficaram `SKIPPED_AUTH_REQUIRED` por ausencia de credencial e de `AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO`.

### Não bloqueadores (para piloto interno)

6. **DDL runtime residual** em SIGVOOS e documentos: **fechado**. R03 = RESOLVED (Sprint X.5), R09 = RESOLVED (Sprint R09), R04 = RESOLVED (Sprint R04.7) e R01 = RESOLVED (Sprint R01.4).
7. **Status residual** em cron/alertas/EVD (bloqueia escala, não piloto).
8. **R2 metadata** de tenant ausente (defense-in-depth, não critério de segurança).
9. **Migration Integrity histórica**: produção atual segue estável, mas o rebaseline ainda precisa ser executado de forma controlada antes que ambientes novos dependam do baseline novo.
10. **Performance/bundle/N+1** sem auditoria profunda; crescimento de God files e concentração de `.prepare(` agora têm guard preventivo.
11. **Admin backfill** sem tenant-scope (admin-gated, idempotente, P3).

---

## 5. O que bloqueia nova empresa externa

**Sim, bloqueia.** Os seguintes itens precisam ser resolvidos antes de liberar acesso a um cliente externo real:

1. **Audit trail padronizado** — schema `audit_events_v2` já aplicado em produção via `0385`, mas writer canônico e flag ainda não ativados. `support_reason` presente no schema mas não em uso operacional ainda.
2. **RBAC/Suporte formal** — sem `platform_admin` persistido e `support` read-only, não há governança para multiempresa.
3. **Data quality executado** — sem validação operacional completa, não há garantia de integridade dos dados.
4. **Smoke autenticado** — sem validação funcional, não há confirmação de que o tenant funciona ponta-a-ponta.
5. **Aceite legal/compliance** — DPA, ToS, política de privacidade e retenção pendentes de definição.

---

## 6. O que não bloqueia piloto interno controlado

Os seguintes itens **não bloqueiam** um piloto interno/controlado ( empresa atual, time interno, sem cliente externo):

- DDL runtime residual (não afeta operação atual).
- Status residual em cron/alertas (não afeta operação principal).
- R2 metadata (defense-in-depth, não requisito).
- Performance audit (escala atual não justifica).
- Repository pattern incompleto (código funciona, só é menos organizado).
- Cobertura beta parcial (módulos permanecem ocultos para cliente).

**Condição para piloto interno:** manter módulos beta ocultos, não liberar acesso a cliente externo, executar smoke autenticado com empresa esperada, e obter aceite legal mínimo.

---

## 7. Riscos técnicos remanescentes

| Risco | Severidade | Probabilidade | Impacto |
|---|---|---|---|
| Script shell legado executado manualmente com `wrangler d1 execute --remote` | P2 | Mitigado (Sprint N — 12 bloqueados, guard ativo, wrapper) | Destruição de dados em produção |
| `deploy:all` com `--commit-dirty=true` (2 scripts) | P2 | Resolvido (flag removida) | Deploy de build não versionado |
| Query futura em `escala_alocacoes` esquecer JOIN `escalas_mensais` | P3 | Baixa (testes de regressão) | Vazamento cross-tenant |
| D1 atingir limite de 5GB ou 1M statements/dia | S3 | Média (crescimento) | Degradação de performance |
| Cadeia histórica de migrations seguir sem baseline governado | P3 | Média | Replay limpo frágil e baixa confiança em novos ambientes |

**Nenhum risco P0 ou P1 ativo em código de produção.**

---

## 8. Proximas 5 acoes recomendadas

1. **Fornecer credencial efemera/read-only + `AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO`** e reexecutar o smoke autenticado.
2. **Provisionar staging/snapshot/rollback de DQ-01** e rerodar o gate fail-closed.
3. **Executar o backfill controlado de Data Quality** em ambiente staging/snapshot aprovado para zerar checks `SKIPPED`.
4. **Executar o rebaseline controlado de MIG-01** com rollback e comparação estrutural.
5. **Executar o Audit v2 staging flag test** com schema ja aplicado, rollback por flag e validacao de paridade minima.

**Decisao operacional OP-1/OP-2:** `CONDITIONAL GO`.

---

## 9. Decisão sobre Supabase

**Decisão: NÃO MIGRAR AGORA. HÍBRIDO FUTURO.**

- Workers + D1 + R2 mantidos como plataforma atual.
- Auth custom mantido (muito integrado para portar).
- Supabase Postgres como caminho futuro quando gatilhos forem atingidos.
- Ações preparatórias concluídas: repository pattern, tenant isolation audit, Cloudflare Queues planejado.
- **Reavaliar em 2027-06-02** ou se D1 atingir 80% de qualquer limite.

---

## 10. Conclusão

**Classificação final:**

| Pergunta | Resposta |
|---|---|
| Pronto para piloto interno/controlado? | **Sim, com condições** (CONDITIONAL GO) |
| Pronto para cliente externo amplo? | **Não ainda** (RBAC/suporte, audit trail, data quality pendentes) |
| Pronto para múltiplas empresas sem governança adicional? | **Não** (requer RBAC formal, DDL residual removido, observabilidade) |
| Riscos P0/P1 conhecidos ativos? | **Nenhum** |
| Riscos P2 ativos? | **2** (scripts shell legados, smoke pendente por empresa esperada) — todos exigem ação manual |

O AirTrust está em um estado sólido para continuar operação e evolução. O ciclo de auditoria identificou e corrigiu os riscos mais graves. O caminho para cliente externo e multiempresa passa por investimento em governança (RBAC, audit trail, data quality) — itens que não exigem reescrita, mas sim disciplina de engenharia e decisões de produto.

**Observação sobre contagem:** a matriz legacy consolidada mistura grupos históricos e subconjuntos resumidos. Após os Sprints O, P e Q, usar a tabela detalhada da matriz mestre como fonte primária para status por achado.

---

**Addendum Sprint R01 Chain Reconciliation (2026-06-03):** achado formalizado. `0354` bloqueia cadeia limpa (`no such table: integracoes_sigvoos_config`). `0387` aplicada em produção não resolve replay. Testes 8/8 PASS. `ensureSigvoosTables()` preservado. **R01 = MIGRATION_APPLIED_CHAIN_RECONCILIATION_REQUIRED.** Doc de decisão: `docs/AIRTRUST_SIGVOOS_MIGRATION_CHAIN_RECONCILIATION_v0_5.md`.

**Addendum Sprint R01 Baseline Strategy (2026-06-03):** estratégia definida. Editar `0354` rejeitado; `0389` isolada insuficiente. Curto prazo: `scripts/bootstrap-new-environment.sql`. Longo prazo: squash/rebaseline. `ensureSigvoosTables()` preservado. Doc: `docs/AIRTRUST_SIGVOOS_R01_BASELINE_STRATEGY_v0_5.md`.

**Addendum Sprint R01 Bootstrap + Replay Closure (2026-06-04):** bootstrap local para ambientes novos implementado. `scripts/bootstrap-new-environment.sql` cria somente o DDL base necessário para a cadeia SIGVOOS atravessar a `0354` em replay limpo, sem dados reais, sem backfill e sem D1 remoto. O teste local agora prova explicitamente a falha sem bootstrap, a passagem com bootstrap e a idempotência do script. `ensureSigvoosTables()` foi preservado. **R01 = BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE.** Próxima fase: gate em ambiente novo/staging aprovado antes de remover o fallback.

**Addendum Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness (2026-06-04):** o bootstrap foi reaudidado e o teste local passou a incluir um gate explícito por etapas em banco limpo temporário. O inventário do fallback runtime foi fechado em 10 call sites concentrados em `sigvoos-frms.ts` e `integracoes_sigvoos.ts`. Nenhuma migration histórica foi editada, nenhuma migration nova foi criada, nenhum D1 remoto foi acessado e `ensureSigvoosTables()` foi preservado. **R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL.** Próxima fase: Runtime Fallback Removal + Final Audit Closure.

**Addendum Sprint R01.4 Runtime Fallback Removal + Final Audit Closure (2026-06-04):** o fallback runtime SIGVOOS foi removido de `sigvoos-frms.ts` e `integracoes_sigvoos.ts`, os 10 call sites foram eliminados, `scripts/bootstrap-new-environment.sql` foi preservado e o teste `sigvoos-no-runtime-ddl.test.ts` passou a bloquear qualquer regressão de DDL/runtime SIGVOOS. Nenhuma migration histórica foi editada, nenhuma migration nova foi criada, nenhum D1 remoto foi acessado e nenhum deploy foi executado. **R01 = RESOLVED. AUDIT_CURRENT_CLOSURE = CLOSED** para o stream R01/DDL residual. Próxima etapa recomendada: reauditoria independente com Opus.

**Addendum Sprint AH Data Quality + Migration Integrity (2026-06-04):** a camada de produção nao recebeu deploy nem migration nova, mas a auditoria remanescente ganhou dois fechamentos importantes de engenharia local. `MIG-01` passou a ter um guard permanente (`migration-governance.test.ts`) que pina duplicatas historicas, nomes fora do padrao e construtos de replay mais hostis ao D1; o status correto ficou **`PARTIAL_REQUIRES_FUTURE_REBASELINE`**, nao `RESOLVED`. `DQ-01` permaneceu parcial, mas os caminhos criticos de simuladores agora validam tenant e referencias antes de ler/escrever (`GET /instrutores`, participantes e fallback de checks), com regressao coberta por `simuladores-sessoes-data-quality.test.ts`.

**Addendum Sprint AI Migration Rebaseline + Data Quality Backfill Readiness (2026-06-04):** a sprint atual elevou os dois trilhos de engenharia local para readiness controlada, ainda sem execucao real. `MIG-01` passou para **`READY_FOR_CONTROLLED_REBASELINE`** com `AIRTRUST_MIGRATION_REBASELINE_READINESS_v0_5.md`, `audit-migration-chain-readiness.sh` e `readiness-audit-scripts.test.ts`. `DQ-01` passou para **`READY_FOR_CONTROLLED_BACKFILL`** com `AIRTRUST_DATA_QUALITY_BACKFILL_READINESS_v0_5.md`, `audit-data-quality-readiness.sh` e os guards criticos de simuladores preservados.

**Addendum Sprint AJ DQ-01 Controlled Backfill Gate (2026-06-04):** a sprint atual não executou mutation e não tocou banco real. O gate de DQ-01 falhou fechado por ausência de staging aprovado, snapshot, rollback e autorização explícita na sessão. `DQ-01` foi reclassificado para **`BACKFILL_EXECUTION_BLOCKED_BY_ENVIRONMENT_READINESS`**. Novos artefatos: `AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md`, `dq01-controlled-backfill-gate.sh` e `dq01-controlled-backfill-gate.test.ts`.

**Addendum Sprint AK Controlled Execution Environment Contract (2026-06-04):** a sprint atual não executou backfill nem rebaseline real, mas deixou os dois streams prontos para uma janela controlada futura. Foram versionados `AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md`, `AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md`, o gate genérico `controlled-execution-gate.sh`, o wrapper `mig01-controlled-rebaseline-gate.sh` e os testes de contrato. Com isso, `MIG-01` e `DQ-01` convergem para **`READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`**.

**Addendum Audit Cycle Final Closure (2026-06-04):** os gates existentes foram executados sem env de ambiente controlado e bloquearam corretamente. Nenhum backfill, rebaseline, D1 remoto, deploy, migration nova ou edição de migration histórica foi executado. `DQ-01` e `MIG-01` passam a **`BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`**. `ARCH-01` passa a **`MITIGATED_WITH_GUARDS`** com `architecture-performance-guard.test.ts`. Relatório final: `AIRTRUST_AUDIT_CYCLE_FINAL_CLOSURE_v0_5.md`.

**Addendum Final Local Residual Closure + Controlled Execution Bridge (2026-06-04):** `syncEscalaEventosExternos.ts`, `escalas-tripulacoes.ts` e `sgso-next-gen-extra.ts` foram endurecidos contra fallback de `empresa_id IS NULL` em ownership filters. O guard `sec02-null-empresa-scope.test.ts` cobre os padrões. Nenhum D1 remoto, deploy, backfill, rebaseline ou apply da `0389` foi executado.

**Addendum Product / Performance / Scale Hardening (2026-06-04):** o ciclo local ganhou uma passada adicional de hardening sem mutation remota. `simuladores-fichas-extras.ts` passou a limitar `GET /historico-notas/:funcionarioId` com default `100` e teto `200`. O smoke local foi ampliado para `dashboard/qualificacoes`, `dashboard/licencas` e `GET /evd?data=...`, enquanto o `architecture-performance-guard.test.ts` passou a congelar a allowlist real de `SELECT *` nas rotas críticas de dashboard/FRMS/EVD/simuladores/LMS/escalas/funcionários/aeronaves. Classificação correta: **`PRODUCT_PERFORMANCE_SCALE = MITIGATED_WITH_LOCAL_GUARDS_AND_SMOKE`**, ainda sem medição de staging/carga.

**Fim do resumo executivo.** Gerado em 2026-06-02. Atualizado com Sprint X.5 closure (R03 = RESOLVED), Sprint R04.7 (**R04 = RESOLVED**), Sprint R01 Chain Reconciliation, Sprint R01 Baseline Strategy, Sprint R01 Bootstrap + Replay Closure, Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness, Sprint R01.4 Runtime Fallback Removal + Final Audit Closure (**R01 = RESOLVED**; `AUDIT_CURRENT_CLOSURE = CLOSED` para o stream R01/DDL residual), Sprint AH (`MIG-01`/`DQ-01` auditados com guards permanentes e hardening crítico de simuladores), Sprint AI (`MIG-01 = READY_FOR_CONTROLLED_REBASELINE`; `DQ-01 = READY_FOR_CONTROLLED_BACKFILL`), Sprint AJ (`DQ-01 = BACKFILL_EXECUTION_BLOCKED_BY_ENVIRONMENT_READINESS`), Sprint AK (`MIG-01`/`DQ-01 = READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`) e Audit Cycle Final Closure (`DQ-01`/`MIG-01 = BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`; `ARCH-01 = MITIGATED_WITH_GUARDS`).
