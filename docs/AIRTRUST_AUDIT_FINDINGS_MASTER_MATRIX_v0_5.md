# AirTrust — Audit Findings Master Matrix v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `87a5b2b3e107b72a64fb9d79080ea21068145816`
**Modo:** Matriz atualizada após o Sprint T.1 de execução local aprovada do Audit v2. Sem migration remota, backfill ou alteração manual de dados reais.
**Sprints de origem consolidados:** A (RBAC), B (Audit Trail/LGPD), C (Status Enum), D (Testes Beta), E (DDL), F (Data Quality), G (Runner), H (Repository Dashboard), I (Supabase Feasibility), J (Supabase Preparation), K (Tenant Isolation Docs), K.1 (Tenant Residuals), L (LMS Reports Integration), Reauditoria Opus v2, General Audit Opus.

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
| RBAC-02 | RBAC_SUPORTE | Role `support` read-only por tenant inexistente | S1 | IMPLEMENTATION_READY | Sprint P definiu `support_read_only`; Sprint Q fechou a readiness e a ordem segura: so ativar apos schema + writer canonico de audit e shadow dual-read de RBAC | — | — | Docs `AIRTRUST_RBAC_SUPPORT_V2_DESIGN_v0_5.md`, `AIRTRUST_SUPPORT_READ_ONLY_MODEL_v0_5.md`, `AIRTRUST_RBAC_AUDIT_V2_IMPLEMENTATION_READINESS_v0_5.md` e `AIRTRUST_RBAC_AUDIT_V2_TEST_MATRIX_v0_5.md` | Exige persistencia de papel, grants, sessao auditavel, enforcement runtime e rollout controlado | Sprint S/T: RBAC dual-read e suporte enforcement | GPT-5.5 Altissimo |
| RBAC-03 | RBAC_SUPORTE | `platform_admin` persistido ausente | S1 | IMPLEMENTATION_READY | Sprint P definiu o modelo conceitual; Sprint Q definiu que o schema de platform roles entra somente depois do foundation do Audit Trail v2 | — | — | Docs `AIRTRUST_PLATFORM_ROLES_MODEL_v0_5.md`, `AIRTRUST_RBAC_V2_MIGRATION_PLAN_v0_5.md`, `AIRTRUST_RBAC_AUDIT_V2_PHASED_IMPLEMENTATION_PLAN_v0_5.md` e `AIRTRUST_RBAC_AUDIT_V2_ROLLBACK_PLAN_v0_5.md` | Migration de papéis, dual-read, monitoramento de divergencia e rollback ainda pendentes | Sprint S: platform roles + RBAC dual-read | GPT-5.5 Altissimo |
| RBAC-04 | RBAC_SUPORTE | Suporte sem audit trail formal próprio | S2 | IMPLEMENTATION_READY | Sprint O documentou `SUPPORT_ACCESS`; Sprint P integrou eventos RBAC/audit; Sprint Q definiu rollout audit-first para que suporte ja nasca auditado | — | — | Docs `AIRTRUST_SUPPORT_ACCESS_AUDIT_MODEL_v0_5.md`, `AIRTRUST_AUDIT_EVENT_TAXONOMY_v0_5.md`, `AIRTRUST_RBAC_AUDIT_INTEGRATION_PLAN_v0_5.md` e `AIRTRUST_RBAC_AUDIT_V2_IMPLEMENTATION_READINESS_v0_5.md` | Implementação real, writer canonico, grants de suporte e enforcement continuam pendentes | Sprint R/S/T: audit foundation, dual-read e suporte enforcement | GPT-5.5 Altissimo |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| LGPD-01 | AUDIT_LGPD | `registrarAuditoria()` grava em `auditoria` sem `empresa_id`, sem `request_id` e sem sanitização | S1 | DUAL_WRITE_PARTIAL | Camada `lib/audit`, schema v2 e writer canônico criados; writers legados preservados | `300ecb9`, Sprint R, Sprint S | Sim para runtime legado; v2 depende de flag/schema | Testes de sanitização, schema e `audit-events-v2-writer.test.ts` | Call sites legados fora do escopo ainda podem gravar payload amplo | Ativar/paridade e ampliar dual-write | GPT-5.5 Altissimo |
| LGPD-02 | AUDIT_LGPD | `logAudit()` usa `audit_logs` mas sem `empresa_id`, `usuario_id` canônico nem `request_id` | S2 | DUAL_WRITE_PARTIAL | Cursos LMS mantêm `logAudit()` e passam contexto dedicado ao writer v2 sem copiar payload legado | `300ecb9`, Sprint R, Sprint S | V2 desabilitado por padrão | Testes de request correlation, schema, writer e dual-write LMS | Ativação operacional e cobertura além de LMS ainda pendentes | Ativar/paridade e ampliar dual-write | GPT-5.5 Altissimo |
| LGPD-03 | AUDIT_LGPD | `support_reason` ausente em todas as tabelas de auditoria | S2 | READY_FOR_STAGING_FLAG_TEST | `support_reason` está no schema, o writer recusa `support_mode > 0` sem justificativa e a validação local aprovada passou | Sprint R, Sprint S, Sprint T, Sprint T.1 | Não aplicado em produção | `audit-events-v2-writer.test.ts`, runners locais PASS, readiness docs e rollback plan | Eventos reais de suporte e enforcement continuam pendentes | Aplicar schema em staging; depois suporte | GPT-5.5 Altissimo |
| LGPD-04 | AUDIT_LGPD | Retenção/audit trail v2 pendente (política de purge, índices, compliance) | S2 | READY_FOR_STAGING_FLAG_TEST | Writer normaliza `retention_class`, metadata por allowlist e falhas controladas; T/T.1 confirmaram flag default off e validação local PASS | Sprint R, Sprint S, Sprint T, Sprint T.1 | V2 desabilitado por padrão | Schema tests, writer tests, runners locais PASS, readiness docs, migration plan e rollback plan | Validacao juridica, ativação, rollout e purge continuam abertos | Aplicar schema em staging e validar paridade | GPT-5.5 Altissimo |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| STATUS-01 | STATUS_ENUM | Status mágicos duplicados em PT/EN e por gênero (CONCLUIDA/CONCLUIDO, CANCELADA/CANCELADO, PENDENTE/PENDING, PLANEJADA/PLANEJADO) | S2 | PARTIAL | Módulo central `status-codes.ts` criado; compatibilidade aplicada em `dashboardService`, simuladores, qualificações e treinamentos planejados | `c747b18`, `3a775a8` | Sim | `status-codes.test.ts`, `dashboard-status-compatibility.test.ts`, `simuladores-status-compatibility.test.ts` | Cron jobs, alertas, EVD e demais módulos ainda usam strings soltas fora da camada crítica | Sprint futuro: expandir compatibilidade | GPT-5.4 Alta |
| STATUS-02 | STATUS_ENUM | Cron/alertas/EVD com status residual não normalizado | S2 | OPEN | Sprint C cobriu camada crítica; residuais em cron jobs e alertas mapeados mas não alterados | — | — | — | Expansão pendente para caminhos batch e operacionais | Sprint futuro: status residual | GPT-5.4 Média |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DQ-01 | DATA_QUALITY | Runner local/staging criado mas com checks SKIPPED por cobertura parcial de snapshot | S1 | PARTIAL | SQL validado estaticamente, runner local seguro criado, 5 PASS, 4 WARN, 0 FAIL, 5 SKIPPED | `1a9722c` | — | `validate-data-quality-sql.sh` PASS, relatório de evidência sanitizado | 5 checks SKIPPED por ausência de tabelas no snapshot local; execução completa pendente | Sprint futuro: Data Quality completo | GPT-5.4 Alta |
| DQ-02 | DATA_QUALITY | Execução operacional completa pendente (snapshot staging completo) | S1 | OPEN | Não executado — requer ambiente aprovado com schema completo | — | — | — | Bloqueia GO pleno para cliente externo | Sprint futuro: executar em staging aprovado | GPT-5.4 Alta |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OPS-01 | OPERACOES_DEPLOY_DB | `--commit-dirty=true` em deploy de Pages | P2 | RESOLVED | Removido do caminho principal; `preflight-clean-deploy.sh` bloqueia deploy com árvore suja | `b488105` | Sim | `ops:guard` PASS, preflight PASS | `deploy:all` e script legado ainda usam `--commit-dirty=true` (P2 residual) | Sprint futuro: fechar residuais | GPT-5.4 Baixa |
| OPS-02 | OPERACOES_DEPLOY_DB | Scripts D1 destrutivos sem wrapper seguro | P1 | RESOLVED | `run-production-db-script.sh` com allowlist; 12 scripts bloqueados com banner+exit; 22 scripts read-only na allowlist; `audit-dangerous-ops.sh` com 5 guards ativos (commit-dirty, git-add, remote-D1, DDL+remote, legacy audit) | `4ebd777`, sprint N | Não (scripts apenas) | `ops:guard` PASS, preflight PASS, inventário completo em `AIRTRUST_D1_SCRIPT_HARDENING_AUDIT_v0_5.md` | Nenhum — todos os scripts perigosos bloqueados ou roteados pelo wrapper | — | GPT-5.4 Média |
| OPS-03 | OPERACOES_DEPLOY_DB | `deploy:all` com `--commit-dirty=true` residual | P2 | RESOLVED | `--commit-dirty=true` removido de `build-and-deploy.sh:48` e `legacy/deploy-full-automated.sh:79`; ambos executam `preflight-clean-deploy.sh` como gate | `7e89b8b` | Sim | `ops:guard` PASS, preflight PASS | Nenhum | — | — |
| OPS-04 | OPERACOES_DEPLOY_DB | Scripts legados bloqueados (seed, purge, cleanup, import) | P2 | RESOLVED | Bloqueados por padrão; retornam erro e orientam uso do wrapper | `b488105` | Sim | `ops:guard` PASS | Nenhum | — | — |
| OPS-05 | OPERACOES_DEPLOY_DB | Smoke autenticado pendente por validação de empresa esperada | P2 | PARTIAL | Script `smoke-authenticated-operational.sh` executado com `PASS=11, FAIL=0, SKIPPED=2`; evidência documentada em `AIRTRUST_AUTHENTICATED_SMOKE_EVIDENCE_20260602.md` | `28a4a89` | — | Smoke public-only PASS; smoke autenticado 11/11 PASS | `AIRTRUST_EXPECTED_EMPRESA_ID`/`AIRTRUST_EXPECTED_EMPRESA_CODIGO` não configurados — validação de empresa esperada pendente | Configurar variável de empresa esperada e reexecutar | GPT-5.4 Baixa |

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
| ARCH-01 | ARQUITETURA_SQL_REPOSITORY | SQL espalhado: 2302 `.prepare(` com concentração em sigvoos-frms, dashboardService, SGSO, FRMS | S3 | PARTIAL | Repository pilot em `dashboardService` (2 queries); expandido para `lmsRelatoriosRepository` (3 queries) | `871a140`, `2733722`, `59e601f` | Sim | `dashboardMetricsRepository.test.ts`, `lmsRelatoriosRepository` com testes de contrato | Cobertura ainda pequena; próximos candidatos: lms-cursos stats, qualificações dashboard | Sprint futuro: expandir repository pattern | GPT-5.4 Alta |
| ARCH-02 | ARQUITETURA_SQL_REPOSITORY | Próximos candidatos read-only identificados | S3 | BACKLOG | LMS reports integrado; lms-cursos e qualificações mapeados como próximos | `59e601f` | Sim | Testes de contrato de repository | Sem urgência; expandir gradualmente | Sprint futuro: próximo domínio | GPT-5.4 Alta |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DDL-01 | DDL_RUNTIME | DDL removido de hot paths (8 funções `ensure*` removidas) | S2 | PARTIAL | `ensure*` removidas de preferencias, escalas-preferencias, matriz-treinamento, frms-fira, alertas, notificacoes-convocacao, treinamentos-planejados; funções órfãs removidas | `01f0902` | Sim | `no-runtime-ddl-hot-paths.test.ts` | 3 residuais mantidos: `sigvoos-frms.ts`, `treinamentos-planejados-integration.ts`, `auto-migration-documentos.ts` | Sprint futuro: migrations para os 3 residuais | GPT-5.5 Altissimo |
| DDL-02 | DDL_RUNTIME | `sigvoos-frms.ts` ainda cria tabelas `integracoes_sigvoos_*` em runtime | S2 | OPEN | Cobertura de migration apenas parcial; mantido por segurança | — | — | — | Exige migration explícita para 3 tabelas base e índices | Sprint futuro: migration SIGVOOS | GPT-5.5 Altissimo |
| DDL-03 | DDL_RUNTIME | `treinamentos-planejados-integration.ts` ainda faz `ALTER TABLE` em `solicitacoes_treinamento` | S2 | OPEN | Mantido; sem migration para colunas de link | — | — | — | Exige migration para `treinamento_planejado_id`, `status_pre_agendamento`, índice | Sprint futuro: migration treinamentos | GPT-5.5 Altissimo |
| DDL-04 | DDL_RUNTIME | `auto-migration-documentos.ts` segue no bootstrap da API | S2 | OPEN | Não tocado; cobertura de schema legada e mista | — | — | — | Exige consolidação de `documentos` em migration canônica única | Sprint futuro: canonicalizar schema documentos | GPT-5.5 Alta |

| ID | Categoria | Achado | Severidade original | Status atual | Correção feita | Commit(s) | Deploy | Evidência/testes | Pendência | Próximo sprint | Modelo recomendado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PERF-01 | PERFORMANCE_EFICIENCIA | Bundle grande, chunks PDF duplicados | S3 | OPEN | Não auditado em profundidade | — | — | — | Falta auditoria específica de bundle e carregamento | Sprint futuro: performance audit | GPT-5.4 Alta |
| PERF-02 | PERFORMANCE_EFICIENCIA | Possíveis N+1 queries em rotas grandes | S3 | OPEN | Não auditado | — | — | — | Falta auditoria de queries | Sprint futuro: query audit | GPT-5.4 Alta |
| PERF-03 | PERFORMANCE_EFICIENCIA | Rotas grandes (FRMS, SGSO, dashboard) sem auditoria de eficiência | S3 | OPEN | Não auditado | — | — | — | Dívida estrutural sem urgência para escala atual | Sprint futuro: performance audit | GPT-5.4 Alta |

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

## 4. Achados resolvidos (22)

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
| DDL-01 | DDL_RUNTIME | 8 funções `ensure*` removidas de hot paths |
| SUP-04 | SUPABASE_ESTRATEGIA | Ações preparatórias concluídas |
| TEST-01 | TESTABILIDADE | Cobertura de tenant isolation ampliada |
| — | FRMS | FRMS fail-open mitigado (campos obrigatórios, fail-safe) — commit `70c15fa` |
| — | FRMS | Read ack storage e eventos — commits `b73f7f1`, `b3e2393`, `777ba18` |
| — | SIMULADORES | Modelos de sessão por equipamento e tipo normalizados — commit `a543132` |
| — | AUTH | Role efetiva normalizada — commit `224b09a` |
| — | UI | Mobile hard refresh, focus-visible padronizado — commits `342c8ec`, `a2ed0fa` |

---

## 5. Achados parciais prioritários

| ID | Categoria | Resumo | O que falta |
|---|---|---|---|
| MULTI-04 | MULTIEMPRESA_TENANT | `escala_alocacoes` com tenant-scope por JOIN mas sem coluna própria | Migration P3 opcional para `empresa_id` denormalizado + UNIQUE parcial |
| RBAC-01 | RBAC_SUPORTE | `userId===1` centralizado mas fallback legado ainda existe | Migration para `platform_admin` persistido e remoção do fallback |
| RBAC-02 | RBAC_SUPORTE | `support_read_only` desenhado e com readiness gate concluido no Sprint Q | Implementar grants, sessao auditavel, enforcement runtime e testes end-to-end somente apos writer canonico |
| RBAC-03 | RBAC_SUPORTE | `platform_admin` desenhado e com readiness gate concluido no Sprint Q | Implementar migration, dual-read, remocao segura do fallback `userId===1` e rollback |
| RBAC-04 | RBAC_SUPORTE | Integracao RBAC/audit desenhada e readiness fechada com ordem audit-first | Implementar role persistida, writer, enforcement e revisoes operacionais |
| LGPD-01 | AUDIT_LGPD | Writer v2 e dual-write mínimo existem, mas writers legados continuam ativos | Ativar/paridade em ambiente aprovado e ampliar cobertura |
| LGPD-02 | AUDIT_LGPD | Cursos LMS passam colunas dedicadas ao writer v2 sem remover `audit_logs` | Aplicar schema, ativar flag e expandir integração |
| LGPD-03 | AUDIT_LGPD | Writer exige `support_reason` para suporte e a validação local foi aprovada | Aplicar schema e integrar eventos reais de suporte/sensiveis |
| LGPD-04 | AUDIT_LGPD | Schema, writer, índices mínimos, taxonomia, readiness local e rollback concluídos | Validação jurídica, staging flag test, rollout e purge policy operacional |
| STATUS-01 | STATUS_ENUM | Status central aplicado em camada crítica mas não em cron/alertas/EVD | Expandir helpers para caminhos batch e operacionais |
| DQ-01 | DATA_QUALITY | Runner funcional mas com 5 checks SKIPPED | Executar em ambiente com schema completo |
| OPS-05 | OPERACOES_DEPLOY_DB | Smoke autenticado executado com PASS=11 mas empresa esperada não validada | Configurar `AIRTRUST_EXPECTED_EMPRESA_ID` e reexecutar |
| BETA-01 | MODULOS_BETA | Hospedagem com contratos mínimos, mas cobertura ainda baixa | Expandir update/checkout e casos cross-tenant |
| BETA-02 | MODULOS_BETA | SGSO com baseline de contratos, mas cobertura de transições ainda incompleta | Expandir casos de workflow e auditoria detalhada |
| BETA-03 | MODULOS_BETA | LMS/EAD com baseline mínimo | Cobrir upload real e sincronizações |
| BETA-04 | MODULOS_BETA | Treinamentos Planejados com bloqueios básicos testados | Cobrir contratos separados de leitura/escrita |
| ARCH-01 | ARQUITETURA_SQL_REPOSITORY | Repository pilot em 2 domínios mas cobertura ainda pequena | Expandir gradualmente para próximos domínios read-only |
| DDL-01 | DDL_RUNTIME | 8 hot paths limpos, mas 3 residuais mantidos por segurança | Planejar migrations para SIGVOOS, treinamentos e documentos |

---

## 6. Achados abertos prioritários

| ID | Categoria | Resumo | Bloqueia |
|---|---|---|---|
| MULTI-07 | MULTIEMPRESA_TENANT | Admin backfill sem tenant-scope | Não (admin-gated, idempotente) |
| MULTI-08 | MULTIEMPRESA_TENANT | R2 sem metadata de tenant | Não (defense-in-depth) |
| RBAC-02 | RBAC_SUPORTE | `support_read_only` ainda não implementado em runtime | Sim — cliente externo e multiempresa |
| RBAC-03 | RBAC_SUPORTE | `platform_admin` persistido ainda não implementado em runtime | Sim — multiempresa |
| STATUS-02 | STATUS_ENUM | Status residual em cron/alertas/EVD | Parcialmente — escala |
| DQ-02 | DATA_QUALITY | Execução operacional completa pendente | Sim — GO pleno |
| BETA-05 | MODULOS_BETA | EVD sem cobertura de teste | Sim — cobertura |
| DDL-02 | DDL_RUNTIME | `sigvoos-frms.ts` DDL residual | Não (bloqueia 5+ empresas) |
| DDL-03 | DDL_RUNTIME | `treinamentos-planejados-integration.ts` DDL residual | Não (bloqueia 5+ empresas) |
| DDL-04 | DDL_RUNTIME | `auto-migration-documentos.ts` DDL residual | Não (bloqueia 5+ empresas) |
| PERF-01 | PERFORMANCE_EFICIENCIA | Bundle grande, chunks duplicados | Não |
| PERF-02 | PERFORMANCE_EFICIENCIA | Possíveis N+1 queries | Não |
| PERF-03 | PERFORMANCE_EFICIENCIA | Rotas grandes sem auditoria | Não |
| TEST-02 | TESTABILIDADE | Métricas executivas complementares sem teste | Não |

---

## 7. Achados que exigem migration/schema

| ID | Descrição | Tipo de migration necessária |
|---|---|---|
| RBAC-01 | `userId===1` → `platform_admin` persistido | Nova tabela `platform_admins` ou coluna em `usuarios` |
| RBAC-02 | Role `support` com escopo e auditoria | Nova tabela `support_access` com escopo, expiração, eventos |
| RBAC-03 | `platform_admin` persistido | Schema para papéis de plataforma |
| LGPD-01/02 | Unificação de `auditoria` + `audit_logs` + `auditoria_avancada_v2` | Writer v2 e integração LMS versionados; ativação/cobertura ampla pendentes |
| LGPD-03 | Coluna `support_reason` | Versionada e validada pelo writer; aplicação e enforcement ainda pendentes |
| MULTI-04 | `escala_alocacoes.empresa_id` denormalizado + UNIQUE parcial | ALTER TABLE + CREATE UNIQUE INDEX |
| DDL-02 | Tabelas `integracoes_sigvoos_*` | CREATE TABLE migrations para 3 tabelas + índices |
| DDL-03 | Colunas `treinamento_planejado_id`, `status_pre_agendamento` em `solicitacoes_treinamento` | ALTER TABLE + CREATE INDEX |
| DDL-04 | Consolidação de `documentos` em migration canônica | Migration única substituindo auto-bootstrap |

**Total: 9 achados que exigem migration**, todos com severidade S2 ou inferior (nenhum P0/P1 ativo).

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

## 12. Próxima sequência recomendada

1. **Reauditoria read-only de documentos/assets tenant isolation** (confirmação de correções) — GPT-5.4 Alta
2. **Data Quality com snapshot/staging completo** (executar checks pendentes) — GPT-5.4 Alta
3. **Sprint R - Audit Trail v2 schema backward-compatible** ✅ — GPT-5.5 Altissimo
4. **Sprint S - Canonical writer com dual-write mínimo** ✅ — GPT-5.5 Altissimo
5. **Sprint T - Activation readiness / local-staging validation** ✅ — GPT-5.5 Altissimo
6. **Sprint T.1 - Local activation run** ✅ — GPT-5.4 Alta
7. **Próxima fase - staging flag test com schema aplicado e rollback por flag** — GPT-5.5 Altissimo
6. **Cobertura beta (EVD + complementos)** — GPT-5.4 Alta
7. **DDL runtime residual design-only** (planejar migrations sem executar) — GPT-5.5 Altissimo
8. **R2 metadata para novos uploads** (defense-in-depth) — GPT-5.4 Alta
9. **Segunda empresa apenas depois das condições mínimas** (CONDITIONAL GO)

---

**Fim da matriz.** Documento gerado em 2026-06-02. Nenhum código alterado, nenhum deploy, nenhuma migration.
