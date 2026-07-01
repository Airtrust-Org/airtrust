# Auditoria de Refatoração Controlada — AirTrust

> **Data:** 2026-07-01 | **SHA main:** `2135328` | **Pipeline:** Baseline GO + SGSO fechado + Repo limpo
> **Modelo desta auditoria:** DeepSeek V4 Flash (barato)

---

## 🔑 Veredito Geral

**BACKLOG DE REFATORAÇÃO PÓS-ESTABILIZAÇÃO — ROTEIRO DE 8 PRs REFERENCIAIS**

A dívida técnica existe e é significativa, mas este documento serve apenas como backlog pós-release. Não autoriza execução imediata, nem substitui a estabilização de PR #216/#221, baseline staging ou validações de Qualificações.

**Documento de referência בלבד.** Não iniciar implementação, migration, deploy, DML ou rebuild de staging com base neste material.

---

## 1. Mapa de Hotspots

### 🔴 Backend — Rotas > 1500 linhas (9 arquivos)

| # | Arquivo | Linhas | Risco | Responsabilidade |
|---|---------|--------|-------|-----------------|
| 1 | `routes/frms.ts` | 3.867 | 🔴 Alto | CRUD FRMS + cálculos + importação + manutenção + alertas — **god route** |
| 2 | `routes/treinamentos-planejados.ts` | 3.757 | 🔴 Alto | CRUD treinamentos + convocações + email + auditoria — **god route** |
| 3 | `routes/lms-matriculas.ts` | 3.260 | 🟡 Médio | Matrículas LMS com 6 erros TS2552 (`dataExpiracao`) |
| 4 | `routes/lms-cursos.ts` | 2.920 | 🟡 Médio | CRUD cursos LMS (já bem isolado) |
| 5 | `routes/lms-assets.ts` | 2.399 | 🟢 Baixo | Assets SCORM/H5P |
| 6 | `routes/escalas-alocacoes.ts` | 2.276 | 🟢 Baixo | Alocações de escala (já modularizado em sub-arquivos) |
| 7 | `routes/escalas-evd.ts` | 2.161 | 🟡 Médio | EVD diário |
| 8 | `routes/controle-voos.ts` | 2.111 | 🟢 Baixo | Bem modularizado, delega para services |
| 9 | `routes/frms-fadiga-checkin.ts` | 2.020 | 🟡 Médio | Check-in de fadiga |

### 🔴 Backend — Serviços > 1000 linhas (4 arquivos)

| # | Arquivo | Linhas | Risco | Responsabilidade |
|---|---------|--------|-------|-----------------|
| 1 | `services/sigvoos-frms.ts` | 2.883 | 🟡 Médio | Integração SIGVOOS com criptografia |
| 2 | `services/dashboardService.ts` | 1.533 | 🟡 Médio | Dashboard multi-métricas (2 testes quebrados) |
| 3 | `services/controle-voos/sigvoos-importer.ts` | 1.504 | 🟡 Médio | Importador SIGVOOS |
| 4 | `services/treinamentos-planejados-integration.ts` | 1.307 | 🟡 Médio | Integração com treinamentos |

### 🔴 Frontend — Páginas > 1500 linhas (4 arquivos)

| # | Arquivo | Linhas | Risco | Responsabilidade |
|---|---------|--------|-------|-----------------|
| 1 | `pages/Qualificacoes.tsx` | **5.509** | 🔴 Alto | **Maior god component do sistema** — listagem, modais, filtros, upload, certificados |
| 2 | `pages/TreinamentosPlanejadosPage.tsx` | 3.974 | 🔴 Alto | God component similar |
| 3 | `pages/escalas/EvdPage.tsx` | 2.709 | 🟡 Médio | EVD diário |
| 4 | `pages/simuladores/fichas/[id]/index.tsx` | 2.316 | 🟡 Médio | Ficha de simulador |

### 🔴 Testes Quebrados Conhecidos

| Teste | Falhas | Causa | Desde |
|-------|--------|-------|-------|
| `dq01-controlled-backfill-gate.test.ts` | 2 | `empresa_sem_admin` env var ausente | Pré-existente |
| `dashboardService.repository-contract.test.ts` | 2 | spy recebe 3º arg `undefined` | Pré-existente |
| `readiness-audit-scripts.test.ts` | 1 | `empresa_sem_admin` env var ausente | Pré-existente |
| `treinamentos-planejados.test.ts` | 2 | `500` vs `400` em edição de turma | Pré-existente |

**Total:** 7 falhas em 1674 testes (99,58% pass).

---

## 2. Matriz Risco x Valor

```
ALTO VALOR
    ↑
    │   PR#3 (TS errors)    PR#1 (Qualificacoes.tsx extracao)
    │   PR#4 (cobertura)    PR#2 (treinamentos-planejados split)
    │   PR#5 (dashboard)    
    │                       PR#6 (frms.ts extracao)
    │                       PR#7 (LMS front tests)
    │   PR#8 (guardrails)
    └─────────────────────────────→ BAIXO RISCO
    BAIXO VALOR
```

---

## 3. Backlog Priorizado de 8 PRs

### PR #1 — Extrair `Qualificacoes.tsx` em submódulos (DeepSeek V4 Flash)

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Quebrar o god component de 5.509 linhas em ~6 subcomponentes sem alterar comportamento |
| **Arquivos tocados** | `Qualificacoes.tsx` (apenas mover código) |
| **O que NÃO tocar** | Lógica de negócio, hooks, API calls, migrations |
| **Técnica** | Extrair `QualificacoesListTab`, `QualificacoesCertificadosTab`, `QualificacoesModelosTab`, `QualificacoesClassificacoesTab`, `QualificacoesHistoryTab` para arquivos separados em `pages/qualificacoes/` |
| **Testes mínimos** | `npx tsc --noEmit` + `npm run test:run` (frontend) |
| **Risco** | 🟢 Baixo — extração pura, sem lógica nova |
| **Tamanho PR** | ~500 linhas movidas, 0 lógica alterada |
| **Modelo** | DeepSeek V4 Flash ✅ |
| **Rollback** | Reverter commit único |

### PR #2 — Extrair `treinamentos-planejados.ts` rota (DeepSeek V4 Flash)

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Separar convocações email + lógica de auditoria do handler principal |
| **Arquivos tocados** | `routes/treinamentos-planejados.ts` |
| **O que NÃO tocar** | Lógica de criação de treinamento, schema discovery |
| **Técnica** | Extrair funções de convocação/email para `services/treinamentos-convocacao-email.ts` (já existe parcialmente) |
| **Testes mínimos** | `npm run test:worker` |
| **Risco** | 🟢 Baixo — funções já delegam parcialmente |
| **Tamanho PR** | ~200 linhas |
| **Modelo** | DeepSeek V4 Flash ✅ |

### PR #3 — Corrigir 6 erros TS2552 em `lms-matriculas.ts` (DeepSeek V4 Flash)

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Corrigir `dataExpiracao` → `data_expiracao` em 6 locais |
| **Arquivos tocados** | `routes/lms-matriculas.ts` |
| **O que NÃO tocar** | Lógica de ciclo de matrícula, queries, emails |
| **Técnica** | Renomear variável no destructuring Zod |
| **Testes mínimos** | `npx tsc --noEmit` + testes LMS |
| **Risco** | 🟢 Baixo — correção de nome de variável, zero alteração de fluxo |
| **Tamanho PR** | ~12 linhas |
| **Modelo** | DeepSeek V4 Flash ✅ |

### PR #4 — Adicionar cobertura de testes SGSO + LMS frontend (DeepSeek V4 Flash)

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Aumentar cobertura nos módulos com pior índice: SGSO (4 testes, 0 front) e LMS front (0 testes) |
| **Arquivos tocados** | Testes novos em `__tests__/routes/sgso-*.test.ts` + `src/react-app/pages/lms/__tests__/` |
| **O que NÃO tocar** | Código de produção |
| **Técnica** | Seguir padrão de mock do `sgso-relatos-beta-contract.test.ts` |
| **Testes mínimos** | `npm run test:all` |
| **Risco** | 🟢 Baixo — só adiciona testes, zero alteração de produção |
| **Tamanho PR** | ~300-500 linhas de teste |
| **Modelo** | DeepSeek V4 Flash ✅ |

### PR #5 — Corrigir 2 testes quebrados do dashboard (DeepSeek V4 Flash)

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Corrigir `dashboardService.repository-contract.test.ts` (spy com 3º arg undefined) |
| **Arquivos tocados** | `__tests__/services/dashboardService.repository-contract.test.ts` |
| **O que NÃO tocar** | `dashboardService.ts`, lógica de dashboard |
| **Técnica** | Ajustar mock do spy para aceitar argumento extra |
| **Testes mínimos** | Teste específico + worker tests |
| **Risco** | 🟢 Baixo — só teste |
| **Tamanho PR** | ~10 linhas |
| **Modelo** | DeepSeek V4 Flash ✅ |

### PR #6 — Extrair cálculo FRMS de `frms.ts` para lib (Codex 5.4 baixo)

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Extrair ~500 linhas de cálculo de fadiga/jornada de `frms.ts` para `lib/frms/` |
| **Arquivos tocados** | `routes/frms.ts` + `lib/frms/calculos.ts` + `lib/frms/alertas.ts` |
| **O que NÃO tocar** | CRUDs de escala, importação APU, relatórios |
| **Técnica** | Mover funções de domínio (cálculo de fadiga, validação de escala) para lib separada |
| **Testes mínimos** | Testes FRMS existentes + `npm run test:worker` |
| **Risco** | 🟡 Médio — FRMS é módulo crítico; requer smoke manual pós-PR |
| **Tamanho PR** | ~400-500 linhas |
| **Modelo** | **Codex 5.4 baixo** (domínio FRMS complexo, risco de regressão) |
| **Rollback** | Reverter commit + verificar `POST /frms/jornadas` |

### PR #7 — Testes de frontend para LMS (DeepSeek V4 Flash)

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Adicionar testes para o catálogo e detalhe de curso LMS (0 testes hoje) |
| **Arquivos tocados** | `src/react-app/pages/lms/__tests__/` (novo) |
| **O que NÃO tocar** | `lms-cursos.ts`, `lms-assets.ts` |
| **Técnica** | Testar renderização do catálogo e detalhe do curso com mocks |
| **Testes mínimos** | `npm run test:run` |
| **Risco** | 🟢 Baixo |
| **Tamanho PR** | ~200-300 linhas |
| **Modelo** | DeepSeek V4 Flash ✅ |

### PR #8 — Adicionar guardrail de cobertura para Qualificações + LMS (DeepSeek V4 Flash)

| Atributo | Valor |
|----------|-------|
| **Objetivo** | Configurar thresholds de cobertura no `vitest.config.ts` para qualificações e LMS |
| **Arquivos tocados** | `vitest.config.ts` + `worker-airtrust/vitest.config.ts` |
| **O que NÃO tocar** | Código de produção |
| **Técnica** | Adicionar include paths para `pages/qualificacoes/**` e `pages/lms/**` |
| **Testes mínimos** | `npm run test:run` (não falhar por cobertura insuficiente ainda) |
| **Risco** | 🟢 Baixo |
| **Tamanho PR** | ~5 linhas |
| **Modelo** | DeepSeek V4 Flash ✅ |

---

## 3.1 Não executar antes de estabilizar PR #216/#221 e staging baseline

Este backlog é somente para uso após estabilização do release atual. Antes disso, não executar nenhum dos PRs listados aqui. A sequência depende de:

- PR #216 estabilizado em Qualificações.
- PR #221 estabilizado no wrapper schema-only.
- Baseline staging validado.
- Migração `0412` aplicada e validada em staging.
- Caminho de release de Qualificações sem regressão funcional.

Enquanto essas condições não estiverem fechadas, este documento deve ser tratado como referência histórica e planejamento, nunca como ordem de execução.

## 3.2 Ordem recomendada pós-release

Ordem executiva recomendada depois da estabilização:

1. PR #3 — correção dos 6 erros TS2552 em `lms-matriculas.ts`.
2. PR #5 — estabilização dos testes quebrados do dashboard.
3. PR #7 — cobertura frontend de LMS.
4. PR #4 — cobertura SGSO + LMS frontend ampliada.
5. PR #1 — extração controlada de `Qualificacoes.tsx`.
6. PR #2 — extração controlada de `treinamentos-planejados.ts`.
7. PR #8 — guardrail de cobertura para Qualificações + LMS.
8. PR #6 — extração FRMS, apenas por último.

Critério de confirmação antes de iniciar qualquer item: release estabilizado, baseline staging validado e ausência de regressões abertas em Qualificações.

---

## 4. Critérios de GO/NO-GO

### Critérios de Aceite (todas as PRs)

| Critério | Obrigatório? |
|----------|-------------|
| `npx tsc --noEmit` sem erros | ✅ Sim |
| `npm run lint` passando | ✅ Sim |
| Testes específicos passando | ✅ Sim |
| `npm run test:all` sem novas falhas | ✅ Sim |
| Zero migrations tocadas | ✅ Sim |
| Zero DML/deploy/produção | ✅ Sim |

### Sinais de Rollback Imediato

- Testes de regressão falhando em módulo não tocado
- Erro TS2552/TS2304 que o tipo checker não pegou
- Vazamento cross-tenant (confirmar `empresa_id` em cada query extraída)
- Aumento de latência em endpoint FRMS (PR #6 apenas)

### Quando Escalar para Codex 5.4

- PR #6 (FRMS): Codex 5.4 baixo — domínio regulatório complexo
- Se PR #1 gerar diff > 800 linhas: Codex 5.4 baixo para revisão
- Se `lms-matriculas.ts` tiver mais erros além dos 6 TS2552 conhecidos: Codex 5.4 médio
- Se qualquer PR tocar `empresa_id` em query de middlewares de tenant: Codex 5.4 baixo

---

## 5. Pontos Congelados Durante a Estabilização

| Item | Motivo |
|------|--------|
| `PR #168` | Explicitamente proibido |
| `sgso.ts` | Recém-corrigido (PR #224), deixar estabilizar |
| `routes/qualificacoes/*` | Migration 0412 recente (PR #216), schema ainda aquecendo |
| `escalas-alocacoes-engine.ts` | Já modularizado, baixo retorno |
| `middleware/tenant.ts` | Crítico para multiempresa, mexer só com teste de integração |
| `services/sigvoos-frms.ts` (criptografia) | Senhas Sigvoos, risco de segurança |
| Migrations > 0412 | Baseline schema-only recém-fechado, não adicionar pressão |
| DML/backfill/deploy | Proibido nesta cadeia |

---

## 6. Apêndice Histórico de Prompt (não executar antes do release)

> **Prompt histórico para implementar PR #1 após estabilização:**
>
> ```text
> Modelo: DeepSeek V4 Flash
> 
> Objetivo: Extrair subcomponentes do god component Qualificacoes.tsx (5.509 linhas)
> em ~6 arquivos separados, sem alterar comportamento, lógica ou imports.
> 
> Regras:
> - Não alterar lógica de negócio
> - Não alterar hooks chamados
> - Não alterar API calls
> - Não tocar migrations/tipos
> - Manter todos os imports originais onde necessário
> - Extrair JSX + funções auxiliares + handlers de eventos locais
> 
> Arquivo fonte: src/react-app/pages/Qualificacoes.tsx
> 
> Extrair para (criar se não existir):
> - pages/qualificacoes/QualificacoesHistoricoTab.tsx (tab de histórico + filtros)
> - pages/qualificacoes/QualificacoesCertificadosTab.tsx (tab de certificados)
> - pages/qualificacoes/QualificacoesModelosTab.tsx (tab de modelos/tipos)
> - pages/qualificacoes/QualificacoesClassificacoesTab.tsx (tab de classificação)
> - pages/qualificacoes/QualificacoesListTab.tsx (tab de listagem principal)
> 
> Testes:
> - npx tsc --noEmit
> - npm run test:run
> - Verificar que npm run lint passa
> 
> Não abrir PR antes da estabilização do release. Não fazer deploy. Não rodar migration.
> ```

---

## 7. Resumo do Cenário Atual

| Métrica | Valor |
|---------|-------|
| SHA main | `2135328` |
| Arquivos backend .ts (excl. testes) | ~538 |
| Arquivos frontend .ts/.tsx | ~844 |
| Testes worker (pass/fail) | 1667 pass / 7 fail (99,58%) |
| Testes frontend (pass/fail) | ~945 pass / 0 fail |
| Migrations | ~383 (356 sequenciais + 27 duplicatas históricas + allowlist) |
| Rotas exportadas | ~126 ativas |
| Lint guards | 6 (api-base, secrets, auth-boundaries, empresa-default1, duplicates, operational-sql) |
| God files > 2000 linhas | 9 backend + 4 frontend |
| Worktrees ativas | 0 |
| PRs fechados nesta cadeia | #221, #222, #223, #224 |
| Baseline schema-only | GO OPERACIONAL |
| PR #168 intocado | ✅ |
| Produção/DML/Migration/Deploy | Zero em toda a cadeia |
