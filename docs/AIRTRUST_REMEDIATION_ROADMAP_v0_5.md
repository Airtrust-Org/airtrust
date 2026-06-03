# AirTrust Remediation Roadmap v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `d65fc9eab2e8abe608c5f4820a6a23319ad1bb2c`
**Modo:** Roadmap atualizado após Sprint X.5 (migrations 0385/0386 aplicadas, Worker/API deployado) e Sprint Z0 (R01 SIGVOOS readiness mapped). Sem migration manual ou alteração de dados reais.

---

## Visão geral

Este roadmap reflete o estado real após 12 sprints de auditoria e remediação (A até L + reauditorias). A ordem foi revisada com base na matriz consolidada de 48 achados.

**Estado atual:** sem P0/P1 ativos em código de produção; o Audit Trail/LGPD v2 está em `READY_FOR_STAGING_FLAG_TEST`, com writer e integração LMS prontos, runners locais aprovados e schema/flag/paridade ainda pendentes fora do ambiente local.
**Nenhum P0/P1 ativo em código de produção.**

---

## Agora, antes de qualquer novo cliente externo

### Item 1 — Smoke autenticado funcional (Sprint M executado, OP-1/OP-2 revalidada)

- **Status:** PARTIAL. Smoke autenticado executado historicamente (Z.1: PASS=11). Em OP-1 e OP-2, a sessao atual ficou `SKIPPED_AUTH_REQUIRED` porque nao havia credencial efemera/read-only nem `AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO`.
- **Objetivo:** Configurar `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO` e reexecutar `npm run smoke:auth:login` para validar empresa esperada.
- **Risco:** Sem validação de empresa esperada, não há confirmação de que o tenant correto foi acessado.
- **Escopo:** Operador configura variável de empresa esperada → executa login interativo → documenta resultado sanitizado.
- **Modelo recomendado:** GPT-5.4 Baixa — execução de script existente + configuração de env var.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.
- **Evidencia Sprint M/OP-1/OP-2:** Smoke publico PASS=3. OP-1 e OP-2 confirmaram `PASS=3 FAIL=0 SKIPPED=1` no script, com skip explicito do bloco autenticado por ausencia de auth material na sessao.

### Item 2 — Data Quality operacional completo (Sprint M executado, OP-1/OP-2 revalidado)

- **Status:** PARTIAL. Runner local executado no Sprint M e repetido em OP-1 e OP-2: PASS=5, WARN=4, FAIL=0, SKIPPED=5.
- **Objetivo:** Executar todos os checks em ambiente staging com schema completo para zerar SKIPPED.
- **Risco:** Onboarding externo com dados inconsistentes ou métricas erradas. 5 checks SKIPPED por schema local incompleto — staging necessário.
- **Escopo:** Apontar staging aprovado com schema completo; executar runner; classificar blocker/warn/info; registrar sumário sem PII.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.
- **Evidencia Sprint M/OP-1/OP-2:** 15 checks executados, 0 FAIL. 5 SKIPPED por ausencia de colunas/tabelas no snapshot local (nao sao erros de SQL). OP-2 tambem confirmou que nao havia `AIRTRUST_DATA_QUALITY_*` de staging configurado na sessao.

### Item OP-1 — Readiness operacional consolidada ✅ CONCLUIDO

- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** consolidar smoke, data quality e audit readiness sem abrir migrations.
- **Resultado:** `CONDITIONAL GO`.
- **Entregue:** `AIRTRUST_OPERATIONAL_READINESS_EVIDENCE_v0_5.md`.
- **Pendente:** credencial/auth para smoke autenticado com empresa esperada, schema completo para Data Quality e staging flag test do Audit v2.

### Item OP-2 — Staging operational gate ✅ CONCLUIDO

- **Status:** CONCLUIDO em 2026-06-03.
- **Objetivo:** tentar fechar smoke autenticado, Data Quality e readiness de staging sem migration, sem schema remoto e sem deploy.
- **Resultado:** `CONDITIONAL GO` mantido.
- **Entregue:** revalidacao read-only da evidencia operacional no mesmo artefato `AIRTRUST_OPERATIONAL_READINESS_EVIDENCE_v0_5.md`.
- **Pendente:** credencial/auth para smoke autenticado com empresa esperada, staging/snapshot aprovado com schema completo e autorizacao separada para eventual staging flag test do Audit v2.

### Item 3 — Blindagem operacional de scripts legados (P2) ✅ RESOLVIDO

- **Status:** Resolvido (confirmado em 2026-06-02, Sprint N).
- **Objetivo:** Mover scripts destrutivos para o wrapper seguro ou para `scripts/legacy/`.
- **Risco:** ~~Execução acidental de DDL/DML destrutivo em produção.~~ Mitigado.
- **Escopo:** 12 scripts bloqueados com banner+exit. 22 scripts read-only na allowlist. Guard reforçado com 5 checks. Inventário completo em `AIRTRUST_D1_SCRIPT_HARDENING_AUDIT_v0_5.md`.
- **Evidência:** `ops:guard` PASS. Nenhum `DANGEROUS_DIRECT` executável fora do wrapper/guard.
- **Modelo recomendado:** GPT-5.4 Média — scripts shell, sem runtime.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.

### Item 4 — ~~Fechar dirty-deploy residual (P2)~~ ✅ RESOLVIDO

- **Status:** Resolvido (confirmado em 2026-06-02, Sprint Z.1).
- **Objetivo:** ~~Remover `--commit-dirty=true` de `build-and-deploy.sh:48` e `legacy/deploy-full-automated.sh:79`.~~
- **Evidência:** Ambos os scripts não contêm mais a flag. Ambos executam `preflight-clean-deploy.sh` como gate. `ops:guard` PASS.
- **Deploy necessário?:** Não.

---

## Antes de 2 empresas com cliente usando

### Item 5 — RBAC de plataforma e suporte (v2 design + readiness) ✅ PRONTO PARA IMPLEMENTAÇÃO

- **Status:** Design concluído no Sprint P e readiness gate concluído no Sprint Q. Implementação, migration e enforcement continuam pendentes.
- **Objetivo:** Entrar depois do foundation do Audit Trail v2, com platform roles schema, shadow dual-read, rollback e remoção segura do operador legado.
- **Risco:** Sem RBAC formal, multiempresa opera sem governança adequada.
- **Escopo consolidado até o Sprint Q:** modelo de papéis de plataforma; `support_read_only` tenant-scoped e fail-closed; separação entre papel de plataforma e papel de tenant; integração RBAC/audit; phased plan, test matrix e rollback plan.
- **Modelo recomendado:** GPT-5.5 Altissimo — schema sensível de auth.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Sim, na fase de implementação.
- **Documentos de referência:** `AIRTRUST_RBAC_SUPPORT_V2_DESIGN_v0_5.md`, `AIRTRUST_PLATFORM_ROLES_MODEL_v0_5.md`, `AIRTRUST_SUPPORT_READ_ONLY_MODEL_v0_5.md`, `AIRTRUST_RBAC_V2_MIGRATION_PLAN_v0_5.md`, `AIRTRUST_RBAC_AUDIT_INTEGRATION_PLAN_v0_5.md`.

### Item 6 — Audit Trail/LGPD v2 writer/readiness ✅ APPLIED_SCHEMA_READY_FOR_FLAG_PLAN

- **Status:** Sprint R versionou `audit_events_v2`; Sprint S criou writer canônico e dual-write mínimo em cursos LMS atrás de flag; Sprint T documentou readiness; Sprint T.1 executou a validação local aprovada com `PASS`; Sprint X.5 aplicou migration `0385_audit_events_v2.sql` em produção.
- **Objetivo:** Ativar flag de forma controlada e validar paridade antes de ampliar cobertura. Schema já aplicado em produção.
- **Risco:** Compliance e LGPD continuam parcialmente cobertos enquanto o runtime persistir em três writers não padronizados. Schema existe mas flag ainda não ativada.
- **Escopo consolidado até o Sprint T.1:** contrato v2, migration aditiva, writer com metadata allowlist, testes de schema/writer, integração LMS, phased plan, rollback plan, readiness doc, evidência sanitizada e runners locais PASS.
- **Modelo recomendado:** GPT-5.5 Altissimo.
- **Deploy necessário?:** Sim, em rollout futuro aprovado; não realizado no Sprint R.
- **Migration necessária?:** Já versionada; aplicação em ambiente aprovado continua pendente.
- **Documentos de referência:** `AIRTRUST_AUDIT_TRAIL_LGPD_HARDENING_PLAN_v0_5.md`, `AIRTRUST_AUDIT_TRAIL_LGPD_V2_DESIGN_v0_5.md`, `AIRTRUST_AUDIT_EVENT_TAXONOMY_v0_5.md`, `AIRTRUST_AUDIT_RETENTION_POLICY_DRAFT_v0_5.md`, `AIRTRUST_AUDIT_TRAIL_V2_MIGRATION_PLAN_v0_5.md`.

### Item 7 — Cobertura de testes dos módulos beta

- **Status:** Parcial (Hospedagem, SGSO, LMS com contratos mínimos; EVD sem cobertura).
- **Objetivo:** Expandir cobertura de EVD e complementar contratos de update/checkout em Hospedagem.
- **Risco:** Regressão silenciosa em módulos com dados operacionais sensíveis.
- **Escopo:** Testes de tenant-scope, leitura/escrita crítica, contratos de erro.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Não.

---

## Antes de 5+ empresas

### Item 8 — Remoção do DDL runtime residual

- **Status:** PARTIAL (Sprint V concluído; Sprint W executou a Pré-Fase; Sprint X.4 versionou a M1 de R03 e removeu o fallback runtime localmente; Sprint X.5 aplicou `0386` em produção e deployou o Worker/API. **R03 = RESOLVED.** Sprint Z0 mapeou integralmente R01, a Sprint Z1 criou `0387` + teste local e a Sprint Z1.1 provou o bloqueio de cadeia em `0354`. **R01 = MIGRATION_CHAIN_BLOCKED_BY_0354.** Sprint R09 removeu o ALTER TABLE de `shared.ts`. **R09 = RESOLVED.** Sprint R04.2 registrou o probe estrutural remoto de produção para R04. **R04 = READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE.**).
- **Objetivo:** Concluir as fases remanescentes: Fase 3 (M3 Documentos canônico — criar/testar/aplicar `0388` sobre a baseline remota capturada → remover bootstrap) e Fase 2 (M2 SIGVOOS base — definir baseline/chain plan). Fase 1 (R03 Treinamentos Link) concluída. R09 concluído (Sprint R09). R04 com probe fechado (Sprint R04.2).
- **Risco:** Drift de schema, lock operacional, comportamento divergente por ambiente (mitigado para R03; mapeado para R01; confirmado para R04 em baseline parcial/legada).
- **Escopo:** Sprint W removeu 6 caminhos cobertos sem migration. Sprint X.0 criou o probe estrutural read-only. Sprint X.2 completou o runner remoto read-only. Sprint X.4 registrou probe aprovado em produção para R03, versionou `0386` e removeu o fallback runtime local. **Sprint X.5 aplicou `0386` em produção e deployou o Worker/API (APP_VERSION=2026-06-03T17:00:27Z-c12d8bf).** Sprint Z0 produziu inventário completo de R01, a Sprint Z1 criou `0387_integracoes_sigvoos_base_tables.sql` e a Sprint Z1.1 confirmou localmente que a cadeia limpa falha em `0354` antes da `0387`. Sprint R04.2 registrou a baseline remota de R04: `documentos` sem `historico_id`/`sha256_hash`, com `empresa_id DEFAULT 1`; `pasta_virtual.documento_id` ausente; `certificados_templates` presente. Resta 1 migration nova planejada (`0388`). R09 (shared.ts) = RESOLVED (Sprint R09). R04 = READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE (Sprint R04.2).
- **Modelo recomendado:** R04 criar 0388: GPT-5.4 Alta. R01 chain plan: GPT-5.5 Altissimo.
- **Deploy necessário?:** Sim, quando implementado (Fase 1 deploy já feito; Fase 3 exigirá deploy após remoção do bootstrap).
- **Migration necessária?:** Sim (1 migration para Fase 3; Fase 2 aguarda baseline/chain plan).
- **Documentos de referência:** `AIRTRUST_RUNTIME_DDL_REMOVAL_PLAN_v0_5.md`, `AIRTRUST_RUNTIME_DDL_RESIDUAL_DESIGN_v0_5.md`, `AIRTRUST_DDL_RESIDUAL_MIGRATION_READINESS_v0_5.md`.

### Item 9 — Status enum central (expansão)

- **Status:** Parcial (camada crítica coberta, cron/alertas/EVD pendentes).
- **Objetivo:** Expandir helpers de compatibilidade para cron jobs, alertas e EVD.
- **Risco:** Contagens/filtros divergentes em caminhos batch.
- **Modelo recomendado:** GPT-5.4 Alta — expansão de helpers existentes.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Não.

### Item 10 — Repository pattern (expansão gradual)

- **Status:** Parcial (2 domínios: dashboard + LMS reports).
- **Objetivo:** Extrair queries read-only de `lms-cursos` stats/listagens e `qualificações` dashboard.
- **Risco:** SQL espalhado dificulta manutenção e testes.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Não.

### Item 11 — Observabilidade multiempresa

- **Status:** Aberto.
- **Objetivo:** Criar diagnóstico operacional por tenant e trilhas de suporte consistentes.
- **Risco:** Expansão sem visibilidade de degradação por empresa.
- **Escopo:** Sinais por tenant, request correlation, falhas por módulo.
- **Modelo recomendado:** GPT-5.5 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Possivelmente.

### Item 12 — Performance/bundle/N+1 audit

- **Status:** Aberto.
- **Objetivo:** Auditoria de bundle size, chunks duplicados, N+1 queries, rotas grandes.
- **Risco:** Degradação com escala; dívida estrutural.
- **Modelo recomendado:** GPT-5.4 Alta — auditoria read-only.

---

## Pode esperar

### Item 13 — R2 metadata para novos uploads (defense-in-depth)

- **Status:** Plano criado no Sprint J.
- **Objetivo:** Adicionar `empresa_id` como custom metadata em novos uploads R2.
- **Dependência:** Correções de tenant isolation já concluídas.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Não.

### Item 14 — Cloudflare Queues (domain_events)

- **Status:** Plano criado no Sprint J, implementação postergada.
- **Objetivo:** Substituir D1 como message queue.
- **Modelo recomendado:** GPT-5.5 Alta.

### Item 15 — Refatoração estrutural ampla

- **Objetivo:** Quebrar arquivos gigantes (FRMS, SGSO, dashboard).
- **Risco:** Sem bloqueio para piloto atual.
- **Modelo recomendado:** GPT-5.4 Alta.

---

## Não fazer agora

### Item 16 — Cutover Supabase

- **Decisão:** NÃO MIGRAR AGORA. HÍBRIDO FUTURO.
- **Gatilhos:** D1 80% limite, incidente tenant isolation, ou 2027-06-02.
- **Ações preparatórias:** Repository pattern, tenant isolation audit, Cloudflare Queues — todas concluídas ou planejadas.
- **Status:** DEFERRED.

---

## Ordem de execucao recomendada (estado consolidado)

| # | Item | Prioridade | Bloqueia | Modelo |
|---|---|---|---|---|
| 1 | Smoke autenticado funcional com empresa esperada | Imediata | Cliente externo | GPT-5.4 Baixa |
| 2 | Data Quality completo (staging/schema completo) | Imediata | GO pleno | GPT-5.4 Alta |
| 3 | Audit v2 staging flag test + paridade minima | Curto prazo | Compliance e base de suporte | GPT-5.5 Altissimo |
| 4 | Platform roles schema + RBAC/Suporte v2 foundation | Curto prazo, depois do item 3 | Cliente externo | GPT-5.5 Altissimo |
| 5 | Cobertura testes beta (EVD + complementos) | Curto prazo | Qualidade | GPT-5.4 Alta |
| 6 | ~~R09 `qualificacoes/shared.ts`~~ **CONCLUÍDO** Sprint R09 2026-06-03 | — | — | — |
| 7 | DDL Fase 3 - M3 Documentos canonico sobre baseline remota capturada | Medio prazo | 5+ empresas | GPT-5.5 Alta |
| 8 | DDL R01 - SIGVOOS baseline/chain plan | Medio prazo | 5+ empresas | GPT-5.5 Altissimo |
| 9 | Status enum expansao | Medio prazo | Escala | GPT-5.4 Alta |
| 10 | Repository pattern expansao | Medio prazo | Manutenibilidade | GPT-5.4 Alta |
| 11 | Performance/bundle/N+1 audit | Medio prazo | Escala | GPT-5.4 Alta |
| 12 | Observabilidade multiempresa | Longo prazo | 5+ empresas | GPT-5.5 Alta |
| 13 | R2 metadata novos uploads | Longo prazo | Defense-in-depth | GPT-5.4 Alta |
| 14 | Cloudflare Queues dry-run | Longo prazo | Arquitetura | GPT-5.5 Alta |

---

**Fim do roadmap.** Documento atualizado em 2026-06-03 com Sprint X.5 closure (migrations 0385/0386 aplicadas, Worker/API deployado, R03 = RESOLVED, Audit v2 schema = APPLIED_SCHEMA_READY_FOR_FLAG_PLAN), Sprint Z0 (R01 SIGVOOS readiness mapped) e Sprint R04.2 (baseline estrutural remota de Documentos registrada; R04 = READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE).
