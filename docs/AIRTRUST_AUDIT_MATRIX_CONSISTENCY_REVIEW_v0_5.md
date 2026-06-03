# AirTrust — Audit Matrix Consistency Review v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `7e89b8b89c5a602f0c1f75b66a34da1b8266acd1`
**Modo:** Documental/read-only. Nenhum código alterado, nenhum deploy, nenhuma migration.
**Sprint:** Z.1 — Auditoria de consistência da matriz consolidada.

---

## 1. Objetivo

Verificar a consistência da matriz consolidada (`AIRTRUST_AUDIT_FINDINGS_MASTER_MATRIX_v0_5.md`) contra evidência atual no repositório. Identificar achados com status desatualizado (marcados como OPEN/PARTIAL que já foram resolvidos em sprints anteriores) e garantir que os próximos sprints reflitam pendências reais.

---

## 2. Método

- **Parte A:** Verificação de estado do repositório (branch, HEAD, preflight, ops:guard, git status).
- **Parte B:** Leitura completa da matriz, closure summary, roadmap e next sprints plan.
- **Partes C-I:** Auditoria read-only de cada categoria de achado contra evidência atual:
  - dirty-deploy / D1 scripts (C)
  - smoke autenticado (D)
  - tenant isolation documentos/assets (E)
  - DDL runtime residual (F)
  - status enum (G)
  - data quality (H)
  - módulos beta (I)
- **Classificação:** cada achado revisado recebeu status corrigido baseado em evidência objetiva.

**Ferramenta:** Claude Code com DeepSeek v4 Pro.
**Restrições:** Nenhum código alterado. Nenhum deploy. Nenhuma migration. Nenhum acesso a banco real.

---

## 3. Inconsistências encontradas

| Item | Status na matriz | Evidência atual | Status corrigido | Ação |
|---|---|---|---|---|
| **OPS-03** — `deploy:all` com `--commit-dirty=true` residual | **OPEN** | `build-and-deploy.sh:48` e `legacy/deploy-full-automated.sh:79` NÃO contêm mais `--commit-dirty=true`. Ambos agora executam `preflight-clean-deploy.sh` como gate. `ops:guard` PASS confirma ausência da flag. | **RESOLVED** | Atualizar matriz: mover OPS-03 para RESOLVED |
| **OPS-05** — Smoke autenticado pendente | **OPEN** | Evidência documentada em `AIRTRUST_AUTHENTICATED_SMOKE_EVIDENCE_20260602.md`: smoke autenticado real executado com **PASS=11, FAIL=0, SKIPPED=2**. Login efêmero, 11 endpoints operacionais validados. Apenas `AIRTRUST_EXPECTED_EMPRESA_ID` não foi configurado. | **PARTIAL** | Atualizar matriz: mover OPS-05 de OPEN para PARTIAL. Pendência: validar empresa esperada ou registrar exceção formal. |

### 3.1 Detalhe: OPS-03 (dirty-deploy residual)

**Evidência coletada:**

- `grep -RIn --commit-dirty=true` (excluindo node_modules, .git, dist, .wrangler): **0 ocorrências ativas em código/scripts.**
- `scripts/build-and-deploy.sh` linha 48: `wrangler pages deploy ... --branch=production` — **sem `--commit-dirty=true`**.
- `scripts/legacy/deploy-full-automated.sh` linha 88: `wrangler pages deploy ... --branch=production` — **sem `--commit-dirty=true`**.
- Ambos executam `bash scripts/preflight-clean-deploy.sh` como primeiro passo.
- `npm run ops:guard` → **PASS** ("no --commit-dirty=true occurrences found").

**Conclusão:** A flag foi removida de ambos os scripts residuais citados na matriz. O risco de deploy de build não versionado por esses caminhos foi eliminado. OPS-03 deve ser RESOLVED.

### 3.2 Detalhe: OPS-05 (smoke autenticado)

**Evidência coletada:**

- Documento `AIRTRUST_AUTHENTICATED_SMOKE_EVIDENCE_20260602.md` registra smoke autenticado executado pelo operador com `npm run smoke:auth:login`.
- Resultado sanitizado: 11 endpoints PASS (auth me, empresas, dashboard, FRMS, EVD, simuladores, qualificações, funcionários, assets), 0 FAIL, 2 SKIPPED.
- Smoke public-only Codex: PASS=3, FAIL=0.
- `AIRTRUST_EXPECTED_EMPRESA_ID` / `AIRTRUST_EXPECTED_EMPRESA_CODIGO` não configurados → validação de empresa esperada pendente.

**Conclusão:** Houve smoke autenticado real com 11/11 PASS. O critério de classificação define PARTIAL quando "houve smoke autenticado PASS mas empresa esperada não validada." OPS-05 deve ser PARTIAL, não OPEN.

---

## 4. Itens confirmados como ainda pendentes

| ID | Status atual | Confirmação |
|---|---|---|
| **OPS-02** — Scripts D1 destrutivos sem wrapper | PARTIAL | **Confirmado.** Wrapper `run-production-db-script.sh` existe e funciona. Mas ~30 scripts legados ainda contêm `wrangler d1 execute --remote` direto. `ops:guard` captura o risco. Status correto. |
| **OPS-01** — `--commit-dirty=true` removido do caminho principal | RESOLVED | **Confirmado.** Preflight + ops:guard bloqueiam deploy sujo. |
| **OPS-04** — Scripts legados bloqueados | RESOLVED | **Confirmado.** Bloqueio por padrão ativo. |
| **MULTI-04** — `escala_alocacoes` sem coluna própria | PARTIAL | **Confirmado.** JOIN existe, mas migration P3 pendente. |
| **RBAC-01** — `userId===1` como fallback | PARTIAL | **Confirmado.** Centralizado mas fallback existe. Migration necessária. |
| **RBAC-02/03/04** — Role support, platform_admin, audit trail | OPEN | **Confirmado.** Não implementado. Migration necessária. |
| **LGPD-01/02** — Sanitização parcial | PARTIAL | **Confirmado.** Camada `lib/audit` existe mas writers sem contrato único. |
| **LGPD-03/04** — support_reason, retenção/audit trail v2 | OPEN | **Confirmado.** Não implementado. |
| **STATUS-01** — Status central em camada crítica | PARTIAL | **Confirmado.** `status-codes.ts` existe, aplicado em dashboard/simuladores/qualificações/treinamentos. |
| **STATUS-02** — Status residual em cron/alertas/EVD | OPEN | **Confirmado.** Expansão pendente. |
| **DQ-01** — Runner com checks SKIPPED | PARTIAL | **Confirmado.** PASS=5, WARN=4, SKIPPED=5. Runner funcional. |
| **DQ-02** — Execução operacional completa pendente | OPEN | **Confirmado.** Requer ambiente staging com schema completo. |
| **DDL-01** — 8 hot paths limpos | PARTIAL | **Confirmado.** Hot paths principais limpos. **Nota:** evidência mostra mais DDL residuals do que os 3 documentados (ver seção 4.1). |
| **DDL-02/03/04** — SIGVOOS, treinamentos, documentos | OPEN | **Confirmado.** DDL runtime persiste nos 3 arquivos + residuais adicionais (ver 4.1). |
| **BETA-01 a BETA-04** — Cobertura beta parcial | PARTIAL | **Confirmado.** Contratos mínimos existem. |
| **BETA-05** — EVD sem cobertura | OPEN | **Confirmado.** Sem testes dedicados. |
| **BETA-06/07** — Module gating e contratos mínimos | RESOLVED | **Confirmado.** Funcionalidade completa e testada. |
| **ASSETS-01 a ASSETS-04** — 14 gaps corrigidos | RESOLVED | **Confirmado.** Todos os gaps críticos/altos/médios corrigidos e testados em Sprints K/K.1. |
| **ASSETS-05** — R2 metadata backfill | BACKLOG | **Confirmado.** Defense-in-depth, sem urgência. |
| **MULTI-07/08** — Admin backfill, R2 metadata | OPEN | **Confirmado.** P3, sem urgência para piloto. |
| **PERF-01/02/03** — Performance sem auditoria | OPEN | **Confirmado.** Não auditado. |
| **ARCH-01/02** — Repository pattern parcial | PARTIAL / BACKLOG | **Confirmado.** Piloto em 2 domínios. |
| **SUP-01 a SUP-05** — Supabase estratégia | DEFERRED | **Confirmado.** Decisão documentada: NÃO MIGRAR AGORA. |
| **TEST-01/02** — Cobertura tenant isolation | RESOLVED / OPEN | **Confirmado.** |

### 4.1 Nota adicional: DDL runtime residual subdocumentado

A matriz lista 3 DDL residuals (DDL-02, DDL-03, DDL-04). A busca por `CREATE TABLE|ALTER TABLE|CREATE INDEX|DROP TABLE` em `worker-airtrust/src/` (excluindo `__tests__`) encontrou **153 ocorrências** em arquivos de runtime, incluindo residuais não documentados na matriz:

| Arquivo | Tipo | Documentado na matriz? |
|---|---|---|
| `services/sigvoos-frms.ts` | CREATE TABLE (5 tabelas + 6 índices) | Sim (DDL-02) |
| `services/treinamentos-planejados-integration.ts` | CREATE TABLE (2) + ALTER TABLE (2) + CREATE INDEX (3) | Sim (DDL-03) |
| `utils/auto-migration-documentos.ts` | CREATE TABLE (1) + CREATE INDEX (5) | Sim (DDL-04) |
| `routes/simuladores-modelos.ts` | ALTER TABLE + CREATE INDEX (função `ensure*` não removida) | **Não** |
| `routes/qualificacoes/historico-helpers.ts` | ALTER TABLE (7 colunas) | **Não** |
| `routes/qualificacoes/shared.ts` | ALTER TABLE dinâmico | **Não** |
| `routes/qualificacoes/tipos.ts` | ALTER TABLE (2 colunas) | **Não** |
| `routes/admin-migrate.ts` | ALTER TABLE + CREATE INDEX | **Não** |
| `routes/migrations.ts` | CREATE/DROP/ALTER (rota de migração admin) | **Não** (admin-gated) |
| `routes/admin-migration.ts` | CREATE/DROP/ALTER (rota de migração admin) | **Não** (admin-gated) |
| `routes/admin-manual-migrations.ts` | ~150 linhas de DDL (rota de migração admin) | **Não** (admin-gated) |

**Classificação:** Os arquivos `routes/migrations.ts`, `routes/admin-migration.ts` e `routes/admin-manual-migrations.ts` são rotas admin-gated de migração manual — intencionais e controladas. Os residuais em `routes/simuladores-modelos.ts`, `routes/qualificacoes/historico-helpers.ts`, `routes/qualificacoes/shared.ts`, `routes/qualificacoes/tipos.ts` e `routes/admin-migrate.ts` são padrões `ensure*` que sobreviveram à limpeza do Sprint E.

**Impacto na matriz:** DDL-01 afirma "8 funções ensure* removidas de hot paths" (PARTIAL). A evidência mostra que o número real de residuais é maior que 8+3=11. **O status PARTIAL permanece correto**, mas a pendência real é maior do que a matriz sugere. Recomenda-se expandir DDL-01 ou criar um novo achado DDL-05 para os residuais não documentados.

---

## 5. Itens reclassificados

| ID | Status anterior | Status corrigido | Justificativa |
|---|---|---|---|
| **OPS-03** | OPEN | **RESOLVED** | `--commit-dirty=true` removido de `build-and-deploy.sh:48` e `legacy/deploy-full-automated.sh:79`. Ambos executam `preflight-clean-deploy.sh`. `ops:guard` PASS. |
| **OPS-05** | OPEN | **PARTIAL** | Smoke autenticado real executado com PASS=11/11. Apenas validação de empresa esperada pendente (`AIRTRUST_EXPECTED_EMPRESA_ID` não configurado). |

---

## 6. Impacto na próxima sequência de sprints

### 6.1 Itens que podem ser removidos ou reduzidos de escopo

- **Sprint N (Blindagem Operacional P2):** A remoção de `--commit-dirty=true` dos 2 scripts (Item 4 do roadmap) **já foi feita**. O Sprint N pode focar apenas em blindagem de scripts D1 legados, reduzindo escopo.
- **Sprint M (Smoke Autenticado):** O smoke já foi executado (PASS=11). O Sprint M deve focar apenas em configurar `AIRTRUST_EXPECTED_EMPRESA_ID` e reexecutar para fechar a pendência — esforço muito menor que o planejado.

### 6.2 Itens que merecem escopo adicional

- **Sprint R (DDL Residual Design):** A evidência mostra que há mais DDL residuals do que os 3 documentados. O Sprint R deve incluir auditoria completa de todos os padrões `ensure*` sobreviventes antes de planejar as migrations.

### 6.3 Sequência ajustada recomendada

| # | Item | Prioridade | Mudança vs roadmap |
|---|---|---|---|
| 1 | Smoke: configurar `AIRTRUST_EXPECTED_EMPRESA_ID` e reexecutar | Imediata | Escopo reduzido (já foi executado) |
| 2 | Data Quality completo (staging) | Imediata | Sem mudança |
| 3 | Blindar scripts D1 legados (sem o item dirty-deploy) | Imediata | Escopo reduzido (dirty-deploy já resolvido) |
| 4 | RBAC/Suporte v2 design | Curto prazo | Sem mudança |
| 5 | Audit Trail/LGPD v2 design | Curto prazo | Sem mudança |
| 6 | Cobertura testes beta (EVD + complementos) | Curto prazo | Sem mudança |
| 7 | DDL residual design (escopo ampliado: auditar TODOS os residuais) | Médio prazo | Escopo ampliado |

---

## 7. Nova contagem após reconciliação

| Status | Antes | Depois | Delta |
|---|---|---|---|
| RESOLVED | 21 | **22** | +1 (OPS-03) |
| PARTIAL | 8 | **9** | +1 (OPS-05 reclassificado de OPEN) |
| OPEN | 12 | **10** | −2 (OPS-03 → RESOLVED, OPS-05 → PARTIAL) |
| DEFERRED | 5 | **5** | 0 |
| BACKLOG | 2 | **2** | 0 |

**Total: 48** (sem alteração)

---

## 8. Conclusão

A matriz consolidada do Sprint Z está **majoritariamente correta**, mas contém **2 inconsistências** que foram identificadas e corrigidas nesta revisão:

1. **OPS-03** (`deploy:all` com `--commit-dirty=true`): marcado como OPEN mas já resolvido — a flag foi removida de ambos os scripts residuais.
2. **OPS-05** (smoke autenticado): marcado como OPEN mas já executado com PASS=11 — reclassificado como PARTIAL (falta validação de empresa esperada).

**Achado adicional:** O DDL runtime residual é mais extenso do que a matriz documenta (153 ocorrências vs 3 residuais listados). Isso não invalida os status atuais (DDL-01 PARTIAL, DDL-02/03/04 OPEN), mas recomenda-se expandir o escopo do Sprint R para auditar todos os padrões `ensure*` sobreviventes.

**Próximos passos:** Atualizar a matriz, closure summary e roadmap para refletir as reclassificações. Os Sprints M e N podem ter escopo reduzido (smoke já executado, dirty-deploy já resolvido).

---

**Fim da revisão de consistência.** Documento gerado em 2026-06-02. Nenhum código alterado, nenhum deploy, nenhuma migration.
