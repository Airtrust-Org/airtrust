# AIRTRUST_MEMORY_INVENTORY_v0_1

**Data:** 2026-05-30
**Fase:** READ-ONLY — inventário documental e técnico
**Repositório:** `<AIRTRUST_ROOT>`
**Autor:** Claude Code (assistente), revisão por Filipe Daumas

---

## 1. Estado Git Inicial

| Campo | Valor |
|---|---|
| **Branch** | `review/tracked-valid-work-consolidation` |
| **HEAD** | `d9c64f1c98ea4c3eec9cb7365203792b0700c4e4` |
| **origin/main** | `ee13cbcb466a6b0bd1c6c459bc10be5471706f34` |
| **Divergência** | Branch local divergente de `origin/main` (branch de review) |
| **Working tree** | Limpo (sem modificações rastreadas) |
| **Diff** | `git diff --stat` vazio; `git diff --name-status` vazio |

### Untracked relevantes

| Arquivo | Tipo | Observação |
|---|---|---|
| `scripts/seed-12-sessoes-aw139-COMPLETO.sql` | Seed script | Dados de exemplo para simuladores |
| `scripts/seed-data-complete.sql` | Seed script | Seed completo de dados |
| `scripts/seed-dev-full-20251119.sql` | Seed script | Seed de desenvolvimento |
| `scripts/seed-local.sql` | Seed script | Seed para ambiente local |
| `scripts/seed-sgso-demo-full.sql` | Seed script | Seed demo SGSO |
| `scripts/validation/audit-endpoint-matrix.mjs` | Script validação | Auditoria de endpoints (read-only) |

### Últimos 20 commits

```
d9c64f1 fix(simuladores): normalize role access and session update diagnostics
9e61a94 fix(frms): align fatigue history filtering and checkin employee scope
d97feb5 fix(auth): normalize effective tenant role across auth middleware and routes
606ef1c fix(ui): harden usuarios list refresh and role update consistency
b6a1c6b fix(ui): standardize focus-visible behavior in shared inputs and tables
586988c fix(dashboard): correct home qualification counters
df3d2a7 docs(ops): record home dashboard deploy smoke
f60fe98 feat(dashboard): redesign home executive panel
a81ebfa fix(dashboard): improve home data reliability
cd010ec docs(product): audit home dashboard
42a2ce3 docs(ops): record modularization deploy smoke
65d68fa refactor(routes): extract public routes
dc14e0f refactor(routes): extract system routes
f11f856 docs(architecture): plan safe modularization
589f33e test(sgso): add nextgen guard coverage
e03d9d3 test(simuladores): add session guard coverage
81ab8db test(sgso): add audit and nc guard coverage
2233731 test(routes): add domain regression coverage
b6b6f0b chore(simuladores): add sessions query benchmark
d022915 docs(ops): record scale hardening deploy smoke
```

---

## 2. Documentos Existentes Relevantes

### 2.1 Docs oficiais (raiz de docs/)

| Arquivo | Tema | Importância | Usar na memória final? |
|---|---|---|---|
| `AIRTRUST_OPERATIONAL_HEALTH_v0_4.md` | Saúde operacional, critérios verde/amarelo/vermelho, rotinas pré/pós-deploy | **Crítica** | SIM |
| `AIRTRUST_DEPLOY_RUNBOOK_v0_4.md` | Runbook de deploy seguro sem migration, comandos proibidos | **Crítica** | SIM |
| `AIRTRUST_AUTHENTICATED_SMOKE_CHECKLIST_v0_4.md` | Checklist de smoke autenticado pós-deploy | **Alta** | SIM |
| `AIRTRUST_ARCHITECTURE_MODULARIZATION_PLAN_H33_v0_5.md` | Plano de modularização segura, diagnóstico de arquivos grandes | **Alta** | SIM |
| `AIRTRUST_SYSTEM_HEALTH_AUDIT_2026_05.md` | Auditoria de saúde com matriz P0/P1/P2/P3 e mapa de endpoints | **Crítica** | SIM |
| `AIRTRUST_DOMAIN_TEST_COVERAGE_H32_v0_5.md` | Expansão de testes por domínio (backup, migração, SGSO, simuladores) | **Alta** | SIM |
| `AIRTRUST_TENANT_SAFETY_CONTRACTS_H28_v0_5.md` | Contratos de segurança multi-tenant (auth, tenant scope) | **Crítica** | SIM |
| `AIRTRUST_SENSITIVE_FILES_GUARDRAIL_v0_4.md` | Política de arquivos sensíveis, classificação, allowlist | **Alta** | SIM |
| `AIRTRUST_REPOSITORY_HEALTH_AUDIT_v0.3-A.md` | Auditoria de saúde do repositório | **Alta** | SIM |
| `AIRTRUST_SAFE_REMEDIATION_PLAN_v0.3-B.md` | Plano de remediação segura | **Alta** | SIM |
| `AIRTRUST_SCALABILITY_READINESS_AUDIT_H27_v0_5.md` | Auditoria de prontidão para escala | **Alta** | SIM |
| `AIRTRUST_SYSTEM_HEALTH_AUDIT_CLOSURE_H25_v0_4.md` | Fechamento de auditoria de saúde | **Média** | Se complementar |
| `AIRTRUST_HEALTH_AUDIT_FINAL_DEPLOY_H26.md` | Deploy de health final | **Média** | Se complementar |
| `AIRTRUST_SENSITIVE_FILES_CLASSIFICATION_H6B_v0_4.md` | Classificação detalhada de arquivos sensíveis | **Alta** | SIM |
| `AIRTRUST_WORKER_SAFE_DEPLOY_H22.md` | Deploy seguro do worker | **Alta** | SIM |
| `AIRTRUST_ROOT_CLEANUP_AUDIT_v0_4_H1.md` | Auditoria de limpeza de raiz | **Média** | Se complementar |
| `AIRTRUST_ROOT_CLEANUP_BATCH1_v0_4_H2.md` | Batch 1 de limpeza de raiz | **Média** | Se complementar |
| `AIRTRUST_MODULARIZATION_DEPLOY_SMOKE_H34C.md` | Smoke de deploy de modularização | **Média** | SIM |
| `AIRTRUST_SCALE_HARDENING_DEPLOY_SMOKE_H31B.md` | Smoke de deploy de scale hardening | **Média** | SIM |
| `AIRTRUST_SIMULADORES_SESSOES_QUERY_BENCHMARK_H30C_v0_5.md` | Benchmark de queries de sessões de simuladores | **Média** | Se relevante |
| `AIRTRUST_QUALIFICACOES_SESSOES_MES_AUDIT_2026_05.md` | Auditoria de qualificações e sessões/mês | **Alta** | SIM |
| `AIRTRUST_WORKER_TYPESCRIPT_FIX_v0.3-C.md` | Correção de TypeScript no worker | **Baixa** | Não |

### 2.2 Docs de domínio — Escala Diária (EVD)

| Arquivo | Tema | Importância |
|---|---|---|
| `AIRTRUST_ESCALA_DIARIA_AUDIT_AND_DESIGN_v0.4-A.md` | Design e auditoria inicial | Alta |
| `AIRTRUST_ESCALA_DIARIA_B2A_EVD_RULES_AUDIT.md` | Auditoria de regras EVD | Alta |
| `AIRTRUST_ESCALA_DIARIA_B2D_QUALIFICACAO_DISPONIBILIDADE_AUDIT.md` | Disponibilidade por qualificação | Alta |
| `AIRTRUST_ESCALA_DIARIA_B3A_PUBLICACAO_PDF_AUDIT.md` | Publicação de PDF | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_B1.md` | Bloco 1 — base | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_B2_B.md` | Bloco 2B | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_B2_C.md` | Bloco 2C | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_B2_E.md` | Bloco 2E | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_B3_B.md` | Bloco 3B | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_B3_C.md` | Bloco 3C | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_C_PRE_PUSH_REVIEW.md` | Pre-push review | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_G10_AVAILABILITY_FRMS_AUDIT.md` | Disponibilidade FRMS | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_G11_AVAILABILITY_FRMS_FIX.md` | Fix de disponibilidade FRMS | **Crítica** |
| `AIRTRUST_ESCALA_DIARIA_V0_4_G13_MONTHLY_ROSTER_FIX.md` | Fix de roster mensal | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_G15_AVAILABILITY_DOMAIN_FIX.md` | Fix de domínio de disponibilidade | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_G16_OPERATIONAL_FLOW_AUDIT.md` | Fluxo operacional | Alta |
| `AIRTRUST_ESCALA_DIARIA_V0_4_G3_UI_UX_TEST.md` | Teste UI/UX G3 | Média |
| `AIRTRUST_ESCALA_DIARIA_V0_4_G5_AIRCRAFT_FIRST_UX.md` | UX de primeira aeronave | Média |
| `AIRTRUST_ESCALA_DIARIA_V0_4_G9_PIC_SIC_UX.md` | UX PIC/SIC | Média |
| `AIRTRUST_EVD_SOFT_CONFLICT_REGRESSION_GATE.md` | Gate de regressão de conflito soft | **Crítica** |

### 2.3 Docs de domínio — FRMS / Fadiga

| Arquivo | Tema | Importância |
|---|---|---|
| `AIRTRUST_FRMS_DAILY_FATIGUE_HOME_FIX_v0.3-C.md` | Fix de fadiga diária na home | Alta |
| `AIRTRUST_FADIGA_DIARIA_CHECKIN_COPY_ALIGNMENT_v0_4.md` | Alinhamento de copy do check-in | Alta |

### 2.4 Docs de domínio — Dashboard

| Arquivo | Tema | Importância |
|---|---|---|
| `AIRTRUST_HOME_DASHBOARD_AUDIT_H35A_v0_5.md` | Auditoria do dashboard home | Alta |
| `AIRTRUST_HOME_DASHBOARD_DATA_AND_LAYOUT_AUDIT_H35E.md` | Auditoria de dados e layout | Alta |
| `AIRTRUST_HOME_DASHBOARD_DATA_FIX_H35B_v0_5.md` | Fix de dados do dashboard | Alta |
| `AIRTRUST_HOME_DASHBOARD_DEPLOY_SMOKE_H35D.md` | Smoke de deploy do dashboard | Média |
| `AIRTRUST_HOME_DASHBOARD_REDESIGN_H35C_v0_5.md` | Redesign do painel executivo | Alta |

### 2.5 Docs operacionais (produção/deploy)

| Arquivo | Tema | Importância |
|---|---|---|
| `PRODUCTION_DEPLOY_RUNBOOK.md` | Runbook completo de deploy em produção | **Crítica** |
| `PRODUCTION_READY_CHECKLIST.md` | Checklist de readiness para produção | **Crítica** |
| `PRODUCTION_READINESS_REPORT.md` | Relatório de prontidão para produção | Alta |
| `PRODUCTION_GO_NO_GO_DECISION.md` | Decisão go/no-go de produção | Alta |
| `PRODUCTION_DEPLOY_EXECUTION_REPORT.md` | Relatório de execução de deploy | Alta |
| `PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md` | Plano de backup e rollback | **Crítica** |
| `PRODUCTION_D1_INCIDENT_AUDIT_REPORT.md` | Auditoria de incidente D1 em produção | **Crítica** |
| `PRE_PRODUCTION_OPERATIONAL_HARDENING_REPORT.md` | Hardening operacional pré-produção | Alta |
| `SAFE_CORRECTION_CHECKLIST_2026-03-15.md` | Checklist de correção segura | Alta |
| `SAFE_REFACTOR_PR_SEQUENCE_2026-03-15.md` | Sequência segura de PRs de refactor | Alta |
| `SAFE_SECRET_ROTATION_AND_CACHE_PURGE_2026-03-15.md` | Rotação de secrets e purge de cache | Alta |
| `MAINTENANCE_SECRET_PRODUCTION_REPORT.md` | Relatório de manutenção de secrets em produção | Alta |
| `MAINTENANCE_SECRET_STAGING_REPORT.md` | Relatório de manutenção de secrets em staging | Média |

### 2.6 Outros docs relevantes

| Arquivo | Tema | Importância |
|---|---|---|
| `README.md` | Documentação inicial da API v2.0 (desatualizada em partes) | Média |
| `API_ENDPOINTS.md` | Lista de endpoints da API | Alta |
| `API_REFERENCE.md` | Referência da API | Alta |
| `ALERTING_SETUP.md` | Configuração de alertas | Média |
| `RUNBOOK.md` | Runbook genérico | Média |
| `PROCESSO-BUGFIX.md` | Processo de correção de bugs | Média |
| `CRITICAL_STABILIZATION_REPORT.md` | Relatório de estabilização crítica | Alta |
| `SIMULADORES_V2_UI_UX_GUIDE.md` | Guia UI/UX de Simuladores V2 | Alta |
| `SIMULADORES_V2_WORKFLOW_CORRETO.md` | Workflow correto de Simuladores V2 | Alta |

### 2.7 Arquivo histórico (docs/arquivo/)

Diretório com ~880 arquivos históricos. Principais categorias:
- Auditorias completas (várias datas: 2025-10, 2025-11, 2025-12)
- Documentação de Advanced DataTable
- Documentação de Design System e layout
- Relatórios de fases 1 a 4
- Relatórios de refatoração
- Arquivos de migração e integração EDAPP

### 2.8 Subdiretórios em docs/

| Diretório | Conteúdo |
|---|---|
| `docs/arquivo/` | ~880 arquivos históricos |
| `docs/checklists/` | `smoke-test-manual-critical.md` |
| `docs/rbac-consolidation/` | Inventário de rotas RBAC (5 txt) |
| `docs/rbac-instructor-fix/` | Rotas de manager (1 txt) |
| `docs/staging-*/` | Artefatos de smoke/seed/login de staging (~30 arquivos) |
| `docs/auditorias/` | Auditoria de segurança 2025-11 |

---

## 3. Scripts Relevantes

### 3.1 Scripts operacionais críticos

| Script | Função | Read-only? | Risco operacional |
|---|---|---|---|
| `scripts/preflight-health.sh` | Health check pré-deploy (tsc, build, test:worker) | SIM | Nenhum |
| `scripts/smoke-production-readonly.sh` | Smoke test read-only em produção | SIM | Nenhum (GET apenas) |
| `scripts/smoke-test-core.sh` | Smoke test core com auth opcional | SIM | Nenhum (GET apenas) |
| `scripts/smoke-tests.sh` | Smoke tests gerais | SIM | Nenhum (GET apenas) |
| `scripts/post-deploy-verify.sh` | Verificação pós-deploy | SIM | Nenhum |
| `scripts/deploy-worker-safe.sh` | Deploy worker sem migration | **NÃO** | **Alto** (deploy produção) |
| `scripts/deploy-all.sh` | Deploy completo (frontend + worker) | **NÃO** | **Alto** (deploy produção) |
| `scripts/deploy-production.sh` | Deploy em produção | **NÃO** | **Crítico** (deploy + migration possível) |
| `scripts/deploy-production-full.sh` | Deploy completo em produção | **NÃO** | **Crítico** |
| `scripts/build-and-deploy.sh` | Build e deploy | **NÃO** | **Alto** |
| `scripts/force-cloudflare-deploy.sh` | Force deploy Cloudflare | **NÃO** | **Crítico** |

### 3.2 Scripts de banco/D1 (RISCO ALTO)

| Script | Função | Risco |
|---|---|---|
| `scripts/apply-migration-*.sh` | Aplicar migrations | **Crítico** — escrita em produção |
| `scripts/sync-production-to-local.sh` | Sincronizar dados de produção para local | **Alto** — lê dados reais |
| `scripts/clone-prod-REAL.sh` | Clonar dados reais de produção | **Crítico** — exporta dados reais |
| `scripts/backup-database.sh` | Backup de banco | **Alto** — lê dados reais |
| `scripts/d1-prod-export.sql` | Export de produção D1 | **Crítico** — lê dados reais |
| `scripts/init-d1-local.sh` | Inicializar D1 local | **Baixo** |
| `scripts/setup-local-db.sh` | Setup de banco local | **Baixo** |

### 3.3 Scripts de validação/auditoria (READ-ONLY)

| Script | Função |
|---|---|
| `scripts/validation/audit-endpoint-matrix.mjs` | Mapear endpoints backend ↔ frontend |
| `scripts/validation/audit-deploy-scripts.sh` | Auditar scripts de deploy |
| `scripts/validation/audit-sensitive-files.sh` | Auditar arquivos sensíveis |
| `scripts/validation/benchmark-simuladores-sessoes.sh` | Benchmark de queries |
| `scripts/audit-frms-sono-rbac135.mjs` | Auditoria FRMS sono RBAC |
| `scripts/audit-sigvoos-frms.mjs` | Auditoria SIGVOOS FRMS |
| `scripts/audit-prod-simple.sh` | Auditoria simples de produção |
| `scripts/audit-prod-tables.sh` | Auditoria de tabelas de produção |
| `scripts/production-audit-check.sh` | Verificação de auditoria de produção |
| `scripts/test-evd-soft-conflict-regression.sh` | Teste de regressão EVD |
| `scripts/diagnose-evd-availability-frms.sh` | Diagnóstico de disponibilidade EVD/FRMS |
| `scripts/validate_complete.sh` | Validação completa |
| `scripts/validate-deploy.sh` | Validação de deploy |
| `scripts/validate-full-system.sh` | Validação completa do sistema |

### 3.4 Scripts de seed (SOMENTE LOCAL)

| Script | Função |
|---|---|
| `scripts/seed-local.sql` | Seed local |
| `scripts/seed-data-complete.sql` | Seed completo |
| `scripts/seed-dev-full-20251119.sql` | Seed dev completo |
| `scripts/seed-sgso-demo-full.sql` | Seed demo SGSO |
| `scripts/seed-12-sessoes-aw139-COMPLETO.sql` | Seed de 12 sessões AW139 |
| `scripts/seed-d1-local.sh` | Seed D1 local |
| `scripts/seed-demo-data-local.sh` | Seed demo local |

### 3.5 Scripts de limpeza/manutenção (RISCO VARIÁVEL)

| Script | Função | Risco |
|---|---|---|
| `scripts/cleanup-simuladores-2026-03-04.sql` | Limpeza de dados de simuladores | **Alto** — destrutivo |
| `scripts/cleanup-backup-tables.sh` | Limpeza de tabelas de backup | **Alto** |
| `scripts/purge-qualificacoes-cascade.sh` | Purge cascade de qualificações | **Crítico** |
| `scripts/purge_soft_deletes.sql` | Purge de soft deletes | **Alto** |
| `scripts/limpar_duplicatas.sh` | Limpar duplicatas | **Alto** |

---

## 4. Módulos Identificados

### 4.1 Dashboard

- **Frontend:** `src/react-app/pages/Home.tsx` (ou similar), componentes em `src/react-app/pages/`
- **Backend:** endpoints agregados em `worker-airtrust/src/routes/` (vários módulos)
- **Docs:** 5 documentos AIRTRUST_HOME_DASHBOARD_*
- **Estado:** Redesign recente (H35C), auditoria de dados concluída (H35E), deploy smoke registrado (H35D)
- **Commits recentes:** `586988c`, `f60fe98`, `a81ebfa`, `cd010ec`, `df3d2a7`

### 4.2 FRMS (Fatigue Risk Management System)

- **Frontend:** `src/react-app/pages/frms/`
- **Backend:** `worker-airtrust/src/routes/frms.ts` (3232 LOC, 49 handlers), `frms-fadiga-checkin.ts` (1843 LOC), `frms-fira.ts` (1059 LOC)
- **Serviços:** `worker-airtrust/src/services/sigvoos-frms.ts` (2841 LOC)
- **Docs:** `AIRTRUST_FRMS_DAILY_FATIGUE_HOME_FIX_v0.3-C.md`, `AIRTRUST_FADIGA_DIARIA_CHECKIN_COPY_ALIGNMENT_v0_4.md`
- **Commits recentes:** `9e61a94` (fix checkin employee scope)
- **Riscos:** Arquivo central com 3232 LOC e 49 handlers — alta concentração

### 4.3 Escalas (EVD / Monthly Roster)

- **Frontend:** `src/react-app/pages/escalas/`, `EvdPage.tsx` (2640 LOC)
- **Backend:** `worker-airtrust/src/routes/escalas-core.ts`, `escalas-evd.ts` (2039 LOC), `escalas-alocacoes.ts` (2248 LOC)
- **Docs:** ~20 documentos AIRTRUST_ESCALA_DIARIA_*
- **Destaques:** G11 fix (disponibilidade FRMS), G13 fix (monthly roster), G15 fix (disponibilidade domain), G16 audit (fluxo operacional)
- **Commits recentes:** Vários no escopo EVD/escalas

### 4.4 Tripulantes (Funcionários)

- **Frontend:** `src/react-app/pages/Funcionarios.tsx`
- **Backend:** `worker-airtrust/src/routes/funcionarios.ts`
- **Docs:** Menos documentado que outros módulos
- **Commits recentes:** `606ef1c` (fix UI de lista de usuários)

### 4.5 Qualificações

- **Frontend:** `src/react-app/pages/Qualificacoes.tsx` (4854 LOC — **maior arquivo do frontend**)
- **Backend:** `worker-airtrust/src/routes/qualificacoes.ts`, `qualificacoes-*.ts`
- **Docs:** `AIRTRUST_QUALIFICACOES_SESSOES_MES_AUDIT_2026_05.md`
- **Riscos:** Arquivo frontend de 4854 LOC — altíssima concentração

### 4.6 Simuladores

- **Frontend:** `src/react-app/pages/Simuladores.tsx`, `src/react-app/pages/simuladores/`
- **Backend:** Conjunto de rotas ~8675 LOC (sessões, fichas, modelos, extras)
- **Docs:** `SIMULADORES_V2_UI_UX_GUIDE.md`, `SIMULADORES_V2_WORKFLOW_CORRETO.md`, `AIRTRUST_SIMULADORES_SESSOES_QUERY_BENCHMARK_H30C_v0_5.md`
- **Commits recentes:** `d9c64f1` (fix role access + session update diagnostics), `e03d9d3` (session guard coverage), `b6b6f0b` (query benchmark)

### 4.7 Worker/API

- **Entry point:** `worker-airtrust/src/index.ts` (1264 LOC, 66 `app.route()`, 30 `app.use()`)
- **Stack:** Cloudflare Workers + Hono v4 + D1 (SQLite) + R2
- **Auth:** JWT (jose), `auth()` middleware, `tenantMiddleware`, `requireRole()`
- **Validação:** Zod via `@hono/zod-validator`
- **Rotas:** 535 paths únicos detectados (maio/2026)
- **Docs:** `docs/API_ENDPOINTS.md`, `docs/API_REFERENCE.md`

### 4.8 Banco/D1

- **Tipo:** Cloudflare D1 (SQLite)
- **Migrations:** 356+ arquivos sequenciais em `worker-airtrust/migrations/` (0001 a ~0383)
- **Schema:** Sem ORM — SQL raw via `c.env.DB.prepare()`
- **Critical rule:** Toda query de tenant data DEVE incluir `WHERE empresa_id = ?`
- **Docs:** `PRODUCTION_D1_INCIDENT_AUDIT_REPORT.md`, `PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md`

### 4.9 Produção/Deploy

- **Ambientes:** local, development, staging, production
- **Worker produção:** `airtrust-api`
- **Frontend produção:** Cloudflare Pages (`airtrust.online`)
- **API produção:** `api.airtrust.online`
- **Deploy worker seguro:** `scripts/deploy-worker-safe.sh` (sem migration)
- **Deploy frontend:** `npm run deploy:pages`
- **Docs críticos:** `PRODUCTION_DEPLOY_RUNBOOK.md`, `PRODUCTION_READY_CHECKLIST.md`, `PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md`

### 4.10 Validações

- **Lint:** `lint:api-base`, `guard:tracked-secrets`, `guard:auth-boundaries`
- **Testes:** `test:run` (frontend), `test:worker` (483 testes), `test:all`, `test:e2e`
- **Build:** `tsc --noEmit`, `npm run build`, `npm run lint`
- **Smoke:** `smoke-production-readonly.sh`, `smoke-test-core.sh`, checklist autenticado manual
- **Scripts:** `scripts/validation/` com audit scripts

---

## 5. Guardrails Operacionais Detectados

### 5.1 Regras do repositório (CLAUDE.md)

1. **Nunca deploy, push ou migration sem autorização explícita**
2. Toda query de tenant data deve incluir `WHERE empresa_id = ?`
3. Migrations NUNCA automáticas — aplicar manualmente com comando explícito
4. Seeds sanitizados devem ser documentados e identificados
5. `ENABLE_DEV_AUTH_BYPASS=true` nunca commitado

### 5.2 Regras do Deploy Runbook (AIRTRUST_DEPLOY_RUNBOOK_v0_4.md)

6. Deploy padrão usa `deploy:worker:safe` (sem migration)
7. Comandos proibidos em deploy comum: `wrangler d1 migrations apply`, `deploy:worker`, `deploy:worker:only`
8. Migration só com: plano documentado + backup validado + janela aprovada + autorização explícita + smoke definido
9. Nunca executar em deploy comum: sync SIGVOOS, deduplicate, importações, seeds, migrations
10. Smoke pós-deploy obrigatório: `smoke-production-readonly.sh`, `smoke-test-core.sh`, `smoke-tests.sh`

### 5.3 Regras de Produção (PRODUCTION_DEPLOY_RUNBOOK.md)

11. **Backup/snapshot D1 obrigatório antes de deploy** (PASSO ZERO)
12. Aprovação humana explícita requerida
13. Responsável técnico presente durante todo o procedimento
14. Rollback definido e documentado
15. Canal de comunicação aberto para notificar usuários

### 5.4 Regras de Segurança (Sensitive Files Guardrail)

16. Segredos devem ficar fora do Git
17. Dumps/backup de produção devem ficar fora do Git
18. Seeds só se documentados e identificados
19. Migrations oficiais podem continuar versionadas
20. Script `audit-sensitive-files.sh` roda como guard

### 5.5 Regras de Tenant Safety (H28)

21. Rotas devem aplicar `auth()` localmente (defesa em profundidade)
22. Filtro `empresa_id` obrigatório em queries de tenant data
23. Fail-closed: sem tenant = 403 `TENANT_CONTEXT_REQUIRED`
24. Sem auth = 401 `AUTH_REQUIRED`

### 5.6 Regras de Health (OPERATIONAL_HEALTH)

25. Critérios verde: tsc OK, build OK, test:worker OK, smoke read-only OK, smoke autenticado sem bloqueadores
26. Rotina pré-deploy: `preflight-health.sh` → revisar diff → confirmar sem mudança de banco
27. Rotina pós-deploy: `smoke-production-readonly.sh` → confirmar APP_VERSION → smoke autenticado manual

---

## 6. Histórico de Fases Detectado

### 6.1 Fases numeradas (v0.3 a v0.5)

| Fase/ID | Tema | Documento principal |
|---|---|---|
| H1 | Root cleanup audit | `AIRTRUST_ROOT_CLEANUP_AUDIT_v0_4_H1.md` |
| H2 | Root cleanup batch 1 | `AIRTRUST_ROOT_CLEANUP_BATCH1_v0_4_H2.md` |
| H6B | Sensitive files classification | `AIRTRUST_SENSITIVE_FILES_CLASSIFICATION_H6B_v0_4.md` |
| H19 | Health fixes deploy smoke | `AIRTRUST_HEALTH_FIXES_DEPLOY_SMOKE_H19.md` |
| H21 | Health fixes deploy smoke | `AIRTRUST_HEALTH_FIXES_DEPLOY_SMOKE_H21.md` |
| H22 | Worker safe deploy | `AIRTRUST_WORKER_SAFE_DEPLOY_H22.md` |
| H25 | System health audit closure | `AIRTRUST_SYSTEM_HEALTH_AUDIT_CLOSURE_H25_v0_4.md` |
| H26 | Health audit final deploy | `AIRTRUST_HEALTH_AUDIT_FINAL_DEPLOY_H26.md` |
| H27 | Scalability readiness audit | `AIRTRUST_SCALABILITY_READINESS_AUDIT_H27_v0_5.md` |
| H28 | Tenant safety contracts | `AIRTRUST_TENANT_SAFETY_CONTRACTS_H28_v0_5.md` |
| H30C | Simuladores sessions query benchmark | `AIRTRUST_SIMULADORES_SESSOES_QUERY_BENCHMARK_H30C_v0_5.md` |
| H31B | Scale hardening deploy smoke | `AIRTRUST_SCALE_HARDENING_DEPLOY_SMOKE_H31B.md` |
| H32 | Domain test coverage | `AIRTRUST_DOMAIN_TEST_COVERAGE_H32_v0_5.md` |
| H33 | Architecture modularization plan | `AIRTRUST_ARCHITECTURE_MODULARIZATION_PLAN_H33_v0_5.md` |
| H34C | Modularization deploy smoke | `AIRTRUST_MODULARIZATION_DEPLOY_SMOKE_H34C.md` |
| H35A | Home dashboard audit | `AIRTRUST_HOME_DASHBOARD_AUDIT_H35A_v0_5.md` |
| H35B | Home dashboard data fix | `AIRTRUST_HOME_DASHBOARD_DATA_FIX_H35B_v0_5.md` |
| H35C | Home dashboard redesign | `AIRTRUST_HOME_DASHBOARD_REDESIGN_H35C_v0_5.md` |
| H35D | Home dashboard deploy smoke | `AIRTRUST_HOME_DASHBOARD_DEPLOY_SMOKE_H35D.md` |
| H35E | Home dashboard data and layout audit | `AIRTRUST_HOME_DASHBOARD_DATA_AND_LAYOUT_AUDIT_H35E.md` |

### 6.2 Fases antigas (docs/arquivo/)

| Fase | Tema |
|---|---|
| Fase 1.1 | Setup inicial |
| Fase 1.2 | Índices aplicados |
| Fase 1.3 | SQL injection corrigido |
| Fase 2 | Roadmap e completação |
| Fase 3.1 | React Query setup |
| Fase 3.3 | Lazy loading |
| Fase 3.4 | Final optimizations |
| Fase 4 | Code quality |

### 6.3 Escala Diária — Versão 0.4

Sequência de fases: A (audit/design) → B1, B2-B, B2-C, B2-D, B2-E, B3-A, B3-B, B3-C → C (pre-push review) → G3, G5, G9, G10, G11, G13, G15, G16

---

## 7. Lacunas da Memória

### 7.1 Módulos com documentação insuficiente

| Módulo | Situação |
|---|---|
| **Tripulantes/Funcionários** | Pouquíssima documentação dedicada. Sem docs AIRTRUST_* específicos. |
| **LMS** | Backend: `lms-cursos.ts` (2266 LOC), `lms-assets.ts` (1931 LOC). Documentação em docs/ mas sem docs AIRTRUST_* dedicados. |
| **SGSO** | Backend: ~4681 LOC. Alguns docs de auditoria mas sem cobertura completa. |
| **Importação** | `importacao.ts` (1384 LOC). Sem docs AIRTRUST_* dedicados. Tenant scope pendente (H28-B). |
| **Certificados** | Documentação dispersa em docs/arquivo/. |

### 7.2 Conhecimento tácito não documentado

- **Fluxo exato de deploy:** Embora haja runbooks, os comandos exatos e interdependências entre scripts não estão consolidados em um único lugar.
- **Configuração de ambiente local:** Dispersa entre vários scripts (`setup-local-*.sh`).
- **Estrutura de roles e permissões:** RBAC mencionado em vários docs mas sem matriz consolidada.
- **Integração SIGVOOS:** Mencionada em serviços (`sigvoos-frms.ts`, 2841 LOC) mas sem documentação de arquitetura da integração.
- **Histórico de decisões de produto:** Decisões de produto não estão documentadas separadamente dos docs técnicos.

### 7.3 Artefatos técnicos não mapeados

- **Arquivos grandes (>2000 LOC):** 8+ arquivos identificados, com risco de manutenção.
- **Migrations duplicadas:** Detectadas na auditoria H33, sem resolução.
- **Rotas órfãs:** 8 chamadas frontend sem endpoint backend (detectadas em maio/2026).
- **Arquivos sensíveis rastreados:** 92 dumps/backups, 4 .env files — classificação conhecida mas não resolvida.

---

## 8. Proposta de Estrutura Final

```
knowledge/airtrust/
├── 00_INDEX.md                          # Índice geral com links para todos os documentos
├── AIRTRUST_PROJECT_MEMORY.md           # Memória principal: visão geral, stack, módulos, pessoas
├── AIRTRUST_CURRENT_STATE.md            # Estado atual: branch, build, testes, riscos ativos
├── AIRTRUST_OPERATIONAL_GUARDRAILS.md   # Todas as regras de segurança e operação (seções 5.x)
├── AIRTRUST_PHASE_HISTORY.md            # Linha do tempo de fases H1-H35 e anteriores
├── AIRTRUST_TECHNICAL_ARCHITECTURE.md   # Arquitetura: worker, frontend, D1, R2, auth, tenant
├── AIRTRUST_DATABASE_AND_PRODUCTION.md  # Banco D1, migrations, backups, deploy, ambientes
├── AIRTRUST_VALIDATION_PROTOCOL.md      # Build, lint, testes, smoke, preflight, post-deploy
├── AIRTRUST_DECISION_LOG.md             # Log de decisões técnicas e de produto
├── AIRTRUST_KNOWN_ISSUES.md             # Bugs conhecidos, riscos, lacunas, P0/P1/P2/P3
├── AIRTRUST_AGENT_HANDOFF.md            # Instruções para handoff entre agentes/ferramentas de IA
└── AIRTRUST_PROMPTS_LIBRARY.md          # Biblioteca de prompts úteis para tarefas comuns
```

### Fontes para cada arquivo

| Arquivo de destino | Fontes principais |
|---|---|
| `00_INDEX.md` | Este inventário + `CLAUDE.md` |
| `AIRTRUST_PROJECT_MEMORY.md` | `CLAUDE.md`, `README.md`, `docs/AIRTRUST_ARCHITECTURE_MODULARIZATION_PLAN_H33_v0_5.md` |
| `AIRTRUST_CURRENT_STATE.md` | `docs/AIRTRUST_OPERATIONAL_HEALTH_v0_4.md`, `docs/AIRTRUST_SYSTEM_HEALTH_AUDIT_2026_05.md` |
| `AIRTRUST_OPERATIONAL_GUARDRAILS.md` | `docs/AIRTRUST_DEPLOY_RUNBOOK_v0_4.md`, `PRODUCTION_DEPLOY_RUNBOOK.md`, `docs/AIRTRUST_SENSITIVE_FILES_GUARDRAIL_v0_4.md`, `docs/AIRTRUST_TENANT_SAFETY_CONTRACTS_H28_v0_5.md` |
| `AIRTRUST_PHASE_HISTORY.md` | Histórico de commits + docs de fase listados na seção 6 |
| `AIRTRUST_TECHNICAL_ARCHITECTURE.md` | `CLAUDE.md`, `docs/AIRTRUST_ARCHITECTURE_MODULARIZATION_PLAN_H33_v0_5.md`, `docs/API_ENDPOINTS.md` |
| `AIRTRUST_DATABASE_AND_PRODUCTION.md` | `PRODUCTION_DEPLOY_RUNBOOK.md`, `PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md`, `PRODUCTION_D1_INCIDENT_AUDIT_REPORT.md` |
| `AIRTRUST_VALIDATION_PROTOCOL.md` | `docs/AIRTRUST_AUTHENTICATED_SMOKE_CHECKLIST_v0_4.md`, `scripts/preflight-health.sh`, `scripts/smoke-production-readonly.sh` |
| `AIRTRUST_DECISION_LOG.md` | Extrair de docs de auditoria e commits |
| `AIRTRUST_KNOWN_ISSUES.md` | `docs/AIRTRUST_SYSTEM_HEALTH_AUDIT_2026_05.md` (seção de P0/P1/P2/P3) |
| `AIRTRUST_AGENT_HANDOFF.md` | Este inventário + `CLAUDE.md` |
| `AIRTRUST_PROMPTS_LIBRARY.md` | Extrair de docs de fase e padrões de uso |

---

## 9. Resumo Final

### Arquivos lidos mais importantes nesta fase

1. `CLAUDE.md` — documentação base do projeto
2. `docs/AIRTRUST_OPERATIONAL_HEALTH_v0_4.md` — saúde operacional e critérios
3. `docs/AIRTRUST_DEPLOY_RUNBOOK_v0_4.md` — runbook de deploy seguro
4. `docs/AIRTRUST_AUTHENTICATED_SMOKE_CHECKLIST_v0_4.md` — checklist de smoke autenticado
5. `docs/AIRTRUST_ARCHITECTURE_MODULARIZATION_PLAN_H33_v0_5.md` — arquitetura e modularização
6. `docs/AIRTRUST_SYSTEM_HEALTH_AUDIT_2026_05.md` — auditoria de saúde com matriz de riscos
7. `docs/AIRTRUST_TENANT_SAFETY_CONTRACTS_H28_v0_5.md` — segurança multi-tenant
8. `docs/AIRTRUST_SENSITIVE_FILES_GUARDRAIL_v0_4.md` — política de arquivos sensíveis
9. `docs/AIRTRUST_DOMAIN_TEST_COVERAGE_H32_v0_5.md` — cobertura de testes por domínio
10. `docs/PRODUCTION_DEPLOY_RUNBOOK.md` — runbook completo de produção
11. `scripts/preflight-health.sh` — script de health check pré-deploy
12. `scripts/smoke-production-readonly.sh` — script de smoke read-only

### Arquivo criado

- `docs/AIRTRUST_MEMORY_INVENTORY_v0_1.md` (este arquivo)

### Confirmação de segurança

- ✅ **Nenhum código alterado** (0 arquivos modificados)
- ✅ **Nenhum banco alterado** (0 operações D1)
- ✅ **Nenhum deploy realizado** (0 wrangler deploy)
- ✅ **Nenhuma migration executada** (0 migrations apply)
- ✅ **Nenhum push realizado** (0 git push)
- ✅ **Nenhum commit realizado** (0 git commit)
- ✅ **Apenas 1 arquivo novo criado** (docs/AIRTRUST_MEMORY_INVENTORY_v0_1.md)

### Git diff final

```
git diff --stat    → (vazio)
git diff --name-status → (vazio)
git status --short → apenas untracked pré-existentes + 1 novo docs/AIRTRUST_MEMORY_INVENTORY_v0_1.md
```

### Recomendação para a próxima fase

1. **Revisar este inventário** com o time para validar classificações e prioridades
2. **Criar a estrutura `knowledge/airtrust/`** com os 12 arquivos propostos
3. **Priorizar a consolidação dos guardrails** (AIRTRUST_OPERATIONAL_GUARDRAILS.md) — é o conhecimento mais crítico para segurança operacional
4. **Preencher as lacunas** identificadas na seção 7, começando por Tripulantes, LMS e SGSO
5. **Considerar uma limpeza faseada** dos ~880 arquivos em `docs/arquivo/` — extrair o que ainda é relevante e arquivar/remover o resto
6. **Manter o modo READ-ONLY** até que a base de memória esteja consolidada e validada
