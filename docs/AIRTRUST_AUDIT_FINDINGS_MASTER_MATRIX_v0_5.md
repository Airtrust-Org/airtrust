# AirTrust — Audit Findings Master Matrix v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `c12d8bf63c7bc9bede27ad6238459a9d921edb50`
**Modo:** Matriz atualizada após Sprint X.5 (migrations 0385/0386 aplicadas, Worker/API deployado) e Sprint R04.5/R01 pós-apply oficial da fila pendente `0387` + `0388`. Sem migration manual ou alteração de dados reais.
**Sprints de origem consolidados:** A (RBAC), B (Audit Trail/LGPD), C (Status Enum), D (Testes Beta), E (DDL), F (Data Quality), G (Runner), H (Repository Dashboard), I (Supabase Feasibility), J (Supabase Preparation), K (Tenant Isolation Docs), K.1 (Tenant Residuals), L (LMS Reports Integration), Reauditoria Opus v2, General Audit Opus, V (DDL Residual Design), W (DDL Pré-Fase), X.0-X.5 (DDL Schema Probe + Apply/Deploy), R/S/T/T.1 (Audit v2), OP-1 (Readiness operacional consolidada), OP-2 (Staging operational gate), AH (Data Quality + Migration Integrity), AI (Migration Rebaseline + Data Quality Backfill Readiness), AJ (DQ-01 Controlled Backfill Gate), AK (Controlled Execution Environment Contract), Audit Cycle Final Closure.

> **Addendum 2026-06-04:** esta matriz continua sendo a fonte mestre dos streams principais do ciclo. Para higiene residual de repositório, governança documental e superfície pública remanescente, usar como fonte canônica complementar `docs/AIRTRUST_REPOSITORY_CLEANUP_GOVERNANCE_PUBLIC_SURFACE_v0_5.md`.

---

## 1. Sumário executivo

Este documento consolida **todos os achados de auditoria** do AirTrust identificados entre 2026-05 e 2026-06, cobrindo 12 sprints e 2 auditorias gerais independentes (Opus). O objetivo é fornecer uma matriz única que permita leitura rápida do estado de cada achado: o que foi corrigido, o que permanece aberto, e o que exige condições especiais (migration, staging, GPT-5.5) para ser tratado.

**Estado geral do AirTrust em 2026-06-03 após o Sprint T.1 (Audit v2 local activation run):**

- **Nenhum P0 ativo.** O único P0 da auditoria original (reset admin cross-tenant) foi mitigado e testado.
- **Nenhum P1 de código ativo.** FRMS fail-open, `escala_alocacoes` sem `empresa_id`, e scripts destrutivos foram mitigados — com residuais P2 operacionais e P3 estruturais.
- **Pronto para piloto interno/controlado:** Sim, com condições (CONDITIONAL GO).
- **Pronto para cliente externo amplo:** Não ainda. Bloqueadores: dual-write v2 ainda não ativado/validado em ambiente aprovado, RBAC/suporte v2 ainda nao implementado, data quality nao executado operacionalmente, cobertura de testes beta insuficiente.
- **Pronto para 5+ empresas:** Não. Requer remoção de `userId===1`, DDL runtime residual, status enum central, e observabilidade multiempresa.

**Status consolidado:** O Sprint S criou `recordAuditEventV2()` e integrou dual-write mínimo em cursos LMS atrás de flag, preservando `logAudit()` legado. O Sprint T adicionou readiness local/staging e o Sprint T.1 executou a validação local aprovada com `PASS` nos dois runners, sem ativar produção. Os itens de Audit/LGPD avançaram para `READY_FOR_STAGING_FLAG_TEST`.

---

## 2. Legenda de status

| Status | Significado |
|---|---|
| RESOLVED | Corrigido, testado e, se runtime, deployado |
| PARTIAL | Mitigado, mas ainda com dívida residual ou cobertura parcial |
| IMPLEMENTATION_READY | Design + readiness gate concluídos; pronto para sprint de implementação, sem runtime ainda |
| SCHEMA_READY | Schema aditivo e testes locais versionados; ainda sem aplicação em produção ou integração runtime |
| DUAL_WRITE_PARTIAL | Writer canônico e integração mínima versionados; ativação/paridade operacional e cobertura ampla ainda pendentes |
| ACTIVATION_READY_PARTIAL | Readiness local/staging documentada e runners seguros prontos; execução aprovada ainda pendente |
| READY_FOR_STAGING_FLAG_TEST | Validação local aprovada concluída; próximo passo é staging aprovado com schema/flag controlados |
| READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT | Contrato de ambiente, gates fail-closed e runbook compartilhado prontos; falta apenas vincular target/janela aprovados e executar controladamente |
| READY_FOR_CONTROLLED_REBASELINE | Estratégia, testes e rollback definidos; falta apenas a execução controlada do novo baseline |
| READY_FOR_CONTROLLED_BACKFILL | Riscos, detecção e ordem de saneamento definidos; falta apenas a execução controlada do backfill |
| BACKFILL_EXECUTION_BLOCKED_BY_ENVIRONMENT_READINESS | Execução tentada corretamente, mas bloqueada por falta de staging/snapshot/rollback/autorização explícita |
| BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE | Prontidão técnica concluída, mas execução real bloqueada porque target/snapshot/rollback/aprovação/comando revisado não existem na sessão |
| LOCAL_FOUNDATION_COMPLETE_BLOCKED_BY_ENVIRONMENT | Fundação local concluída e testada, mas sem apply controlado nem validação no ambiente-alvo |
| LOCAL_READINESS_COMPLETE_BLOCKED_BY_ENVIRONMENT | Readiness local concluída e gates validados, mas sem target/snapshot/rollback/aprovação/comando revisado no ambiente-alvo |
| MITIGATED_WITH_GUARDS | Dívida estrutural não resolvida, mas agora protegida por teste/guard contra regressão ou crescimento silencioso |
| OPEN | Ainda não corrigido |
| DEFERRED | Conscientemente adiado (ex: Supabase cutover) |
| BACKLOG | Futuro estratégico, sem urgência imediata |
| NOT_APPLICABLE | Reclassificado como não aplicável |

**Legenda de severidade:**

| Sev | Significado |
|---|---|
| P0/S1 | Bloqueia operação ou cria risco imediato de segurança/governança |
| P1/S2 | Não derruba piloto atual, mas impede escala segura ou aumenta risco relevante |
| P2/S3 | Dívida estrutural importante, sem urgência de deploy |
| P3 | Cosmético ou melhoria de defesa em profundidade |

---

## 3. Matriz mestre

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MULTI-01 | MULTIEMPRESA_TENANT | Reset admin cross-tenant sem `empresa_id` | P0 | RESOLVED | `resolveTenantScope`, todas queries com `WHERE empresa_id = ?`, guard `tenant_scope_required` (403), mount `requireRole('admin')` | `a068b75` | Sim | `admin-reset-tenant-scope.test.ts` | Nenhum | — | — |
| MULTI-02 | MULTIEMPRESA_TENANT | `/api/assets` público demais, sem tenant robusto | P1 | RESOLVED | `classifyAssetAccess()` + `authorizeTenantAsset()` com deny-by-default, logos públicos explícitos, FIRA tenant-scoped, prefixos sensíveis bloqueados | `abf9002` | Sim | Testes de asset gateway | Nenhum | — | — |
| MULTI-03 | MULTIEMPRESA_TENANT | Download/stream/export/delete de documentos sem tenant check | P0 | RESOLVED | JOIN `funcionarios.empresa_id` em todas as queries de pasta-virtual, pasta-virtual-extra, certificados | `7702467`, `8dfc14e` | Sim | `documentos-tenant-isolation.test.ts` | Nenhum explorável | — | — |
| MULTI-04 | MULTIEMPRESA_TENANT | `escala_alocacoes` sem coluna `empresa_id` própria | P1 | PARTIAL | CRUD e overlap escopados por JOIN `escalas_mensais.empresa_id = ?` | `ebddff5` | Sim | `escalas-alocacoes-tenant-scope.test.ts` | Sem coluna própria e sem UNIQUE parcial → risco se query futura esquecer JOIN | Sprint futuro: migration P3 opcional | GPT-5.5 Alta |
| MULTI-05 | MULTIEMPRESA_TENANT | Dashboard metrics sem `empresa_id` verificado | P2 | RESOLVED | `empresaId` propagado em todas as queries, `deleted_at IS NULL`, status compatível | `e6d773e` | Sim | `dashboard-metrics-integrity.test.ts` | Métricas executivas complementares sem mesmo teste | — | — |
| MULTI-06 | MULTIEMPRESA_TENANT | Simulador→qualificação tenant-scope ausente na transição | P1 | RESOLVED | `sincronizarQualificacoesDaSessaoConcluida` com `empresa_id`, conflito unique tratado | `2128a50` | Sim | `simuladores-qualificacoes-transition.test.ts` (6 casos) | Nenhum | — | — |
| AUTH-RESIDUAL-01 | MULTIEMPRESA_TENANT | `syncEscalaEventosExternos.ts` ainda aceitava funcionario com `empresa_id IS NULL` quando `empresaId` era informado | P2 | RESOLVED | Filtro alterado para `(? IS NULL OR f.empresa_id = ?)`, preservando o modo sem filtro e removendo fallback nulo quando tenant existe | Final Local Residual Closure | — | `sec02-null-empresa-scope.test.ts` | Nenhum | — | — |
| AUTH-RESIDUAL-02 | MULTIEMPRESA_TENANT | `escalas-tripulacoes.ts` aceitava `empresa_id IS NULL` em lookups operacionais de aeronave/PIC | P3 | RESOLVED | Lookups tenant-scoped de `aeronaves` e `funcionarios` endurecidos para `empresa_id = ?`; `LEFT JOINs` decorativas seguem allowlist ancorada por `em.empresa_id` | Final Local Residual Closure | — | `sec02-null-empresa-scope.test.ts` | Nenhum | — | — |
| MULTI-07 | MULTIEMPRESA_TENANT | Admin backfill sem `empresa_id` (backfill-session-checks) | P3 | OPEN | Não corrigido — opera DB-wide | — | — | — | Admin-gated, idempotente, não-destrutivo, mas não respeita tenant-scope | Sprint futuro: aplicar `empresa_id` | GPT-5.4 Baixa |
| MULTI-08 | MULTIEMPRESA_TENANT | R2 sem `empresa_id` metadata (defense-in-depth) | P3 | OPEN | Plano criado no Sprint J, sem alteração em objetos R2 reais | — | — | — | Depende de correções de tenant isolation primeiro (já feitas). Sem urgência | Sprint futuro: metadata em novos uploads | GPT-5.4 Alta |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ASSETS-01 | ASSETS_DOCUMENTOS_R2 | 7 gaps críticos de tenant isolation em documentos/certificados | P0 | RESOLVED | JOIN `funcionarios.empresa_id` em download/stream/delete/export de docs e certificados | `7702467`, `8dfc14e` | Sim | `documentos-tenant-isolation.test.ts` cobrindo stream/download/export/delete | Nenhum | — | — |
| ASSETS-02 | ASSETS_DOCUMENTOS_R2 | 5 gaps altos de acesso indevido/modificação cross-tenant | P1 | RESOLVED | JOIN `funcionarios.empresa_id` nas queries de listagem, upload e admin delete | `7702467` | Sim | Mesmo teste de isolamento | Nenhum | — | — |
| ASSETS-03 | ASSETS_DOCUMENTOS_R2 | GAP-014: recuperar-orfaos cross-tenant | P1 | RESOLVED | Busca, candidato e update filtrados por tenant | `8dfc14e` | Sim | Teste de isolamento ampliado | Nenhum | — | — |
| ASSETS-04 | ASSETS_DOCUMENTOS_R2 | 2 gaps médios: limpar-refs-orfas e historico/:id/certificados | P2 | RESOLVED | Limpeza limitada ao tenant, metadado cross-tenant não retornado | `8dfc14e` | Sim | Teste de isolamento ampliado | Nenhum | — | — |
| ASSETS-05 | ASSETS_DOCUMENTOS_R2 | R2 backfill de metadata futuro | P3 | BACKLOG | Plano documentado, sem execução | — | — | — | Aguardar volume multiempresa justificar | Sprint futuro: backfill metadata | GPT-5.4 Média |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| RBAC-01 | RBAC_SUPORTE | `userId === 1` como platform admin implícito em `auth.ts` e `empresas.ts` | S1 | PARTIAL | Centralizado em `middleware/tenant.ts` com helpers nomeados (`isLegacyPlatformAdminUserId`, `isPlatformAdminContext`). Guard arquitetural contra novos atalhos diretos. | `13dd828` | Sim | `no-direct-platform-admin-user-id.test.ts`, `rbac-platform-admin-boundaries.test.ts` | Fallback legado ainda existe; remoção real exige migration com `platform_admin` persistido | Sprint futuro: migration RBAC v2 | GPT-5.5 Altissimo |
| RBAC-02 | RBAC_SUPORTE | Role `support` read-only por tenant inexistente | S1 | SCHEMA_APPLIED_READY_FOR_GRADUAL_ENFORCEMENT | Sprint P definiu `support_read_only`; Sprint Q fechou a readiness; `MIG-01` deixou baseline controlado validado e a janela atual aplicou a `0389` em `staging`, confirmando grants/sessoes auditaveis e helper local de dual-read | `0389` controlled execution | — | Docs `AIRTRUST_RBAC_SUPPORT_V2_DESIGN_v0_5.md`, `AIRTRUST_0389_AUDIT_V2_RBAC_SCHEMA_EXECUTION_RESULT_AND_ENFORCEMENT_HANDOFF_v0_5.md`, testes `platform-roles-support-access-schema.test.ts` e `platform-access.test.ts` | Falta enforcement runtime gradual e validacao operacional de grants/sessoes | Bloco 4 - enforcement gradual | GPT-5.5 Altissimo |
| RBAC-03 | RBAC_SUPORTE | `platform_admin` persistido ausente | S1 | SCHEMA_APPLIED_READY_FOR_GRADUAL_ENFORCEMENT | Sprint P definiu o modelo conceitual; `MIG-01` deixou baseline controlado validado e a janela atual aplicou a `0389` em `staging`, confirmando `user_platform_roles` e helper de resolucao persistida + fallback legado | `0389` controlled execution | — | Docs `AIRTRUST_PLATFORM_ROLES_MODEL_v0_5.md`, `AIRTRUST_0389_AUDIT_V2_RBAC_SCHEMA_EXECUTION_RESULT_AND_ENFORCEMENT_HANDOFF_v0_5.md`, teste `platform-access.test.ts` | Falta dual-read operacional e remocao futura do fallback `userId===1` | Bloco 4 - enforcement gradual | GPT-5.5 Altissimo |
| RBAC-04 | RBAC_SUPORTE | Suporte sem audit trail formal próprio | S2 | SCHEMA_APPLIED_READY_FOR_GRADUAL_ENFORCEMENT | Sprint O documentou `SUPPORT_ACCESS`; `MIG-01` deixou baseline controlado validado e a janela atual aplicou a `0389`, criando `support_access_sessions` com helper pequeno de dual-audit legado + v2 preservado | `0389` controlled execution | — | Docs `AIRTRUST_SUPPORT_ACCESS_AUDIT_MODEL_v0_5.md`, `AIRTRUST_0389_AUDIT_V2_RBAC_SCHEMA_EXECUTION_RESULT_AND_ENFORCEMENT_HANDOFF_v0_5.md`, teste `record-legacy-and-canonical-audit.test.ts` | Faltam call sites reais de sessao de suporte e ativacao operacional | Bloco 4 - enforcement gradual | GPT-5.5 Altissimo |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| LGPD-01 | AUDIT_LGPD | `registrarAuditoria()` grava em `auditoria` sem `empresa_id`, sem `request_id` e sem sanitização | S1 | DUAL_WRITE_PARTIAL | Camada `lib/audit`, schema v2 e writer canônico criados; writers legados preservados | `300ecb9`, Sprint R, Sprint S | Sim para runtime legado; v2 depende de flag/schema | Testes de sanitização, schema e `audit-events-v2-writer.test.ts` | Call sites legados fora do escopo ainda podem gravar payload amplo | Ativar/paridade e ampliar dual-write | GPT-5.5 Altissimo |
| LGPD-02 | AUDIT_LGPD | `logAudit()` usa `audit_logs` mas sem `empresa_id`, `usuario_id` canônico nem `request_id` | S2 | DUAL_WRITE_PARTIAL | Cursos LMS mantêm `logAudit()` e passam contexto dedicado ao writer v2 sem copiar payload legado | `300ecb9`, Sprint R, Sprint S | V2 desabilitado por padrão | Testes de request correlation, schema, writer e dual-write LMS | Ativação operacional e cobertura além de LMS ainda pendentes | Ativar/paridade e ampliar dual-write | GPT-5.5 Altissimo |
| LGPD-03 | AUDIT_LGPD | `support_reason` ausente em todas as tabelas de auditoria | S2 | READY_FOR_STAGING_FLAG_TEST | `support_reason` está no schema, o writer recusa `support_mode > 0` sem justificativa e a validação local aprovada passou. Migration `0385` aplicada em produção (Sprint X.5). | Sprint R, Sprint S, Sprint T, Sprint T.1, Sprint X.5 | Schema aplicado; v2 desabilitado por padrão | `audit-events-v2-writer.test.ts`, runners locais PASS, readiness docs e rollback plan | Flag e ativação/paridade ainda pendentes | Staging flag test e ativação controlada | GPT-5.5 Altissimo |
| LGPD-04 | AUDIT_LGPD | Retenção/audit trail v2 pendente (política de purge, índices, compliance) | S2 | READY_FOR_STAGING_FLAG_TEST | Writer normaliza `retention_class`, metadata por allowlist e falhas controladas; T/T.1 confirmaram flag default off e validação local PASS. Migration `0385` aplicada em produção (Sprint X.5). | Sprint R, Sprint S, Sprint T, Sprint T.1, Sprint X.5 | Schema aplicado; v2 desabilitado por padrão | Schema tests, writer tests, runners locais PASS, readiness docs, migration plan e rollback plan | Validacao juridica, ativação, rollout e purge continuam abertos | Staging flag test e validar paridade | GPT-5.5 Altissimo |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| STATUS-01 | STATUS_ENUM | Status mágicos duplicados em PT/EN e por gênero (CONCLUIDA/CONCLUIDO, CANCELADA/CANCELADO, PENDENTE/PENDING, PLANEJADA/PLANEJADO) | S2 | PARTIAL | Módulo central `status-codes.ts` criado; compatibilidade aplicada em `dashboardService`, simuladores, qualificações e treinamentos planejados | `c747b18`, `3a775a8` | Sim | `status-codes.test.ts`, `dashboard-status-compatibility.test.ts`, `simuladores-status-compatibility.test.ts` | Cron jobs, alertas, EVD e demais módulos ainda usam strings soltas fora da camada crítica | Sprint futuro: expandir compatibilidade | GPT-5.4 Alta |
| STATUS-02 | STATUS_ENUM | Cron/alertas/EVD com status residual não normalizado | S2 | OPEN | Sprint C cobriu camada crítica; residuais em cron jobs e alertas mapeados mas não alterados | — | — | — | Expansão pendente para caminhos batch e operacionais | Sprint futuro: status residual | GPT-5.4 Média |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MIG-01 | MIGRATION_INTEGRITY | Cadeia canônica de migrations com 30 prefixos duplicados, 3 nomes fora do padrão e exceções históricas de replay/governança | S2 | RESOLVED_FOR_CONTROLLED_SCOPE | Guard local criado para pin de duplicatas, nomes fora do padrão, `CREATE TEMP TABLE` e `PRAGMA foreign_keys = OFF`; Sprint AI adicionou estratégia formal de corte, rollback, dry-run local e readiness scripts sem editar migrations aplicadas; Sprint AK adicionou contrato compartilhado; `DQ-01` foi executado e validado em `staging`; a janela atual gerou baseline SQL de schema a partir do snapshot `staging`, excluiu `d1_migrations`, validou replay limpo e preservou `0389` fora do baseline | Sprint AH, Sprint AI, Sprint AK, DQ01 Local Copy Backfill, DQ01 Staging Backfill, MIG01 Controlled Rebaseline | — | `migration-governance.test.ts`, `sigvoos-base-tables-schema.test.ts`, `readiness-audit-scripts.test.ts`, `controlled-execution-gate.test.ts`, `mig01-staging-rebaseline.test.ts`, `AIRTRUST_MIGRATION_REBASELINE_READINESS_v0_5.md`, `AIRTRUST_DQ01_STAGING_BACKFILL_EXECUTION_RESULT_AND_MIG01_HANDOFF_v0_5.md`, `AIRTRUST_MIG01_CONTROLLED_REBASELINE_EXECUTION_RESULT_AND_0389_HANDOFF_v0_5.md`, `run-mig01-staging-rebaseline.sh`, `mig01-staging-schema-baseline-20260604.sql` | `0389` ainda não aplicada; enforcement runtime fica para bloco posterior | Aplicar `0389` / Audit v2 + RBAC/Suporte v2 em janela controlada | GPT-5.5 Altissimo |
| DQ-01 | DATA_QUALITY | Runner parcial e caminhos críticos de simuladores dependiam de integridade implícita entre tenant, sessão, participante e checks | S1 | RESOLVED_FOR_CONTROLLED_SCOPE | SQL validado estaticamente, runner local seguro criado; OP-1/OP-2 preservados; Sprint AH endureceu caminhos críticos; Sprint AI mapeou riscos; Sprint AJ registrou bloqueio; Sprint AK adicionou contrato; Sprint AL materializou pacote `local-copy`; a janela local-copy corrigiu `17` soft-deletes ativos em `funcionarios`; a janela atual materializou `staging`, capturou snapshot/rollback, passou nos gates e executou o apply controlado em `staging` com `0` candidatos, `0` alterações e `0` remanescentes | `1a9722c`, Sprint AH, Sprint AI, Sprint AJ, Sprint AK, Sprint AL, DQ01 Local Copy Backfill, DQ01 Staging Backfill | — | `validate-data-quality-sql.sh` PASS, `simuladores-sessoes-data-quality.test.ts`, `dq01-controlled-backfill-gate.test.ts`, `controlled-execution-gate.test.ts`, `dq01-local-copy-backfill-apply.test.ts`, `dq01-staging-backfill-apply.test.ts`, `AIRTRUST_DQ01_CONTROLLED_ENVIRONMENT_PACKAGE_v0_5.md`, `AIRTRUST_DQ01_LOCAL_COPY_BACKFILL_EXECUTION_RESULT_v0_5.md`, `AIRTRUST_DQ01_STAGING_BACKFILL_EXECUTION_RESULT_AND_MIG01_HANDOFF_v0_5.md`, `run-dq01-local-copy-backfill-readonly.sh`, `run-dq01-local-copy-backfill-apply.sh`, `run-dq01-staging-backfill-readonly.sh`, `run-dq01-staging-backfill-apply.sh` | 5 checks seguem `SKIPPED` por cobertura parcial do schema atual de `staging`; trilha futura separada permanece em `DQ-02` | Manter `DQ-02` separado e avançar `MIG-01` | GPT-5.4 Alta |
| DQ-02 | DATA_QUALITY | Execução operacional completa pendente (snapshot staging completo) | S1 | OPEN | Não executado — requer ambiente aprovado com schema completo | — | — | — | Bloqueia GO pleno para cliente externo | Sprint futuro: executar em staging aprovado | GPT-5.4 Alta |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OPS-01 | OPERACOES_DEPLOY_DB | `--commit-dirty=true` em deploy de Pages | P2 | RESOLVED | Removido do caminho principal; `preflight-clean-deploy.sh` bloqueia deploy com árvore suja | `b488105` | Sim | `ops:guard` PASS, preflight PASS | `deploy:all` e script legado ainda usam `--commit-dirty=true` (P2 residual) | Sprint futuro: fechar residuais | GPT-5.4 Baixa |
| OPS-02 | OPERACOES_DEPLOY_DB | Scripts D1 destrutivos sem wrapper seguro | P1 | RESOLVED | `run-production-db-script.sh` com allowlist; 12 scripts bloqueados com banner+exit; 22 scripts read-only na allowlist; `audit-dangerous-ops.sh` com 5 guards ativos (commit-dirty, git-add, remote-D1, DDL+remote, legacy audit) | `4ebd777`, sprint N | Não (scripts apenas) | `ops:guard` PASS, preflight PASS, inventário completo em `AIRTRUST_D1_SCRIPT_HARDENING_AUDIT_v0_5.md` | Nenhum — todos os scripts perigosos bloqueados ou roteados pelo wrapper | — | GPT-5.4 Média |
| OPS-03 | OPERACOES_DEPLOY_DB | `deploy:all` com `--commit-dirty=true` residual | P2 | RESOLVED | `--commit-dirty=true` removido de `build-and-deploy.sh:48` e `legacy/deploy-full-automated.sh:79`; ambos executam `preflight-clean-deploy.sh` como gate | `7e89b8b` | Sim | `ops:guard` PASS, preflight PASS | Nenhum | — | — |
| OPS-04 | OPERACOES_DEPLOY_DB | Scripts legados bloqueados (seed, purge, cleanup, import) | P2 | RESOLVED | Bloqueados por padrão; retornam erro e orientam uso do wrapper | `b488105` | Sim | `ops:guard` PASS | Nenhum | — | — |
| OPS-05 | OPERACOES_DEPLOY_DB | Smoke autenticado pendente por validação de empresa esperada | P2 | PARTIAL | Script `smoke-authenticated-operational.sh` executado historicamente com `PASS=11, FAIL=0, SKIPPED=2`; OP-1 e OP-2 confirmaram que a sessao atual segue sem credencial efemera e sem `AIRTRUST_EXPECTED_EMPRESA_*` | `28a4a89` | — | Smoke public-only PASS; tentativas OP-1/OP-2 resultaram em `SKIPPED_AUTH_REQUIRED` sem gravar segredo ou PII | `AIRTRUST_EXPECTED_EMPRESA_ID`/`AIRTRUST_EXPECTED_EMPRESA_CODIGO` não configurados e nenhuma credencial read-only presente na sessão | Configurar variável de empresa esperada e credencial efêmera/read-only, depois reexecutar | GPT-5.4 Baixa |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BETA-01 | MODULOS_BETA | Hospedagem com 0 testes | S2 | PARTIAL | Contratos funcionais mínimos de listagem, criação e validação criados | `7be3d50`, `11b9d44` | Sim | `hospedagem-beta-contract.test.ts`, `module-access.test.ts` | Cobertura ainda baixa; update/checkout e cross-tenant explícito pendentes | Sprint futuro: expandir cobertura beta | GPT-5.4 Alta |
| BETA-02 | MODULOS_BETA | SGSO com cobertura baixa | S2 | PARTIAL | Contratos funcionais em relatos, auditorias e workflow tenant-scoped criados | `7be3d50`, `11b9d44` | Sim | `sgso-relatos-beta-contract.test.ts`, `sgso-nextgen-relatos-acoes-guards.test.ts`, `sgso-auditorias-ncs-guards.test.ts` | Casos de transição e auditoria detalhada pendentes | Sprint futuro: expandir cobertura SGSO | GPT-5.4 Alta |
| BETA-03 | MODULOS_BETA | LMS/EAD com cobertura baixa | S2 | PARTIAL | Contratos funcionais mínimos de listagem e criação simples criados | `7be3d50`, `11b9d44` | Sim | `lms-cursos-beta-contract.test.ts` | Upload real e sincronização EdApp/EAD pendentes | Sprint futuro: expandir cobertura LMS | GPT-5.4 Alta |
| BETA-04 | MODULOS_BETA | Treinamentos Planejados com cobertura baixa | S2 | PARTIAL | Contratos de bloqueio direto criados | `7be3d50` | Sim | `module-access.test.ts`, `ProtectedRoute.module-gating` | Testes de contrato de escrita/leitura separados pendentes | Sprint futuro: contratos de escrita | GPT-5.4 Média |
| BETA-05 | MODULOS_BETA | EVD sem cobertura de teste | S2 | OPEN | Fora do escopo dos sprints D/E/F; sem testes dedicados | — | — | — | Cobertura zero para módulo com dados operacionais sensíveis | Sprint futuro: cobertura EVD | GPT-5.4 Alta |
| BETA-06 | MODULOS_BETA | Module gating implementado e funcional | P2 | RESOLVED | Menu, rotas diretas e worker protegidos; `/api/auth/empresas` retorna `modulos_ativos` normalizado | `a375257`, `5b21dbe` | Sim | `module-access.test.ts`, `navigation-module-gating.test.ts`, `AppLayout.module-gating.test.tsx`, `ProtectedRoute.module-gating.test.tsx`, `beta-module-public-surface.test.ts` | Nenhum — funcionalidade completa | — | — |
| BETA-07 | MODULOS_BETA | Contratos funcionais mínimos dos módulos beta | S2 | RESOLVED | Contratos de tenant-scope e fluxo simples criados para Hospedagem, SGSO, LMS | `11b9d44` | Sim | 3 arquivos de teste de contrato beta | Cobertura pode crescer mas baseline estabelecida | — | — |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ARCH-01 | ARQUITETURA_SQL_REPOSITORY | SQL espalhado: 2302 `.prepare(` com concentração em sigvoos-frms, dashboardService, SGSO, FRMS | S3 | MITIGATED_WITH_GUARDS | Repository pilot em `dashboardService` (2 queries); expandido para `lmsRelatoriosRepository` (3 queries); fechamento final adicionou guard de regressão para arquivos runtime acima de 2.000 linhas e concentração de `.prepare(` acima de 40 | `871a140`, `2733722`, `59e601f`, Audit Cycle Final Closure | Sim | `dashboardMetricsRepository.test.ts`, `lmsRelatoriosRepository` com testes de contrato, `architecture-performance-guard.test.ts` | dívida estrutural permanece; próximos candidatos: lms-cursos stats, qualificações dashboard, extrações FRMS/Simuladores | Sprint futuro: expandir repository pattern | GPT-5.4 Alta |
| ARCH-02 | ARQUITETURA_SQL_REPOSITORY | Próximos candidatos read-only identificados | S3 | BACKLOG | LMS reports integrado; lms-cursos e qualificações mapeados como próximos | `59e601f` | Sim | Testes de contrato de repository | Sem urgência; expandir gradualmente | Sprint futuro: próximo domínio | GPT-5.4 Alta |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DDL-01 | DDL_RUNTIME | Stream DDL runtime residual fechado (`R01`, `R03`, `R04`, `R09`) | S2 | RESOLVED | Sprint E removeu 8 hot paths. Sprint V inventariou 20 ocorrências. Sprint W executou a Pré-Fase e removeu R02, R05, R06, R07, R08 e R10. Sprint X.4 versionou `0386` e removeu o fallback runtime de R03 localmente. Sprint X.5 aplicou `0386` em produção e deployou o Worker/API. Sprint Z1 versionou `0387`. Sprint Z1.1 provou localmente que a cadeia limpa SIGVOOS quebra na `0354`. Sprint R01.2 criou o bootstrap local de novo ambiente e provou o replay controlado sem tocar D1 remoto. Sprint R01.3 revalidou o pacote em gate local-isolado e fechou a readiness para remoção do fallback. Sprint R01.4 removeu `ensureSigvoosTables()`, eliminou 10 call sites e adicionou o teste `sigvoos-no-runtime-ddl.test.ts`. Sprint R09 removeu o ALTER TABLE de `qualificacoes/shared.ts`; R09 = RESOLVED. Sprint R04.2 registrou o probe estrutural remoto de produção para R04, a Sprint R04.3 fechou o desenho documental da `0388`, a Sprint R04.4 versionou a migration e o teste local e a Sprint R04.5 registrou o apply oficial da fila pendente (`0387` + `0388`) com probe pós-apply. Sprint R04.6 removeu o bootstrap runtime: auto-migration-documentos.ts deletado, api-bootstrap.ts limpo, guard test atualizado, testes (33/33) PASS. Sprint R04.7 executou o deploy do Worker/API (APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9), smoke pós-deploy PASS (3/3 público, read-only PASS). R04 = RESOLVED. | `01f0902`, Sprint V, Sprint W, Sprint X.4, Sprint X.5, Sprint Z1, Sprint Z1.1, Sprint R01.2, Sprint R01.3, Sprint R01.4, Sprint R09, Sprint R04.2, Sprint R04.3, Sprint R04.4, Sprint R04.5, Sprint R04.6, Sprint R04.7 | Sim (X.5, R04.7) | `no-runtime-ddl-hot-paths.test.ts`, `sigvoos-no-runtime-ddl.test.ts`, migration tests `0386`/`0387`, auditoria de cadeia Z1.1, `scripts/bootstrap-new-environment.sql`, `AIRTRUST_SIGVOOS_R01_RUNTIME_FALLBACK_REMOVAL_AND_AUDIT_CLOSURE_v0_5.md`, smoke pós-deploy X.5 e R04.7, `qualificacoes-historico-shared-schema.test.ts`, `worker-airtrust/src/__tests__/migrations/documentos-canonical-schema.test.ts`, `AIRTRUST_DOCUMENTOS_DDL_R04_READINESS_v0_5.md`, `AIRTRUST_DOCUMENTOS_0388_CANONICAL_SCHEMA_DESIGN_v0_5.md` | Nenhuma no stream DDL runtime. | Reauditoria independente do fechamento DDL residual | GPT-5.5 Alta / GPT-5.5 Altissimo |
| DDL-02 | DDL_RUNTIME | `sigvoos-frms.ts` runtime fallback removido; bootstrap preservado | S2 | RESOLVED | Sprint V confirmou: cobertura de migration apenas parcial (`0352` cobre `sigvoos_mapeamento_manual` + `frms_jornada_pendente`; `0354` referencia `integracoes_sigvoos_config` mas não cria). Sprint Z1 criou `0387_integracoes_sigvoos_base_tables.sql` e teste local. Sprint Z1.1 demonstrou que `0354` falha em cadeia limpa antes de `0387`. Sprint R04.5 registrou `0387` aplicada em produção porque o mecanismo oficial consumiu a fila pendente junto com a `0388`. Sprint R01.2 criou `scripts/bootstrap-new-environment.sql`, o runbook operacional e a prova local de replay com bootstrap antes da cadeia histórica. Sprint R01.3 auditou novamente o bootstrap, validou o gate local-isolado e fechou o inventário exato do fallback runtime. Sprint R01.4 removeu `ensureSigvoosTables()` do runtime, eliminou 10 call sites e manteve o bootstrap como caminho oficial de novo ambiente. | Sprint Z1, Sprint Z1.1, Sprint R04.5, Sprint R01.2, Sprint R01.3, Sprint R01.4 | Não | `0387_integracoes_sigvoos_base_tables.sql`, `scripts/bootstrap-new-environment.sql`, `sigvoos-base-tables-schema.test.ts`, `sigvoos-no-runtime-ddl.test.ts`, `AIRTRUST_SIGVOOS_R01_RUNTIME_FALLBACK_REMOVAL_AND_AUDIT_CLOSURE_v0_5.md` | Nenhuma. | Reauditoria independente opcional | GPT-5.5 Altissimo |
| DDL-03 | DDL_RUNTIME | `treinamentos-planejados-integration.ts` tinha DDL residual em `solicitacoes_treinamento` | S2 | RESOLVED | Probe aprovado em produção, migration `0386` versionada, fallback runtime removido localmente (X.4). Migration `0386` aplicada em produção + Worker/API deployado (X.5). | Sprint X.0, X.1, X.2, X.3, Sprint X.4, Sprint X.5 | Sim (X.5) | `probe-solicitacoes-treinamento-schema-readonly.sh`, `0386_solicitacoes_treinamento_planejado_link.sql`, `solicitacoes-treinamento-planejado-link-schema.test.ts`, `no-runtime-ddl-hot-paths.test.ts`, smoke pós-deploy PASS | Nenhum | — | — |
| DDL-04 | DDL_RUNTIME | `auto-migration-documentos.ts` segue no bootstrap da API | S2 | RESOLVED (Sprint R04.7) | Sprint R04.1 mapeou o runtime; Sprint R04.2 registrou o probe estrutural remoto real em produção com `PRAGMA` only. Baseline confirmado: `documentos` com `empresa_id DEFAULT 1`, sem `historico_id`/`sha256_hash`, sem índice nominal `idx_documentos_uuid`; `pasta_virtual.documento_id` ausente; `certificados_templates` presente. Sprint R04.3 fechou o desenho conservador da futura `0388`. Sprint R04.4 versionou `0388_documentos_canonical_schema.sql` e o teste dedicado de schema/idempotência. Sprint R04.5 registrou o apply oficial da `0388` e o probe pós-apply PASS estrutural. Sprint R04.6 removeu o bootstrap runtime: auto-migration-documentos.ts deletado, api-bootstrap.ts limpo, guard test atualizado, testes (33/33) PASS. Sprint R04.7 executou o deploy do Worker/API (APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9), smoke pós-deploy PASS (3/3 público, read-only PASS). R04 = RESOLVED. | Sprint R04.1–R04.7 | Sim (R04.7) | `AIRTRUST_DOCUMENTOS_DDL_R04_READINESS_v0_5.md`, `AIRTRUST_DOCUMENTOS_0388_CANONICAL_SCHEMA_DESIGN_v0_5.md`, `worker-airtrust/src/__tests__/migrations/documentos-canonical-schema.test.ts`, smoke pós-deploy R04.7 PASS | Nenhuma. | — | — |
| DDL-05 | DDL_RUNTIME | `qualificacoes/tipos.ts`, `historico-helpers.ts` e `simuladores-modelos.ts` — DDL coberto por migration em qualificações/simuladores | S3 | RESOLVED | Sprint W removeu os caminhos cobertos por migration: R05, R06, R07, R08 e R10. Sprint R09 removeu o ALTER TABLE de `shared.ts` (R09 = RESOLVED). | Sprint W, Sprint R09 | Sim | Guard arquitetural atualizado + testes Sprint W + `qualificacoes-historico-shared-schema.test.ts` | Nenhuma | — | — |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PERF-01 | PERFORMANCE_EFICIENCIA | Bundle grande, chunks PDF duplicados | S3 | OPEN | Não auditado em profundidade | — | — | — | Falta auditoria específica de bundle e carregamento | Sprint futuro: performance audit | GPT-5.4 Alta |
| PERF-02 | PERFORMANCE_EFICIENCIA | Possíveis N+1 queries em rotas grandes | S3 | OPEN | Não auditado | — | — | — | Falta auditoria de queries | Sprint futuro: query audit | GPT-5.4 Alta |
| PERF-03 | PERFORMANCE_EFICIENCIA | Rotas grandes (FRMS, SGSO, dashboard) sem auditoria de eficiência | S3 | OPEN | Não auditado | — | — | — | Dívida estrutural sem urgência para escala atual | Sprint futuro: performance audit | GPT-5.4 Alta |
| PERF-04 | PERFORMANCE_EFICIENCIA | Hardening local de produto/performance/scale em rotas críticas | S3 | MITIGATED_WITH_GUARDS | clamp de `limit` em `simuladores-fichas-extras.ts`; smoke adicional para `dashboard/qualificacoes`, `dashboard/licencas` e `GET /evd`; guard arquitetural ampliado para `SELECT *` em rotas críticas com allowlist explícita | Product/Performance/Scale Hardening | Não | `simuladores-fichas-extras-limit.test.ts`, `dashboard-metrics-integrity.test.ts`, `escalas-evd-regression.test.ts`, `architecture-performance-guard.test.ts`, `AIRTRUST_PRODUCT_PERFORMANCE_SCALE_HARDENING_v0_5.md` | falta medição real de staging/carga; allowlists de legacy ainda grandes | Medição em staging + redução gradual de payloads/legacy SQL | GPT-5.4 Alta |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SUP-01 | SUPABASE_ESTRATEGIA | Decisão: NÃO MIGRAR AGORA, HÍBRIDO FUTURO | S3 | DEFERRED | Feasibility audit concluído; 4 docs produzidos; decisão documentada | `bdbc200` | — | `AIRTRUST_SUPABASE_FEASIBILITY_AUDIT_v0_5.md`, `_MIGRATION_DECISION_RECORD`, `_RISK_MATRIX` | Reavaliação em 2027-06-02 ou se gatilhos de escala forem atingidos | — | — |
| SUP-02 | SUPABASE_ESTRATEGIA | RLS avaliado como ganho futuro de segurança | S3 | DEFERRED | Análise documental concluída; ~110 tabelas com `empresa_id` candidatas a RLS | — | — | — | Aguardar decisão de iniciar migração | — | — |
| SUP-03 | SUPABASE_ESTRATEGIA | Auth custom mantido; sem migração para Supabase Auth | S3 | DEFERRED | Decisão documentada: auth custom muito integrada, difícil de portar | — | — | — | Reavaliar se houver necessidade de features específicas do Supabase Auth | — | — |
| SUP-04 | SUPABASE_ESTRATEGIA | Repository pattern, tenant isolation audit e Cloudflare Queues como preparação | S3 | RESOLVED | Preparações concluídas nos Sprints H, J, K, K.1, L | Múltiplos | Sim (parcial) | Docs e testes de preparação | Cloudflare Queues implementação postergada | — | — |
| SUP-05 | SUPABASE_ESTRATEGIA | Gatilhos de reavaliação definidos: D1 80% limite, incidente tenant isolation, 2027-06-02 | S3 | DEFERRED | Documentado | — | — | — | Monitoramento contínuo | — | — |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TEST-01 | TESTABILIDADE | Cobertura de testes de tenant isolation ampliada | P1 | RESOLVED | Testes de isolamento para documentos, admin reset, escalas, simuladores, dashboard criados | Múltiplos | Sim | 5+ arquivos de teste de tenant isolation | Expansão contínua desejável | — | — |
| TEST-02 | TESTABILIDADE | Cobertura de testes de contrato para métricas executivas complementares | P3 | OPEN | Apenas métricas principais cobertas (taxaConclusaoMensal, utilizacaoSimuladores) | — | — | — | Compliance score, demanda, atividades recentes sem teste de contrato dedicado | Sprint futuro: expandir cobertura de dashboard | GPT-5.4 Média |

---

## 4. Achados resolvidos (25)

| ID | Categoria | Resumo |
|---|---|---|
| MULTI-01 | MULTIEMPRESA_TENANT | Reset admin cross-tenant corrigido e testado |
| MULTI-02 | MULTIEMPRESA_TENANT | Asset gateway com deny-by-default e classificação por prefixo |
| MULTI-03 | MULTIEMPRESA_TENANT | 7 gaps críticos de tenant isolation em documentos fechados |
| MULTI-05 | MULTIEMPRESA_TENANT | Dashboard metrics com `empresa_id` verificado |
| MULTI-06 | MULTIEMPRESA_TENANT | Transição simulador→qualificação com tenant-scope |
| ASSETS-01 | ASSETS_DOCUMENTOS_R2 | 7 gaps críticos em documentos/certificados |
| ASSETS-02 | ASSETS_DOCUMENTOS_R2 | 5 gaps altos de acesso/modificação cross-tenant |
| ASSETS-03 | ASSETS_DOCUMENTOS_R2 | GAP-014 recuperar-orfaos cross-tenant |
| ASSETS-04 | ASSETS_DOCUMENTOS_R2 | 2 gaps médios de metadado/limpeza |
| OPS-01 | OPERACOES_DEPLOY_DB | `--commit-dirty=true` removido do caminho principal |
| OPS-03 | OPERACOES_DEPLOY_DB | `deploy:all` com `--commit-dirty=true` residual removido de ambos os scripts |
| OPS-04 | OPERACOES_DEPLOY_DB | Scripts legados bloqueados por padrão |
| BETA-06 | MODULOS_BETA | Module gating implementado e funcional |
| BETA-07 | MODULOS_BETA | Contratos funcionais mínimos dos módulos beta |
| DDL-02 | DDL_RUNTIME | Fallback runtime SIGVOOS removido; bootstrap preservado |
| DDL-03 | DDL_RUNTIME | DDL runtime de `solicitacoes_treinamento` link — migration `0386` aplicada + deploy (X.5) |
| SUP-04 | SUPABASE_ESTRATEGIA | Ações preparatórias concluídas |
| TEST-01 | TESTABILIDADE | Cobertura de tenant isolation ampliada |
| — | FRMS | FRMS fail-open mitigado (campos obrigatórios, fail-safe) — commit `70c15fa` |
| — | FRMS | Read ack storage e eventos — commits `b73f7f1`, `b3e2393`, `777ba18` |
| — | SIMULADORES | Modelos de sessão por equipamento e tipo normalizados — commit `a543132` |
| — | AUTH | Role efetiva normalizada — commit `224b09a` |
| — | UI | Mobile hard refresh, focus-visible padronizado — commits `342c8ec`, `a2ed0fa` |
| — | AUDIT | Schema `audit_events_v2` aplicado em produção via migration `0385` (X.5) |
| — | DDL | Migration `0386` aplicada + Worker/API deployado; R03 RESOLVED (X.5) |

---

## 5. Achados parciais e readiness prioritários

| ID | Categoria | Resumo | O que falta |
|---|---|---|---|
| MULTI-04 | MULTIEMPRESA_TENANT | `escala_alocacoes` com tenant-scope por JOIN mas sem coluna própria | Migration P3 opcional para `empresa_id` denormalizado + UNIQUE parcial |
| RBAC-01 | RBAC_SUPORTE | `userId===1` centralizado mas fallback legado ainda existe | Migration para `platform_admin` persistido e remoção do fallback |
| RBAC-02 | RBAC_SUPORTE | `support_read_only` desenhado, readiness concluida e `MIG-01` rebaselineado para liberar schema controlado | Aplicar `0389`, validar sessao auditavel, dual-read e enforcement gradual |
| RBAC-03 | RBAC_SUPORTE | `platform_admin` desenhado, readiness concluida e `MIG-01` rebaselineado para liberar schema controlado | Aplicar `0389`, validar dual-read, rollback e remocao futura do fallback `userId===1` |
| RBAC-04 | RBAC_SUPORTE | Integracao RBAC/audit desenhada e readiness fechada com ordem audit-first | Aplicar `0389`, integrar eventos reais de suporte e revisar enforcement |
| LGPD-01 | AUDIT_LGPD | Writer v2 e dual-write mínimo existem, mas writers legados continuam ativos | Ativar/paridade em ambiente aprovado e ampliar cobertura |
| LGPD-02 | AUDIT_LGPD | Cursos LMS passam colunas dedicadas ao writer v2 sem remover `audit_logs` | Aplicar schema, ativar flag e expandir integração |
| LGPD-03 | AUDIT_LGPD | Writer exige `support_reason` para suporte e a validação local foi aprovada | Aplicar schema e integrar eventos reais de suporte/sensiveis |
| LGPD-04 | AUDIT_LGPD | Schema, writer, índices mínimos, taxonomia, readiness local e rollback concluídos | Validação jurídica, staging flag test, rollout e purge policy operacional |
| MIG-01 | MIGRATION_INTEGRITY | Baseline SQL de schema gerado e replayado a partir do snapshot `staging`, sem `d1_migrations` e sem `0389` | Nenhuma para o escopo controlado; proximo bloco e apply da `0389` |
| STATUS-01 | STATUS_ENUM | Status central aplicado em camada crítica mas não em cron/alertas/EVD | Expandir helpers para caminhos batch e operacionais |
| DQ-01 | DATA_QUALITY | Execucao controlada em `staging` concluida com gates PASS e `changed=0` | Manter `DQ-02` separado se cobertura total de schema for necessaria |
| OPS-05 | OPERACOES_DEPLOY_DB | Smoke autenticado executado com PASS=11 mas empresa esperada não validada | Configurar `AIRTRUST_EXPECTED_EMPRESA_ID` e reexecutar |
| BETA-01 | MODULOS_BETA | Hospedagem com contratos mínimos, mas cobertura ainda baixa | Expandir update/checkout e casos cross-tenant |
| BETA-02 | MODULOS_BETA | SGSO com baseline de contratos, mas cobertura de transições ainda incompleta | Expandir casos de workflow e auditoria detalhada |
| BETA-03 | MODULOS_BETA | LMS/EAD com baseline mínimo | Cobrir upload real e sincronizações |
| BETA-04 | MODULOS_BETA | Treinamentos Planejados com bloqueios básicos testados | Cobrir contratos separados de leitura/escrita |
| ARCH-01 | ARQUITETURA_SQL_REPOSITORY | Repository pilot em 2 domínios mas cobertura ainda pequena | Expandir gradualmente para próximos domínios read-only |
| DDL-01 | DDL_RUNTIME | Stream DDL residual fechado: R01, R03, R04 e R09 resolvidos | RESOLVED — Sprint X.5: migrations 0385/0386 aplicadas, Worker/API deployado, R03 = RESOLVED. Sprint R09: ALTER TABLE removido de shared.ts, R09 = RESOLVED. Sprint R04.6: bootstrap removido (auto-migration-documentos.ts deletado, api-bootstrap.ts limpo, guard test atualizado, testes 33/33 PASS). Sprint R04.7: deploy Worker/API (APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9), smoke pós-deploy PASS (3/3 público, read-only PASS), R04 = RESOLVED. Sprint R01.4: fallback SIGVOOS removido, ausência de DDL/runtime validada e R01 = RESOLVED. |

---

## 6. Achados abertos prioritarios

| ID | Categoria | Resumo | Bloqueia |
|---|---|---|---|
| MULTI-07 | MULTIEMPRESA_TENANT | Admin backfill sem tenant-scope | Não (admin-gated, idempotente) |
| MULTI-08 | MULTIEMPRESA_TENANT | R2 sem metadata de tenant | Não (defense-in-depth) |
| RBAC-02 | RBAC_SUPORTE | `support_read_only` ainda não implementado em runtime | Sim — cliente externo e multiempresa |
| RBAC-03 | RBAC_SUPORTE | `platform_admin` persistido ainda não implementado em runtime | Sim — multiempresa |
| STATUS-02 | STATUS_ENUM | Status residual em cron/alertas/EVD | Parcialmente — escala |
| MIG-01 | MIGRATION_INTEGRITY | Baseline governado gerado/replayado para o escopo controlado de staging | Não para produção atual; proximo risco e apply controlado da `0389` |
| DQ-02 | DATA_QUALITY | Execução operacional completa pendente | Sim — GO pleno |
| BETA-05 | MODULOS_BETA | EVD sem cobertura de teste | Sim — cobertura |
| DDL-03 | DDL_RUNTIME | `treinamentos-planejados-integration.ts` DDL residual | ✅ RESOLVIDO (Sprint X.5) |
| DDL-04 | DDL_RUNTIME | `auto-migration-documentos.ts` DDL residual | Nao (bloqueia 5+ empresas) — ✅ RESOLVED (Sprint R04.7) |
| DDL-09 | DDL_RUNTIME | `qualificacoes/shared.ts` dynamic DDL residual | ✅ RESOLVIDO (Sprint R09, 2026-06-03) — ALTER TABLE removido; colunas cobertas: `renovada`=0200+, `local`/`modalidade`=intencionalmente removidas por 0200; shared.ts era dead code; active path (historico-helpers.ts:131) já é no-op |
| PERF-01 | PERFORMANCE_EFICIENCIA | Bundle grande, chunks duplicados | Não |
| PERF-02 | PERFORMANCE_EFICIENCIA | Possíveis N+1 queries | Não |
| PERF-03 | PERFORMANCE_EFICIENCIA | Rotas grandes sem auditoria | Não |
| TEST-02 | TESTABILIDADE | Métricas executivas complementares sem teste | Não |

---

## 7. Achados remanescentes que exigem migration/schema

| ID | Descrição | Tipo de migration necessária |
|---|---|---|
| RBAC-01 | `userId===1` → `platform_admin` persistido | Nova tabela `platform_admins` ou coluna em `usuarios` |
| RBAC-02 | Role `support` com escopo e auditoria | Nova tabela `support_access` com escopo, expiração, eventos |
| RBAC-03 | `platform_admin` persistido | Schema para papéis de plataforma |
| MULTI-04 | `escala_alocacoes.empresa_id` denormalizado + UNIQUE parcial | ALTER TABLE + CREATE UNIQUE INDEX |
| MIG-01 | Cadeia histórica de migrations com duplicatas e exceções de replay | ✅ RESOLVED_FOR_CONTROLLED_SCOPE. Baseline governado de staging gerado e replayado; proxima migration real e `0389` |
| DDL-02 | Tabelas `integracoes_sigvoos_*` | Bootstrap local + migrations históricas para 3 tabelas + 4 índices. **Status: RESOLVED.** `0387` já foi aplicada em produção, `scripts/bootstrap-new-environment.sql` permanece oficial para ambientes novos e o fallback runtime saiu integralmente do código na Sprint R01.4. |
| DDL-04 | Consolidação de `documentos` em migration canônica | ✅ RESOLVED. Migration `0388` aplicada, bootstrap removido (R04.6), deploy + smoke concluídos (R04.7). |

**Nota:** Audit v2 ja tem schema aplicado em producao; o pendente real agora e ativacao/paridade por flag. `R03` ja nao entra mais nesta lista porque `0386` foi aplicada e o fallback saiu do runtime.

---

## 8. Achados que exigem staging/snapshot completo

| ID | Descrição | Dependência |
|---|---|---|
| DQ-01 | Data quality com 5 checks SKIPPED | Snapshot local/staging com schema completo (todas as tabelas) |
| DQ-02 | Execução operacional completa | Ambiente aprovado + operador autorizado |

---

## 9. Achados que exigem GPT-5.5

| ID | Categoria | Justificativa |
|---|---|---|
| RBAC-01, RBAC-02, RBAC-03 | RBAC_SUPORTE | Schema sensível de auth, migration com dados de plataforma, rollback planejado |
| LGPD-01, LGPD-02, LGPD-03, LGPD-04 | AUDIT_LGPD | Compliance, dados sensíveis, unificação de 3 tabelas de auditoria |
| DDL-02, DDL-03, DDL-04 | DDL_RUNTIME | Migrations complexas com dependências entre tabelas e risco de breaking change |
| MULTI-04 | MULTIEMPRESA_TENANT | ALTER TABLE em tabela crítica de produção com volume de dados |

---

## 10. Achados que podem ser tratados com DeepSeek/GPT-5.4-Mini

| ID | Categoria | Complexidade |
|---|---|---|
| STATUS-01, STATUS-02 | STATUS_ENUM | Expansão de helpers existentes, sem migration |
| BETA-01 a BETA-05 | MODULOS_BETA | Criação de testes de contrato, sem alteração de runtime |
| DQ-01, DQ-02 | DATA_QUALITY | Execução de SQL read-only, documentação |
| OPS-01, OPS-02, OPS-03, OPS-05 | OPERACOES | Scripts shell, remoção de flags, documentação |
| ARCH-01, ARCH-02 | ARQUITETURA_SQL | Extração de queries read-only, sem mutation |
| PERF-01, PERF-02, PERF-03 | PERFORMANCE | Auditoria read-only, documentação |
| MULTI-07, MULTI-08 | MULTIEMPRESA_TENANT | Ajustes pontuais, metadata R2 |
| TEST-02 | TESTABILIDADE | Criação de testes |

---

## 11. Backlog estratégico

| ID | Descrição | Gatilho |
|---|---|---|
| SUP-01 | Migração Supabase (cutover) | D1 80% limite, incidente tenant, ou 2027-06-02 |
| SUP-05 | Reavaliação programada | 2027-06-02 |
| ASSETS-05 | R2 metadata backfill | Volume multiempresa justificar |
| PERF-01/02/03 | Performance audit completo | Antes de 5+ empresas |
| ARCH-02 | Repository pattern em mais domínios | Conforme novos desenvolvimentos |

---

## 12. Proxima sequencia recomendada

1. **Aplicar `0389` / schema Audit v2 + RBAC/Suporte v2 em janela controlada** - GPT-5.5 Altissimo
2. **Enforcement runtime gradual Audit v2 + RBAC/Suporte v2** - GPT-5.5 Altissimo
3. **Product/performance/scale em staging** - GPT-5.4 Alta
4. **Smoke autenticado com empresa esperada** - GPT-5.4 Baixa
5. **~~R09 readiness/verification~~ CONCLUÍDO (Sprint R09)** - GPT-5.4 Alta
6. **~~R04 remover o bootstrap de Documentos agora que `0388` já foi aplicada e sondada~~ CONCLUÍDO (Sprint R04.6)** - GPT-5.5 Alta
7. **~~R04 deploy da remoção do bootstrap de Documentos~~ CONCLUÍDO (Sprint R04.7)** — R04 = RESOLVED. Deploy executado (APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9), smoke pós-deploy PASS (3/3).
8. **Cobertura beta (EVD + complementos)** - GPT-5.4 Alta
9. **Status residual / observabilidade / R2 metadata** - GPT-5.4 Alta

---

**Addendum Sprint R01 Chain Reconciliation (2026-06-03):** achado de bloqueio de replay limpo formalizado. DDL-02 / R01 reclassificado para `MIGRATION_APPLIED_CHAIN_RECONCILIATION_REQUIRED`. Nenhuma migration anterior à `0354` cria `integracoes_sigvoos_config`. Testes locais 8/8 PASS. `ensureSigvoosTables()` preservado. Doc de decisão: `docs/AIRTRUST_SIGVOOS_MIGRATION_CHAIN_RECONCILIATION_v0_5.md`.

**Addendum Sprint R01 Baseline Strategy (2026-06-03):** estratégia definida. Editar `0354` rejeitado. Curto prazo: `scripts/bootstrap-new-environment.sql`. Longo prazo: squash/rebaseline. `ensureSigvoosTables()` preservado. Doc de estratégia: `docs/AIRTRUST_SIGVOOS_R01_BASELINE_STRATEGY_v0_5.md`.

**Addendum Sprint R01 Bootstrap + Replay Closure (2026-06-04):** `scripts/bootstrap-new-environment.sql` foi criado e o teste local passou a provar explicitamente a diferença entre replay sem bootstrap e replay com bootstrap, além da idempotência do script. Nenhuma migration histórica foi editada, nenhuma migration nova foi criada, nenhum D1 remoto foi acessado e `ensureSigvoosTables()` foi preservado. DDL-02 / R01 avancou para **`BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE`**. Próxima fase: gate em ambiente novo/staging aprovado.

**Addendum Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness (2026-06-04):** o bootstrap foi reaudidado e o teste local passou a incluir um gate explícito por etapas em banco limpo temporário (`bootstrap -> 0352 -> 0354 -> 0387`). O inventário do fallback runtime foi fechado em 10 call sites e 2 arquivos. Nenhuma migration histórica foi editada, nenhuma migration nova foi criada, nenhum D1 remoto foi acessado e `ensureSigvoosTables()` foi preservado. DDL-02 / R01 avancou para **`READY_FOR_RUNTIME_FALLBACK_REMOVAL`**. Próxima fase: Runtime Fallback Removal + Final Audit Closure.

**Addendum Sprint R01.4 Runtime Fallback Removal + Final Audit Closure (2026-06-04):** `ensureSigvoosTables()` foi removido de runtime, os 10 call sites foram eliminados, o bootstrap `scripts/bootstrap-new-environment.sql` foi preservado e o teste `sigvoos-no-runtime-ddl.test.ts` passou a bloquear regressões de DDL/runtime SIGVOOS. Nenhuma migration histórica foi editada, nenhuma migration nova foi criada, nenhum D1 remoto foi acessado e nenhum deploy foi executado. DDL-02 / R01 avançou para **`RESOLVED`**. `AUDIT_CURRENT_CLOSURE = CLOSED` para o stream R01/DDL residual. Próxima etapa recomendada: reauditoria independente com Opus.

**Addendum Sprint AH Data Quality + Migration Integrity (2026-06-04):** `MIG-01` foi reclassificado como **`PARTIAL_REQUIRES_FUTURE_REBASELINE`** com guard permanente de governança local (`migration-governance.test.ts`) pinando 30 prefixos duplicados, 3 nomes fora do padrão e os construtos históricos mais hostis ao runner do D1. `DQ-01` permaneceu **PARTIAL**, mas os caminhos críticos de simuladores foram endurecidos: `GET /instrutores`, participantes de sessão e fallback de checks agora respeitam `empresa_id` e validam referências no tenant atual. Nenhuma migration histórica foi editada, nenhuma migration nova foi criada, nenhum D1 remoto foi acessado, nenhum deploy foi executado e nenhum dado real foi saneado. Documento consolidado: `AIRTRUST_DATA_QUALITY_AND_MIGRATION_INTEGRITY_AUDIT_v0_5.md`.

**Addendum Sprint AI Migration Rebaseline + Data Quality Backfill Readiness (2026-06-04):** a fase atual não executou rebaseline nem backfill real, mas elevou os dois streams para readiness controlada. `MIG-01` passou para **`READY_FOR_CONTROLLED_REBASELINE`** com estratégia de corte, staging, rollback e dry-run local documentados em `AIRTRUST_MIGRATION_REBASELINE_READINESS_v0_5.md` e `audit-migration-chain-readiness.sh`. `DQ-01` passou para **`READY_FOR_CONTROLLED_BACKFILL`** com mapa de riscos, regras de detecção, trilha de decisão manual e dry-run local documentados em `AIRTRUST_DATA_QUALITY_BACKFILL_READINESS_v0_5.md` e `audit-data-quality-readiness.sh`. O teste `readiness-audit-scripts.test.ts` versiona a execução local desses dois scripts.

**Addendum Sprint AJ DQ-01 Controlled Backfill Gate (2026-06-04):** a tentativa desta fase parou corretamente antes de qualquer mutation. A sessão atual não trouxe staging aprovado, snapshot, rollback ou autorização explícita para tocar banco alvo. `DQ-01` saiu de **`READY_FOR_CONTROLLED_BACKFILL`** para **`BACKFILL_EXECUTION_BLOCKED_BY_ENVIRONMENT_READINESS`**. A sprint criou `AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md`, `dq01-controlled-backfill-gate.sh` e `dq01-controlled-backfill-gate.test.ts`, além de ampliar `simuladores-sessoes-data-quality.test.ts` para bloquear criação órfã quando a sessão não existe.

**Addendum Sprint AK Controlled Execution Environment Contract (2026-06-04):** a sprint atual consolidou o pacote operacional compartilhado dos dois streams. Foram versionados `AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md`, `AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md`, `controlled-execution-gate.sh`, `mig01-controlled-rebaseline-gate.sh` e os testes do contrato/gates. `MIG-01` e `DQ-01` convergem para **`READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`**, ainda sem target real aprovado na sessão.

**Addendum DQ01 Local Copy Backfill Execution (2026-06-04):** a janela `local-copy` executou `scripts/run-dq01-local-copy-backfill-apply.sh` depois de gates PASS, snapshot e rollback. A mutação ficou restrita a `funcionarios` soft-deleted com status ativo: `17` candidatos, `17` alterados, `0` remanescentes. O diagnóstico passou de `PASS=5 WARN=4 FAIL=0 SKIPPED=5` para `PASS=6 WARN=3 FAIL=0 SKIPPED=5`. **`DQ-01 = LOCAL_COPY_BACKFILL_VALIDATED_READY_FOR_STAGING`** e **`MIG-01 = WAITING_FOR_DQ_STAGING_OR_CONTROLLED_DECISION`**.

**Addendum Audit Cycle Final Closure (2026-06-04):** a fase atual não criou novo gate e não executou DQ/MIG real. Os gates existentes foram rodados e bloquearam fechado por falta de target, banco, snapshot, rollback, aprovação e comando seguro. `DQ-01` e `MIG-01` passam para **`BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`**. `ARCH-01` passa para **`MITIGATED_WITH_GUARDS`** com `architecture-performance-guard.test.ts`, que congela crescimento de God files e concentração de `.prepare(`.

**Addendum Final Local Residual Closure + Controlled Execution Bridge (2026-06-04):** `AUTH-RESIDUAL-01` e `AUTH-RESIDUAL-02` foram fechados localmente. `syncEscalaEventosExternos.ts` removeu o fallback `f.empresa_id IS NULL`; `escalas-tripulacoes.ts` endureceu os lookups operacionais de `aeronaves` e `funcionarios`; `sgso-next-gen-extra.ts` endureceu a métrica tenant-scoped de compliance. `AUTH_TENANT = CONFIRMED_CLOSED` e `LOCAL_AUDIT_CLOSURE = COMPLETE_WITH_ENVIRONMENT_BLOCKERS`. DQ, MIG, `0389`, Audit v2 e RBAC/Suporte v2 seguem bloqueados por ambiente.

**Addendum DQ01 Staging Controlled Backfill Execution (2026-06-04):** o target oficial `staging` foi materializado com approval, target evidence, snapshot SQL + SQLite, rollback e safe commands versionados. Os gates `controlled-execution-gate.sh`, `dq01-controlled-backfill-gate.sh` e `audit-data-quality-readiness.sh` passaram. O diagnóstico pré em snapshot de `staging` ficou `PASS=9 WARN=0 FAIL=0 SKIPPED=5`; o apply remoto autorizado em `funcionarios` encontrou `0` candidatos e concluiu com `changed=0`; o snapshot pós-janela preservou as mesmas contagens e o mesmo hash do dump. **`DQ-01 = RESOLVED_FOR_CONTROLLED_SCOPE`** e **`MIG-01 = READY_FOR_CONTROLLED_REBASELINE_AFTER_DQ`**.

**Addendum MIG01 Controlled Rebaseline Execution (2026-06-04):** a janela `MIG-01` usou o snapshot SQLite pos-DQ de `staging` como entrada, passou os gates `controlled-execution-gate.sh`, `mig01-controlled-rebaseline-gate.sh` e `audit-migration-chain-readiness.sh`, e executou `scripts/run-mig01-staging-rebaseline.sh`. O baseline SQL gerado contem `225` tabelas, `585` indices, `21` triggers e `10` views, exclui `d1_migrations`, nao inclui objetos da `0389` e foi replayado em SQLite limpo com `PRAGMA integrity_check = ok`. Nao houve D1 remoto, deploy, producao, DQ novo, apply da `0389` ou edicao de migration historica. **`MIG-01 = RESOLVED_FOR_CONTROLLED_SCOPE`**; **`RBAC_SUPPORT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`**; **`AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`**.

**Addendum 0389 Controlled Schema Execution (2026-06-04):** a `0389_platform_roles_support_access_foundation.sql` foi aplicada diretamente em `staging` via wrappers controlados, com snapshot schema-only, rollback explicito, gate generico e gate especifico aprovados. Estado pos-apply: `user_platform_roles`, `support_access_grants` e `support_access_sessions` presentes; `OBJECTS_0389_COUNT=9`; contagens de linha `0`; `d1_migrations` preservado em `4`; `LEDGER_0389_ROWS=0`. Nao houve deploy, producao, DQ ou MIG nesta janela. **`RBAC_SUPPORT_V2 = SCHEMA_APPLIED_READY_FOR_GRADUAL_ENFORCEMENT`**; **`AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`** porque `AUDIT_EVENTS_V2_EXISTS=0` em `staging`.

**Fim da matriz.** Documento gerado em 2026-06-02. Atualizado com Sprint X.5 closure (R03 = RESOLVED), Sprint R04.7 (**R04 = RESOLVED**), Sprint R01 Chain Reconciliation, Sprint R01 Baseline Strategy, Sprint R01 Bootstrap + Replay Closure, Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness, Sprint R01.4 Runtime Fallback Removal + Final Audit Closure (**R01 = RESOLVED**; `AUDIT_CURRENT_CLOSURE = CLOSED` para o stream R01/DDL residual), Sprint AH (**`MIG-01 = PARTIAL_REQUIRES_FUTURE_REBASELINE` / `DQ-01` parcial com hardening de caminhos críticos**), Sprint AI (**`MIG-01 = READY_FOR_CONTROLLED_REBASELINE` / `DQ-01 = READY_FOR_CONTROLLED_BACKFILL`**), Sprint AJ (**`DQ-01 = BACKFILL_EXECUTION_BLOCKED_BY_ENVIRONMENT_READINESS`** por falta de staging/snapshot/rollback/autorização), Sprint AK (**`MIG-01`/`DQ-01 = READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`**), Audit Cycle Final Closure (**`DQ-01`/`MIG-01 = BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`; `ARCH-01 = MITIGATED_WITH_GUARDS`**), DQ01 Staging Controlled Backfill Execution (**`DQ-01 = RESOLVED_FOR_CONTROLLED_SCOPE`; `MIG-01 = READY_FOR_CONTROLLED_REBASELINE_AFTER_DQ`**) e MIG01 Controlled Rebaseline Execution (**`MIG-01 = RESOLVED_FOR_CONTROLLED_SCOPE`; `RBAC_SUPPORT_V2`/`AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`**).
