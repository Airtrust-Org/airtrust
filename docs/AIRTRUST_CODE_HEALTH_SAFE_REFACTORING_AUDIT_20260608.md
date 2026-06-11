# AIRTRUST — Code Health & Safe Refactoring Audit

> Auditoria **read-only**. Nenhum arquivo modificado, nenhum commit, deploy ou migration executado.
> Data: 2026-06-08 · Branch: `main` · HEAD: `5425399` (= `origin/main`, working tree limpo de _tracked_) · Modelo: Opus 4.8
> Escopo: code health, tamanho de arquivo, acoplamento e plano de refatoração segura. **Não corrige nada.**

---

## 1. Sumário executivo

**Classificação geral: CODEBASE GRANDE MAS CONTROLÁVEL — com 3 a 5 HOTSPOTS CRÍTICOS pontuais.**

O AirTrust é grande (≈369 mil linhas de TS/TSX próprio: 208k frontend / 161k worker) mas **não está arquiteturalmente quebrado**. A camada de backend é a mais saudável: middleware de tenant/auth/RBAC **centralizado** (`middleware/tenant.ts`, `auth.ts`, `rbac.ts`), shape de resposta padronizado, e **152 arquivos de teste no worker** — incluindo uma bateria explícita de _tenant-isolation_ (`auditoria-tenant-isolation.test.ts`, `*-tenant-scope.test.ts`, `tenant-write-paths.test.ts`). Isso é o que torna a refatoração **viável com segurança**.

Os problemas de saúde se concentram em um número pequeno de **"god files"**:

- **27 arquivos > 1000 linhas** (14 frontend, 13 worker). **6 arquivos > 2500 linhas.**
- O pior ponto isolado: **`Qualificacoes.tsx` — 4859 linhas, 62 `useState`, 47 `useMemo/useCallback`, e quatro paradigmas de data-fetching misturados no mesmo arquivo** (`fetch()` cru com token manual + `apiFetch` + `useApi` + `react-query`).
- No worker, **`escalas-alocacoes.ts` tem um único handler de ~780 linhas** (`POST /alocacoes/lote`, linhas 431–1211) com SQL embutido e **zero validação Zod**.

**Riscos principais:**
1. **Risco funcional/manutenção** — alterar qualquer god file tem alta chance de regressão lateral; estado e efeitos estão entrelaçados.
2. **Risco de tenant** — concentrado, não disperso: 126/126 rotas usam `.prepare()` inline (sem camada de repositório), então cada `WHERE empresa_id = ?` é responsabilidade manual de quem escreve o handler. A boa notícia: já há testes guardando isso.
3. **Risco de inconsistência** — a infraestrutura boa existe (hooks de query, repositories, mappers) mas **é subutilizada**: só 16/268 páginas usam React Query; só 2 repositories para 126 rotas.

**Estratégia recomendada:** refatoração **incremental, por extração, com teste de caracterização antes de tocar em qualquer god file**. Não reescrever. Começar pelos extrações de baixo risco (formatadores puros, colunas de tabela, sub-componentes já inline) e só depois mover lógica de dados. **Nenhuma extração pode remover um `WHERE empresa_id`** — ver Guardrails (§9).

---

## 2. Estado inicial do repo

```
git rev-parse HEAD       = 54253997ef08fa7214772e4de508570b50a444d5
git rev-parse origin/main= 54253997ef08fa7214772e4de508570b50a444d5   (em dia)
git branch --show-current= main
git diff --stat          = (vazio — sem mudanças em arquivos tracked)
git diff --name-status   = (vazio)
```

**Untracked (`git status --short -uall`)** — apenas artefatos de auditorias paralelas, nada de código:
- `artifacts/db-backups/*.sql` (3 dumps), `artifacts/sanitization/*.csv`, `artifacts/validation/*` (inclui a auditoria de saúde sistêmica paralela e um PNG).
- `docs/AIRTRUST_QUALIFICACOES_*_20260607.md`, `docs/AIRTRUST_SIMULATOR_*_20260608.md`.
- `src/__tests__/auth-tenant-cache.test.ts` (teste novo, da auditoria de tenant paralela).

⚠️ **Achado confirmado (fora do escopo de refatoração, mas relevante e já levantado na auditoria de saúde paralela):** `git check-ignore` confirma que **`artifacts/db-backups/*.sql` NÃO está no `.gitignore`** → risco de commit acidental de PII. `tmp/` e `_arquivos_nao_usados/` **estão** ignorados (linhas 103 e 127). Não é tarefa desta auditoria corrigir, apenas registrar a confirmação.

---

## 3. Maiores arquivos e hotspots

### 3.1 Inventário (próprio, exclui `node_modules`/`dist`/`tmp`/`_arquivos_nao_usados`)

| Camada | Arquivos | Linhas | >1500 | 1000–1500 | 500–1000 |
|---|---|---|---|---|---|
| Frontend `src/` | 809 | 208.098 | 14 | 14 | 69 |
| Worker `worker-airtrust/src/` | 429 | 160.682 | 13 | 22 | 63 |

### 3.2 Top hotspots — **achados confirmados** (arquivo · linhas · responsabilidade · risco)

| # | Arquivo | Linhas | Sinais medidos | Responsabilidade | Risco |
|---|---|---|---|---|---|
| 1 | [Qualificacoes.tsx](src/react-app/pages/Qualificacoes.tsx) | **4859** | 62 useState · 8 useEffect · 47 useMemo/cb · 16 `fetch()` · 4 paradigmas de dados | God page: UI+filtros+modais+fetch+transformação+cache | **CRÍTICO** |
| 2 | [frms.ts](worker-airtrust/src/routes/frms.ts) | **3648** | **49 endpoints** · 67 SQL refs · 93 empresa refs · 39 zod | Mega-router: muitos domínios FRMS num arquivo | **CRÍTICO** |
| 3 | [TreinamentosPlanejadosPage.tsx](src/react-app/pages/TreinamentosPlanejadosPage.tsx) | **3269** | 22 useState · 6 `fetch()` · 0 react-query · 3 sub-comp inline | God page: calendário+turmas+modais+fetch cru | **ALTO** |
| 4 | [treinamentos-planejados.ts](worker-airtrust/src/routes/treinamentos-planejados.ts) | **3063** | 30 endpoints · **103 SQL refs** · 166 empresa refs | Router + lógica de integração + SQL pesado | **ALTO** |
| 5 | [sigvoos-frms.ts](worker-airtrust/src/services/sigvoos-frms.ts) | **2812** | 20 "endpoints" · 73 SQL · 7 zod | Service de integração SIGVOOS↔FRMS | **ALTO** |
| 6 | [EvdPage.tsx](src/react-app/pages/escalas/EvdPage.tsx) | **2660** | 13 useState · 3 react-query · 2 sub-comp | Página EVD (escala diária) | MÉDIO-ALTO |
| 7 | [simuladores/fichas/[id]/index.tsx](src/react-app/pages/simuladores/fichas/[id]/index.tsx) | **2308** | 21 useState · 12 `fetch()` cru | Detalhe de ficha de simulador | MÉDIO-ALTO |
| 8 | [lms-cursos.ts](worker-airtrust/src/routes/lms-cursos.ts) | **2294** | **43 endpoints** · 80 SQL · 172 empresa refs | Mega-router LMS | **ALTO** |
| 9 | [escalas-alocacoes.ts](worker-airtrust/src/routes/escalas-alocacoes.ts) | **2267** | **5 endpoints / handler de ~780 linhas** · 68 SQL · **0 zod** | Engine de alocação: handlers gigantes sem validação | **CRÍTICO** |
| 10 | [ModalNovaSessao.tsx](src/react-app/components/modals/ModalNovaSessao.tsx) | **2135** | **39 useState** · 12 useEffect · 15 `fetch()` | Modal-formulário monstro | **ALTO** |
| 11 | [EscalasDetalheView.tsx](src/react-app/pages/escalas/views/EscalasDetalheView.tsx) | 2107 | 13 useState · 3 fetch | View de detalhe de escala | MÉDIO |
| 12 | [escalas-evd.ts](worker-airtrust/src/routes/escalas-evd.ts) | 2161 | 15 endpoints · 119 empresa refs · 29 zod | Router EVD (tem zod — melhor) | MÉDIO |
| 13 | [UsuariosPage.tsx](src/react-app/pages/admin/UsuariosPage.tsx) | 1975 | 35 useState · **7 sub-comp inline** | Admin usuários (sub-comp já existem → extração fácil) | MÉDIO |
| 14 | [auth.ts](worker-airtrust/src/routes/auth.ts) | 1550 | 19 endpoints · 92 SQL · 0 zod | Auth core — **sensível, não mexer agora** | ALTO-SENSÍVEL |

### 3.3 Padrões estruturais — **achados confirmados**

- **Repository quase inexistente:** só **2** repositories (`dashboardMetricsRepository.ts`, `lmsRelatoriosRepository.ts`) e **apenas 1 rota** os importa; **126/126 rotas usam `.prepare()` inline**. → SQL e tenant-scoping espalhados pelos handlers.
- **React Query subutilizado:** **16/268 páginas** usam `useQuery/useMutation`; **17 páginas** chamam `fetchWithAuth` direto; existe uma pasta `hooks/queries` e `hooks/mutations` robusta (50+ hooks) que os god files **ignoram**.
- **Mistura de paradigmas de dados no mesmo arquivo** (Qualificacoes.tsx): `fetch()` cru com `getAccessToken()` manual + `apiFetch` + `useApi` + `useQueryClient`. Isso é o pior tipo de acoplamento porque cada caminho tem semântica de auth/refresh/cache diferente.
- **Frontend praticamente sem SQL** (só 1 arquivo casa `SELECT/INSERT` — provavelmente string em template/export). Boa separação de camada nesse eixo.

---

## 4. Diagnóstico por módulo

Legenda de responsabilidades misturadas: UI · Negócio · Fetch · Payload(transform) · Validação · FormState · RBAC · Tenant · SQL · Normalização · Formatação · Modais · Tabelas · Filtros · Cache · SideEffects.

### Qualificações — **o módulo mais crítico do frontend**
- `Qualificacoes.tsx` (4859): UI+Filtros+Modais+Fetch+Payload+FormState+Cache+SideEffects — **misto máximo**. 62 useState = estado de UI, de formulário e de servidor entrelaçados.
- Backend está **mais saudável**: já fatiado em `qualificacoes/historico-write.ts` (1473), `qualificacoes-certificados-*` (helpers/admin/write), `qualificacoes/tipos.ts`, `qualificacoes/historico.ts`. Boa cobertura de teste (`qualificacoes-*` ~15 specs).
- **Veredito:** frontend = candidato #1 a extração; backend = manutenção normal.

### Simuladores
- `ModalNovaSessao.tsx` (2135, 39 useState) e `fichas/[id]/index.tsx` (2308, 12 fetch cru): FormState+Fetch+Modais+Negócio.
- Backend fatiado razoavelmente (`simuladores-sessoes.ts`, `-modelos`, `-fichas`, `-shared`) e com testes específicos (`simuladores-*-tenant-scope`, `-guards`, `-pagination`).
- **Veredito:** extrair o form/modal no frontend; backend ok.

### Escala
- `escalas-alocacoes.ts` (2267, **handler de 780 linhas, 0 zod**): Negócio+SQL+Tenant numa função só → **o handler mais arriscado do worker**.
- `EvdPage.tsx` (2660), `EscalasDetalheView.tsx` (2107), `GradeGantt.tsx` (1121): UI+Negócio de renderização de grade.
- **Tem testes** (`escalas-alocacoes-tenant-scope`, `-helpers`, `escalas-conflitos`, `escalas-evd-*`) → refatoração do backend é **possível com rede de segurança**.
- **Veredito:** quebrar o handler `lote` em sub-funções **com caracterização antes** (alto valor, alto risco).

### FRMS
- `frms.ts` (3648, **49 endpoints**) é o maior router; `sigvoos-frms.ts` (2812, service), `frms-fadiga-checkin.ts` (1971), `lib/frms/*` (calculos, db-service, fira-service).
- **Cobertura de teste excelente** (~30 specs FRMS, incl. `calculos-alertas`, `fadiga-*`, `frms-*-tenant`). É o módulo mais testado.
- **Veredito:** `frms.ts` deve ser **dividido por subdomínio** (split de router puro, baixo risco) aproveitando os testes existentes.

### SGSO
- `Sgso.tsx` (1649, 23 useState), `SgsoRelato.tsx` (1287), páginas bowtie/frat/relprev (~600–900). Backend `sgso-next-gen.ts`, `sgso.ts`, `sgso-kpi.ts`.
- Testes de guards (`sgso-*-guards`, `-beta-contract`) presentes.
- **Veredito:** risco médio; frontend grande mas não no top crítico.

### LMS
- `lms-cursos.ts` (2294, 43 endpoints) e `lms-assets.ts` (1931), `lms-matriculas.ts` (1636) no backend; `LmsCatalogo.tsx` (1945, **8 sub-comp inline**), `useLms.ts` (1181).
- **Veredito:** `LmsCatalogo` tem sub-componentes já inline → **extração estrutural fácil**; `lms-cursos.ts` = candidato a split de router.

### Dashboard
- **Módulo mais saudável**: já usa o padrão repository (`dashboardMetricsRepository.ts`) com testes de contrato (`dashboardService.repository-contract.test.ts`, `dashboard-metrics-integrity`). **Serve de modelo de arquitetura-alvo** para os outros (§6).

### Worker/API (transversal)
- Estrutura de pastas boa: `routes/ middleware/ lib/ services/ repositories/ schemas/ shared/ utils/ cron/`.
- Problema: **lógica de negócio + SQL vivem dentro dos route handlers**; `repositories/` e `schemas/` existem mas são pouco usados.

### Auth / Tenant — **o ponto forte**
- Middleware **centralizado**: `tenant.ts`, `auth.ts`, `rbac.ts`, aplicados globalmente em `index.ts`; injetam `empresaId`/`userId` no contexto.
- `auth.ts` (1550) é grande e **sensível** → classificado "não mexer agora".
- **Garantia de rede:** `auditoria-tenant-isolation.test.ts`, `tenant-write-paths.test.ts`, vários `*-tenant-scope.test.ts`, `rbac-*.test.ts`. Essa malha é o que autoriza refatorar o resto.

---

## 5. Riscos de refatoração

Para cada candidato, eixos avaliados: funcional · tenant · dados · UI · performance · dependências · testes.

| Candidato | F | Tenant | Dados | UI | Perf | Testes existentes | Facilidade extração |
|---|---|---|---|---|---|---|---|
| Qualificacoes.tsx | Alto | Baixo* | Médio | Alto | Médio | Parcial (backend sim, página não) | Difícil (estado entrelaçado) |
| frms.ts (split router) | Médio | Médio | Baixo | — | Baixo | **Forte** | Médio (split mecânico) |
| escalas-alocacoes handler | **Alto** | **Alto** | **Alto** | — | Médio | Bom (tenant-scope+conflitos) | Difícil (1 função 780L) |
| ModalNovaSessao.tsx | Alto | Baixo | Médio | Alto | Baixo | Fraco no front | Difícil (39 useState) |
| LmsCatalogo / UsuariosPage | Médio | Baixo | Baixo | Médio | Baixo | Médio | **Fácil** (sub-comp já inline) |
| lms-cursos.ts (split router) | Baixo | Médio | Baixo | — | Baixo | Médio | **Fácil** (split mecânico) |
| Formatadores/datas puros | Baixo | Nenhum | Nenhum | Baixo | Nenhum | — | **Trivial** |

\* Qualificacoes.tsx tenant-risk é baixo porque o frontend não faz SQL; o tenant é resolvido server-side. O risco de tenant mora no **worker**.

**Classificação de cada candidato:**
- **Seguro para extração simples:** formatadores/datas puros; colunas de tabela puras; sub-componentes já inline em `UsuariosPage`/`LmsCatalogo`; split mecânico de mega-routers (`frms.ts`, `lms-cursos.ts`) em arquivos por subdomínio montados no mesmo `Hono` router.
- **Exige teste antes:** `Qualificacoes.tsx`, `ModalNovaSessao.tsx`, `TreinamentosPlanejadosPage.tsx`, qualquer extração de hook de dados.
- **Exige auditoria de tenant antes:** `escalas-alocacoes.ts` (handler lote), qualquer extração de função que carregue SQL com `empresa_id`, criação de camada repository.
- **Não mexer agora:** `auth.ts`, `index.ts` (wiring de rotas/middleware), `sigvoos-frms.ts` (integração externa com efeitos colaterais).
- **Candidato a reescrita futura (não agora):** `Qualificacoes.tsx` — após extrações incrementais reduzirem a superfície, reavaliar uma reescrita por sub-rotas.

---

## 6. Arquitetura recomendada

**Princípio: alinhar todos os módulos ao padrão que o Dashboard já usa.** Não inventar arquitetura nova — promover a melhor que já existe no repo.

### Frontend (alvo por página de domínio)
```
pages/<dominio>/
  <Dominio>Page.tsx          # container: layout + orquestração (fino)
  components/                # UI pura (tabelas, cards, sub-views)
  modals/                    # cada modal em seu arquivo
  columns/                   # definições de colunas de tabela (puras)
  hooks/
    queries/                 # useXQuery  (já existe hooks/queries — usar!)
    mutations/               # useXMutation (já existe hooks/mutations — usar!)
  mappers.ts                 # transformação de payload (puro, testável)
  formatters.ts              # formatação visual (puro, testável)
  types.ts                   # domain types
  queryKeys.ts               # chaves de cache centralizadas
```
- **Uma via de dados:** padronizar em React Query + `fetchWithAuth`. Erradicar `fetch()` cru com token manual.
- Container não contém SQL-like, transformação pesada nem formatação — delega.

### Worker/API (alvo por rota de domínio)
```
routes/<dominio>.ts          # só wiring: monta sub-routers + middleware
routes/<dominio>/
  handlers.ts                # route handlers finos
  validators.ts              # schemas Zod (pasta schemas/ já existe — usar!)
repositories/<dominio>Repository.ts  # TODA query SQL + tenant scoping aqui
services/<dominio>Service.ts # regra de negócio pura (sem c.env direto)
mappers/<dominio>.ts         # row → DTO
```
- **Camada repository é onde o `WHERE empresa_id = ?` vive** — centraliza o tenant guard e torna-o testável de forma exaustiva.
- Handler: valida (Zod) → chama service → retorna shape padrão `{success,data}`.
- Mega-routers (`frms.ts` 49 endpoints) viram `frms/` com sub-routers por subdomínio.

### Tenant (invariantes)
- **Nenhuma extração remove ou afrouxa um tenant guard.** Toda função extraída que toca dados recebe `empresaId` como parâmetro **explícito** (nunca infere/omite).
- Helpers de tenant ficam **centralizados** (já estão em `middleware/tenant.ts`); refatoração não cria caminhos paralelos.
- Queries migram gradualmente para a camada repository comum, **uma rota por vez**, sempre com teste cross-tenant antes/depois.

---

## 7. Plano de refatoração em lotes

> Regra-mãe (regra #7 da missão): **nenhuma refatoração ampla sem teste de caracterização antes.** Cada lote é pequeno e reversível por `git revert` de um commit isolado.

| Lote | Objetivo | Arquivos-alvo | Tipo | Comportamento | Testes ANTES | Testes DEPOIS | Risco | Critério de aceite | Rollback | DeepSeek | Codex | Revisão humana |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **R0** | Inventário+métricas (este relatório) | — | Diagnóstico | Sem mudança | — | — | Nenhum | Relatório aprovado | n/a | n/a | n/a | Sim |
| **R1** | Extrair formatadores/datas **puros** | de `Qualificacoes.tsx`, `Treinamentos…`, `EvdPage` → `formatters.ts` | Extração pura | Sem mudança funcional | snapshot de output das funções | unit dos formatadores | **Baixo** | tsc+lint+test verdes, output idêntico | revert commit | **Sim** | Não | Leve |
| **R2** | Extrair **colunas de tabela** e sub-componentes **já inline** | `UsuariosPage` (7), `LmsCatalogo` (8) | Extração estrutural | Sem mudança | render snapshot da página | render test dos componentes | Baixo | UI pixel-equivalente, sem novo estado | revert | **Sim** | Não | Leve |
| **R3** | Extrair **hooks de query/mutation** para `hooks/queries`+`hooks/mutations` | data-fetch de `Qualificacoes`, `ModalNovaSessao` | Extração c/ unificação de via de dados | **Mudança técnica** (fetch cru→React Query) — sem mudança visível | **caracterização da página (MSW)** | hook tests + página | **Médio** | mesmas chamadas de rede/auth, cache equivalente | revert | Parcial | **Sim** | **Sim** |
| **R4** | Extrair **modais** para arquivos próprios | `ModalNovaSessao` e modais inline das god pages | Extração estrutural | Sem mudança | caracterização do fluxo do modal | modal tests | Médio | abrir/submeter/fechar idênticos | revert | Parcial | **Sim** | Sim |
| **R5** | Split de **mega-routers** (router puro) | `frms.ts`→`frms/`, `lms-cursos.ts`→`lms-cursos/` | Split mecânico de rotas | Sem mudança de contrato | suites FRMS/LMS existentes | mesmas suites + smoke de rotas | Médio | todas as rotas respondem igual | revert | **Sim** | Não | Sim |
| **R6** | Introduzir **repository + Zod** numa rota piloto | `escalas-alocacoes.ts` (handler `lote`) | Extração SQL→repository | Sem mudança funcional | **`escalas-alocacoes-tenant-scope` + caracterização cross-tenant** | + repository unit + tenant exhaustivo | **Alto** | mesmo resultado, tenant garantido, perf ≥ | revert | Não | **Sim** | **Sim (obrigatória)** |
| **R7** | Adicionar **testes de caracterização** faltantes (frontend god pages) | Qualificações, Treinamentos, EVD | Teste | Sem mudança | — | nova suíte de caracterização | Baixo | cobre fluxos antes de R8 | revert | Parcial | Sim | Sim |
| **R8** | Remover **duplicações** + código morto | duplicatas de mappers/formatters; revisar `_arquivos_nao_usados/` (28M), `tmp/` (628K) | Limpeza | Sem mudança | suites afetadas | suites afetadas | Baixo | sem refs órfãs, build verde | revert | **Sim** | Não | Leve |

**Quem faz o quê (orientação):**
- **DeepSeek** (mecânico, baixo risco, verificável por test): R1, R2, R5, R8.
- **Codex** (refatoração com lógica/dados): R3, R4, R6 (com humano).
- **Revisão humana obrigatória**: R6 (tenant), e qualquer lote que toque `escalas-alocacoes`, `auth`, `index.ts`.

---

## 8. Testes de caracterização necessários (pré-requisito de R3+)

Caracterização = "trava" o comportamento atual (mesmo que imperfeito) antes de mexer.

**Frontend (faltam — só 16/268 páginas têm cobertura de dados):**
1. `Qualificacoes` — fluxo: listar histórico → filtrar → confirmar renovação → abrir modal certificado. Mock de rede (MSW) capturando as 16 chamadas atuais.
2. `TreinamentosPlanejadosPage` — render do calendário + criar/cancelar turma.
3. `ModalNovaSessao` — abrir → preencher (39 campos de estado) → submeter; snapshot do payload enviado.
4. `EvdPage` — render da escala diária + edição de linha.

**Worker (reforçar antes de R5/R6):**
5. `escalas-alocacoes` `POST /alocacoes/lote` — **caracterização cross-tenant**: empresa A não enxerga/grava em B (estende `escalas-alocacoes-tenant-scope.test.ts`), + snapshot do resultado do lote.
6. `frms.ts` — smoke de contrato das 49 rotas (status + shape) antes de dividir.
7. `lms-cursos.ts` — idem para as 43 rotas.

> Os módulos com boa cobertura (FRMS calc/fadiga, dashboard, RBAC) **já satisfazem** o pré-requisito de caracterização — por isso aparecem em lotes de risco menor.

---

## 9. Guardrails obrigatórios

1. **Tenant é intocável:** nenhuma extração remove/afrouxa `WHERE empresa_id = ?`. Toda função extraída recebe `empresaId` **explícito**. Rodar a suíte `*-tenant-scope` + `auditoria-tenant-isolation` **antes e depois** de cada lote que toque dados.
2. **Verde sempre:** `npx tsc --noEmit`, `npm run lint` (api-base + guard:tracked-secrets + guard:auth-boundaries), `npm run test:all` devem passar em cada commit de lote.
3. **Um lote = um commit reversível.** Sem mudança funcional e estrutural no mesmo commit.
4. **Sem deploy/migration/`git add` em massa** durante refatoração de saúde — produção é dado real (regra do CLAUDE.md).
5. **Não tocar** em `auth.ts`, `index.ts` (wiring), `sigvoos-frms.ts` sem decisão humana dedicada.
6. **Mudança de via de dados (R3)** deve preservar semântica de auth/refresh/cache — validar que `fetchWithAuth` cobre os casos do `fetch()` cru substituído (refresh de token no 401).
7. **Performance:** extrair não pode introduzir re-render extra (frontend) nem query N+1 (backend). Medir antes/depois nos handlers grandes.

---

## 10. Lista "não mexer agora"

| Arquivo | Linhas | Por quê |
|---|---|---|
| [auth.ts](worker-airtrust/src/routes/auth.ts) | 1550 | JWT/refresh/login — superfície de segurança; 0 zod e 92 SQL refs aumentam o risco de regressão silenciosa. Exige projeto próprio. |
| `worker-airtrust/src/index.ts` | 1062* | Wiring de rotas + whitelist de rotas públicas + middleware global. Quebrar isso quebra tenant/auth de tudo. |
| [sigvoos-frms.ts](worker-airtrust/src/services/sigvoos-frms.ts) | 2812 | Integração externa com efeitos colaterais (importação de voos). Difícil de caracterizar sem ambiente SIGVOOS. |
| `App.tsx` | 1062 | Roteamento/lazy-loading central — risco de quebrar chunk-loading de toda a SPA. |
| `escalas-alocacoes.ts` handler `lote` | 780 (1 fn) | Alvo de R6 **mas só com caracterização cross-tenant completa + revisão humana**. Não tocar antes disso. |
| `i18n/translations.ts` | 1174 | Grande por natureza (dados, não lógica). Não é dívida técnica real. |

\* confirmar exato; `index.ts` não estava no top-list medido mas é estruturalmente sensível.

---

## 11. Próximos 3 lotes recomendados

**Comece pelo valor/risco mais favorável — ganhos visíveis sem tocar em tenant nem em dados:**

1. **R1 — Extrair formatadores e datas puros** das 3–4 god pages.
   _Primeiro passo:_ criar `pages/qualificacoes/formatters.ts`, mover funções puras de formatação de data/status de `Qualificacoes.tsx`, com unit tests espelhando o output atual. Risco baixo, reversível, dá tração imediata e reduz a página.

2. **R2 — Extrair sub-componentes já inline** de `UsuariosPage.tsx` (7) e `LmsCatalogo.tsx` (8).
   _Primeiro passo:_ mover cada componente `const X = () => …` já existente para `components/`, sem alterar estado/props. Extração puramente mecânica, ideal para DeepSeek, verificável por render snapshot.

3. **R5 — Split do mega-router `frms.ts`** (49 endpoints) em `routes/frms/` por subdomínio, montados no mesmo `Hono` router.
   _Primeiro passo:_ rodar a suíte FRMS (já forte) como baseline; mover blocos de endpoints para arquivos por tema mantendo os mesmos paths; reexportar no `frms.ts` agora fino. Sem mudança de contrato; a malha de testes FRMS existente é a rede de segurança.

> **Não** começar por `Qualificacoes.tsx` reescrita, `escalas-alocacoes` handler, nem `auth.ts`. Esses só depois que R1/R2/R5 estabelecerem o padrão e R7 cobrir a caracterização frontend.

---

## Conclusão

**Estado: CODEBASE GRANDE MAS CONTROLÁVEL, com HOTSPOTS CRÍTICOS pontuais (não sistêmicos).**

A fundação está sólida onde mais importa para um SaaS multiempresa: tenant/auth/RBAC centralizados e cobertos por testes de isolamento dedicados. A dívida é real mas **localizada** em ~6 god files e na subutilização de camadas que **já existem** (repositories, hooks de query, schemas). Isso é o cenário ideal para refatoração incremental: não é preciso reescrever — é preciso **promover o padrão do Dashboard** ao resto, um lote pequeno e testado por vez, sem nunca afrouxar o tenant guard. O sistema **pode evoluir para multiempresa com segurança**, desde que os god files críticos (especialmente `escalas-alocacoes` handler `lote` e a via de dados de `Qualificacoes.tsx`) sejam tratados com caracterização antes de qualquer mudança.
