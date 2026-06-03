# AirTrust Remediation Roadmap v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `59e601f0a25cbbbe7e842dd83844af4ce91279ab`
**Modo:** Roadmap técnico-operacional atualizado após consolidação final do Sprint Z. Sem migration, sem dados reais, sem deploy.

---

## Visão geral

Este roadmap reflete o estado real após 12 sprints de auditoria e remediação (A até L + reauditorias). A ordem foi revisada com base na matriz consolidada de 48 achados.

**Estado atual:** 21 RESOLVED, 8 PARTIAL, 12 OPEN, 5 DEFERRED, 2 BACKLOG.
**Nenhum P0/P1 ativo em código de produção.**

---

## Agora, antes de qualquer novo cliente externo

### Item 1 — Smoke autenticado funcional

- **Status:** Pendente por credencial.
- **Objetivo:** Executar validação funcional ponta-a-ponta com token dedicado read-only.
- **Risco:** Sem validação, não há confirmação de que o tenant funciona corretamente.
- **Escopo:** Fornecer `AIRTRUST_AUTH_TOKEN`/`AIRTRUST_COOKIE` para conta de serviço; rodar `smoke-authenticated-operational.sh` uma vez; documentar resultado.
- **Modelo recomendado:** GPT-5.4 Baixa — execução de script existente.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.

### Item 2 — Data Quality operacional completo

- **Status:** Parcial (5 PASS, 4 WARN, 5 SKIPPED).
- **Objetivo:** Executar todos os checks em ambiente staging com schema completo para zerar SKIPPED.
- **Risco:** Onboarding externo com dados inconsistentes ou métricas erradas.
- **Escopo:** Apontar staging aprovado com schema completo; executar runner; classificar blocker/warn/info; registrar sumário sem PII.
- **Modelo recomendado:** GPT-5.4 Alta.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.

### Item 3 — Blindagem operacional de scripts legados (P2)

- **Status:** Parcial (wrapper existe, scripts legados sem proteção).
- **Objetivo:** Mover scripts destrutivos para o wrapper seguro ou para `scripts/legacy/`.
- **Risco:** Execução acidental de DDL/DML destrutivo em produção.
- **Escopo:** `purge-qualificacoes-cascade.sh`, `aplicar-correcoes-db.sh`, `apply-seed-data.sh`, `cleanup-backup-tables.sh` e similares.
- **Modelo recomendado:** GPT-5.4 Média — scripts shell, sem runtime.
- **Deploy necessário?:** Não.
- **Migration necessária?:** Não.

### Item 4 — Fechar dirty-deploy residual (P2)

- **Status:** Aberto (2 scripts).
- **Objetivo:** Remover `--commit-dirty=true` de `build-and-deploy.sh:48` e `legacy/deploy-full-automated.sh:79`.
- **Risco:** Deploy de build não versionado.
- **Modelo recomendado:** GPT-5.4 Baixa — remoção de flag.
- **Deploy necessário?:** Não (alteração de script).

---

## Antes de 2 empresas com cliente usando

### Item 5 — RBAC de plataforma e suporte (v2 design)

- **Status:** Parcial (fallback centralizado, helpers canônicos, mas migration pendente).
- **Objetivo:** Desenhar schema para `platform_admin` persistido, `support` read-only com escopo, expiração e eventos auditados. **Sem executar migration.**
- **Risco:** Sem RBAC formal, multiempresa opera sem governança adequada.
- **Escopo:** Modelo de dados, permissões, eventos, política de expiração/revogação, plano de rollback.
- **Modelo recomendado:** GPT-5.5 Altissimo — schema sensível de auth.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Sim, na fase de implementação.
- **Documento de referência:** `AIRTRUST_RBAC_SUPPORT_MODEL_v0_5.md`.

### Item 6 — Audit Trail/LGPD v2 design

- **Status:** Parcial (sanitização aplicada, writers legados sem contrato único).
- **Objetivo:** Definir contrato único de auditoria com colunas dedicadas (`empresa_id`, `request_id`, `support_reason`, `actor`). **Sem executar migration.**
- **Risco:** Compliance e LGPD sem trilha padronizada.
- **Escopo:** Comparar `auditoria`, `audit_logs`, `auditoria_avancada_v2`; escolher writer canônico; definir schema alvo; mapear call sites; plano de migração.
- **Modelo recomendado:** GPT-5.5 Alta.
- **Deploy necessário?:** Sim, quando implementado.
- **Migration necessária?:** Sim, na fase de implementação.
- **Documento de referência:** `AIRTRUST_AUDIT_TRAIL_LGPD_HARDENING_PLAN_v0_5.md`.

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

## Ordem de execução recomendada (atualizada após Sprint Z)

| # | Item | Prioridade | Bloqueia | Modelo |
|---|---|---|---|---|
| 1 | Smoke autenticado funcional | Imediata | Cliente externo | GPT-5.4 Baixa |
| 2 | Data Quality completo (staging) | Imediata | GO pleno | GPT-5.4 Alta |
| 3 | Blindar scripts legados (P2) | Imediata | Segurança operacional | GPT-5.4 Média |
| 4 | Fechar dirty-deploy residual (P2) | Imediata | Integridade de deploy | GPT-5.4 Baixa |
| 5 | RBAC/Suporte v2 design | Curto prazo | Cliente externo | GPT-5.5 Altissimo |
| 6 | Audit Trail/LGPD v2 design | Curto prazo | Compliance | GPT-5.5 Alta |
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
