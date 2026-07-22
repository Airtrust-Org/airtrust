# AirTrust — Opus Mega Audit: Multiempresa, Onboarding, RBAC, Produto, Compliance, Demo e Roadmap

- **Data:** 2026-06-02
- **Repositório:** `<AIRTRUST_ROOT>`
- **Branch / HEAD auditado:** `main` @ `5777d775876c7088907c039d0306dfd7bc0b2f9d` (== `origin/main`, 0 ahead / 0 behind)
- **Working tree:** sem alterações *tracked*; apenas *untracked* (`docs/`, `knowledge/`, `scripts/seed-*.sql`, `scripts/validation/*`).
- **Modo:** read-only, auditoria estratégica + técnica + produto + compliance. Nenhum código alterado, nenhum commit/push/deploy/migration, nenhum DB remoto/real tocado, nenhuma empresa/usuário criado.
- **Pergunta central:** *"O AirTrust está pronto para receber novas empresas reais com segurança, clareza operacional e aparência de produto maduro?"*

> **Método.** Esta auditoria **consolida e revalida** as 5 auditorias Opus anteriores (geral 06-01, reauditoria v2 06-02, arquitetura/eficiência 06-02, RBAC/produto 06-02, roadmap estratégico 06-02) **e adiciona** o que elas cobriram de leve: roteiro de demo/piloto, compliance/LGPD aprofundado e isolamento de assets. Os pontos de maior severidade foram **reverificados linha-a-linha no código atual**. Classificação: `CONFIRMADO` = li o código/linha nesta passada; `HERDADO` = vindo de auditoria anterior no mesmo HEAD, não re-verificado aqui; `SUSPEITA` = evidência consistente sem confirmação exaustiva.
>
> Nota sobre o doc de scale readiness: o prompt referenciava `docs/AIRTRUST_OPUS_MULTI_COMPANY_SCALE_READINESS_20260602.md` — **esse arquivo não existe**. O conteúdo equivalente está em `AIRTRUST_OPUS_MULTI_COMPANY_RBAC_PRODUCT_READINESS_20260602.md` e `AIRTRUST_OPUS_STRATEGIC_ROADMAP_20260602.md`, ambos usados como base.

---

## Parte A — Estado inicial e validações (executadas nesta sessão)

| Verificação | Resultado |
|---|---|
| `git branch` / `HEAD` / `origin/main` | `main` @ `5777d77` == `origin/main`, **0 ahead / 0 behind** |
| `git status` | árvore limpa (tracked); apenas untracked (docs/knowledge/seeds/validation) |
| `scripts/preflight-clean-deploy.sh` | **PASS** (exit 0; untracked = warning não-bloqueante) |
| `npm run ops:guard` | **PASS** — "no `--commit-dirty=true`"; "no unsafe direct remote D1 execute paths" |
| `npx tsc --noEmit` | **PASS** (sem erros de tipo) |
| `npm run build` (vite + tsc) | **PASS** — built in ~12.5s |
| `npm run test:run` (frontend) | **PASS** — 478 passed, 3 skipped (50 arquivos) |
| `npm run test:worker` | **PASS** — **605 passed** (83 arquivos) |
| `AIRTRUST_PUBLIC_ONLY=YES smoke-authenticated-operational.sh` | **PASS** — version+health 200 |
| Smoke autenticado funcional (login + leitura/escrita por tenant) | **NÃO EXECUTADO** — pendente de credencial |

Observações registradas (não corrigidas, conforme modo read-only):
- `console.error` em testes de caminho negativo (`fail-open-hardening`, `sessoes-list`, `matriz-treinamento`) são **esperados** (asserção de erro) — não são falhas.
- `npm run test` (sem `:run`) entra em watch e travaria — usar sempre `test:run`/`test:all`.

**Conclusão A:** base verde em todos os gates automatizados. O único gate não-coberto é a **validação autenticada ponta-a-ponta em produção** (falta `AIRTRUST_AUTH_TOKEN`/`AIRTRUST_COOKIE`).

---

## Parte B — Síntese das auditorias anteriores

**Já mitigados e cobertos por teste (CONFIRMADO nos commits/testes):**
- P0 reset admin cross-tenant → tenant-scoped (`admin.ts` + `requireRole('admin')` no mount + teste dedicado).
- P1 FRMS fail-open (sono→8h, apto=1) → fail-safe (payload incompleto → 400; `fit_for_duty` obrigatório).
- Tenant-scope de `escala_alocacoes` por JOIN `escalas_mensais` (teste cross-tenant → 404).
- Simulador PLANEJADA→CONCLUÍDA sincroniza qualificação (6 casos de teste).
- Integridade de métricas do dashboard (tenant + exclusão de deletados/cancelados).
- DDL runtime classe A removido de hot paths + teste de arquitetura `no-runtime-ddl-hot-paths`.
- Endpoint de "fix temporário" (`POST /api/fix/populate-qualificacao-ids`) removido (0 ocorrências).
- `--commit-dirty=true` eliminado de `package.json`/`scripts` (só resta o guard que o proíbe).
- `backfill-session-checks` agora recebe `tenantScope.empresaId`.

**Pendências/risco herdados (ainda abertos):**
- Onboarding multiempresa = processo manual de 2 passos **sem runbook/script atômico**.
- Super-admin/suporte = `userId === 1` **hardcoded**; sem papel `platform_admin`/`support` dedicado.
- DDL runtime **residual** classe B/C: `sigvoos-frms`, `treinamentos-planejados-integration`, `documentos`.
- `escala_alocacoes` sem coluna `empresa_id` própria nem `UNIQUE` parcial (isolamento por convenção/JOIN).
- Cobertura multi-tenant nula/leve: hospedagem (0), EVD (2), LMS (2), SGSO (4).
- Sem enum central de status (magic strings ×400+) → risco de contagem errada em métricas.
- ~31 sites vazam `error.message` interno ao cliente em `details`.
- Smoke autenticado nunca rodado.

---

## 1. Decisão executiva

> **Decisão: B — pronto para PILOTO CONTROLADO com 1–3 empresas reais, acompanhado pela equipe AirTrust.**
> **Nota geral de prontidão: 3.3 / 5.**

**Por que não A (onboarding aberto/self-service):** o onboarding é manual e sem runbook; não há papel de super-admin/suporte dedicado (é `userId===1`); a validação autenticada ponta-a-ponta nunca foi rodada; há módulos com cobertura multi-tenant zero/leve; e — achado **novo e CONFIRMADO nesta passada** — `/api/assets/*` é um **passthrough público para o R2 inteiro por chave, sem autenticação nem verificação de tenant** (§7). Isso é incompatível com onboarding aberto até ser blindado.

**Por que não C/D (bloquear/pausar):** o núcleo está sólido e endurecido. Não há **P0/P1 de código ativo**. Auth + tenant globais, RBAC por-empresa no JWT, isolamento por `empresa_id` testado nos módulos principais (funcionários 16, qualificações 15, admin 12, FRMS 11, simuladores 7, escalas 6 testes de tenant — HERDADO), convite por e-mail com token 72h, multi-empresa por usuário, storage R2 com chave por empresa, audit trail presente, e CI com guards de demo-data/secret/dev-bypass.

**Resposta à pergunta central:** **Sim, com piloto acompanhado de 1–3 empresas.** Antes da 1ª nova empresa que faça upload de documentos/fichas, **blindar `/api/assets/*`** (B-OBJ-AUTH) e **rodar o smoke autenticado uma vez**. Antes da 5ª–10ª, fechar super-admin/suporte, DDL runtime e cobertura de testes.

---

## 2. Módulos por status

| Módulo | Status | Nota 0–5 | Liberar? | Risco principal | Antes de cliente real |
|---|---|---|---|---|---|
| Funcionários | READY | 4.2 | LIBERAR PILOTO | — (16 testes tenant) | Nenhuma crítica |
| Qualificações | READY | 4.0 | LIBERAR PILOTO | Bordas de vencimento/timezone | Smoke autenticado |
| Simuladores | READY | 4.0 | LIBERAR PILOTO | — (transição testada) | Smoke autenticado |
| Dashboard executivo | READY | 3.8 | LIBERAR PILOTO | Métricas além das testadas | Validar com dados reais |
| FRMS / Fadiga Diária | READY (vigiar) | 3.6 | LIBERAR PILOTO | Maior superfície; PDF FIRA via assets público | Blindar assets; vigiar com dados reais |
| Escalas | READY (vigiar) | 3.5 | LIBERAR PILOTO | `escala_alocacoes` sem `empresa_id` próprio | Reforçar testes |
| Admin / manutenção | READY (interno) | 3.5 | USO INTERNO | Sem papel de suporte dedicado | Restringir acesso |
| Usuários / empresas / permissões | READY (manual) | 3.2 | USO INTERNO | Onboarding 2-passos sem runbook | Runbook de onboarding |
| EVD / Escalas-EVD | NEEDS TEST | 3.0 | PILOTO CONTROLADO | Cobertura tenant leve (2) | Testes de conflito + tenant |
| SGSO | NEEDS TEST | 2.8 | BETA/OCULTAR | Tela mostra "em desenvolvimento com dados de teste" | Testes + remover aviso de teste |
| LMS / EAD | NEEDS TEST | 2.8 | BETA | Cobertura tenant leve (2) | Testes tenant + matrícula |
| Treinamentos planejados | NEEDS MIGRATION | 2.8 | BETA | DDL runtime (link cols) | Migration antes de novo tenant |
| Hospedagem | NEEDS TEST | 2.5 | BETA/OCULTO | **0 testes** | Testes contrato + tenant |
| SIGVOOS (integração FRMS) | NEEDS MIGRATION | 2.5 | OCULTO/BLOQUEAR | Tabelas criadas em runtime (DDL classe C) | Migration explícita |
| Configurações | PARCIAL | 2.5 | BETA | Seções "em breve" visíveis | Ocultar seções incompletas |

Legenda: READY · NEEDS TEST · NEEDS PATCH · NEEDS DESIGN · NEEDS MIGRATION.

---

## 3. Matriz multi-tenant

| Módulo | Tenant backend | Tenant frontend | Teste multi-tenant | Risco | Próxima ação |
|---|---|---|---|---|---|
| Funcionários | `empresa_id` direto | filtra | Forte (16) | Baixo | — |
| Qualificações | via histórico + JOIN | filtra | Forte (15) | Baixo | Documentar design |
| Simuladores | `empresa_id` + JOIN | filtra | Forte (7) | Baixo | — |
| FRMS | `empresa_id` + índices compostos | filtra | Forte (11) | Baixo→Médio* | *PDF FIRA exposto via assets público |
| Dashboard | `empresa_id` + exclui deletados | filtra | Médio (4) | Baixo | Estender contrato métricas |
| Escalas / Alocações | JOIN `escalas_mensais` (sem coluna própria) | filtra | Médio (6/2) | **Médio (S1 latente)** | Migration `empresa_id`+UNIQUE (90d) |
| EVD | JOIN | filtra | Leve (2) | Médio | Testes tenant+conflito |
| SGSO | `empresa_id` | filtra | Leve (4) | Médio | Testes tenant |
| LMS | `empresa_id` | filtra | Leve (2) | Médio | Testes tenant |
| Hospedagem | `empresa_id` | filtra | **Nenhum (0)** | **Médio** | Testes contrato+tenant |
| Storage / R2 (uploads) | chave `empresas/{id}/`, `fira/{empresaId}/`, `funcionarios/{id}/` | — | indireto | **Alto (S1) — `/api/assets/*` público** | **Blindar ownership (B-OBJ-AUTH)** |
| Exports / PDF | herdam tenant da query origem | — | indireto | Baixo-Médio | Smoke de export por tenant |

---

## 4. Matriz RBAC

Papéis efetivos: `admin > manager > instructor > editor > student > viewer` (hierarquia em `tenant.ts`), colapsados para `admin > manager > user` em `rbac.ts`. **O JWT carrega o papel POR EMPRESA** (`select-empresa` re-emite o token), então `requireRole` é, na prática, tenant-aware (HERDADO/CONFIRMADO).

| Ação | Papel esperado | Evidência atual | Lacuna | Correção |
|---|---|---|---|---|
| Criar empresa | Super-admin plataforma | `empresas.ts:157,610` `isPlatformSuperAdmin` (`empresaCodigo==='airtrust' \|\| userId===1`) — CONFIRMADO | Super-admin **hardcoded**, sem role/coluna | Coluna `is_super_admin` / role `platform_admin` |
| Listar todas as empresas | Super-admin | `empresas.ts:475` super vê todas, admin vê a própria | OK | — |
| Convidar usuário | manager+ da empresa | `empresas-usuarios.ts` `requireTenantRole('manager')` + escopo | OK | — |
| Trocar empresa ativa | usuário com vínculo | `auth.ts:108,1217,1298` `userId===1` é platform admin; user 1 acessa qualquer uma | user 1 = acesso amplo implícito | Logar/auditar; role explícito |
| Reset/manutenção admin | admin do tenant | `index.ts:836` `requireRole('admin')` + resets tenant-scoped (CONFIRMADO) | OK (hardened) | — |
| Suporte interno diagnosticar | papel `support` read-only | **inexistente** (CONFIRMADO: nenhum `'support'`/`platform_admin` no worker) | Suporte hoje = airtrust-admin/user 1 = acesso amplo | Criar role `support` read-only |
| Revogar acesso | admin da empresa | `empresas-usuarios.ts` DELETE `usuarios_empresas` | OK | — |
| Desativar empresa | super-admin | `empresas.ts:883` soft-delete, bloqueia se há funcionários | OK | Adicionar export prévio |
| Servir asset/documento | usuário do tenant dono | `routes/assets.ts:11` **sem auth, sem tenant** | **`/api/assets/*` é público por chave** | **B-OBJ-AUTH (ver §7)** |

---

## 5. Checklist de onboarding

> Hoje **não existe script/runbook oficial nem fluxo atômico** (HERDADO/CONFIRMADO). Os blocos abaixo são executáveis manualmente com os endpoints existentes.

**Antes de criar empresa**
- [ ] Definir `codigo` (lowercase `^[a-z0-9_-]+$`), `plano` (basic/pro/enterprise), `max_funcionarios`, `max_storage_mb`.
- [ ] Confirmar `BREVO_API_KEY`/`SENDGRID` (senão convite não envia e-mail — usar `conviteUrl` retornado).
- [ ] **(novo bloqueio)** Confirmar que `/api/assets/*` foi blindado se o tenant for fazer upload de documentos/fichas/FIRA.

**Criação da empresa**
- [ ] `POST /api/empresas` (super-admin airtrust) → cria empresa + `empresas_config` com `modulos_ativos=['treinamento','compliance']`. **Sem** criação automática do 1º admin.

**Criação do primeiro admin** *(passo separado — não atômico)*
- [ ] `POST /api/empresas/:id/usuarios/invite` `{ email, role:'admin', empresaIds:[novaId] }` → cria usuário (senha temp), vincula `usuarios_empresas`, gera convite 72h, envia e-mail.
- [ ] Admin acessa `/aceitar-convite?token=...` e define senha.

**Configuração inicial por módulo**
- [ ] Definir `modulos_ativos` por empresa (`empresas_config`); logo/cores/certificado via `PUT /api/empresas/:id/config`.
- [ ] Cadastrar setores/funções/categorias/aeronaves/tipos de qualificação base (sem seed automático por tenant).

**Dados mínimos obrigatórios**
- [ ] Funcionários, funções, modelos de aeronave, tipos de qualificação — todos manuais.

**Smoke por tenant** *(inexistente hoje — recomendado criar)*
- [ ] Validar login do admin + leitura de escala/FRMS/qualificação no tenant novo; confirmar que nenhum dado de outro tenant aparece.

**Handover**
- [ ] Entregar credencial admin + guia de primeiro acesso (não há onboarding in-app).

**Suporte**
- [ ] Sem papel `support` read-only: diagnóstico exige airtrust-admin/user 1 (acesso amplo) — registrar acesso.

**Offboarding**
- [ ] `DELETE /api/empresas/:id` (super-admin) — bloqueia se há funcionários ativos. **Sem export/backup automático prévio.**

---

## 6. Readiness para demo / piloto

Diagnóstico de demo: o produto **demonstra bem** nos módulos READY, mas há **3 telas que passam má impressão** e devem ser evitadas/ocultadas.

**Telas para MOSTRAR (confiáveis):**
1. Login → seleção de empresa (mostra multi-tenant real).
2. Dashboard executivo (métricas com tenant, testadas).
3. Funcionários (CRUD + ficha) — base mais sólida.
4. Qualificações (vencimentos, alertas, certificados).
5. Simuladores (sessão planejada → concluída → qualificação sincronizada).
6. FRMS / Fadiga Diária (check-in + explicação do dia) — a "joia" diferenciada, **com dados reais preparados**.
7. Escalas / EVD (visualização de grade) — modo leitura.

**Telas para EVITAR / ESCONDER do menu na demo (CONFIRMADO):**
- `Sgso.tsx:630` — exibe literalmente **"(em desenvolvimento com dados de teste)"**.
- `ConfiguracoesPage.tsx:330` / `ConfiguracoesLayout.tsx:25,32` — seções **"disponível em breve"**.
- `ManutencaoDados.tsx:26` — **"Mais ferramentas em breve"** (tela interna).
- Hospedagem (0 testes) e SIGVOOS (DDL runtime) — não demonstrar.

**Dados mínimos de demo (empresa fictícia, NUNCA em tenant real):**
- 1 empresa demo isolada + 8–12 funcionários, 2–3 modelos de aeronave, tipos de qualificação com vencimentos variados (alguns vencidos/a vencer para colorir o dashboard), 1 escala mensal preenchida, algumas sessões de simulador concluídas, e check-ins FRMS de 1–2 semanas. Usar os `scripts/seed-*.sql` **em ambiente local/dev**, nunca via `--remote`.

### Roteiro de demo — 15 minutos
1. **(2min) Login + multi-empresa** — entrar, selecionar empresa, mostrar troca de empresa.
2. **(3min) Dashboard executivo** — compliance, vencimentos, demanda; narrar "visão única da operação".
3. **(3min) FRMS / Fadiga** — check-in do tripulante + explicação do dia (diferencial científico-operacional).
4. **(3min) Qualificações** — vencimentos coloridos, alerta, certificado PDF.
5. **(2min) Simuladores** — concluir sessão e mostrar qualificação atualizando automaticamente.
6. **(2min) Escalas/EVD** — grade do mês (modo leitura), fechar com a narrativa de governança.

### Roteiro de demo — 30 minutos
1. **(3min)** Login + multi-empresa + papéis (admin × usuário).
2. **(5min)** Dashboard executivo aprofundado.
3. **(6min)** FRMS completo: check-in, série temporal, explicação, indicadores.
4. **(5min)** Qualificações: ciclo de vencimento, renovação, certificado, importação.
5. **(4min)** Simuladores: planejamento → conclusão → qualificação.
6. **(4min)** Escalas/EVD: montagem de escala, detecção de conflito.
7. **(3min)** Convite de usuário por e-mail (mostrar fluxo de onboarding de pessoa).

### Checklist pré-demo
- [ ] Logar com empresa **demo** (nunca tenant real).
- [ ] Confirmar `GET /api/version` e `/api/health` 200 (ambiente no ar).
- [ ] Esconder do menu: SGSO, Hospedagem, SIGVOOS, seções "em breve" de Configurações.
- [ ] Conferir que dashboard tem dados (não vazio).
- [ ] Testar 1 fluxo de escrita antes (evitar erro ao vivo).
- [ ] Desativar qualquer aviso de "dados de teste" nas telas mostradas.

### Checklist pós-demo
- [ ] Não deixar dados de demo em tenant real.
- [ ] Registrar bugs vistos.
- [ ] Coletar quais módulos o cliente pediu (priorização).

---

## 7. Compliance / LGPD / dados sensíveis

**Dados pessoais tratados (CONFIRMADO por grep de schema/rotas):** nome, e-mail, telefone, CANAC (licença ANAC), dados de funcionário, certificados/qualificações; **dados operacionais sensíveis (fadiga/sono/KSS)** no FRMS — categoria de maior sensibilidade (saúde-adjacente).

**Achados de compliance:**

| # | Achado | Sev | Evidência | Classificação |
|---|---|---|---|---|
| C1 | **`/api/assets/*` é passthrough público do R2 por chave, sem auth/tenant** | **Alto** | `routes/assets.ts:11-47` (CONFIRMADO) + `index.ts:255` na whitelist pública (CONFIRMADO) | **BLOQUEIA CLIENTE REAL** (que faça upload) |
| C2 | **PDFs FIRA de fadiga em chave semi-adivinhável** servidos pelo C1 | **Alto** | `lib/frms/fira-service.ts:405` `fira/{empresaId}/{canac}/{ano}-{mes}/...` (CONFIRMADO) | **BLOQUEIA SCALE** |
| C3 | Fichas de funcionário em `funcionarios/{id}/{uuid}.pdf` | Médio | `pasta-virtual-extra.ts:188` — UUID protege por obscuridade, mas sem auth no caminho público | ROADMAP |
| C4 | `error.message` interno vazado ao cliente em `details` (~31 sites client-facing) | Médio | HERDADO arch #12 / grep amplo 222 ocorrências (inclui logs server-side legítimos) | ROADMAP |
| C5 | Audit trail existe mas cobertura parcial | Médio | `utils/db.ts:120 logAudit` (`audit_logs`), `utils/auditoria.ts`, FRMS `logAuditoria` rico (CONFIRMADO) | ACEITÁVEL (estender) |
| C6 | Soft-delete presente (`deleted_at`) e filtrado nas queries principais | — | HERDADO/CONFIRMADO em dashboard/escalas | ACEITÁVEL |
| C7 | Sem export/backup por tenant no offboarding | Médio | HERDADO RBAC #8 | ROADMAP (antes da 10ª) |
| C8 | Sem política documentada de retenção/exclusão a pedido (LGPD art. 18) | Médio | não encontrada em `docs/` | ROADMAP (antes de vender) |

**Risco PII / FRMS:** o ponto mais sério é a combinação **C1+C2**: relatórios de fadiga (sono/jornada) de tripulantes, ligados a CANAC, ficam acessíveis publicamente por chave semi-previsível (empresaId pequeno + CANAC + período). Não é trivialmente explorável (precisa da chave), mas **"segurança por obscuridade" sobre dado sensível não atende LGPD** e configura vetor cross-tenant.

**Ações mínimas antes de cliente real:**
1. **Blindar `/api/assets/*` (B-OBJ-AUTH):** exigir auth+tenant e validar que o prefixo `{tipo}/{empresaId}/...` == `getTenantContext(c).empresaId` (exceto super-admin). Logos podem ter exceção explícita; FIRA/fichas/certificados **não**. (próximo prompt §12).
2. Padronizar resposta de erro (remover `details: error.message` client-facing).
3. Documentar política mínima de retenção/exclusão e de acesso de suporte (LGPD).

**Classificação geral:** C1/C2 = **BLOQUEIA** onboarding de tenant que suba documentos; demais = **ROADMAP/ACEITÁVEL**.

---

## 8. Top bloqueios para novas empresas

| Rank | Bloqueio | Sev | Antes da 1ª? | Antes da 5ª? | Antes da 10ª? | Correção |
|---|---|---|---|---|---|---|
| 1 | `/api/assets/*` público sem ownership (FIRA/fichas expostos) | **S1** | **SIM** | sim | sim | B-OBJ-AUTH: auth+tenant+validação de prefixo + teste cross-tenant |
| 2 | Smoke autenticado ponta-a-ponta nunca rodado | S2 | **SIM** | sim | sim | Rodar 1× com token read-only e documentar |
| 3 | Sem runbook/checklist oficial de onboarding (2-passos manual) | S2 | **SIM** | sim | sim | Runbook + script idempotente de provisionamento |
| 4 | Seções "em desenvolvimento/dados de teste" visíveis (SGSO, Config) | S3 | **SIM** (esconder p/ demo) | sim | sim | Feature-flag/ocultar seções incompletas |
| 5 | Super-admin/suporte = `userId===1` hardcoded, sem role dedicada | S2 | não | **SIM** | sim | Role `platform_admin` + `support` read-only |
| 6 | DDL runtime residual (sigvoos/treinamentos/documentos) | S2 | parcial | **SIM** | sim | Migrations explícitas; remover `ensure*` |
| 7 | Cobertura multi-tenant nula/leve: hospedagem(0), evd(2), lms(2), sgso(4) | S2 | não | **SIM** | sim | Testes contrato + tenant |
| 8 | `escala_alocacoes` sem `empresa_id`/UNIQUE (isolamento por JOIN) | S1 latente | não | parcial | **SIM** | Migration denormalização + UNIQUE parcial |
| 9 | Sem enum central de status (contagem errada em métricas) | S2 | não | **SIM** | sim | Módulo de status worker+frontend |
| 10 | Sem export/backup por tenant no offboarding; sem métricas de uso por empresa | S3 | não | parcial | **SIM** | Export por empresa + dashboard de uso |

Severidade: **S1** crítico (isolamento/vazamento) · **S2** alto (onboarding/suporte/operação) · **S3** moderado (produto/UX/processo).

---

## 9. Roadmap

**Antes da PRIMEIRA nova empresa real**
1. **Blindar `/api/assets/*`** (ownership de tenant + teste cross-tenant) — bloqueio #1.
2. Rodar o smoke autenticado uma vez (credencial read-only) e documentar.
3. Escrever runbook manual de onboarding (criar empresa → convidar admin → config mínima → smoke por tenant).
4. Ocultar/feature-flag seções "em breve"/"dados de teste" (SGSO, Configurações, ManutençãoDados).
5. Padronizar resposta de erro (parar de vazar `error.message`).

**Antes da 5ª empresa**
6. Role `platform_admin` + `support` read-only; parar de depender de `userId===1`.
7. Migrations explícitas para SIGVOOS e link de treinamentos; remover DDL runtime classe B/C.
8. Testes multi-tenant: hospedagem, EVD, LMS, SGSO.
9. Módulo central de status (começar pelos caminhos de métrica/contagem).
10. Script idempotente de provisionamento de tenant (sem seed de demo em prod).

**Antes da 10ª empresa**
11. Migration `escala_alocacoes.empresa_id` + `UNIQUE(...) WHERE deleted_at IS NULL`.
12. Paginação nos endpoints `.all()` de alto volume; resolver N+1 (~13 arquivos); medir por tenant.
13. Export/backup por empresa no offboarding + política de retenção/exclusão (LGPD).
14. Métricas de uso/limite por empresa + dashboard de suporte.

**Pode esperar (dívida aceitável)**
- Camada de repositório (2302 `.prepare()`), quebra dos arquivos gigantes, consolidação de PDF, descomissionar tabelas `_v2/_v3/_bak/_temp`, unificar as duas taxonomias de role, logger estruturado.

---

## 9b. Auditoria de operação e suporte multiempresa (Parte I)

**Observabilidade existente (CONFIRMADO/HERDADO):**

| Item | Situação | Evidência |
|---|---|---|
| Audit trail de ações | Presente — `audit_logs` (DB) + `logAuditoria` FRMS | `utils/db.ts:120`, `utils/auditoria.ts:22`, `lib/frms/db-service-*.ts` |
| Health/version endpoints | `GET /api/health` + `/api/version` — 200 em produção | Confirmado no smoke desta sessão |
| Tenant incluído nos logs | Parcial — FRMS tem `empresa_id` no audit; demais rotas usam `console.log` sem tenant estruturado | Grep worker: 378 `console.log`, sem logger estruturado centralizado |
| Request ID | **Ausente** — não encontrado `request_id`/`x-request-id` nos headers/logs | Grep: 0 ocorrências |
| Métricas de uso por empresa | **Ausentes** — não há dashboard de uso/limite por tenant | — |
| Diagnóstico por tenant sem DB | **Inexistente** — suporte precisa de DB ou ser `userId===1` | — |
| Runbook de incidente | **Inexistente** em `docs/` | — |
| Export/backup por empresa | **Inexistente** — sem rota de export bulk por tenant | — |
| Smoke por tenant | Script genérico existe (`smoke-test-core.sh`), mas não parametrizado por tenant | `scripts/smoke-test-core.sh` |
| Processo de suporte interno | **Inexistente** — sem papel `support`, sem trilha de acesso de suporte | — |

**Risco de suporte acessar dado indevido:** alto — quem diagnostica hoje é `airtrust-admin` ou `userId===1`, que tem acesso total a todos os tenants. Sem audit trail de acesso de suporte, sem scope de leitura.

**Checklist de prontidão operacional:**

| Item | Mínimo para 1ª empresa | Mínimo para 5 empresas | Mínimo para 10+ empresas |
|---|---|---|---|
| Health/version 200 em produção | ✅ já OK | ✅ | ✅ |
| Smoke público (version+health) | ✅ já OK | ✅ | ✅ |
| Smoke autenticado por tenant | ⚠️ pendente credencial | obrigatório | obrigatório + automatizado |
| Audit trail de ações admin | ⚠️ parcial (FRMS rico; outras rotas leve) | estender a todas mutações críticas | cobertura completa |
| Request ID em logs | ⚠️ ausente | implementar | obrigatório |
| Runbook de incidente por módulo | ⚠️ criar rascunho | versão 1.0 | iterado com experiência |
| Papel `support` read-only | ⚠️ ausente (usar com cuidado user 1) | obrigatório | obrigatório + audit de acesso |
| Métricas de uso por empresa | não crítico | criar dashboard básico | obrigatório (limites/alertas) |
| Export/backup antes de offboarding | não crítico | recomendado | obrigatório |
| Diagnóstico sem acesso ao banco | não crítico | recomendado | obrigatório |

---

## 9c. Auditoria de performance e custo para escala (Parte J)

**Riscos de query (HERDADO de arch audit + reverificado por grep):**

| Risco | Módulo | Evidência | Tier critico |
|---|---|---|---|
| DDL por requisição (`ensure*Schema`) — OVERHEAD por request | treinamentos, frms-fira, preferencias, alertas | ~60 call sites restantes (classe B/C) | **antes da 5ª** |
| N+1 em loops com query por item | compliance, simuladores-sessoes-update, notificacoes-convocacao | 13 arquivos com `for`/`.map` + `.prepare()` dentro | antes da 10ª |
| Endpoints sem paginação garantida (`.all()`) | 84+ arquivos | `grep -c ".all("` worker-airtrust/src | antes da 10ª |
| Dashboard sem cache (recalcula tudo) | dashboard executivo | sem `Cache-Control` em respostas de métrica | antes da 10ª |
| `escala_alocacoes` sem índice `empresa_id` próprio | escalas | coluna ausente; JOIN obrigatório | antes da 10ª |
| `treinamentos_planejados` sem índice `(empresa_id, data_prevista, deleted_at)` | treinamentos | — | pode esperar |

**Índices de tenant existentes (ponto positivo — HERDADO):** `funcionarios`, `qualificacoes_historico`, `sessoes`, `frms_jornada` têm índices compostos em `empresa_id`. Base quente bem coberta.

**Cloudflare D1 / Workers:**
- D1 suporta múltiplos tenants numa mesma instância com bom desempenho para volumes de aviação (centenas de funcionários por empresa). Não há sharding necessário em 10 empresas.
- Workers: stateless por design — escala horizontalmente. O gargalo é D1 read-throughput e DDL runtime (eliminar é a ação de maior retorno).
- Custos que crescem com empresas: D1 writes (mutações por request aumentam linear), R2 storage (FIRA PDFs + docs), Workers invocations (proporcional ao número de usuários ativos).

**Classificação de riscos por tier:**

| Risco | Antes da 1ª | Antes da 5ª | Antes da 10ª | Pode esperar |
|---|---|---|---|---|
| DDL runtime classe A (**já removido**) | — | — | — | ✅ feito |
| DDL runtime classe B/C (sigvoos/treinamentos/docs) | não crítico | **alto** — remover | — | — |
| N+1 em compliance/simuladores/notificações | não crítico | medir | **resolver** | — |
| Paginação em endpoints `.all()` de alto volume | não crítico | não crítico | **implementar** | — |
| Cache de dashboard executivo | não crítico | não crítico | recomendado | **pode esperar** |
| Índice `empresa_id` em treinamentos_planejados | não crítico | não crítico | não crítico | **pode esperar** |
| Camada de repositório (2302 `.prepare()`) | não crítico | não crítico | iniciar | **pode esperar** |

---

## 10. Features liberadas (avançar agora, baixo risco)

- **Funcionários, Qualificações, Simuladores, Dashboard executivo** — evoluir normalmente.
- **Escalas/EVD e FRMS** — evoluir **com testes acompanhando** (FRMS é a maior superfície).
- **Convite/usuários por empresa** — funcional (e-mail + token 72h + multi-empresa).

## 11. Features condicionadas / bloqueadas (só após readiness)

- **Onboarding self-service de empresa** — condicionado a runbook + script idempotente + role super-admin/suporte.
- **Upload/serving de documentos para cliente real** — **bloqueado até B-OBJ-AUTH** (assets ownership).
- **SIGVOOS / integração FRMS** — bloqueado até migration das tabelas `integracoes_sigvoos_*` (hoje DDL runtime).
- **Treinamentos planejados (link solicitações)** — condicionado à migration das colunas de link.
- **Hospedagem / SGSO / LMS para cliente real** — condicionados a testes multi-tenant.
- **Abertura para 5+ empresas** — condicionada a super-admin/suporte dedicados e remoção de DDL runtime.

---

## 12. Próximo prompt operacional (para Codex)

Executa o **bloqueio #1 (antes da 1ª empresa)**: blindar o isolamento de tenant no serving de assets — o maior risco silencioso de vazamento (inclui PDFs de fadiga FIRA), com correção pequena e testável.

```text
Prompt — Codex: blindar isolamento de tenant no serving de assets (/api/assets/*)

Repositório: <AIRTRUST_ROOT>  | Branch: main
Objetivo: /api/assets/* hoje é PÚBLICO (na whitelist de index.ts) e serve QUALQUER
chave do R2 sem auth nem verificação de tenant (routes/assets.ts). Isso expõe
documentos/fichas e, criticamente, PDFs FIRA de fadiga em chaves semi-adivinháveis
(fira/{empresaId}/{canac}/...). Garantir que só o tenant dono (ou super-admin)
acesse cada asset não-público; manter logos públicos por exceção explícita.

Restrições:
- NÃO executar migration, NÃO tocar DB remoto, NÃO rodar wrangler d1 --remote.
- NÃO criar empresa/usuário real. Trabalhar em local/testes apenas.
- Mudança mínima e cirúrgica; não refatorar o módulo. NÃO mudar formatos de sucesso.

1) DIAGNOSTICAR
   - Ler routes/assets.ts e a whitelist isPublicPath em index.ts (linha ~255).
   - Mapear os prefixos de chave realmente usados (grep):
     grep -RIn "bucket.put\|BUCKET.put\|r2Key =\|r2_key =" worker-airtrust/src --include="*.ts" | grep -v __tests__
     Confirmar: empresas/{id}/ (logo, público OK), fira/{empresaId}/{canac}/...,
     funcionarios/{id}/{uuid}.pdf, certificados/{nome}.
   - Documentar no PR quais prefixos são sensíveis e quais podem ser públicos.

2) CORRIGIR
   - Tirar /api/assets/* da whitelist pública OU dividir em dois caminhos:
     * /api/assets/public/* (logos) → público.
     * /api/assets/* (default) → exige auth() + tenant; extrair empresaId do prefixo
       da chave (empresas/{id}/, fira/{empresaId}/, funcionarios/{id} via lookup) e
       validar == getTenantContext(c).empresaId (exceto super-admin airtrust).
   - Acesso cross-tenant → 404 (não 403, para não confirmar existência). Não vazar
     error.message. Para funcionarios/{id}, resolver empresa via tabela funcionarios.

3) TESTAR
   - Teste novo (worker): usuário empresa A → GET asset FIRA/ficha de empresa B → 404;
     usuário da própria empresa → 200; super-admin airtrust → conforme regra;
     logo público → 200 sem auth.
   - Rodar: npx tsc --noEmit && npm run build && npm run test:worker && npm run test:run

4) COMMITAR
   - git add nos arquivos alterados (sem -A).
   - fix(assets): enforce tenant ownership on asset serving
     Co-Authored-By: ...

5) PUSHAR / DEPLOY
   - Só pushar com gates verdes e árvore limpa coerente com origin/main.
   - NÃO deployar nesta tarefa. Deploy fica para etapa autorizada à parte
     (atenção: mudar comportamento de URL de logo pode exigir ajuste no frontend).

6) SMOKE
   - AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh
   - Reportar: prefixos sensíveis encontrados, o que mudou, cobertura de teste,
     e se algum consumo público legítimo (logo no login) precisa de ajuste.
```

---

## Entrega — respostas diretas

1. **Branch/HEAD auditados:** `main` @ `5777d77` (== `origin/main`, 0 ahead / 0 behind).
2. **Validações executadas:** `tsc --noEmit` PASS; `npm run build` PASS (~12.5s); `test:run` 478 passed / 3 skipped; `test:worker` 605 passed; `preflight` PASS; `ops:guard` PASS; smoke público (version+health 200). Smoke autenticado funcional **pendente de credencial**.
3. **Arquivo criado:** `docs/AIRTRUST_OPUS_MEGA_SCALE_PRODUCT_READINESS_20260602.md` (untracked, não commitado).
4. **Decisão:** **B — pronto para piloto controlado com 1–3 empresas reais**, acompanhado, e com o bloqueio #1 (assets) resolvido antes de tenant que suba documentos.
5. **Nota geral de prontidão:** **3.3 / 5.**
6. **Top 5 bloqueios:** (1) `/api/assets/*` público sem ownership (FIRA/fichas); (2) smoke autenticado nunca rodado; (3) sem runbook de onboarding; (4) telas "em desenvolvimento/dados de teste" visíveis; (5) super-admin/suporte = `userId===1` hardcoded.
7. **Top 5 ações imediatas:** blindar assets (B-OBJ-AUTH); rodar smoke autenticado; escrever runbook de onboarding; ocultar seções "em breve"/"dados de teste"; padronizar resposta de erro.
8. **Módulos liberáveis:** Funcionários, Qualificações, Simuladores, Dashboard, Escalas/EVD e FRMS (estes vigiados), convite/usuários.
9. **Módulos beta/ocultos:** Hospedagem (0 testes) e SIGVOOS (DDL runtime) → ocultar/bloquear; SGSO, LMS, Treinamentos planejados, Configurações → beta.
10. **Roteiro de demo recomendado:** 15min (login/multi-empresa → dashboard → FRMS → qualificações → simuladores → escalas), escondendo SGSO/Hospedagem/SIGVOOS/seções "em breve". Detalhe na §6.
11. **Próximo prompt operacional:** §12 — blindar isolamento de tenant no serving de assets.

### Confirmação final
- ✅ Nenhum código alterado · ✅ nenhum commit · ✅ nenhum push · ✅ nenhum deploy · ✅ nenhuma migration · ✅ nenhum DB remoto/real tocado · ✅ nenhuma empresa/usuário criado.
- Validações `npm run build`/`test`/`tsc` geram apenas artefatos locais em `dist/` (não-código, não commitados).
- Único artefato de relatório criado: este markdown **untracked** em `docs/`.
