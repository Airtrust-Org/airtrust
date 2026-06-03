# AirTrust Remediation Roadmap v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `c3328b59ab4d683d94a7fcbb4cfb30ceec77461f`
**Modo:** Roadmap técnico-operacional atualizado após Sprint P (RBAC/Suporte v2 design). Sem migration, sem dados reais, sem deploy.

---

## Visão geral

Este roadmap reflete o estado real após 12 sprints de auditoria e remediação (A até L + reauditorias). A ordem foi revisada com base na matriz consolidada de 48 achados.

**Estado atual:** sem P0/P1 ativos em código de produção; itens de Audit Trail/LGPD v2 e RBAC/Suporte v2 avançaram de backlog puramente aberto para design documental concluído, ainda sem implementação.
**Nenhum P0/P1 ativo em código de produção.**

---

## Agora, antes de qualquer novo cliente externo

### Item 1 — Smoke autenticado funcional (Sprint M executado)

- **Status:** PARTIAL. Smoke autenticado executado (Z.1: PASS=11). Empresa esperada: SKIPPED (variáveis não configuradas no Sprint M).
- **Objetivo:** Configurar `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO` e reexecutar `npm run smoke:auth:login` para validar empresa esperada.
- **Risco:** Sem validação de empresa esperada, não há confirmação de que o tenant correto foi acessado.
- **Escopo:** Operador configura variável de empresa esperada → executa login interativo → documenta resultado sanitizado.
- **Modelo recomendado:** GPT-5.4 Baixa — execução de script existente + configuração de env var.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.
- **Evidência Sprint M:** Smoke público PASS=3. Smoke autenticado SKIPPED (`AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO` não configurados).

### Item 2 — Data Quality operacional completo (Sprint M executado)

- **Status:** PARTIAL. Runner local executado no Sprint M: PASS=5, WARN=4, FAIL=0, SKIPPED=5.
- **Objetivo:** Executar todos os checks em ambiente staging com schema completo para zerar SKIPPED.
- **Risco:** Onboarding externo com dados inconsistentes ou métricas erradas. 5 checks SKIPPED por schema local incompleto — staging necessário.
- **Escopo:** Apontar staging aprovado com schema completo; executar runner; classificar blocker/warn/info; registrar sumário sem PII.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.
- **Evidência Sprint M:** 15 checks executados, 0 FAIL. 5 SKIPPED por ausência de colunas/tabelas no snapshot local (não são erros de SQL).

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

### Item 5 — RBAC de plataforma e suporte (v2 design) ✅ DESIGN CONCLUÍDO

- **Status:** Design concluído documentalmente no Sprint P. Implementação, migration e enforcement continuam pendentes.
- **Objetivo:** Converter o design produzido no Sprint P em sprint autorizada de implementação com migration, dual-read, rollback e remoção segura do operador legado.
- **Risco:** Sem RBAC formal, multiempresa opera sem governança adequada.
- **Escopo entregue no Sprint P:** modelo de papéis de plataforma; `support_read_only` tenant-scoped e fail-closed; separação entre papel de plataforma e papel de tenant; integração RBAC/audit; plano conceitual de migração do `userId===1`.
- **Modelo recomendado:** GPT-5.5 Altissimo — schema sensível de auth.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Sim, na fase de implementação.
- **Documentos de referência:** `AIRTRUST_RBAC_SUPPORT_V2_DESIGN_v0_5.md`, `AIRTRUST_PLATFORM_ROLES_MODEL_v0_5.md`, `AIRTRUST_SUPPORT_READ_ONLY_MODEL_v0_5.md`, `AIRTRUST_RBAC_V2_MIGRATION_PLAN_v0_5.md`, `AIRTRUST_RBAC_AUDIT_INTEGRATION_PLAN_v0_5.md`.

### Item 6 — Audit Trail/LGPD v2 design

- **Status:** Design concluído nesta fase documental. Implementação/migration continuam abertas.
- **Objetivo:** Converter o design produzido no Sprint O em sprint autorizada de implementação com migration, rollout e rollback seguros.
- **Risco:** Compliance e LGPD continuam parcialmente cobertos enquanto o runtime persistir em três writers não padronizados.
- **Escopo entregue no Sprint O:** contrato conceitual v2, campos obrigatórios/proibidos, taxonomia de eventos, modelo auditável de suporte, retenção draft e plano de migration futura.
- **Modelo recomendado:** GPT-5.5 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Sim, na fase de implementação.
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

- **Status:** Parcial (8 hot paths limpos, 3 residuais mantidos).
- **Objetivo:** Criar migrations para `sigvoos-frms.ts`, `treinamentos-planejados-integration.ts` e `auto-migration-documentos.ts`. **Sem executar as migrations.**
- **Risco:** Drift de schema, lock operacional, comportamento divergente por ambiente.
- **Escopo:** Planejar migrations explícitas, ordem segura de remoção, testes de regressão.
- **Modelo recomendado:** GPT-5.5 Altissimo — migrations complexas.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Sim.
- **Documento de referência:** `AIRTRUST_RUNTIME_DDL_REMOVAL_PLAN_v0_5.md`.

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

## Ordem de execução recomendada (atualizada após Sprint P)

| # | Item | Prioridade | Bloqueia | Modelo |
|---|---|---|---|---|
| 1 | Smoke autenticado funcional | Imediata | Cliente externo | GPT-5.4 Baixa |
| 2 | Data Quality completo (staging) | Imediata | GO pleno | GPT-5.4 Alta |
| 3 | Blindar scripts legados (P2) ✅ RESOLVIDO | — | — | — |
| 4 | ~~Fechar dirty-deploy residual (P2)~~ ✅ RESOLVIDO | — | — | — |
| 5 | Implementação planejada do RBAC/Suporte v2 | Curto prazo | Cliente externo | GPT-5.5 Altissimo |
| 6 | Implementação planejada do Audit Trail/LGPD v2 | Curto prazo | Compliance | GPT-5.5 Altissimo |
| 7 | Cobertura testes beta (EVD + complementos) | Curto prazo | Qualidade | GPT-5.4 Alta |
| 8 | DDL runtime residual design | Médio prazo | 5+ empresas | GPT-5.5 Altissimo |
| 9 | Status enum expansão | Médio prazo | Escala | GPT-5.4 Alta |
| 10 | Repository pattern expansão | Médio prazo | Manutenibilidade | GPT-5.4 Alta |
| 11 | Performance/bundle/N+1 audit | Médio prazo | Escala | GPT-5.4 Alta |
| 12 | Observabilidade multiempresa | Longo prazo | 5+ empresas | GPT-5.5 Alta |
| 13 | R2 metadata novos uploads | Longo prazo | Defense-in-depth | GPT-5.4 Alta |
| 14 | Cloudflare Queues dry-run | Longo prazo | Arquitetura | GPT-5.5 Alta |

---

**Fim do roadmap.** Documento atualizado em 2026-06-02 com base na matriz consolidada de 48 achados.
