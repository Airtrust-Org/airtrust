# AirTrust — Auditoria Geral Independente (Opus)

- **Data:** 2026-06-01
- **Repositório:** `/Users/filipedaumas/SAAS/Airtrust`
- **Branch auditada:** `main`
- **HEAD:** `70c15fa` (== `origin/main`, árvore limpa de alterações *tracked*)
- **Modo:** read-only. Nenhum arquivo de código alterado, nenhum commit, push, deploy ou migration.
- **Método:** auditoria transversal. Achados de subagentes foram **verificados manualmente** nos pontos de maior severidade. Onde a verificação contradisse o achado, o achado foi corrigido/rebaixado (ver seção "Achados rebaixados").

> **Aviso de método:** este relatório distingue `CONFIRMADO` (verifiquei o código/linha pessoalmente), `SUSPEITA FORTE` (evidência consistente mas não confirmada linha-a-linha) e `HIPÓTESE` (precisa validação). Não tratar `SUSPEITA`/`HIPÓTESE` como fato.

---

## 1. Resumo executivo

**O AirTrust está em condição aceitável para continuar publicado?**
Sim, com ressalvas. Não há P0 explorável por usuário **não autenticado**. A base é madura (auth+tenant globais, RBAC, CSP/HSTS, rate-limit, blocklist de JWT, validação de webhook por secret). Porém há **1 caminho destrutivo cross-tenant** que exige apenas role admin, e **defaults "fail-open" em decisão de fadiga** que afetam segurança operacional.

**Há algum P0?**
Sim, um: `DELETE /api/admin/reset/*` executa soft-delete **sem filtro `empresa_id`** — um admin de qualquer tenant apaga dados de **todos os tenants** (admin.ts:181, 262, 346). Severidade prática depende de quantos tenants reais existem hoje.

**Há P1 que deveria bloquear evolução/deploy?**
Sim: (a) defaults fail-open no check-in de fadiga FRMS (06:00/22:00 e `apto=1`); (b) `escala_alocacoes` sem coluna `empresa_id` (isolamento depende 100% de disciplina de JOIN); (c) scripts npm que rodam SQL destrutivo direto em produção (`db:qualificacoes:*` com `--remote`).

**Maior risco sistêmico hoje:** isolamento multi-tenant que depende de convenção (JOIN/where manual) em vez de garantia estrutural — sem `empresa_id` em tabelas críticas (alocações) e sem `NOT NULL` em outras, um único query mal escrito vaza/cruza tenants.

**Maior risco de dado operacional errado:** FRMS preenche sono/aptidão com defaults quando o payload chega incompleto → avaliação de fadiga fabricada e potencialmente "APTO" indevido.

**Maior risco de segurança:** operação destrutiva cross-tenant via reset admin (P0) + scripts de manutenção que tocam produção via `npm run`.

**Maior risco de arquitetura/manutenção:** ~140 arquivos de rota e 357 migrations, várias das quais são *data patches* (0373–0383) e não mudanças de schema; baixa cobertura de teste em fluxos críticos (escalas/conflitos, métricas de dashboard, isolamento de tenant).

---

## 2. Top 10 achados

| # | Sev | Módulo | Achado | Evidência | Impacto | Próxima ação |
|---|-----|--------|--------|-----------|---------|--------------|
| 1 | **P0** | Admin/Tenant | Reset admin faz soft-delete sem `empresa_id` → cross-tenant | `routes/admin.ts:181,262,346` (CONFIRMADO) | Admin de 1 tenant apaga funcionários/qualificações de TODOS | Adicionar `AND empresa_id = ?` a todos os resets; restringir a super-admin de plataforma |
| 2 | **P1** | FRMS | Defaults fail-open: sono ausente → 8h; aptidão ausente → `apto=1` | `frms-fadiga-checkin.ts:269,274-275,298` (CONFIRMADO) | Avaliação de fadiga fabricada; "APTO" sem dado do tripulante | Exigir campos no schema; default fail-safe (recusar/`apto=0`) |
| 3 | **P1** | Escalas | `escala_alocacoes` sem coluna `empresa_id` | `migrations/0256_*.sql` (CONFIRMADO) | Isolamento só via JOIN `escalas_mensais`; 1 query sem join = vazamento | Avaliar adicionar `empresa_id` denormalizado + índice; auditar todos os SELECT/UPDATE/DELETE de alocações |
| 4 | **P1** | DB/Ops | `npm run db:qualificacoes:*` roda SQL destrutivo direto em PROD | `package.json:127-129` (CONFIRMADO) | Merge/soft-delete em produção sem dry-run/aprovação, disparável por engano | Mover para script com confirmação dupla + `--env production` explícito + backup prévio |
| 5 | **P1** | Simuladores | Sessão PLANEJADA→CONCLUÍDA pode não atualizar a qualificação vinculada | `simuladores-sessoes-update.ts:~421,865` (SUSPEITA FORTE) | Qualificação fica presa em PLANEJADA; contagens divergem | Verificar transição e cobrir com teste de integração |
| 6 | **P2** | Deploy | `deploy:pages` usa `--commit-dirty=true --branch=production` | `package.json:104` (CONFIRMADO) | Pode publicar build que não corresponde a nenhum commit | Bloquear deploy com árvore suja; carimbar commit SHA no build |
| 7 | **P1** | Tenant | Fallback de plataforma seleciona "primeira empresa ativa" quando `userId===1` | `middleware/tenant.ts:242-326` (CONFIRMADO) | Usuário 1 ganha contexto de tenant implícito se o vínculo falhar | Restringir/feature-flag; logar e alertar; não escolher tenant implicitamente |
| 8 | **P2** | DB | `escala_alocacoes` sem UNIQUE → duplo-agendamento possível | `migrations/0256_*.sql` (CONFIRMADO) | Tripulante alocado 2x (mesma data/função) | Avaliar UNIQUE parcial (`WHERE deleted_at IS NULL`) |
| 9 | **P2** | API | ~70% dos `c.req.json()` sem schema zod; `Number()`/`new Date()` sem guarda de NaN | amostrado em frms-fira, escalas-cobertura, notificacoes-convocacao, simuladores-sessoes-update (SUSPEITA FORTE) | Datas/IDs inválidos entram silenciosamente | Padronizar `@hono/zod-validator` em mutações; helper central de data/ID |
| 10 | **P2** | Testes | Sem cobertura real em conflitos de escala, métricas de dashboard e isolamento de tenant | `__tests__/*` (CONFIRMADO) | Regressões silenciosas em fluxos críticos | Criar testes-contrato e smoke ampliado (ver §7) |

---

## 3. Mapa de riscos por módulo

| Módulo | Risco principal | Sev | Recomendação |
|--------|-----------------|-----|--------------|
| Admin/Migrations | Reset cross-tenant; rotas de migration mutáveis | P0/P1 | Escopo de tenant + gate de super-admin + auditoria |
| Auth/Tenant/RBAC | Isolamento por convenção; `requireRole` simplista (`role===req || ADMIN`) | P1/P2 | Usar hierarquia (`requireTenantRole`) consistente; revisar fallback `userId===1` |
| FRMS/Fadiga | Defaults fail-open na avaliação | P1 | Fail-safe + schema obrigatório |
| Escalas/EVD | Falta `empresa_id`/UNIQUE; override de conflito sem trilha | P1/P2 | `empresa_id`+UNIQUE; auditar override de hard-conflict |
| Simuladores | Transição de status não gera qualificação | P1 | Confirmar + teste de integração |
| Qualificações | Matemática de vencimento (off-by-one/timezone) e semântica de `renovada` | P2/P3 | Testar bordas de data; documentar exclusão de `renovada` |
| Dashboard | (verificado) filtra tenant e exclui deletados — OK; risco baixo | P3 | Apenas documentar semântica de `renovada` |
| SGSO | Validação por schema presente; cobertura de enum incerta | P2 | Auditar completude dos enums |
| LMS | Não auditado em profundidade nesta passada | — | Auditar em fase futura |
| Deploy/CF | Deploy de árvore suja; scripts prod via npm | P1/P2 | Gates de deploy; scripts com confirmação |
| Segurança/Secrets | Nenhum secret tracked vazado (verificado) | OK/P3 | Manter guard; revisar docs `MAINTENANCE_SECRET_*` |

---

## 4. Backlog recomendado

**Correções imediatas (até 24h)**
- Escopar `empresa_id` em `DELETE /api/admin/reset/*` (#1, P0). Considerar desabilitar as rotas até o fix.
- FRMS: tornar `wake_time`/`hora_dormiu`/`fit_for_duty` obrigatórios no schema e default fail-safe (#2, P1).

**Até 7 dias**
- Auditar todas as queries de `escala_alocacoes` para garantir JOIN com `escalas_mensais` + `empresa_id`; avaliar coluna `empresa_id` denormalizada (#3).
- Reformular `db:qualificacoes:*` com confirmação dupla + backup (#4).
- Verificar/corrigir transição de sessão simulador → qualificação + teste (#5).
- Gate de deploy contra árvore suja; carimbar commit SHA (#6).

**Até 30 dias**
- UNIQUE parcial em alocações (#8); padronizar validação zod em mutações (#9).
- Suite de testes de conflito de escala, métricas de dashboard e isolamento de tenant (#10).
- Revisar `requireRole` para usar hierarquia consistente.

**Dívida técnica/documentação**
- Separar *data patches* (0373–0383) do pipeline de schema; política de migrations.
- Padronizar `deleted_at` e filtros de soft-delete; documentar semântica `renovada`.
- Consolidar 357 migrations / ~140 rotas (mapa de domínios).

---

## 5. Plano de ação (5 passos, em ordem)

1. **Conter o P0:** escopar `empresa_id` nos resets admin (ou desabilitar a rota) — menor esforço, maior risco eliminado.
2. **Fail-safe no FRMS:** schema obrigatório + recusar payload incompleto; teste de borda (sem sono / sem aptidão).
3. **Blindar produção:** trocar scripts `db:qualificacoes:*` por fluxo com confirmação/backup; gate de deploy sujo.
4. **Auditar alocações:** garantir tenant-scoping por JOIN em 100% das queries; planejar `empresa_id`+UNIQUE.
5. **Rede de testes:** smoke ampliado + testes de isolamento de tenant e métricas, antes de novas features.

---

## 6. Arquivos críticos para revisão manual

- `worker-airtrust/src/routes/admin.ts` (resets destrutivos)
- `worker-airtrust/src/middleware/tenant.ts` (fallback `userId===1`)
- `worker-airtrust/src/middleware/auth.ts` / `middleware/rbac.ts` (dev-bypass, `requireRole`)
- `worker-airtrust/src/routes/frms-fadiga-checkin.ts` (defaults de fadiga)
- `worker-airtrust/migrations/0256_situacoes_sem_aeronave.sql` (schema final de alocações)
- `worker-airtrust/src/routes/simuladores-sessoes-update.ts` (transição→qualificação)
- `worker-airtrust/src/routes/escalas-alocacoes*.ts` (tenant-scoping + conflitos)
- `package.json` (scripts de deploy e `db:*`)

---

## 7. Testes prioritários a criar

1. Isolamento de tenant: para cada mutação crítica (escalas PUT, qualificações POST, reset admin), asserir que dados de outro `empresa_id` não são afetados.
2. FRMS fail-safe: payload sem sono/aptidão deve ser **recusado** (não fabricar 8h/`apto=1`).
3. Conflito de escala: PIC/SIC duplo no mesmo dia/aeronave deve bloquear; alocação válida em escalas distintas não deve falso-bloquear (regressão do bug `escala_id`).
4. Simulador→qualificação: sessão PLANEJADA marcada CONCLUÍDA gera/atualiza a qualificação vinculada.
5. Vencimento de qualificação: bordas (vence hoje, mês cheio, ano bissexto, timezone São Paulo).
6. Dashboard: contagens batem com fixtures conhecidos e excluem deletados/cancelados.
7. Smoke ampliado (`scripts/smoke-test-core.sh`): incluir login + leitura de escala + check-in FRMS + escrita de qualificação (hoje cobre basicamente health+login+1 leitura).

---

## 8. Achados rebaixados / corrigidos na verificação

Transparência (subagentes superestimaram; **verifiquei e corrigi**):

- **EdApp webhook "P0 não autenticado / cross-tenant":** FALSO. `integracoes_edapp.ts:92-93` valida `X-EdApp-Secret` contra `EDAPP_WEBHOOK_SECRET`. Risco residual: funções de mapeamento podem não escopar `empresa_id`, mas o endpoint é *gated* por secret compartilhado → **P3**, não P0.
- **Dashboard "P0 soft-delete/tenant não filtrados":** FALSO. `dashboard.ts` filtra `f.empresa_id = ?`, `f.deleted_at IS NULL`, `qh.deleted_at IS NULL`. → sem achado (P3 apenas para documentar `renovada`).
- **DEV_AUTH_BYPASS "habilitável em produção":** mitigado. `auth.ts:238` lança erro se `ENVIRONMENT !== 'development'` (inclusive quando indefinido). → **P3**.
- **Endpoints `/maintenance/*` "exploráveis":** mitigado. Exigem localhost + secret (confirmado pelos relatórios de staging: retornam 403 "apenas em localhost"). → **P2/P3**.
- **`qualificacoes` "sem empresa_id":** o escopo de tenant é via `qualificacoes_historico` (tem `empresa_id`) + JOIN `funcionarios`; `qualificacoes_tipos` é catálogo. → tratar como decisão de design a documentar, não P0.

---

## 9. Validações executadas

- `git`: branch/HEAD/status/log — árvore limpa (tracked), HEAD == origin/main.
- `npx tsc --noEmit` — **exit 0** (sem erros de tipo).
- Inspeção manual de: `index.ts` (whitelist pública, ordem de middleware), `auth.ts`, `tenant.ts`, `admin.ts`, `frms-fadiga-checkin.ts`, `dashboard.ts`, `integracoes_edapp.ts`, migrations de `escala_alocacoes`, `package.json`, `.gitignore`.
- `guard:tracked-secrets` (manual): nenhum secret real versionado; só `*.example` e docs com placeholders.
- **Não executados** (read-only / tempo): `npm run build`, `npm run test`, `npm run test:worker`, e2e. Recomenda-se rodá-los antes de aplicar correções.

---

## 10. Decisão final

**B — seguir operação, mas corrigir P1 antes de nova feature** — com a seguinte condição:

> Tratar o achado #1 (reset admin cross-tenant) como **efetivamente P0 → migrar para C (bloquear deploy)** SE houver mais de um tenant real ativo em produção. Em ambiente single-tenant na prática, o blast radius do #1 é contido e B é adequado.

**Justificativa:** não há vetor P0 anônimo; a base é sólida. Mas existe um caminho destrutivo cross-tenant (gated por admin) e defaults de segurança fail-open no FRMS — ambos baratos de corrigir e de alto impacto. Corrigir #1 e #2 antes de qualquer feature nova é o equilíbrio correto entre risco e velocidade.

**Próxima ação recomendada:** aplicar o fix do achado #1 (escopo `empresa_id` nos resets admin) e do #2 (FRMS fail-safe), com testes, antes de prosseguir com novas funcionalidades.

---

### Confirmação final
Nenhum código foi alterado. Nenhum commit, push, deploy, migration ou alteração de banco foi executado. Este relatório é um arquivo **untracked** em `docs/` e não foi commitado.
</content>
</invoke>
