# AirTrust Next Sprints Plan v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `c3328b59ab4d683d94a7fcbb4cfb30ceec77461f`
**Modo:** Planejamento de sprints atualizado após Sprint P (RBAC/Suporte v2 design). Baseado na matriz de 48 achados.

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

### Sprint Q — Cobertura Beta (EVD + Complementos)
- **Prioridade:** Curto prazo.
- **Objetivo:** Criar cobertura de teste para EVD e complementar Hospedagem (update/checkout).
- **Escopo:** Testes de tenant-scope para EVD; contratos de update/checkout em Hospedagem; revisão de cobertura SGSO e LMS.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Não.
- **Risco:** Médio.

### Sprint R — DDL Runtime Residual Design
- **Prioridade:** Médio prazo.
- **Objetivo:** Planejar migrations para os 3 DDL residuais sem executar.
- **Escopo:** Criar migration para `integracoes_sigvoos_*` (3 tabelas + índices); criar migration para `solicitacoes_treinamento` (colunas de link + índice); consolidar `documentos` em migration canônica; plano de remoção segura.
- **Modelo recomendado:** GPT-5.5 Altissimo.
- **Deploy necessário?:** Não nesta fase.
- **Migration necessária?:** Sim, em fase futura de implementação.
- **Risco:** Alto (schema complexo, dependências entre tabelas).

### Sprint S — Status Enum Expansão
- **Prioridade:** Médio prazo.
- **Objetivo:** Expandir helpers de status para cron jobs, alertas e EVD.
- **Escopo:** Auditar queries batch; aplicar helpers `status-codes.ts` onde usam strings soltas; testes de compatibilidade.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Não.
- **Risco:** Médio.

### Sprint T — Performance/Bundle Audit
- **Prioridade:** Médio prazo.
- **Objetivo:** Auditoria de bundle size, chunks duplicados, N+1 queries, rotas grandes.
- **Escopo:** Análise de bundle com `vite build` + análise; identificação de chunks PDF duplicados; revisão de queries em rotas grandes (FRMS, SGSO, dashboard); documentar achados sem corrigir.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Não (auditoria read-only).
- **Migration necessária?:** Não.
- **Risco:** Baixo (documental).

---

## Backlog (longo prazo)

### Sprint U — Repository Pattern Expansão
- **Objetivo:** Extrair queries read-only de `lms-cursos` e `qualificações` dashboard.
- **Modelo:** GPT-5.4 Alta.

### Sprint V — R2 Metadata Novos Uploads
- **Objetivo:** Adicionar `empresa_id` como custom metadata em novos uploads R2.
- **Dependência:** Correções de tenant isolation já concluídas.
- **Modelo:** GPT-5.4 Alta.

### Sprint W — Cloudflare Queues Dry-Run
- **Objetivo:** Implementar fila de domain_events substituindo D1.
- **Modelo:** GPT-5.5 Alta.

### Sprint X — Observabilidade Multiempresa
- **Objetivo:** Sinais por tenant, request correlation, falhas por módulo.
- **Modelo:** GPT-5.5 Alta.

### Sprint Y — Refatoração Estrutural Ampla
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
| M | Data Quality + Smoke | Imediata | GPT-5.4 | Não | Não |
| N | Blindagem Operacional P2 ✅ | — | GPT-5.4 | Não | Não |
| O | Audit Trail/LGPD v2 Design ✅ | Concluído | GPT-5.5 | Não | Futura |
| P | RBAC/Suporte v2 Design ✅ | Concluído | GPT-5.5 | Não | Futura |
| Q | Cobertura Beta (EVD + Complementos) | Curto prazo | GPT-5.4 | Sim | Não |
| R | DDL Residual Design | Médio prazo | GPT-5.5 | Não | Futura |
| S | Status Enum Expansão | Médio prazo | GPT-5.4 | Sim | Não |
| T | Performance/Bundle Audit | Médio prazo | GPT-5.4 | Não | Não |
| U | Repository Pattern Expansão | Longo prazo | GPT-5.4 | Sim | Não |
| V | R2 Metadata Uploads | Longo prazo | GPT-5.4 | Sim | Não |
| W | Cloudflare Queues | Longo prazo | GPT-5.5 | Sim | Não |
| X | Observabilidade | Longo prazo | GPT-5.5 | Sim | Possível |
| Y | Refatoração Estrutural | Longo prazo | GPT-5.4 | Sim | Não |

---

**Fim do plano de sprints.** Documento atualizado em 2026-06-02 com base na matriz consolidada de 48 achados do Sprint Z.
