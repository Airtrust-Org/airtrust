# AirTrust — Opus Readiness: Multiempresa, Onboarding, RBAC e Produto

- **Data:** 2026-06-02
- **Repositório:** `<AIRTRUST_ROOT>`
- **Branch / HEAD:** `main` @ `5777d775876c7088907c039d0306dfd7bc0b2f9d` (== `origin/main`, 0 ahead / 0 behind)
- **Working tree:** sem *tracked changes*; apenas *untracked* (`docs/`, `knowledge/`, `scripts/seed-*.sql`, `scripts/validation/*`).
- **Modo:** read-only. Nenhum código alterado, nenhum commit/push/deploy/migration, nenhum DB remoto/real tocado, nenhuma empresa/usuário criado.
- **Pergunta central:** *"Podemos colocar novas empresas reais no AirTrust agora?"* — avaliada por risco operacional, comercial, suporte, UX, onboarding, permissões e isolamento (não apenas "passa nos testes").

> **Método:** verifiquei o código dos caminhos de tenant/RBAC/onboarding linha-a-linha (`middleware/tenant.ts`, `middleware/rbac.ts`, `routes/empresas.ts`, `routes/empresas-usuarios.ts`, `routes/auth.ts` select-empresa/login). Os achados de RBAC foram **corrigidos após verificação**: o JWT é re-emitido por empresa no `select-empresa`, então `requireRole` é efetivamente tenant-aware — não tratei isso como falha.

---

## 1. Decisão executiva

**Decisão: B — pronto para PILOTO CONTROLADO com 1–3 empresas reais.**
**Nota geral de prontidão: 3.4 / 5.**

Não é **A** (onboarding aberto/self-service) porque o onboarding ainda é um **processo manual de 2 passos sem runbook oficial**, falta **papel de super-admin/suporte dedicado** (hoje é o `userId === 1` hardcoded), há **DDL em runtime que pode criar schema inconsistente para um tenant novo**, a **validação autenticada ponta-a-ponta nunca foi rodada** (pendente de credencial), e módulos como `evd/lms/hospedagem` têm cobertura multi-tenant leve ou nula.

Não é **C/D** porque o núcleo está sólido: auth + tenant globais, isolamento por `empresa_id` testado nos módulos principais (funcionários 16, qualificações 15, admin 12, FRMS 11, simuladores 7, escalas 6 testes de tenant), fluxo de convite por e-mail funcional (Brevo/SendGrid + token 72h), multi-empresa por usuário (`usuarios_empresas`), storage R2 escopado por `empresas/{id}/`, e audit trail presente.

**Resumo da pergunta central:** Sim, pode onboardar **1–3 empresas reais como piloto acompanhado**, desde que: (a) o onboarding seja feito pela equipe AirTrust com um runbook manual; (b) rode-se o smoke autenticado uma vez; (c) verifique-se o isolamento de `/api/assets/*`. Antes da 5ª–10ª empresa é preciso fechar super-admin/suporte, DDL runtime e cobertura de testes.

---

## 2. Módulos por status

| Módulo | Status | Nota 0–5 | Liberar? | Risco principal | Antes de cliente real |
|---|---|---|---|---|---|
| Qualificações | READY | 4.0 | LIBERAR PILOTO | Datas/vencimento bordas | Smoke autenticado |
| Simuladores | READY | 4.0 | LIBERAR PILOTO | — (transição testada) | Smoke autenticado |
| Funcionários | READY | 4.2 | LIBERAR PILOTO | — (16 testes tenant) | Nenhuma crítica |
| Dashboard executivo | READY | 3.8 | LIBERAR PILOTO | Métricas além das testadas | Validar com dados reais do tenant |
| Escalas | READY (vigiar) | 3.5 | LIBERAR PILOTO | `escala_alocacoes` sem `empresa_id` próprio | Reforçar testes EVD |
| EVD | NEEDS TEST | 3.0 | PILOTO CONTROLADO | Cobertura tenant leve (2) | Testes de conflito + tenant |
| FRMS / Fadiga | READY (vigiar) | 3.6 | PILOTO CONTROLADO | Maior superfície; estimativa fail-safe | Acompanhar com dados reais |
| Treinamentos planejados | NEEDS MIGRATION | 2.8 | BETA | DDL runtime (link cols) | Migration antes de novo tenant |
| SGSO | NEEDS TEST | 2.8 | BETA | KPI/auditoria, cobertura leve (4) | Testes de caminho crítico |
| LMS / EAD | NEEDS TEST | 2.8 | BETA | Cobertura tenant leve (2) | Testes tenant + matrícula |
| Hospedagem | NEEDS TEST | 2.5 | BETA/OCULTO | **0 testes** | Testes contrato + tenant |
| SIGVOOS (integração FRMS) | NEEDS MIGRATION | 2.5 | OCULTO/BLOQUEAR | Tabelas criadas em runtime | Migration explícita |
| Configurações | PARCIAL | 2.5 | BETA | Seções "em breve" visíveis | Ocultar seções incompletas |
| Admin / manutenção | READY (interno) | 3.5 | USO INTERNO | Sem papel de suporte dedicado | Restringir acesso |
| Usuários / empresas / permissões | READY (manual) | 3.2 | USO INTERNO | Onboarding 2-passos sem runbook | Runbook de onboarding |

---

## 3. Matriz multi-tenant

| Módulo | Tenant backend | Tenant frontend | Teste multi-tenant | Risco | Próxima ação |
|---|---|---|---|---|---|
| Funcionários | `empresa_id` direto | filtra | Forte (16) | Baixo | — |
| Qualificações | via histórico + JOIN | filtra | Forte (15) | Baixo | Documentar design |
| Simuladores | `empresa_id` + JOIN | filtra | Forte (7) | Baixo | — |
| Escalas / Alocações | JOIN `escalas_mensais` (sem coluna própria) | filtra | Médio (6/2) | **Médio (S1 latente)** | Migration `empresa_id`+UNIQUE (90d) |
| EVD | JOIN | filtra | Leve (2) | Médio | Testes tenant+conflito |
| FRMS | `empresa_id` + índices compostos | filtra | Forte (11) | Baixo | — |
| Dashboard | `empresa_id` + exclui deletados | filtra | Médio (4) | Baixo | Estender contrato métricas |
| SGSO | `empresa_id` | filtra | Leve (4) | Médio | Testes tenant |
| LMS | `empresa_id` | filtra | Leve (2) | Médio | Testes tenant |
| Hospedagem | `empresa_id` | filtra | **Nenhum (0)** | **Médio** | Testes contrato+tenant |
| Storage / R2 | chave `empresas/{id}/` | — | indireto | **Médio (S2)** | Verificar ownership em `/api/assets/*` |
| Exports / PDF | herdam tenant da query origem | — | indireto | Baixo-Médio | Smoke de export por tenant |

Status legenda: READY · NEEDS TEST · NEEDS PATCH · NEEDS DESIGN · NEEDS MIGRATION.

---

## 4. Matriz RBAC

Papéis efetivos: `admin > manager > instructor > editor > student > viewer` (hierarquia em `tenant.ts`), colapsados para `admin > manager > user` em `rbac.ts`. **JWT carrega o papel POR EMPRESA** (`resolveAuthRoleForUser` lê `usuarios_empresas.role` do `empresaId` ativo; `select-empresa` re-emite o token) — `requireRole` é, na prática, tenant-aware.

| Ação | Papel esperado | Evidência atual | Lacuna | Correção |
|---|---|---|---|---|
| Criar empresa | Super-admin plataforma | `empresas.ts:601` `isPlatformSuperAdmin` (`codigo==='airtrust' \|\| userId===1`) | Super-admin é **hardcoded**, sem role/coluna dedicada | Coluna `is_super_admin` / role `platform_admin` |
| Listar todas empresas | Super-admin | `empresas.ts:475` filtra: super vê todas, admin vê a própria | OK (correto) | — |
| Convidar usuário | manager+ da empresa | `empresas-usuarios.ts:218` `requireTenantRole('manager')` + escopo | OK | — |
| Gerir acessos multi-empresa | super-admin (cross) / admin (própria) | `:549` bloqueia editar acesso de outra empresa se não-airtrust | OK | — |
| Trocar empresa ativa | usuário com vínculo | `auth.ts:1287` exige `usuarios_empresas`; user 1 acessa qualquer uma | user 1 **auto-insere** vínculo admin no tenant alvo | Logar/auditar; idealmente role explícito |
| Reset/manutenção admin | admin do tenant | `index.ts:836` `requireRole('admin')` + resets tenant-scoped | OK (hardened) | — |
| Suporte interno diagnosticar | papel "suporte" read-only | **inexistente** | Suporte precisa ser airtrust-admin ou user 1 = acesso amplo | Criar role `support` read-only |
| Revogar acesso | admin da empresa | `:714` DELETE `usuarios_empresas` | OK | — |
| Desativar empresa | super-admin | `:878` soft-delete, bloqueia se há funcionários | OK | — |
| Perfil global do usuário | — | `syncUsuarioPerfilFromAcessos` = **maior** role entre empresas | Mitigado (JWT é por-empresa), mas `usuarios.perfil` global pode confundir | Não usar `perfil` global para autorização |

---

## 5. Checklist de onboarding (estado atual)

> Hoje **não existe script/runbook oficial nem fluxo atômico**. Os blocos abaixo são executáveis manualmente com os endpoints existentes.

**Antes de criar empresa**
- [ ] Definir `codigo` (lowercase, `^[a-z0-9_-]+$`), `plano` (basic/pro/enterprise), `max_funcionarios`, `max_storage_mb`.
- [ ] Confirmar BREVO_API_KEY/SENDGRID configurado (senão convite não envia e-mail — usar `conviteUrl` retornado).

**Criação da empresa**
- [ ] `POST /api/empresas` (super-admin airtrust) → cria empresa + `empresas_config` com `modulos_ativos=['treinamento','compliance']`. **Sem** criação automática do 1º admin.

**Criação do primeiro admin** *(passo separado — não atômico)*
- [ ] `POST /api/empresas/:id/usuarios/invite` com `{ email, role:'admin', empresaIds:[novaId] }` (airtrust pode mirar outra empresa) → cria usuário (senha temp), vincula `usuarios_empresas`, gera convite 72h, envia e-mail.
- [ ] Usuário acessa `/aceitar-convite?token=...` e define senha.

**Configuração inicial por módulo**
- [ ] Definir `modulos_ativos` por empresa (`empresas_config`). Logo/cores/certificado via `PUT /api/empresas/:id/config` e upload de logo.
- [ ] Cadastrar setores/funções/categorias/aeronaves base (sem seed automático por tenant).

**Dados mínimos obrigatórios**
- [ ] Funcionários, funções, modelos de aeronave, tipos de qualificação — todos manuais.

**Smoke por tenant** *(inexistente hoje)*
- [ ] Validar login do admin, leitura de escala/FRMS/qualificação no tenant novo. **Recomendado criar.**

**Handover**
- [ ] Entregar credencial admin + guia de primeiro acesso (não há onboarding in-app).

**Suporte**
- [ ] Sem papel de suporte read-only: diagnóstico exige airtrust-admin/user 1 (acesso amplo).

**Offboarding**
- [ ] `DELETE /api/empresas/:id` (super-admin) — bloqueia se há funcionários ativos (remover antes). Sem export automático prévio.

---

## 6. Top bloqueios para novas empresas

| Rank | Bloqueio | Sev | Antes da 1ª? | Antes da 5ª? | Antes da 10ª? | Correção |
|---|---|---|---|---|---|---|
| 1 | Smoke autenticado ponta-a-ponta nunca rodado (pendente credencial) | S2 | **SIM** | sim | sim | Rodar 1× com token read-only e documentar |
| 2 | Sem runbook/checklist oficial de onboarding (processo 2-passos manual) | S2 | **SIM** | sim | sim | Escrever runbook + script idempotente de provisionamento |
| 3 | `/api/assets/*` — ownership de tenant não verificada nesta auditoria | S2 | **SIM** (verificar) | sim | sim | Teste: tenant A não lê asset de tenant B |
| 4 | DDL runtime (sigvoos/treinamentos/documentos) → schema pode divergir por tenant | S2 | parcial | **SIM** | sim | Migrations explícitas; remover `ensure*` |
| 5 | Super-admin/suporte = `userId===1` hardcoded, sem papel dedicado | S2 | não | **SIM** | sim | Role `platform_admin` + `support` read-only |
| 6 | `escala_alocacoes` sem `empresa_id`/UNIQUE (isolamento por JOIN) | S1 latente | não | parcial | **SIM** | Migration denormalização + UNIQUE parcial |
| 7 | Cobertura multi-tenant nula/leve: hospedagem(0), evd(2), lms(2), sgso(4) | S2 | não | **SIM** | sim | Testes contrato + tenant |
| 8 | Sem export/backup por tenant no offboarding | S3 | não | parcial | **SIM** | Export por empresa antes de desativar |
| 9 | Endpoints `.all()` sem paginação garantida (84 arquivos) + N+1 (~13) | S3 | não | parcial | **SIM** | Paginação + medir volume por tenant |
| 10 | Sem métricas de uso por empresa (observabilidade) | S3 | não | não | **SIM** | Dashboard de uso/limite por tenant |

Severidade: **S1** crítico (isolamento/vazamento) · **S2** alto (onboarding/suporte/operação multiempresa) · **S3** moderado (produto/UX/processo) · **S4** melhoria técnica.

---

## 7. Roadmap

**Antes da PRIMEIRA nova empresa**
1. Rodar o smoke autenticado uma vez (credencial read-only) e documentar (OPS).
2. Verificar isolamento de `/api/assets/*` entre tenants (teste rápido) (MT).
3. Escrever um runbook manual de onboarding (criar empresa → convidar admin → config mínima → smoke por tenant) (ON).
4. Ocultar/feature-flag seções "em breve" de Configurações (PR).

**Antes da 5ª empresa**
5. Criar papel `platform_admin` (coluna/role) e `support` read-only; parar de depender de `userId===1` (RB).
6. Migrations explícitas para SIGVOOS e link de treinamentos; remover DDL runtime (DDL).
7. Testes multi-tenant: hospedagem, EVD, LMS, SGSO (TEST).
8. Script idempotente de provisionamento de tenant (sem seed de demo em prod) (ON).

**Antes da 10ª empresa**
9. Migration `escala_alocacoes.empresa_id` + UNIQUE parcial (MT/S1 latente).
10. Paginação nos endpoints `.all()` de alto volume; resolver N+1; medir por tenant (PERF).
11. Export/backup por empresa no offboarding (OPS).
12. Métricas de uso/limite por empresa + dashboard de suporte (OPS).

**Pode esperar (dívida aceitável)**
- Unificar as duas taxonomias de role (rbac 3-níveis × tenant 6-níveis).
- Padronizar resposta de erro (não vazar `error.message`, ~31 sites).
- Quebra de arquivos gigantes, camada de repository, descomissionar tabelas `_v2/_v3`.

---

## 8. Features liberadas (avançar agora, baixo risco)

- Qualificações, Simuladores, Funcionários, Dashboard executivo — evoluir normalmente.
- Escalas/EVD e FRMS — evoluir **com testes acompanhando** (FRMS é a maior superfície).
- Fluxo de convite/usuários por empresa — já funcional (e-mail + token + multi-empresa).

## 9. Features condicionadas (só após readiness)

- **SIGVOOS / integração FRMS** — bloqueada até migration das tabelas `integracoes_sigvoos_*` (hoje DDL runtime).
- **Treinamentos planejados (link solicitações)** — condicionada à migration das colunas de link.
- **Onboarding self-service de empresa** — condicionado a runbook + script idempotente + papel super-admin/suporte.
- **Hospedagem / SGSO / LMS para cliente real** — condicionados a testes multi-tenant.
- **Abertura para 5+ empresas** — condicionada a super-admin/suporte dedicados e remoção de DDL runtime.

---

## 10. Próximo prompt operacional (para Codex)

Executa o **bloqueio #3 (Antes da 1ª empresa)**: verificar e blindar o isolamento de tenant no serving de assets — o de maior risco silencioso de vazamento, com correção pequena e testável.

```text
Prompt — Codex: garantir isolamento de tenant no serving de assets (/api/assets/*)

Repositório: <AIRTRUST_ROOT>  | Branch: main
Objetivo: garantir que um usuário autenticado de uma empresa NÃO consiga ler
arquivos/documentos de outra empresa via o endpoint de assets (R2 keys usam
prefixo empresas/{id}/...). Confirmar o comportamento atual e blindar com
verificação de ownership + teste.

Restrições:
- NÃO executar migration, NÃO tocar DB remoto, NÃO rodar wrangler d1 --remote.
- NÃO criar empresa/usuário real. Trabalhar em local/testes apenas.
- Mudança mínima e cirúrgica; não refatorar o módulo.

1) DIAGNOSTICAR
   - Localizar o handler de assets:
     grep -RIn "api/assets\|/assets/\|bucket.get\|BUCKET" worker-airtrust/src --include="*.ts" | grep -v __tests__
   - Ler o(s) handler(s) e responder no PR: hoje o endpoint exige auth? extrai
     o empresa_id do path? compara com o tenantContext.empresaId? documentos
     sensíveis (não-logo) são serviços por esse caminho?
   - Verificar se /api/assets está na whitelist pública (isPublicPath em index.ts).

2) CORRIGIR (somente se houver brecha)
   - Se o asset for escopado por empresas/{id}/, exigir auth+tenant e validar que
     o {id} do path == getTenantContext(c).empresaId (exceto super-admin airtrust).
   - Logos públicos podem ter exceção explícita; documentos/certificados NÃO.
   - Retornar 403/404 para acesso cross-tenant. Não vazar error.message.

3) TESTAR
   - Teste novo: usuário da empresa A → GET asset de empresa B → 403/404.
   - Usuário da própria empresa → 200. Super-admin airtrust → acesso conforme regra.
   - Rodar: npx tsc --noEmit && npm run build && npm run test:worker && npm run test:run

4) COMMITAR
   - git add nos arquivos alterados (sem -A).
   - fix(assets): enforce tenant ownership on asset serving
     Co-Authored-By: ...

5) PUSHAR / DEPLOY
   - Só pushar com gates verdes e árvore limpa coerente com origin/main.
   - NÃO deployar nesta tarefa. Deploy fica para etapa autorizada à parte.

6) SMOKE
   - AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh
   - Reportar: havia brecha? o que mudou? cobertura de teste adicionada.
```

---

## Entrega — respostas diretas

1. **Branch/HEAD auditados:** `main` @ `5777d77` (== `origin/main`, 0/0).
2. **Validações executadas (esta sessão, mesmo HEAD):** `tsc --noEmit` exit 0; `npm run build` OK; `test:run` 478 passed / 3 skipped; `test:worker` 605 passed; `preflight` OK; `ops:guard` PASS; smoke público (version+health 200).
3. **Arquivo criado:** `docs/AIRTRUST_OPUS_MULTI_COMPANY_RBAC_PRODUCT_READINESS_20260602.md` (untracked, não commitado).
4. **Decisão:** **B — pronto para piloto controlado com 1–3 empresas reais.**
5. **Nota geral de prontidão:** **3.4 / 5.**
6. **Top 5 bloqueios para onboardar novas empresas:** (1) smoke autenticado nunca rodado; (2) sem runbook oficial de onboarding (2-passos manual); (3) ownership de tenant em `/api/assets/*` não verificada; (4) DDL runtime pode criar schema divergente por tenant; (5) super-admin/suporte = `userId===1` hardcoded.
7. **Top 5 ações imediatas:** rodar smoke autenticado; verificar isolamento de `/api/assets/*`; escrever runbook de onboarding; ocultar seções "em breve" de Configurações; planejar role `platform_admin`+`support`.
8. **Módulos liberáveis:** Qualificações, Simuladores, Funcionários, Dashboard, Escalas/EVD e FRMS (estes dois vigiados), fluxo de convite/usuários.
9. **Módulos beta/ocultos:** Hospedagem (0 testes) e SIGVOOS (DDL runtime) → ocultar/bloquear; SGSO, LMS, Treinamentos planejados, Configurações → beta.
10. **Próximo prompt operacional:** §10 — garantir isolamento de tenant no serving de assets.

### Confirmação final
- ✅ Nenhum código alterado · ✅ nenhum commit · ✅ nenhum push · ✅ nenhum deploy · ✅ nenhuma migration · ✅ nenhum DB remoto/real tocado · ✅ nenhuma empresa/usuário criado.
- Único artefato criado: este relatório markdown **untracked** em `docs/`.
