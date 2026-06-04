# AirTrust Next Sprints Plan v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `d65fc9eab2e8abe608c5f4820a6a23319ad1bb2c`
**Modo:** Planejamento atualizado após Sprint X.5 (migrations 0385/0386 aplicadas, Worker/API deployado), Sprint Z0 (R01 SIGVOOS readiness mapped), Sprint R04.5/R01 pós-apply oficial da fila pendente `0387` + `0388` e **Sprint R04.6 (bootstrap runtime de Documentos removido)**. Sem migration manual ou aplicação manual de dados reais.

> **Addendum 2026-06-04:** antes dos próximos blocos grandes, o repositório passou por uma etapa ampla de cleanup/governança/superfície pública. O resultado e os residuais aceitos estão em `docs/AIRTRUST_REPOSITORY_CLEANUP_GOVERNANCE_PUBLIC_SURFACE_v0_5.md`.
>
> **Addendum 2026-06-04 — Schema Readiness:** a fundação local para `Audit v2` + `RBAC/Suporte v2` foi versionada em `0389_platform_roles_support_access_foundation.sql`, com helper de dual-read de plataforma/suporte e helper pequeno de dual-audit legado + v2. Próximo bloco correto: apply controlado + validação de dual-read, sem ativar enforcement amplo nesta etapa.
>
> **Addendum 2026-06-04 — 0389 Applied In Staging:** a `0389` foi aplicada com sucesso em `staging` via wrappers controlados, sem deploy e sem enforcement amplo. `RBAC_SUPPORT_V2 = SCHEMA_APPLIED_READY_FOR_GRADUAL_ENFORCEMENT`. `AUDIT_V2` permanece em `READY_FOR_CONTROLLED_SCHEMA_MIGRATION` porque `audit_events_v2` ainda nao existe no target `staging`.
>
> **Addendum 2026-06-04 — Block 4 Closed:** a `0385_audit_events_v2.sql` foi aplicada com sucesso em `staging` sob gate/snapshot/rollback dedicados, e o enforcement gradual de `RBAC/Suporte v2` foi ativado em escopo controlado nas rotas sensíveis de certificados/admin. Status canônicos: `RBAC_SUPPORT_V2 = GRADUAL_ENFORCEMENT_ACTIVE_FOR_CONTROLLED_SCOPE` e `AUDIT_V2 = PARITY_VALIDATED_FOR_CONTROLLED_SCOPE`. Próximo bloco correto: `Product / performance / scale em staging`.
>
> **Addendum 2026-06-04 — Product/Performance/Scale Hardening:** houve uma passada local de hardening sem D1 remoto, sem deploy e sem mutation. Resultado: clamp seguro de `limit` em simuladores, smoke local adicional para dashboard/EVD e guard arquitetural ampliado para `SELECT *` em rotas críticas. Próximo passo correto para este stream: medição em staging dos hotspots herdados de FRMS/SGSO/LMS/escalas antes de qualquer conclusão de escala.
>
> **Addendum 2026-06-04 — Block 5 Product/Performance/Scale Staging Validation:** o stream foi validado em `staging` apenas no escopo controlado/read-only. `VALIDATION_BASELINE = PASS`; `PRODUCT_PERFORMANCE_SCALE = VALIDATED_IN_STAGING_FOR_CONTROLLED_SCOPE`; `test:worker` passou com `133` arquivos e `874` testes; smoke publico staging passou `PASS=3 FAIL=0 SKIPPED=0`; diagnostico D1 staging read-only passou. Proximo bloco correto: reauditoria final Opus / release gate, sem deploy ou schema change automaticos.

---

## Sprints concluídos (A–L)

### Sprint A — RBAC/Suporte
- **Status:** CONCLUÍDO (camada sem migration).
- **Commit principal:** `13dd828`
- **Deploy:** Sim (Worker).
- **Entregue:** Centralização do fallback `userId===1`, helpers canônicos, testes de fronteira RBAC, guard arquitetural.
- **Pendente:** Migration para `platform_admin`/`support` com remoção do fallback legado.

### Sprint B — Audit Trail/LGPD
- **Status:** CONCLUÍDO (camada sem migration).
- **Commit principal:** `300ecb9`
- **Deploy:** Sim (Worker).
- **Entregue:** Camada `lib/audit` com sanitização; `auth.ts`, `admin.ts`, `assets.ts`, `empresas.ts` sanitizados; eventos de acesso a assets privados.
- **Pendente:** Unificação dos 3 writers em contrato único com colunas dedicadas.

### Sprint C — Status Enum
- **Status:** CONCLUÍDO (camada crítica do worker).
- **Commits principais:** `c747b18`, `3a775a8`
- **Deploy:** Sim (Worker).
- **Entregue:** Módulo `status-codes.ts`, compatibilidade em dashboard, simuladores, qualificações e treinamentos planejados.
- **Pendente:** Cron jobs, alertas, EVD.

### Sprint D — Testes dos Módulos Beta
- **Status:** CONCLUÍDO (contratos mínimos).
- **Commits principais:** `7be3d50`, `11b9d44`
- **Deploy:** Sim (Worker).
- **Entregue:** Contratos funcionais mínimos para Hospedagem, SGSO, LMS/EAD; module gating testado.
- **Pendente:** EVD sem cobertura; complementos de update/checkout em Hospedagem.

### Sprint E — DDL Runtime Residual
- **Status:** CONCLUÍDO (hot paths).
- **Commit principal:** `01f0902`
- **Deploy:** Sim (Worker).
- **Entregue:** 8 funções `ensure*` removidas; funções órfãs removidas; teste de arquitetura.
- **Pendente:** 3 residuais (SIGVOOS, treinamentos, documentos) — exigem migrations.

### Sprint F — Data Quality
- **Status:** CONCLUÍDO (parcial — SQL validado, runner criado).
- **Commit principal:** `1a9722c`
- **Deploy:** Não (scripts apenas).
- **Entregue:** SQL read-only validado, runner local seguro, 10 checks (5 PASS, 4 WARN, 5 SKIPPED).
- **Pendente:** Execução completa em ambiente com schema completo.

### Sprint G — Data Quality Runner
- **Status:** CONCLUÍDO.
- **Entregue:** Runner local, npm scripts, validação estática.

### Sprint H — Repository Pilot Dashboard
- **Status:** CONCLUÍDO.
- **Commit principal:** `871a140`
- **Deploy:** Sim (Worker).
- **Entregue:** `dashboardMetricsRepository` com 2 queries read-only, testes de contrato.
- **Pendente:** Expandir para outras queries do dashboard e segundo domínio.

### Sprint I — Supabase Feasibility Audit
- **Status:** CONCLUÍDO.
- **Commit principal:** `bdbc200`
- **Deploy:** Não (documental).
- **Entregue:** 3 docs de análise; decisão NÃO MIGRAR AGORA / HÍBRIDO FUTURO.

### Sprint J — Supabase Preparation
- **Status:** CONCLUÍDO.
- **Commit principal:** `2733722`
- **Deploy:** Parcial.
- **Entregue:** `lmsRelatoriosRepository` criado (3 queries); tenant isolation audit (14 gaps); Cloudflare Queues plano; R2 metadata plano.

### Sprint K — Tenant Isolation Hardening
- **Status:** CONCLUÍDO.
- **Commit principal:** `7702467`
- **Deploy:** Sim (Worker).
- **Entregue:** 7 gaps críticos e 5 altos corrigidos; JOIN `funcionarios.empresa_id` em todas as queries de documentos/certificados.

### Sprint K.1 — Tenant Isolation Residuals
- **Status:** CONCLUÍDO.
- **Commit principal:** `8dfc14e`
- **Deploy:** Sim (Worker).
- **Entregue:** GAP-014 corrigido; MED-001 e MED-002 classificados e corrigidos; testes ampliados.

### Sprint L — LMS Reports Repository Integration
- **Status:** CONCLUÍDO.
- **Commit principal:** `59e601f`
- **Deploy:** Sim (Worker).
- **Entregue:** `lmsRelatoriosRepository` integrado em 3 rotas LMS; contrato preservado; testes de contrato.
- **APP_VERSION:** `2026-06-03T01:04:30Z-59e601f`.

### Sprint M — Data Quality + Smoke com Empresa Esperada
- **Status:** CONCLUÍDO (parcial — executado, pendências documentadas).
- **Commit principal:** `1b496af`
- **Deploy:** Não (documental/operacional).
- **Entregue:** Data Quality local executado (PASS=5, WARN=4, FAIL=0, SKIPPED=5). Smoke público baseline PASS=3. Evidências atualizadas.
- **Pendente:** Smoke com empresa esperada — SKIPPED (`AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO` não configurados). Data Quality staging com schema completo — SKIPPED (target staging não configurado).
- **Documentos:** `AIRTRUST_AUTHENTICATED_SMOKE_EVIDENCE_20260602.md`, `AIRTRUST_DATA_QUALITY_EVIDENCE_20260602.md`.

### Sprint Z.1 — Audit Matrix Consistency Review
- **Status:** CONCLUÍDO.
- **Commit principal:** `1b496af`
- **Deploy:** Não (documental).
- **Entregue:** Matriz reconciliada — 2 reclassificações (OPS-03→RESOLVED, OPS-05→PARTIAL). Documento de revisão de consistência. Roadmap e planos atualizados.
- **Pendente:** Nenhum.

---

## Próximos sprints (planejados)

### Bloco 6 — Reauditoria final Opus / Release Gate

- **Status:** Proximo bloco.
- **Escopo:** reconciliar resultado final do ciclo, validar se release gate exige smoke autenticado com credencial efemera, e decidir se ha condicao de deploy.
- **Nao fazer por padrao:** deploy, producao, migrations/apply, DQ-01, MIG-01 ou ampliacao de RBAC/Suporte sem nova janela controlada.
- **Dependencias:** se smoke autenticado for obrigatorio, configurar `AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE` e `AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO`.

### Sprint M — ~~Data Quality Completo + Smoke Empresa Esperada~~ ✅ EXECUTADO (parcial)

- **Status:** Executado em 2026-06-02. Data Quality local: PASS=5, WARN=4, FAIL=0, SKIPPED=5. Smoke público: PASS=3. Smoke empresa esperada: SKIPPED (env var não configurada).
- **Pendências:** (1) Configurar `AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO` e reexecutar smoke. (2) Executar Data Quality em staging com schema completo para zerar SKIPPED.
- **Commit:** `1b496af`

### Sprint N — Blindagem Operacional (P2 residuais) ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-02.
- **Commit:** Sprint N.
- **Deploy:** Não (scripts apenas).
- **Entregue:** Inventário completo de 45 scripts `.sh` com `wrangler d1 execute`. 12 scripts bloqueados com banner+exit. 22 scripts read-only na allowlist. Guard `audit-dangerous-ops.sh` reforçado com 5 checks (commit-dirty, git-add, remote-D1, DDL+remote, legacy audit). Documento `AIRTRUST_D1_SCRIPT_HARDENING_AUDIT_v0_5.md` criado. OPS-02 reclassificado de PARTIAL → RESOLVED.
- **Pendente:** Nenhum.

### Sprint O — Audit Trail/LGPD v2 Design ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-02.
- **Deploy:** Não (documental).
- **Entregue:** design do Audit Trail v2; campos obrigatórios/proibidos; taxonomia de eventos; modelo auditável de suporte; draft técnico de retenção; plano de migration futura.
- **Documentos:** `AIRTRUST_AUDIT_TRAIL_LGPD_V2_DESIGN_v0_5.md`, `AIRTRUST_AUDIT_EVENT_TAXONOMY_v0_5.md`, `AIRTRUST_AUDIT_RETENTION_POLICY_DRAFT_v0_5.md`, `AIRTRUST_SUPPORT_ACCESS_AUDIT_MODEL_v0_5.md`, `AIRTRUST_AUDIT_TRAIL_V2_MIGRATION_PLAN_v0_5.md`.
- **Pendente:** implementação real, migration, validação jurídica do draft de retenção e integração com RBAC/suporte v2.

### Sprint P — RBAC/Suporte v2 Design ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-02.
- **Deploy:** Não (documental).
- **Entregue:** modelo v2 para `platform_admin`, `support_read_only` e `support_elevated`; separação entre papéis de plataforma e de tenant; fail-closed para suporte; integração RBAC/audit; plano conceitual de migração do fallback legado `userId===1`.
- **Documentos:** `AIRTRUST_RBAC_SUPPORT_V2_DESIGN_v0_5.md`, `AIRTRUST_PLATFORM_ROLES_MODEL_v0_5.md`, `AIRTRUST_SUPPORT_READ_ONLY_MODEL_v0_5.md`, `AIRTRUST_RBAC_V2_MIGRATION_PLAN_v0_5.md`, `AIRTRUST_RBAC_AUDIT_INTEGRATION_PLAN_v0_5.md`.
- **Pendente:** implementação real, migration, dual-read, enforcement runtime, remoção segura do `userId===1` e rollback operacional.

### Sprint Q — RBAC + Audit Trail v2 Implementation Readiness Gate ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-02.
- **Deploy:** Não (documental).
- **Entregue:** ordem clara de implementação; phased implementation plan; test matrix; rollback plan; definição explícita de `audit-first`; recomendação de Sprint R antes de Sprint S.
- **Documentos:** `AIRTRUST_RBAC_AUDIT_V2_IMPLEMENTATION_READINESS_v0_5.md`, `AIRTRUST_RBAC_AUDIT_V2_PHASED_IMPLEMENTATION_PLAN_v0_5.md`, `AIRTRUST_RBAC_AUDIT_V2_TEST_MATRIX_v0_5.md`, `AIRTRUST_RBAC_AUDIT_V2_ROLLBACK_PLAN_v0_5.md`.
- **Pendente:** ativação/paridade do writer de audit, schema de platform roles, dual-read, enforcement e remocao do fallback legado.

### Sprint R — Audit Trail v2 Schema Backward-Compatible ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03.
- **Objetivo:** Versionar somente o schema backward-compatible do Audit Trail v2.
- **Entregue:** migration `0385_audit_events_v2.sql`; tabela `audit_events_v2`; campos canônicos; índices mínimos; teste local de schema/migration.
- **Compatibilidade:** `auditoria`, `audit_logs` e `auditoria_avancada_v2` preservadas; nenhum writer, auth, tenant ou RBAC alterado.
- **Deploy:** Migration aplicada em produção (Sprint X.5). Writer e flag permanecem desabilitados.
- **Pendente:** ativação do dual-write, paridade em ambiente aprovado e retenção operacional.
- **Modelo recomendado:** GPT-5.5 Altissimo.
- **Risco:** Alto, mitigado por schema aditivo e ausência de runtime.

### Sprint S — Audit Trail v2 Canonical Writer + Dual-Write ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03.
- **Objetivo:** Integrar o canonical writer ao schema v2 com dual-write mínimo e controlado, mantendo writers legados.
- **Entregue:** `recordAuditEventV2()`; metadata por allowlist; validações de suporte/falha; integração no helper de cursos LMS; testes de isolamento de falha.
- **Rollout:** `AUDIT_EVENTS_V2_DUAL_WRITE` desabilitada por padrão. Schema `audit_events_v2` já aplicado em produção via migration `0385` (Sprint X.5). Flag permanece desabilitada até staging flag test.
- **Modelo recomendado:** GPT-5.5 Altissimo.
- **Deploy necessário?:** Sim (já feito no Sprint X.5 junto com 0386).
- **Migration necessária?:** Já aplicada em produção via migration `0385` (Sprint X.5). Flag permanece desabilitada.
- **Pendente:** ativação, paridade operacional, observabilidade e ampliação para eventos críticos.
- **Risco:** Alto/Altissimo.

### Sprint T — Audit v2 Activation Readiness / Local-Staging Validation ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03.
- **Objetivo:** confirmar readiness local/staging do Audit v2 sem ativação em produção.
- **Entregue:** runners `audit-v2-local-activation-check.sh` e `audit-v2-dual-write-local-check.sh`; teste de readiness; confirmação de flag default off; evidência sanitizada.
- **Resultado operacional:** readiness criada; execução real ficou pendente para a rodada local aprovada seguinte.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.
- **Pendente:** aplicar schema em ambiente aprovado, ativar flag e validar paridade.
- **Risco:** Médio/Alto.

### Sprint T.1 — Audit v2 Local Activation Run ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03.
- **Objetivo:** executar localmente os runners do Sprint T com env aprovada.
- **Entregue:** `AIRTRUST_ALLOW_AUDIT_V2_LOCAL_CHECK=YES`; `AIRTRUST_AUDIT_V2_TARGET=local`; activation check `PASS`; dual-write local check `PASS`; evidência sanitizada atualizada; produção não tocada.
- **Decisão:** `READY_FOR_STAGING_FLAG_TEST`.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.
- **Pendente:** staging com schema aplicado, rollback por flag e validação de paridade.
- **Risco:** Médio.

### Sprint U — Audit v2 Staging Parity / Flag Prerequisite
- **Prioridade:** Curto prazo.
- **Objetivo:** fechar o gap de schema operacional do Audit v2 em `staging`, depois ativar a flag de forma controlada e validar paridade mínima.
- **Escopo:** schema aprovado; dual-write em LMS; rollback por flag; comparação mínima entre legado e v2; evidência sanitizada.
- **Modelo recomendado:** GPT-5.5 Altissimo.
- **Deploy necessário?:** Não necessariamente, depende do ambiente aprovado e do método de validação.
- **Migration necessária?:** Sim, em staging aprovado.
- **Risco:** Alto.

### Sprint V — RBAC/Suporte v2 Gradual Enforcement
- **Prioridade:** Curto prazo.
- **Objetivo:** ligar enforcement runtime gradual sobre o schema `0389` ja aplicado em `staging`, sem remover fallback legado nesta etapa.
- **Escopo:** grants persistidos; sessoes de suporte; shadow dual-read; logs de divergencia; rollback por flag; fallback `userId===1` preservado.
- **Modelo recomendado:** GPT-5.5 Altissimo.
- **Deploy necessário?:** Sim.
- **Migration necessária?:** Sim.
- **Risco:** Altissimo.

### Sprint W — Cobertura Beta (EVD + Complementos)
- **Prioridade:** Curto prazo.
- **Objetivo:** Criar cobertura de teste para EVD e complementar Hospedagem (update/checkout).
- **Escopo:** Testes de tenant-scope para EVD; contratos de update/checkout em Hospedagem; revisão de cobertura SGSO e LMS.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Não.
- **Risco:** Médio.

### Sprint V — DDL Runtime Residual Design ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03.
- **Objetivo:** Planejar migrations para os 3 DDL residuais sem executar.
- **Entregue:** Inventário completo de 20 ocorrências DDL em runtime; classificação (3 RUNTIME_HOT_PATH, 6 RUNTIME_HOT_PATH_COVERED, 4 LEGACY_QUARANTINED, 1 RUNTIME_BOOTSTRAP); 3 lacunas de migration confirmadas (SIGVOOS, Treinamentos Link, Documentos); design doc com ordem de 4 fases; migration readiness com pré-condições, validação, rollback. 6 funções `ensure*` identificadas como removíveis na Pré-Fase sem migration nova.
- **Documentos:** `AIRTRUST_RUNTIME_DDL_RESIDUAL_DESIGN_v0_5.md`, `AIRTRUST_DDL_RESIDUAL_MIGRATION_READINESS_v0_5.md`.
- **Deploy:** Não (docs-only).
- **Migration necessária:** Não nesta fase. 3 migrations planejadas para fases futuras.
- **Pendente na Sprint V:** Fase 3 M3 (remoção do bootstrap R04) — CONCLUÍDO na Sprint R04.6. R04 = RESOLVED. Fase 2 M2 (baseline/chain plan R01) — pendente. R09 = RESOLVED.
- **Risco:** Controlado (fase documental concluída; riscos de implementação mapeados por fase).

### Sprint W — DDL Pré-Fase: Remover `ensure*` já cobertos
- **Prioridade:** Curto prazo.
- **Status:** Entregue em 2026-06-03.
- **Objetivo:** Remover 6 funções `ensure*` cujo schema já é coberto por migrations existentes — zero migration nova, risco BAIXO.
- **Escopo entregue:** removidos `ensureTreinamentosPlanejadosSchema` (R02), DDL de `tipos.ts` (R05), DDL de `historico-helpers.ts` (R06/R07/R08) e `ensureModelosSessaoModeloAeronaveColumn` (R10). O guard arquitetural foi atualizado. Os call sites de `historico.ts`/`historico-write.ts` ficaram como compatibilidade via no-op/backfill porque esses arquivos ficaram fora do escopo autorizado.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Sim.
- **Migration necessária?:** Não.
- **Risco:** Baixo.

### Sprint X.0 — Read-only Schema Probe para M1 Treinamentos Link ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03.
- **Objetivo:** descobrir, sem tocar schema nem dados, se `solicitacoes_treinamento` já possui `treinamento_planejado_id`, `status_pre_agendamento` e `idx_solicitacoes_treinamento_planejado`.
- **Entregue:** runner `scripts/validation/probe-solicitacoes-treinamento-schema-readonly.sh`, fail-closed, somente com `PRAGMA`/`SELECT`; evidência sanitizada em `AIRTRUST_DDL_M1_SCHEMA_PROBE_EVIDENCE_20260603.md`.
- **Resultado:** probe local `PASS` em snapshot D1 local com tabela existente e as 2 colunas + índice ausentes. Probe de staging/produção `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED`.
- **Decisão:** R03 reclassificado para `BLOCKED_SCHEMA_PROBE_REQUIRED`; não criar M1 até existir probe read-only de ambiente aprovado.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não nesta fase.
- **Risco:** Baixo nesta fase; risco de implementação permanece médio/alto sem evidência do ambiente aprovado.

### Sprint X.1 — Tentativa de Schema Probe Autorizado ⚠️ SKIPPED
- **Status:** SKIPPED em 2026-06-03 (HEAD `c09c0cb`).
- **Objetivo:** executar o probe read-only em staging ou produção explicitamente autorizada, consultando apenas estrutura da tabela `solicitacoes_treinamento`.
- **Pré-condições:** branch `main` limpo, HEAD == origin/main, preflight PASS, ops:guard PASS.
- **Script revalidado:** `bash -n` limpo; somente PRAGMA table_info/index_list/index_info; bloqueio de produção sem confirmação presente; sem impressão de dados de linha; sem DML/DDL.
- **Autorização:** 4 variáveis UNSET (`AIRTRUST_ALLOW_SCHEMA_PROBE`, `AIRTRUST_SCHEMA_PROBE_TARGET`, `AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE`, `AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY`).
- **Resultado:** `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED`. Nenhum dado consultado. Nenhum DML/DDL executado.
- **Decisão:** R03 permanece `BLOCKED_SCHEMA_PROBE_REQUIRED`.
- **Bloqueio:** operador ainda não definiu as variáveis de autorização. O script está pronto e seguro — a barreira é exclusivamente humana.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não nesta fase.
- **Risco:** Baixo nesta fase.
- **Próxima fase:** Sprint X.2 — estender o script com runner remoto read-only.

### Sprint X.2 — Runner Remoto Read-only para Schema Probe ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03 (HEAD `d775bea`).
- **Objetivo:** estender o script de probe com runner remoto read-only para staging e production, usando `wrangler d1 execute --remote --json --command="PRAGMA ..."`.
- **Entregue:** runner remoto em `scripts/validation/probe-solicitacoes-treinamento-schema-readonly.sh` com:
  - Suporte a 3 targets: `local` (sqlite3), `staging` (wrangler remote), `production` (wrangler remote).
  - Validação SQL reforçada: bloqueio de `SELECT *`, `FROM` em tabelas de usuário, DDL, DML.
  - 3 PRAGMA validados (table_info, index_list, index_info).
  - Classificação de erro remoto: auth, network, generic.
  - Output sanitizado: apenas yes/no estruturais, sem dados de linha, sem PII.
- **Testes:** 5 cenários de autorização testados. Guardas de validação: 3 PRAGMA aceitos, 8 padrões DDL/DML rejeitados.
- **Resultado:** local `PASS`. Staging autorizado: `FAIL: remote_wrangler_error` (esperado — sem `wrangler login`).
- **Decisão:** R03 permanece `BLOCKED_SCHEMA_PROBE_REQUIRED`. Runner completo e fail-closed.
- **Bloqueio:** duplo — (a) env vars de autorização não definidas, (b) `wrangler login` necessário para `d1 execute --remote`.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não nesta fase.
- **Risco:** Baixo nesta fase.
- **Próxima fase:** Sprint X.3 — executar o fluxo em worktree limpo separado do repositório principal.

### Sprint X.3 — Worktree limpo + tentativa sem autorização ⚠️ SKIPPED
- **Status:** SKIPPED em 2026-06-03 (HEAD `ed354f9`).
- **Objetivo:** repetir o fluxo do R03 em worktree limpo para não tocar untracked fora do escopo no repositório principal.
- **Entregue:** worktree `/Users/filipedaumas/SAAS/Airtrust-r03-probe`; branch `sprint-x3-r03-probe`; HEAD == `origin/main`; `git status` limpo no worktree; `ops:guard` PASS; runner revalidado como seguro.
- **Resultado:** `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED` porque `AIRTRUST_ALLOW_SCHEMA_PROBE`, `AIRTRUST_SCHEMA_PROBE_TARGET`, `AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE` e `AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY` estavam `UNSET`.
- **Nota operacional:** `preflight-clean-deploy.sh` falhou apenas pelo gate `deploy only from main`, incompatível com a própria exigência de worktree em branch separada. Como não houve deploy, runtime ou schema change, isso foi tratado como conflito de procedimento, não como falha técnica do probe.
- **Decisão:** R03 permanece `BLOCKED_SCHEMA_PROBE_REQUIRED`.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não nesta fase.
- **Risco:** Baixo nesta fase.
- **Próxima fase:** Sprint X.4 — registrar o probe aprovado, versionar a M1 simples e remover o fallback runtime localmente.

### Sprint X.4 — M1 simples + remoção do fallback local ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03 (base `7bee415`).
- **Objetivo:** registrar o probe aprovado em produção para R03, criar a migration simples `0386`, remover `ensureSolicitacoesTreinamentoLinkSchema()` do runtime local e atualizar o guard arquitetural.
- **Entregue:** evidência de probe em `production` com `TABLE_EXISTS=yes`, `TREINAMENTO_PLANEJADO_ID_EXISTS=no`, `STATUS_PRE_AGENDAMENTO_EXISTS=no`, `IDX_SOLICITACOES_TREINAMENTO_PLANEJADO_EXISTS=no`; migration `0386_solicitacoes_treinamento_planejado_link.sql`; teste `solicitacoes-treinamento-planejado-link-schema.test.ts`; remoção do fallback runtime; atualização do `no-runtime-ddl-hot-paths.test.ts`.
- **Decisão:** `SIMPLE_M1` e status de R03 = `MIGRATION_VERSIONED_RUNTIME_FALLBACK_REMOVED_PENDING_APPLY`.
- **Deploy necessário?:** Não nesta sprint.
- **Motivo do não deploy:** a migration ainda não foi aplicada no ambiente-alvo; deployar o Worker/API antes da aplicação pode quebrar o runtime.
- **Migration necessária?:** Já versionada; aplicação remota permanece pendente.
- **Risco:** Médio/alto se deployar sem aplicar a migration; controlado enquanto o deploy permanecer bloqueado.
- **Próxima fase:** aplicar `0386` por procedimento aprovado no ambiente-alvo e só depois deployar o Worker/API.

### Sprint X.5 — Apply 0385/0386 + Deploy Worker/API ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03 (HEAD `c12d8bf`).
- **Objetivo:** aplicar as migrations `0385` e `0386` em produção via Cloudflare D1 migrations apply, executar probe pós-migration e deployar o Worker/API.
- **Entregue:**
  - Migrations `0385_audit_events_v2.sql` e `0386_solicitacoes_treinamento_planejado_link.sql` aplicadas em produção (mecanismo oficial Cloudflare D1).
  - Probe pós-migration: `STATUS=PASS` (target=production, todas as colunas/índices confirmados).
  - Worker/API deployado: `APP_VERSION=2026-06-03T17:00:27Z-c12d8bf`.
  - Smoke pós-deploy: PASS (3/3 público, health OK).
  - R03 = RESOLVED.
  - Audit v2 schema = `APPLIED_SCHEMA_READY_FOR_FLAG_PLAN`.
  - Observação: `/api/health stats.version` divergiu de `/api/version` (monitorar em sprint de observabilidade).
- **Deploy necessário?:** Já executado (Worker/API).
- **Migration necessária?:** Já aplicadas (0385 e 0386).
- **Pendente na Sprint X.5:** DDL runtime remanescente na época: R04 (Documentos) = MIGRATION_APPLIED_PENDING_RUNTIME_REMOVAL (Sprint R04.5). **Nota: R04 bootstrap foi removido na Sprint R04.6** — status atual: RESOLVED. R01 (SIGVOOS) evoluiu depois para `BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE` (ativo). R09 = RESOLVED.
- **Risco:** Controlado. Migrations aplicadas via mecanismo oficial, probe confirmou schema, smoke pós-deploy PASS.

### Sprint Z0 — DDL Fase 2 R01 SIGVOOS Readiness ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03 (HEAD `d65fc9e`).
- **Objetivo:** Mapear integralmente `ensureSigvoosTables()` (R01) em modo read-only/docs-only para preparar remoção futura.
- **Entregue:**
  - Inventário completo: 5 tabelas, 8 índices, 10 call sites em 2 arquivos.
  - 3 lacunas de migration confirmadas: `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` + 4 índices sem migration base.
  - Migração `0352` cobre integralmente `sigvoos_mapeamento_manual` e `frms_jornada_pendente` (com FK + CHECK extras que runtime não tem).
  - Migração `0354` referencia `integracoes_sigvoos_config` (coluna `notificar_falha_email`) mas não cria a tabela base — dependência circular documentada.
  - Migration `0387` planejada com schema completo incluindo `notificar_falha_email` no CREATE TABLE para resolver a circularidade.
  - Guard, preflight, tsc, build, testes e smoke executados: todos PASS.
  - R01 = READINESS_MAPPED.
- **Documentos:** `AIRTRUST_SIGVOOS_DDL_R01_READINESS_v0_5.md` (novo). 7 docs existentes atualizados.
- **Deploy necessário?:** Não (docs-only).
- **Migration necessária?:** Não nesta fase. Migration `0387` planejada para Sprint Z1.
- **Pendente:** Sprint Z1 — criar migration `0387`, teste local e plano de aplicação controlada.
- **Risco:** Controlado (fase documental concluída; riscos de implementação mapeados).

### Sprint Z1 — DDL Fase 2 R01 SIGVOOS Migration Local ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03 (HEAD `f2d0db6`).
- **Objetivo:** versionar a migration `0387`, criar teste local e decidir se o fallback R01 podia sair do runtime sem aplicar D1 remoto.
- **Entregue:**
  - Migration `0387_integracoes_sigvoos_base_tables.sql` criada.
  - Teste `sigvoos-base-tables-schema.test.ts` criado com cobertura de schema limpo, idempotência e cobertura combinada com `0352`.
  - Guard arquitetural mantido com `services/sigvoos-frms.ts` documentado explicitamente como exceção temporária.
  - Fallback `ensureSigvoosTables()` **preservado**.
  - R01 = `MIGRATION_VERSIONED_PENDING_RUNTIME_REMOVAL`.
- **Decisão:** não remover o fallback nesta sprint, porque `0354_auditoria_critica_schema_hardening.sql` ainda referencia `integracoes_sigvoos_config` antes de `0387` numa cadeia limpa de migrations.
- **Deploy necessário?:** Não.
- **Migration remota?:** Não nesta sprint.
- **Próxima fase:** auditar formalmente a cadeia `0354 -> 0387` antes de qualquer apply.

### Sprint Z1.1 — SIGVOOS Migration Chain Audit ✅ CONCLUÍDO
- **Status:** CONCLUÍDO em 2026-06-03 (HEAD `9da88c1` ou posterior).
- **Objetivo:** provar se a cadeia limpa de migrations SIGVOOS continua inválida por causa da `0354`.
- **Entregue:**
  - Auditoria formal em `AIRTRUST_SIGVOOS_MIGRATION_CHAIN_AUDIT_v0_5.md`.
  - Teste local expandido provando que `0354` falha sem `integracoes_sigvoos_config`.
  - Teste local provando que `0387` posterior não resgata a cadeia limpa.
  - Probe remoto SIGVOOS não executado: `SKIPPED_NO_SIGVOOS_SCHEMA_PROBE`.
  - R01 = `MIGRATION_CHAIN_BLOCKED_BY_0354`.
- **Decisão:** não aplicar `0387`, não remover `ensureSigvoosTables()`, não editar `0354` nesta fase.
- **Próxima fase:** definir baseline/plano de cadeia segura para ambientes novos e só depois discutir apply controlado ou remoção do fallback.

### Sprint Z2 — Remaining Findings Closure Plan ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** reconciliar o estado real dos achados remanescentes sem abrir novas microfases desnecessarias.
- **Entregue:**
  - plano consolidado em `AIRTRUST_AUDIT_REMAINING_FINDINGS_CLOSURE_PLAN_v0_5.md`;
  - reconciliacao da ordem real: `Smoke/Data Quality -> Audit v2 staging flag -> RBAC/Suporte v2 -> R04 bootstrap removal/deploy -> R01 chain plan` (R09 = RESOLVED; R04 bootstrap = CONCLUÍDO Sprint R04.6 — RESOLVED; pendente deploy + smoke);
  - confirmacao de que esta rodada nao comporta alteracao segura de runtime, migration ou deploy.
- **Decisao:** fechar esta sprint como docs-only. Nenhum schema remoto, nenhum deploy e nenhuma migration remota.

### Sprint R04.2 — Documentos Probe Closure ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** registrar documentalmente o probe estrutural remoto read-only já executado em produção para Documentos e reclassificar o próximo passo de R04.
- **Entregue:**
  - baseline estrutural remoto registrada em `AIRTRUST_DOCUMENTOS_DDL_R04_READINESS_v0_5.md`;
  - confirmação operacional do probe: `production`, `PRAGMA only`, `Total queries executed: 6`, `Rows read: 0`, `Rows written: 0`;
  - `documentos` confirmado com `empresa_id DEFAULT 1`, sem `historico_id` e sem `sha256_hash`;
  - `idx_documentos_uuid` nominal ausente, coberto por autoíndices SQLite;
  - `pasta_virtual.documento_id` ausente;
  - `certificados_templates` presente em produção;
  - R04 reclassificado para `READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE`.
- **Decisao:** não criar `0388` nesta sprint. Próxima fase: versionar/testar a migration canônica contra a baseline capturada.

### Sprint R04.3 — Documentos 0388 Design Closure ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** fechar documentalmente o desenho da futura `0388_documentos_canonical_schema.sql` usando a baseline real de produção, sem criar migration, sem alterar runtime e sem tocar schema remoto.
- **Entregue:**
  - novo documento `AIRTRUST_DOCUMENTOS_0388_CANONICAL_SCHEMA_DESIGN_v0_5.md`;
  - reclassificacao de R04 para `0388_DESIGN_READY`;
  - decisao de escopo conservador para a `0388`: incluir apenas `documentos` aderente a baseline real + `idx_documentos_empresa`, `idx_documentos_funcionario`, `idx_documentos_deleted`, `idx_documentos_tipo`, `idx_documentos_funcionario_tipo`;
  - registro explícito dos itens adiados/não tocados: `historico_id`, `sha256_hash`, `pasta_virtual.documento_id`, `certificados_templates` e índices de `0200` dependentes de colunas fantasmas.
- **Decisao:** não versionar a `0388` nesta sprint. Próxima fase: criar testes locais e versionar a migration conforme o desenho aprovado.

### Sprint R04.4 — Documentos 0388 Versioning ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** versionar localmente a `0388_documentos_canonical_schema.sql` e seu teste dedicado, sem apply remoto, sem alterar runtime e sem remover bootstrap.
- **Entregue:**
  - `worker-airtrust/migrations/0388_documentos_canonical_schema.sql`;
  - `worker-airtrust/src/__tests__/migrations/documentos-canonical-schema.test.ts`;
  - reclassificacao de R04 para `MIGRATION_VERSIONED_PENDING_APPLY`;
  - atualização documental da próxima fase: `R04.5 = apply controlado + probe pós-apply`.
- **Decisao:** não aplicar a migration nesta sprint. O bootstrap permanece intocado.

### Sprint OP-1 — Readiness Operacional Consolidada ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** consolidar smoke autenticado, Data Quality e Audit v2 readiness sem tocar schema ou producao.
- **Entregue:**
  - `AIRTRUST_OPERATIONAL_READINESS_EVIDENCE_v0_5.md`;
  - smoke do script confirmado em modo sem credencial: `PASS=3 FAIL=0 SKIPPED=1`, com `SKIPPED_AUTH_REQUIRED`;
  - Data Quality local reexecutado: `PASS=5 WARN=4 FAIL=0 SKIPPED=5`;
  - Audit v2 reconfirmado como `READY_FOR_STAGING_FLAG_TEST`.
- **Decisao:** `CONDITIONAL GO`.
- **Pendente:** credencial efemera/read-only + empresa esperada, staging/schema completo para Data Quality e staging flag test do Audit v2.

### Sprint OP-2 — Staging Operational Gate ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** tentar fechar smoke autenticado com empresa esperada, reduzir SKIPPED do Data Quality e revalidar Audit v2 sem ativar flag.
- **Entregue:**
  - estado inicial read-only reconfirmado em `main`, `HEAD == origin/main`, sem tracked changes;
  - smoke do script repetido com o mesmo resultado sanitizado: `PASS=3 FAIL=0 SKIPPED=1`, ainda com `SKIPPED_AUTH_REQUIRED`;
  - Data Quality local repetido com o mesmo resultado: `PASS=5 WARN=4 FAIL=0 SKIPPED=5`;
  - ausencia de `AIRTRUST_EXPECTED_EMPRESA_*`, `AIRTRUST_AUTH_*` e `AIRTRUST_DATA_QUALITY_*` de staging confirmada na sessao;
  - Audit v2 mantido em `READY_FOR_STAGING_FLAG_TEST`, sem ativacao de flag.
- **Decisao:** `CONDITIONAL GO` mantido.
- **Pendente:** credencial efemera/read-only, empresa esperada, staging/snapshot aprovado com schema completo e autorizacao separada para qualquer staging flag test.

### Sprint R04.6 — Documentos Bootstrap Removal ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** remover o bootstrap runtime de Documentos (`auto-migration-documentos.ts`) agora que a `0388` já estava aplicada em produção e o probe pós-apply confirmou o schema canônico.
- **Entregue:**
  - `auto-migration-documentos.ts` deletado do runtime via `git rm`;
  - `api-bootstrap.ts` limpo — `import { ensureDocumentosTableExists }` e `await ensureDocumentosTableExists(db)` removidos;
  - guard test `no-runtime-ddl-hot-paths.test.ts` atualizado — `api-bootstrap.ts` removido de `DOCUMENTED_EXCEPTIONS`, R04 documentado como `RESOLVED` nos comentários;
  - `documentos-canonical-schema` (8/8), `no-runtime-ddl-hot-paths` (13/13) e `tenant-isolation` (12/12) todos PASS.
  - R04 reclassificado para `RUNTIME_FALLBACK_REMOVED_PENDING_DEPLOY`.
- **Decisao:** bootstrap removido. Nenhuma migration nova, nenhum schema remoto alterado, nenhum backfill, nenhum dado tocado.
- **Pendente:** deploy do Worker/API + smoke pós-deploy → R04 = RESOLVED.
- **Risco:** Baixo (migration `0388` já aplicada; probe pós-apply PASS; remoção do bootstrap é só código morto).

### Sprint R04.7 — Deploy Worker/API + Smoke ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** executar o deploy do Worker/API sem o bootstrap de Documentos e validar com smoke pós-deploy.
- **Entregue:**
  - Deploy Worker/API executado: `APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9`.
  - Smoke pós-deploy: read-only PASS, public-only PASS (3/3).
  - `/api/version` retorna a versão correta; `/api/health` saudável.
  - Deploy Pages: NÃO.
  - R04 reclassificado para `RESOLVED`.
- **Risco:** Nenhum. Migration `0388` já aplicada em produção, bootstrap já removido (R04.6), deploy apenas removeu código morto.

### Sprint R01 — SIGVOOS Chain Reconciliation ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** Formalizar o achado de bloqueio de replay limpo da cadeia `0354 → 0387` e criar documento de decisão.
- **Entregue:**
  - Auditoria confirmou que nenhuma migration anterior à `0354` cria `integracoes_sigvoos_config`.
  - `0354` falha em cadeia limpa com `no such table: integracoes_sigvoos_config`.
  - Concatenar `0387` depois de `0354` não resgata a execução — o bloqueio ocorre antes.
  - Testes locais 8/8 PASS (`sigvoos-base-tables-schema.test.ts`) — dois testes de prova do bloqueio já existentes e confirmados.
  - `ensureSigvoosTables()` preservado — necessário para ambientes novos.
  - R01 reclassificado para `MIGRATION_APPLIED_CHAIN_RECONCILIATION_REQUIRED`.
  - Doc de decisão criado: `docs/AIRTRUST_SIGVOOS_MIGRATION_CHAIN_RECONCILIATION_v0_5.md`.
  - 10 docs de readiness/design/plan/matrix atualizados com addendum.
- **Sem:** migration nova, D1 remoto, deploy, alteração de runtime, alteração de schema, backfill, dados reais.
- **Próxima fase:** R01-baseline — criar bootstrap local para `integracoes_sigvoos_*` antes de `0354` e reconciliar cadeia limpa.
- **Modelo recomendado:** Sonnet 4.6 (docs/analysis-only); Opus para a fase de baseline design.

### Sprint R01.1 — SIGVOOS Baseline Strategy ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** Definir estratégia segura de baseline/replay limpo para R01 sem alterar migrations históricas.
- **Entregue:**
  - Opção A (editar `0354`) rejeitada formalmente — migration histórica aplicada em produção.
  - Opção B (`0389` isolada) avaliada como insuficiente — não corrige replay limpo.
  - Estratégia recomendada curto prazo: `scripts/bootstrap-new-environment.sql` com tabelas SIGVOOS base.
  - Estratégia recomendada longo prazo: squash/rebaseline em sprint arquitetural dedicada.
  - `ensureSigvoosTables()` preservado — condições de remoção documentadas na Seção 9 do strategy doc.
  - Doc de estratégia criado: `docs/AIRTRUST_SIGVOOS_R01_BASELINE_STRATEGY_v0_5.md`.
  - 9 docs de readiness/design/plan/matrix atualizados com addendum.
- **Sem:** migration nova, D1 remoto, deploy, alteração de runtime, alteração de schema, backfill, dados reais.
- **Próxima fase:** R01-bootstrap — criar `scripts/bootstrap-new-environment.sql` e documentar processo de novo ambiente.
- **Modelo recomendado:** Sonnet 4.6 (docs/bootstrap script); Opus 4.x para staging gate e remoção do fallback.

### Sprint R01.2 — SIGVOOS Bootstrap + Replay Closure ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** entregar o pacote completo para ambientes novos sem editar migrations históricas: bootstrap SQL, runbook operacional e prova local de replay.
- **Entregue:**
  - `scripts/bootstrap-new-environment.sql` criado com DDL puro para `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos` e `integracoes_sigvoos_mapeamentos`, sem dados reais, sem backfill, sem tenant real e sem secrets.
  - Documento operacional criado: `docs/AIRTRUST_SIGVOOS_R01_NEW_ENVIRONMENT_BOOTSTRAP_AND_REPLAY_CLOSURE_v0_5.md`.
  - Teste local ampliado em `sigvoos-base-tables-schema.test.ts`, provando que: sem bootstrap, o replay limpo falha na `0354`; com bootstrap, a cadeia atravessa `0354`; o bootstrap é idempotente; e o fluxo não depende de dados reais nem de D1 remoto.
  - Docs de strategy/readiness/matrix/closure/roadmap atualizados para refletir o novo estado.
  - `ensureSigvoosTables()` preservado; nenhum call site alterado; nenhuma migration histórica editada; nenhuma migration nova criada.
- **Sem:** D1 remoto, deploy, backfill, alteração de runtime, alteração de auth/RBAC/tenant, alteração de R2.
- **Status final de R01 nesta sprint:** `BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE`.
- **Próxima fase:** R01-staging/new-environment gate — executar o bootstrap + cadeia histórica em ambiente novo aprovado antes de propor a remoção do fallback runtime.

### Sprint R01.3 — SIGVOOS Staging/New Environment Gate + Fallback Removal Readiness ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** validar o pacote de bootstrap em condição local-isolada realista de novo ambiente e decidir se a próxima etapa já pode remover o fallback runtime.
- **Entregue:**
  - gate local-isolado explicitado no teste de migrations com sequência por etapas: banco limpo -> bootstrap -> `0352` -> `0354` -> `0387`;
  - auditoria adicional do bootstrap confirmando escopo apenas DDL, sem seeds, sem secrets, sem tenant real e sem substituição das migrations históricas de `0352`;
  - inventário fechado do fallback runtime SIGVOOS: 10 call sites, concentrados em `sigvoos-frms.ts` e `integracoes_sigvoos.ts`;
  - documento de readiness criado: `docs/AIRTRUST_SIGVOOS_R01_STAGING_GATE_AND_FALLBACK_REMOVAL_READINESS_v0_5.md`.
- **Sem:** migration nova, D1 remoto, deploy, remoção de runtime, alteração de auth/RBAC/tenant/R2.
- **Status final de R01 nesta sprint:** `READY_FOR_RUNTIME_FALLBACK_REMOVAL`.
- **Próxima fase:** `Runtime Fallback Removal + Final Audit Closure`.

### Sprint R01.4 — SIGVOOS Runtime Fallback Removal + Final Audit Closure ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** remover `ensureSigvoosTables()` e fechar o stream documental/técnico de R01 sem tocar migrations históricas.
- **Entregue:**
  - `ensureSigvoosTables()` removido de `sigvoos-frms.ts`;
  - 10 call sites removidos de `sigvoos-frms.ts` e `integracoes_sigvoos.ts`;
  - guard arquitetural atualizado;
  - teste novo `sigvoos-no-runtime-ddl.test.ts` criado para bloquear regressões;
  - bootstrap `scripts/bootstrap-new-environment.sql` preservado;
  - documento final criado: `docs/AIRTRUST_SIGVOOS_R01_RUNTIME_FALLBACK_REMOVAL_AND_AUDIT_CLOSURE_v0_5.md`.
- **Sem:** migration nova, D1 remoto, deploy, backfill, alteração de auth/RBAC/tenant/R2.
- **Status final de R01 nesta sprint:** `RESOLVED`.
- **Próxima fase:** reauditoria independente do stream DDL residual e realocação de foco para Audit v2, RBAC/Suporte v2 e Data Quality.

### Sprint AH — Data Quality + Migration Integrity ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** auditar `MIG-01` e `DQ-01` com evidência local, corrigindo apenas o que era seguro sem tocar D1 remoto, sem criar migration nova e sem saneamento de dados reais.
- **Entregue:**
  - documento consolidado `docs/AIRTRUST_DATA_QUALITY_AND_MIGRATION_INTEGRITY_AUDIT_v0_5.md`;
  - guard `migration-governance.test.ts` criado para pin de 30 prefixos duplicados, 3 nomes fora do padrão, `CREATE TEMP TABLE` e `PRAGMA foreign_keys = OFF`;
  - hardening em simuladores: `GET /instrutores`, participantes de sessão e fallback de checks agora respeitam `empresa_id` e validam referências no tenant;
  - teste novo `simuladores-sessoes-data-quality.test.ts`;
  - matriz mestre, closure plan e executive summary atualizados com status conservador.
- **Sem:** migration nova, D1 remoto, deploy, backfill, edição de migration histórica.
- **Status final desta sprint:** `MIG-01 = PARTIAL_REQUIRES_FUTURE_REBASELINE`; `DQ-01 = PARTIAL_REQUIRES_MIGRATION_OR_BACKFILL`.
- **Próxima fase:** executar Data Quality completo em snapshot/staging aprovado e depois abrir a sprint estrutural de rebaseline/governança de migrations.

### Sprint AI — Migration Rebaseline + Data Quality Backfill Readiness ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** preparar readiness formal de rebaseline e backfill sem executar apply real, sem D1 remoto e sem tocar dados reais.
- **Entregue:**
  - `docs/AIRTRUST_MIGRATION_REBASELINE_READINESS_v0_5.md`;
  - `docs/AIRTRUST_DATA_QUALITY_BACKFILL_READINESS_v0_5.md`;
  - scripts dry-run locais `scripts/audit-migration-chain-readiness.sh` e `scripts/audit-data-quality-readiness.sh`;
  - teste `readiness-audit-scripts.test.ts` para bloquear regressão dos scripts;
  - matriz/plano/resumo reclassificados para readiness controlada.
- **Sem:** migration nova, D1 remoto, deploy, backfill real, edição de migration histórica.
- **Status final desta sprint:** `MIG-01 = READY_FOR_CONTROLLED_REBASELINE`; `DQ-01 = READY_FOR_CONTROLLED_BACKFILL`.
- **Próxima fase:** executar a janela controlada de backfill e a janela controlada de rebaseline em ambiente aprovado.

### Sprint AJ — DQ-01 Controlled Backfill Gate ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** tentar avançar de `READY_FOR_CONTROLLED_BACKFILL` para execução real somente se houvesse staging aprovado, snapshot, rollback e autorização explícita.
- **Entregue:**
  - documento [AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md);
  - script fail-closed `scripts/dq01-controlled-backfill-gate.sh`;
  - teste `dq01-controlled-backfill-gate.test.ts`;
  - ampliação de `simuladores-sessoes-data-quality.test.ts` para bloquear criação órfã quando a sessão não existe.
- **Resultado:** backfill real não executado. A sessão atual não trouxe staging/snapshot/rollback/autorização suficientes.
- **Status final desta sprint:** `DQ-01 = BACKFILL_EXECUTION_BLOCKED_BY_ENVIRONMENT_READINESS`.
- **Próxima fase:** provisionar ambiente aprovado e rerodar o gate antes de qualquer mutation.

### Sprint AK — Controlled Execution Environment Contract ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** preparar o pacote compartilhado de staging/snapshot/rollback/approval/safe-command para `DQ-01` e `MIG-01`, sem mutation real.
- **Entregue:**
  - documento [AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md);
  - runbook [AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md);
  - gate genérico `scripts/controlled-execution-gate.sh`;
  - wrapper `scripts/mig01-controlled-rebaseline-gate.sh`;
  - `dq01-controlled-backfill-gate.sh` reancorado no contrato genérico;
  - testes `controlled-execution-gate.test.ts` e ampliação de `dq01-controlled-backfill-gate.test.ts`.
- **Sem:** backfill real, rebaseline real, D1 remoto, deploy, migration nova, edição de migration histórica.
- **Status final desta sprint:** `DQ-01 = READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`; `MIG-01 = READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`.
- **Próxima fase:** declarar target/janela aprovados e executar DQ primeiro, MIG depois, em janelas separadas.

### Audit Cycle Final Closure ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** fechar o ciclo atual sem criar nova preparação redundante, executando a decisão real dos gates e uma correção preventiva local de arquitetura/performance.
- **Entregue:**
  - relatório [AIRTRUST_AUDIT_CYCLE_FINAL_CLOSURE_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_AUDIT_CYCLE_FINAL_CLOSURE_v0_5.md);
  - teste `architecture-performance-guard.test.ts`;
  - matriz/plano/resumo atualizados para refletir bloqueio real de ambiente.
- **Sem:** backfill real, rebaseline real, D1 remoto, deploy, migration nova, edição de migration histórica.
- **Status final:** `DQ-01 = BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`; `MIG-01 = BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`; `ARCH-01 = MITIGATED_WITH_GUARDS`.
- **Próxima fase:** auditoria independente Opus pós-ciclo antes de nova execução controlada real.

### Final Local Residual Closure + Controlled Execution Bridge ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** fechar os residuos finais de auth/tenant apontados pela auditoria Opus e confirmar a ponte para execucao controlada.
- **Entregue:**
  - relatorio [AIRTRUST_FINAL_LOCAL_RESIDUAL_CLOSURE_AND_CONTROLLED_EXECUTION_BRIDGE_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_FINAL_LOCAL_RESIDUAL_CLOSURE_AND_CONTROLLED_EXECUTION_BRIDGE_v0_5.md);
  - `AUTH-RESIDUAL-01 = RESOLVED`;
  - `AUTH-RESIDUAL-02 = RESOLVED`;
  - `AUTH_TENANT = CONFIRMED_CLOSED`;
  - guard `sec02-null-empresa-scope.test.ts` ampliado.
- **Sem:** D1 remoto, deploy, backfill real, rebaseline real, apply da `0389`.
- **Status final:** `LOCAL_AUDIT_CLOSURE = COMPLETE_WITH_ENVIRONMENT_BLOCKERS`.
- **Próxima fase:** ambiente controlado real para DQ primeiro, MIG depois, `0389`/Audit/RBAC em seguida.

### Sprint AL — DQ01 Controlled Environment Package ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** materializar um pacote operacional rastreável para `DQ-01`, sem executar backfill, sem D1 remoto e sem tocar produção.
- **Entregue:**
  - documento [AIRTRUST_DQ01_CONTROLLED_ENVIRONMENT_PACKAGE_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_DQ01_CONTROLLED_ENVIRONMENT_PACKAGE_v0_5.md);
  - evidência de target [dq01-target-evidence-20260604.md](/Users/filipedaumas/SAAS/Airtrust/docs/controlled-execution/dq01-target-evidence-20260604.md);
  - plano de rollback [dq01-rollback-plan-20260604.md](/Users/filipedaumas/SAAS/Airtrust/docs/controlled-execution/dq01-rollback-plan-20260604.md);
  - wrapper read-only `scripts/run-dq01-local-copy-backfill-readonly.sh`;
  - snapshot local pré-janela não rastreado em `.wrangler/state/v3/d1/controlled-execution-snapshots/`.
- **Gates:** `controlled-execution-gate.sh = READY_FOR_MANUAL_CONTROLLED_EXECUTION`; `dq01-controlled-backfill-gate.sh = READY_FOR_MANUAL_CONTROLLED_EXECUTION`; `audit-data-quality-readiness.sh = PASS`.
- **Sem:** backfill real, D1 remoto, deploy, `MIG-01`, apply da `0389`, mutation de dados reais.
- **Status final desta sprint:** `DQ-01 = READY_FOR_CONTROLLED_BACKFILL_EXECUTION`.
- **Próxima fase:** aprovar o comando mutante por lote e executar a janela controlada em `local-copy`, ou promover pacote equivalente para `staging`.

### DQ01 Local Copy Backfill Execution ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** executar DQ-01 de forma controlada em `local-copy`, sem tocar staging, produção, D1 remoto, deploy, `MIG-01` ou `0389`.
- **Entregue:**
  - resultado [AIRTRUST_DQ01_LOCAL_COPY_BACKFILL_EXECUTION_RESULT_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_DQ01_LOCAL_COPY_BACKFILL_EXECUTION_RESULT_v0_5.md);
  - safe command mutante `scripts/run-dq01-local-copy-backfill-apply.sh`;
  - teste `dq01-local-copy-backfill-apply.test.ts`;
  - snapshot pré-janela `dq01-local-copy-pre-window-20260604T172927Z.sqlite` fora do versionamento;
  - rollback validado em cópia separada com `PRAGMA integrity_check = ok`.
- **Resultado:** `registro_ativo_deleted_at_inconsistente` foi de `17` para `0`; resumo DQ foi de `PASS=5 WARN=4 FAIL=0 SKIPPED=5` para `PASS=6 WARN=3 FAIL=0 SKIPPED=5`.
- **Remanescente:** `qualificacao_duplicada=45`, `alocacao_sem_escala_valida=2`, `alocacao_duplicada=2` e 5 checks `SKIPPED` por schema local incompleto.
- **Status final:** `DQ-01 = LOCAL_COPY_BACKFILL_VALIDATED_READY_FOR_STAGING`; `MIG-01 = WAITING_FOR_DQ_STAGING_OR_CONTROLLED_DECISION`.
- **Próxima fase:** staging real de DQ-01 ou decisão formal antes de iniciar `MIG-01`.

### DQ01 Staging Controlled Backfill Execution ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** materializar `staging` como ambiente controlado canônico de `DQ-01`, capturar snapshot/rollback, passar nos gates e executar o lote autorizado sem deploy, sem `MIG-01` e sem `0389`.
- **Entregue:**
  - resultado [AIRTRUST_DQ01_STAGING_BACKFILL_EXECUTION_RESULT_AND_MIG01_HANDOFF_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_DQ01_STAGING_BACKFILL_EXECUTION_RESULT_AND_MIG01_HANDOFF_v0_5.md);
  - evidência de target [dq01-staging-target-evidence-20260604.md](/Users/filipedaumas/SAAS/Airtrust/docs/controlled-execution/dq01-staging-target-evidence-20260604.md);
  - plano de rollback [dq01-staging-rollback-plan-20260604.md](/Users/filipedaumas/SAAS/Airtrust/docs/controlled-execution/dq01-staging-rollback-plan-20260604.md);
  - wrappers `scripts/run-dq01-staging-backfill-readonly.sh` e `scripts/run-dq01-staging-backfill-apply.sh`;
  - teste `dq01-staging-backfill-apply.test.ts`;
  - snapshot pré-janela e pós-janela não rastreados em `.wrangler/state/v3/d1/controlled-execution-snapshots/staging/`.
- **Gates:** `controlled-execution-gate.sh = READY_FOR_MANUAL_CONTROLLED_EXECUTION`; `dq01-controlled-backfill-gate.sh = READY_FOR_MANUAL_CONTROLLED_EXECUTION`; `audit-data-quality-readiness.sh = PASS`.
- **Resultado:** diagnóstico pré/pós em `staging` ficou `PASS=9 WARN=0 FAIL=0 SKIPPED=5`; o apply remoto em `funcionarios` encontrou `0` candidatos, executou `changed=0` e preservou `remaining=0`.
- **Sem:** deploy, produção, `MIG-01`, apply da `0389`, migration nova, edição de migration histórica.
- **Status final:** `DQ-01 = RESOLVED_FOR_CONTROLLED_SCOPE`; `MIG-01 = READY_FOR_CONTROLLED_REBASELINE_AFTER_DQ`.
- **Próxima fase:** materializar pacote próprio de `MIG-01` e executar o rebaseline controlado em janela separada.

### MIG01 Controlled Rebaseline Execution ✅ CONCLUIDO
- **Status:** CONCLUIDO em 2026-06-04.
- **Objetivo:** executar o rebaseline controlado de `MIG-01` usando o snapshot pos-DQ de `staging`, sem D1 remoto novo, sem deploy, sem producao, sem DQ novo e sem apply da `0389`.
- **Entregue:**
  - resultado [AIRTRUST_MIG01_CONTROLLED_REBASELINE_EXECUTION_RESULT_AND_0389_HANDOFF_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_MIG01_CONTROLLED_REBASELINE_EXECUTION_RESULT_AND_0389_HANDOFF_v0_5.md);
  - evidência de target [mig01-staging-target-evidence-20260604.md](/Users/filipedaumas/SAAS/Airtrust/docs/controlled-execution/mig01-staging-target-evidence-20260604.md);
  - plano de rollback [mig01-staging-rollback-plan-20260604.md](/Users/filipedaumas/SAAS/Airtrust/docs/controlled-execution/mig01-staging-rollback-plan-20260604.md);
  - baseline SQL [mig01-staging-schema-baseline-20260604.sql](/Users/filipedaumas/SAAS/Airtrust/docs/controlled-execution/mig01-staging-schema-baseline-20260604.sql);
  - summary [mig01-staging-rebaseline-summary-20260604.txt](/Users/filipedaumas/SAAS/Airtrust/docs/controlled-execution/mig01-staging-rebaseline-summary-20260604.txt);
  - wrapper `scripts/run-mig01-staging-rebaseline.sh`;
  - teste `mig01-staging-rebaseline.test.ts`.
- **Gates:** `controlled-execution-gate.sh = READY_FOR_MANUAL_CONTROLLED_EXECUTION`; `mig01-controlled-rebaseline-gate.sh = READY_FOR_MANUAL_CONTROLLED_EXECUTION`; `audit-migration-chain-readiness.sh = PASS`.
- **Resultado:** baseline de schema replayavel em SQLite limpo, `225` tabelas, `585` indices, `21` triggers, `10` views, `d1_migrations=0` e `0389_objects=0`.
- **Sem:** D1 remoto, deploy, producao, DQ novo, apply da `0389`, migration nova aplicada, edicao de migration historica.
- **Status final:** `MIG-01 = RESOLVED_FOR_CONTROLLED_SCOPE`; `RBAC_SUPPORT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`; `AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`.
- **Próxima fase:** Bloco 4 — enforcement runtime gradual de `RBAC/Suporte v2` e fechamento do gap de `Audit v2` em `staging`.

### Sprint Y — Status Enum Expansão
- **Prioridade:** Médio prazo.
- **Objetivo:** Expandir helpers de status para cron jobs, alertas e EVD.
- **Escopo:** Auditar queries batch; aplicar helpers `status-codes.ts` onde usam strings soltas; testes de compatibilidade.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Não.
- **Risco:** Médio.

### Sprint Z — Performance/Bundle Audit
- **Prioridade:** Médio prazo.
- **Objetivo:** Auditoria de bundle size, chunks duplicados, N+1 queries, rotas grandes.
- **Escopo:** Análise de bundle com `vite build` + análise; identificação de chunks PDF duplicados; revisão de queries em rotas grandes (FRMS, SGSO, dashboard); documentar achados sem corrigir.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Não (auditoria read-only).
- **Migration necessária?:** Não.
- **Risco:** Baixo (documental).

---

## Backlog (longo prazo)

### Sprint AA — Repository Pattern Expansão
- **Objetivo:** Extrair queries read-only de `lms-cursos` e `qualificações` dashboard.
- **Modelo:** GPT-5.4 Alta.

### Sprint AB — R2 Metadata Novos Uploads
- **Objetivo:** Adicionar `empresa_id` como custom metadata em novos uploads R2.
- **Dependência:** Correções de tenant isolation já concluídas.
- **Modelo:** GPT-5.4 Alta.

### Sprint AC — Cloudflare Queues Dry-Run
- **Objetivo:** Implementar fila de domain_events substituindo D1.
- **Modelo:** GPT-5.5 Alta.

### Sprint AD — Observabilidade Multiempresa
- **Objetivo:** Sinais por tenant, request correlation, falhas por módulo.
- **Modelo:** GPT-5.5 Alta.

### Sprint AE — Refatoração Estrutural Ampla
- **Objetivo:** Quebrar arquivos gigantes (FRMS, SGSO, dashboard).
- **Modelo:** GPT-5.4 Alta.

---

## Não planejado (gatilho futuro)

### Supabase Cutover
- **Decisão:** NÃO MIGRAR AGORA.
- **Gatilhos:** D1 80% limite, incidente tenant isolation, ou 2027-06-02.
- **Modelo:** GPT-5.5 Altissimo.

---

## Resumo da sequência

| # | Sprint | Prioridade | Modelo | Deploy | Migration |
|---|---|---|---|---|---|
| M | Data Quality + Smoke | Imediata | GPT-5.4 | Nao | Nao |
| N | Blindagem Operacional P2 ✅ | — | GPT-5.4 | Não | Não |
| O | Audit Trail/LGPD v2 Design ✅ | Concluído | GPT-5.5 | Não | Futura |
| P | RBAC/Suporte v2 Design ✅ | Concluído | GPT-5.5 | Não | Futura |
| Q | Readiness Gate RBAC + Audit ✅ | Concluído | GPT-5.4/5.5 | Não | Não |
| R | Audit Trail v2 Schema Backward-Compatible ✅ | Concluído + Aplicado | GPT-5.5 | Sim (X.5) | Versionada e aplicada (X.5) |
| S | Audit Trail v2 Canonical Writer + Dual-Write ✅ | Concluído | GPT-5.5 | Sim (X.5) | Aplicada (X.5); flag off |
| T | Audit v2 Activation Readiness / Local-Staging Validation ✅ | Concluído | GPT-5.5 | Não | Não |
| T.1 | Audit v2 Local Activation Run ✅ | Concluído | GPT-5.4 | Não | Não |
| U | Audit v2 Staging Parity / Flag Prerequisite | Curto prazo | GPT-5.5 | Nao/Controlado | Staging |
| V | RBAC/Suporte v2 Gradual Enforcement | Curto prazo | GPT-5.5 | Sim | Ja aplicada em `staging` via `0389` |
| W | Cobertura Beta (EVD + Complementos) | Curto prazo | GPT-5.4 | Sim | Nao |
| V | DDL Residual Design ✅ | Concluído | GPT-5.5 | Não | Planejadas (3→2) |
| W | DDL Pré-Fase — Remover 6 `ensure*` cobertos ✅ | Concluído | GPT-5.4 | Sim | Não |
| X.0 | DDL Schema Probe Read-only ✅ | Concluído | GPT-5.4 | Não | Não |
| X.1–X.4 | DDL Probe Runner + M1 Versionada ✅ | Concluído | GPT-5.4/5.5 | Não | Versionada |
| X.5 | DDL Apply 0385/0386 + Deploy Worker/API ✅ | Concluído | GPT-5.4 | Sim | Aplicadas |
| OP-1 | Operational Readiness Evidence ✅ | Concluido | GPT-5.4 | Nao | Nao |
| OP-2 | Staging Operational Gate ✅ | Concluido | GPT-5.4 | Nao | Nao |
| R09 | ~~R09 Readiness / Verification~~ **CONCLUÍDO** Sprint R09 2026-06-03 | — | GPT-5.4 DeepSeek | Sim (DDL removido) | Nao (sem migration) |
| R04.6 | Documentos Bootstrap Removal ✅ | Concluído (2026-06-03) | GPT-5.5 | Pendente (deploy + smoke) | Nao (0388 ja aplicada) |
| R04.7 | Deploy Worker/API + Smoke ✅ | Concluído (2026-06-04) | GPT-5.5 | Sim (APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9) | Nao |
| Z | SIGVOOS Runtime Fallback Removal + Final Audit Closure ✅ | Concluído | GPT-5.5 | Não | Não |
| Z.1 | Reauditoria Independente do Fechamento DDL Residual | Curto prazo | GPT-5.5/Opus | Não | Não |
| AH | Data Quality + Migration Integrity ✅ | Concluído | GPT-5 / Sonnet 4.6 | Não | Não |
| AI | Migration Rebaseline + Data Quality Backfill Readiness ✅ | Concluído | GPT-5 / Sonnet 4.6 | Não | Não |
| AJ | DQ-01 Controlled Backfill Gate ✅ | Concluído | GPT-5 / Sonnet 4.6 | Não | Não |
| AH-FINAL | Audit Cycle Final Closure ✅ | Concluído | GPT-5 / Sonnet 4.6 | Não | Não |
| AA | Status Enum Expansao | Medio prazo | GPT-5.4 | Sim | Nao |
| AB | Performance/Bundle Audit | Longo prazo | GPT-5.4 | Nao | Nao |
| AC | Repository Pattern Expansao | Longo prazo | GPT-5.4 | Sim | Nao |
| AD | R2 Metadata Uploads | Longo prazo | GPT-5.4 | Sim | Nao |
| AE | Cloudflare Queues | Longo prazo | GPT-5.5 | Sim | Nao |
| AF | Observabilidade | Longo prazo | GPT-5.5 | Sim | Possivel |
| AG | Refatoracao Estrutural | Longo prazo | GPT-5.4 | Sim | Nao |

---

**Fim do plano de sprints.** Documento atualizado em 2026-06-04 com Sprint X.5 closure (R03=RESOLVED), Sprint R04.5 (apply oficial `0387`+`0388`), Sprint R04.6 (bootstrap documentos removido), **Sprint R04.7 (deploy Worker/API APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS 3/3, R04=RESOLVED)**, **Sprint R01 Chain Reconciliation (achado formalizado, R01 = MIGRATION_APPLIED_CHAIN_RECONCILIATION_REQUIRED)**, **Sprint R01 Baseline Strategy (estratégia definida: bootstrap-new-environment.sql curto prazo, squash/rebaseline longo prazo)**, **Sprint R01.2 Bootstrap + Replay Closure (bootstrap criado, replay provado localmente)**, **Sprint R01.3 Staging/New Environment Gate + Fallback Removal Readiness (gate local-isolado PASS, inventário do fallback fechado)**, **Sprint R01.4 Runtime Fallback Removal + Final Audit Closure (`ensureSigvoosTables()` removido, 10 call sites eliminados, teste de ausência de DDL/runtime criado, `R01 = RESOLVED`)**, **Sprint AH (Data Quality + Migration Integrity: `MIG-01` parcial com guard local permanente; `DQ-01` parcial com hardening crítico de simuladores)**, **Sprint AI (`MIG-01 = READY_FOR_CONTROLLED_REBASELINE`; `DQ-01 = READY_FOR_CONTROLLED_BACKFILL`; docs + dry-run scripts + readiness tests criados)**, **Sprint AJ (`DQ-01 = BACKFILL_EXECUTION_BLOCKED_BY_ENVIRONMENT_READINESS`; gate fail-closed + documento de execução bloqueada versionados)**, **Sprint AK (`MIG-01`/`DQ-01 = READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`; contrato/runbook/gates compartilhados versionados)**, **Audit Cycle Final Closure (`DQ-01`/`MIG-01 = BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`; `ARCH-01 = MITIGATED_WITH_GUARDS`)**, **DQ01 Staging Controlled Backfill Execution (`DQ-01 = RESOLVED_FOR_CONTROLLED_SCOPE`; `MIG-01 = READY_FOR_CONTROLLED_REBASELINE_AFTER_DQ`)** e **MIG01 Controlled Rebaseline Execution (`MIG-01 = RESOLVED_FOR_CONTROLLED_SCOPE`; `RBAC_SUPPORT_V2`/`AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`)**.
