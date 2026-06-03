# AirTrust Next Sprints Plan v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `d65fc9eab2e8abe608c5f4820a6a23319ad1bb2c`
**Modo:** Planejamento atualizado após Sprint X.5 (migrations 0385/0386 aplicadas, Worker/API deployado) e Sprint Z0 (R01 SIGVOOS readiness mapped). Sem migration manual ou aplicação manual de dados reais.

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

### Sprint U — Audit v2 Staging Flag Test
- **Prioridade:** Curto prazo.
- **Objetivo:** aplicar schema em ambiente staging aprovado, ativar a flag de forma controlada e validar paridade mínima.
- **Escopo:** schema aprovado; dual-write em LMS; rollback por flag; comparação mínima entre legado e v2; evidência sanitizada.
- **Modelo recomendado:** GPT-5.5 Altissimo.
- **Deploy necessário?:** Não necessariamente, depende do ambiente aprovado e do método de validação.
- **Migration necessária?:** Sim, em staging aprovado.
- **Risco:** Alto.

### Sprint V — RBAC/Suporte v2 Implementation Foundation
- **Prioridade:** Curto prazo.
- **Objetivo:** Implementar platform roles schema e shadow dual-read de RBAC somente depois do writer v2 estar operacional e com paridade validada.
- **Escopo:** `platform_admin`; grants persistidos; sessoes de suporte; shadow dual-read; logs de divergencia; rollback simples.
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
- **Pendente:** Fase 3 M3 (`0388` sobre baseline remota capturada + desenho aprovado → remoção bootstrap R04) e Fase 2 M2 (baseline/chain plan R01). R09 = RESOLVED (Sprint R09). R04 = 0388_DESIGN_READY (Sprint R04.3, 2026-06-03).
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
- **Pendente:** DDL runtime remanescente: R04 (Documentos) = 0388_DESIGN_READY (Sprint R04.3). R01 (SIGVOOS) = MIGRATION_CHAIN_BLOCKED_BY_0354 (Sprint Z1.1). R09 = RESOLVED (Sprint R09).
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
  - reconciliacao da ordem real: `Smoke/Data Quality -> Audit v2 staging flag -> RBAC/Suporte v2 -> R04 0388 -> R01 chain plan` (R09 = RESOLVED Sprint R09; R04 = 0388_DESIGN_READY Sprint R04.3);
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
| U | Audit v2 Staging Flag Test | Curto prazo | GPT-5.5 | Nao/Controlado | Staging |
| V | RBAC/Suporte v2 Implementation Foundation | Curto prazo | GPT-5.5 | Sim | Sim |
| W | Cobertura Beta (EVD + Complementos) | Curto prazo | GPT-5.4 | Sim | Nao |
| V | DDL Residual Design ✅ | Concluído | GPT-5.5 | Não | Planejadas (3→2) |
| W | DDL Pré-Fase — Remover 6 `ensure*` cobertos ✅ | Concluído | GPT-5.4 | Sim | Não |
| X.0 | DDL Schema Probe Read-only ✅ | Concluído | GPT-5.4 | Não | Não |
| X.1–X.4 | DDL Probe Runner + M1 Versionada ✅ | Concluído | GPT-5.4/5.5 | Não | Versionada |
| X.5 | DDL Apply 0385/0386 + Deploy Worker/API ✅ | Concluído | GPT-5.4 | Sim | Aplicadas |
| OP-1 | Operational Readiness Evidence ✅ | Concluido | GPT-5.4 | Nao | Nao |
| OP-2 | Staging Operational Gate ✅ | Concluido | GPT-5.4 | Nao | Nao |
| R09 | ~~R09 Readiness / Verification~~ **CONCLUÍDO** Sprint R09 2026-06-03 | — | GPT-5.4 DeepSeek | Sim (DDL removido) | Nao (sem migration) |
| Y | Documentos Canonical Schema (`0388`) sobre baseline remota capturada e desenho aprovado | Medio prazo | GPT-5.5 | Sim | Sim |
| Z | SIGVOOS Baseline / Chain Plan | Medio prazo | GPT-5.5 | Nao ate plano aprovado | Sim/Strategic |
| AA | Status Enum Expansao | Medio prazo | GPT-5.4 | Sim | Nao |
| AB | Performance/Bundle Audit | Longo prazo | GPT-5.4 | Nao | Nao |
| AC | Repository Pattern Expansao | Longo prazo | GPT-5.4 | Sim | Nao |
| AD | R2 Metadata Uploads | Longo prazo | GPT-5.4 | Sim | Nao |
| AE | Cloudflare Queues | Longo prazo | GPT-5.5 | Sim | Nao |
| AF | Observabilidade | Longo prazo | GPT-5.5 | Sim | Possivel |
| AG | Refatoracao Estrutural | Longo prazo | GPT-5.4 | Sim | Nao |

---

**Fim do plano de sprints.** Documento atualizado em 2026-06-03 com Sprint X.5 closure (migrations 0385/0386 aplicadas em produção, Worker/API deployado, APP_VERSION=2026-06-03T17:00:27Z-c12d8bf, R03=RESOLVED, Audit v2=APPLIED_SCHEMA_READY_FOR_FLAG_PLAN).
