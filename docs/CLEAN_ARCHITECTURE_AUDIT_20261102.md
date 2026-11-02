# AirTrust — Auditoria de Clean Architecture

> **Data:** 2026-11-02 · **Base:** `main` @ `49a9e4774` · **Modo:** somente leitura (nenhum código, banco ou deploy alterado)
> **Lentes:** `codebase-design` (módulos profundos, seams, deletion test) + `engineering:tech-debt` (Impacto, Risco, Esforço)
> **Escopo:** worker (`worker-airtrust/src`, 660 arquivos não-teste), frontend (`src/react-app`, 905 arquivos) e todos os módulos de negócio.

---

## 1. Veredito

**O AirTrust não segue Clean Architecture hoje, e isso é uma escolha implícita, não um acidente isolado.** O backend é um *transaction script* em camadas parciais: a rota Hono é o lugar onde HTTP, validação, regra de negócio e SQL convivem. As pastas `services/`, `lib/` e `repositories/` existem, mas **não formam camadas com direção de dependência**: nenhuma regra impede que um service importe uma rota, nem existe lint de fronteira.

Isso **não é um julgamento de que o sistema está ruim**. Há pontos fortes reais (seção 3). A questão é onde a falta de camadas já custa caro: nos handlers gigantes de Simuladores, Escalas, LMS e SGSO, e no acoplamento de tudo ao runtime de schema do D1.

| Dimensão | Nota | Resumo |
|---|---|---|
| Regra de dependência (dentro → fora) | 🔴 Fraca | 12 imports de service→rota, middleware→rota, repository→service; sem lint de fronteira |
| Isolamento de persistência | 🔴 Fraco | 84% dos arquivos de rota têm SQL (2.379 `prepare` em rotas vs. 41 em repositories) |
| Núcleo de domínio testável | 🟡 Misto | FRMS tem núcleo puro real (57 de 92 arquivos sem DB); outros módulos não |
| Ciclos de dependência | 🟢 Bom | Só 2 ciclos no worker (7 arquivos) e 1 no frontend (2 arquivos) |
| Tamanho/coesão dos módulos | 🔴 Fraco | Handlers de até 1.138 linhas; páginas de até 4.765 linhas |
| Camada de acesso a dados no frontend | 🟡 Misto | 3 clientes HTTP coexistem; páginas ainda chamam API direto |

---

## 2. Como o código está organizado (medido)

### Worker — LOC e SQL por camada (não-teste)

| Camada | Arquivos | Arquivos com SQL | Chamadas `prepare` |
|---|---|---|---|
| `routes/` | 215 | **180 (84%)** | **2.379** |
| `services/` | 182 | 90 (49%) | 706 |
| `lib/` | 143 | 45 (31%) | 254 |
| `cron/` | 20 | 16 | 120 |
| `middleware/` | 25 | 12 | 75 |
| `shared/` | 14 | 13 | 52 |
| `repositories/` | 10 | 8 | 41 |
| `utils/` | 33 | 8 | 23 |

**Leitura:** `repositories/` é a menor camada de dados (41 chamadas) enquanto rotas concentram 2.379. Em Clean Architecture a proporção seria o inverso. `shared/` e `middleware/` executam SQL, e `shared` deveria ser puro.

Só **17 de 215 rotas** usam `repositories/`; **104** usam `services/`.

### Violações da regra de dependência (arquivos, não nome de camada)

| Direção proibida | Ocorrências | Exemplos |
|---|---|---|
| `services → routes` | 10 arquivos (12 imports) | `cae-planning-materialization.ts` e `simulator-planning-v3-materialization.ts` importam `routes/simuladores-shared-session-*`; `generate-certificate.ts` e `qualificacoes-g1-sem.ts` importam `routes/qualificacoes-certificados-helpers`; 4 services importam *tipo* de `routes/compliance-treinamentos` |
| `lib → routes` | 1 | `lib/lms/lms-scorm-package-version-service.ts` → `routes/lms-scorm-asset-paths` |
| `middleware → routes` | 1 | `middleware/processarEventos.ts` → `routes/escalas-shared` |
| `repositories → services` | 8 arquivos | `edb/*`, `dashboardMetricsRepository`, `lmsRelatoriosRepository` (repositório dependendo de service é inversão) |
| `lib → services` | 5 arquivos | `lib/frms/*` → `services/controle-voos/*`, `employee-sector-access` |
| `services → middleware` | 21 arquivos | quase todos só importam `error-handler` (classes de erro no lugar errado) |
| Hono `Context` fora de `routes` | 10 arquivos | `services/operational-domain-access*.ts`, `employee-sector-access.ts`, `controle-voos/rdv-*`, `lib/frms/access.ts`, `repositories/controle-voos/rdv-repository.ts`, `utils/tenant-context.ts` |

### Frontend — dependências invertidas

- `components → pages`: 5 arquivos · `hooks → pages`: 1 · `utils/lib → pages|components|hooks`: 3
- `pages → pages` de outro módulo: 11
- `src/components`, `src/hooks`, `src/services`… (fora de `react-app`) ainda existem (38 arquivos) e **39 arquivos de `react-app` importam via `@/components` etc.** em vez de `@/react-app/...` — a duplicação já registrada em `TECHNICAL_DEBT.md`.

---

## 3. O que já está bom (preservar)

1. **FRMS tem um núcleo de domínio de verdade.** 57 dos 92 arquivos de `lib/frms` não tocam DB. `calculos.ts` (1.084 linhas), `fadiga-score.ts`, `decision-policy.ts`, `compliance-policy.ts` são puros. É o melhor exemplo interno de módulo profundo.
2. **Existe uma fronteira arquitetural executável:** `scripts/guard-frms-no-direct-sigvoos.cjs`. O padrão (guard que quebra o lint) é exatamente o que falta nas demais fronteiras.
3. **Ciclos quase inexistentes.** Em 660 arquivos do worker e ~2.000 arestas: 2 ciclos. Isso torna a refatoração em camadas viável sem desatar nós.
4. **Repositórios com contrato explícito de tenant.** `dashboardMetricsRepository` aceita `D1Database` por parâmetro, tem `assertEmpresaId` e tipa as linhas de retorno — é o modelo a replicar. `repositories/controle-voos/` e `repositories/edb/` seguem o mesmo padrão.
5. **Injeção de dependência já praticada em ~50% dos services** (92/182 recebem `D1Database` em vez de criar/pegar do contexto).
6. **Contratos compartilhados** em `src/shared`/`src/schemas` com sentido único (worker importa de `src`, 8 arquivos).
7. **Cobertura de testes alta (976 arquivos de teste no worker)** e a maioria testa por comportamento: 351 importam services/lib diretamente e 102 exercitam a rota via `app.request`. Só ~35 leem código-fonte como texto (principalmente guardas de auth/rbac), o que é aceitável como teste de contrato.

---

## 4. Auditoria por módulo

Métricas de rota somam todos os arquivos do prefixo. "Pior handler" é a maior função inline `.get/.post/.put...` encontrada.

| Módulo | Rotas (arq. / LOC) | Handlers | `prepare` em rotas | Pior handler | Camadas | Diagnóstico |
|---|---|---|---|---|---|---|
| **Simuladores** | 36 / 25.538 | 118 | **499** | **1.138 linhas** (`simuladores-sessoes-update.ts:84`) | rotas + `services/cae-*`, `simulator-planning-v3-*` | 🔴 Maior concentração de SQL e regra em rota. Ciclo de 5 arquivos em `simuladores-shared-session-*`. Services importam *de* rotas. |
| **Escalas** | 28+1 / 13.971 | 85 | 272 | 774 linhas (`escalas-alocacoes.ts:440`) | rotas, quase sem services (1 import) | 🔴 `escalas-shared.ts` virou *shared kernel* dentro de `routes/` (ver §5.3). Handlers de 770/468/395 linhas. |
| **EVD** (dentro de Escalas) | `escalas-evd.ts` 2.161 | — | — | — | rota única | 🟡 Um arquivo de rota para um bounded context inteiro; página `EvdPage.tsx` com 2.687 linhas. |
| **Qualificações** | 21+8 / 18.620 | 33 | 272 | `historico-write.ts` 1.570 (arq.) | rotas + helpers em `routes/qualificacoes/` | 🔴 `generate-certificate` e `qualificacoes-g1-sem` (services) dependem de helpers que vivem em rotas. `Qualificacoes.tsx` 4.765 linhas, fan-out 48. |
| **Treinamentos Planejados** | 1 / 3.745 | 5 | 52 | arquivo único de 3.745 | rota + `services/treinamentos-planejados-integration.ts` (41 `prepare`) | 🔴 Já listado em `TECHNICAL_DEBT.md` (rotas monolíticas). O service é um *script de SQL* que importa `routes/qualificacoes/historico-helpers`. `TreinamentosPlanejadosPage.tsx` 4.143 linhas. |
| **FRMS** | 19 / 11.536 | 34 | 150 | 493 linhas (`frms-fadiga-checkin-legacy.ts:896`) | **`lib/frms` (92 arq.) + services + repositórios** | 🟡 Melhor módulo. Problemas pontuais: `routes/frms.ts` com 3.359 linhas; ciclo `frms-iogp-shadow-caller ↔ db-service-jornadas`; `lib/frms/*` importa de `services/` (direção invertida); `db-service-*` e puro misturados no mesmo diretório. |
| **LMS** | 19 / 12.643 | 63 | 152 | 546 linhas (`lms-matriculas.ts:1274`) | rotas + `services/lms-*` + `repositories/lms-*` | 🟡/🔴 `lms-matriculas` 3.055, `lms-cursos-legacy` 2.998, `lms-assets` 2.682. 13 rotas LMS importam `escalas-shared` só para `getEmpresaIdSafe`/`getEscalaVerificada`. `lib/lms` importa de `routes/`. |
| **SGSO** | 7 / 5.407 | 53 | 178 | 461 linhas (`sgso-kpi.ts:101`) | **só rotas** (1 import de service) | 🔴 Nenhuma camada de aplicação. 178 `prepare` em 7 arquivos; ~25 `prepare` por arquivo. |
| **Controle de Voos / SIGVOOS** | 17 / 7.966 | 46 | 130 | 1.944 (arq. `rdv-workflow`) | rotas + `services/controle-voos/*` + `repositories/controle-voos/*` | 🟡 Segundo melhor em camadas (41 imports de service, repos próprios). 383 usos de `c.env.DB` ainda diretos; sem Zod no módulo; `services/controle-voos/rdv-*` e `rdv-repository` usam Hono `Context`. |
| **Compliance** | 8 / 4.827 | 45 | 84 | 372 linhas (`compliance-recalculate.ts:65`) | rotas + services | 🟡 Tipos de domínio (`TrainingComplianceSnapshot`) definidos **em arquivo de rota** e consumidos por 4 services. |
| **Funcionários** | 2 / 2.157 | 8 | 37 | — | rotas + `services/employee-sector-access` | 🟡 `employee-sector-access` é importado por 50 arquivos: virou dependência estrutural sem estar em um módulo de identidade/acesso. `ModalFuncionario.tsx` 2.004 linhas. |
| **Auth** | 1 / 1.925 | 6 | 54 | — | arquivo único | 🟡 54 `prepare` em um arquivo de 1.925 linhas; `middleware/auth` tem fan-in 142 (correto para fronteira, mas sem porta/abstração). |
| **Empresas** | 2 / 2.307 | 18 | 69 | — | rotas | 🟡 SQL direto, sem service. |
| **Importação** | 2 / 2.223 | 11 | 23 | — | rotas + 9 imports de service | 🟢/🟡 Aceitável; sem Zod local detectado. |
| **Integrações** | 3 / 2.385 | 7 | 22 | — | rotas | 🟢 Pequeno e razoavelmente isolado. |
| **Pasta Virtual** | 2 / 1.942 | 12 | 33 | — | rotas | 🟡 SQL em rota; sem Zod local detectado. |
| **Cron** | 20 / 6.848 | — | 120 | — | handlers + `job-state` | 🟡 16 de 20 arquivos com SQL direto; o dispatcher é separado, o que é bom. |

---

## 5. Achados priorizados

Prioridade = (Impacto + Risco) × (6 − Esforço) · escala 1–5.

| # | Achado | Impacto | Risco | Esforço | **Prioridade** |
|---|---|---|---|---|---|
| A1 | Sem lint de fronteira entre camadas (nada impede novas violações) | 4 | 5 | 2 | **36** |
| A2 | Handlers gigantes com regra + SQL inline (Simuladores, Escalas, LMS, SGSO) | 5 | 4 | 4 | **18** |
| A3 | Schema probing em runtime (`getSchemaColumns`, `PRAGMA`) espalhado | 4 | 5 | 4 | **18** |
| A4 | `routes/escalas-shared.ts` é um shared kernel mal localizado | 3 | 3 | 2 | **24** |
| A5 | `services → routes` e `lib → routes` (dependência invertida) | 3 | 3 | 2 | **24** |
| A6 | `repositories` quase não usado (41 vs. 2.379 `prepare`) | 4 | 4 | 5 | **8** |
| A7 | Hono `Context` vazando para services/lib/repositories | 3 | 3 | 2 | **24** |
| A8 | Frontend: 3 clientes HTTP + chamada direta em páginas | 3 | 3 | 3 | **18** |
| A9 | Frontend: páginas-monólito (4.765 / 4.143 / 3.037 linhas) | 4 | 3 | 4 | **14** |
| A10 | Frontend: `src/components|hooks|services` duplicados | 2 | 3 | 2 | **20** |
| A11 | Ciclos (shared-session, frms-iogp↔jornadas, apiFetch↔api) | 2 | 2 | 2 | **16** |
| A12 | Classes de erro em `middleware/error-handler` importadas por 21 services | 2 | 2 | 1 | **20** |

### 5.1 A1 — Falta de regra de dependência executável *(maior alavanca)*
O repositório já tem uma dúzia de guards em `scripts/guard-*` (incluindo `guard-frms-no-direct-sigvoos`). Falta um **guard de camadas** equivalente. Sem ele, qualquer limpeza regride. **Recomendação:** criar `scripts/guard-layer-boundaries.mjs` em modo *baseline* (permite as violações atuais conhecidas, falha em novas), e plugar em `npm run lint`. Esse é o primeiro passo porque converte "esforço de disciplina" em "falha de CI".

### 5.2 A2 — Handlers gigantes (deletion test)
Aplicando o *deletion test*: se `simuladores-sessoes-update.ts` PUT `/sessoes/:id` fosse apagado, a complexidade (validação de instrutor, autoavaliação, normalização de checks, notificações, sessões compartilhadas) **reaparece em lugar nenhum** — está inteira dentro do handler. Ou seja, **ela não está encapsulada num módulo; está presa no adaptador HTTP**. O handler lê `c.req.json()` sem schema, executa `SELECT *`, decide regras de negócio e responde. Para testar uma regra é preciso montar request + DB.

Os 15 maiores handlers (370–1.138 linhas) estão em: `simuladores-sessoes-update`, `escalas-alocacoes` (×3), `simuladores-sessoes`, `lms-matriculas`, `simuladores-planejamento` (×2), `frms-fadiga-checkin-legacy`, `escalas-tripulacoes`, `simuladores-fichas` (×2), `sgso-kpi`, `alertas`, `compliance-recalculate`.

### 5.3 A4 — `escalas-shared.ts` é um kernel compartilhado dentro de `routes/`
357 linhas que misturam: resolução de tenant (`getEmpresaIdSafe`, **36 usos**), carga de escala (`getEscalaVerificada`), parse de body (`parseBody`), 6 schemas Zod do domínio Escalas e geração de eventos (`gerarEventosBase`). É importado por **44 arquivos**, incluindo `middleware/processarEventos.ts`, LMS (13 arquivos), `aeronaves`, `horas-voo`, `preferencias`, `integracoes_sigvoos`. Entre os imports dessas rotas, `getEmpresaIdSafe` (tenant) responde por 36 dos ~50 usos, ou seja, a maior parte do acoplamento LMS↔Escalas é só para obter o `empresaId` (não verifiquei função a função em LMS). Já existe `utils/tenant-context.ts`/`getTenantContext(c)` (usado em Simuladores) que faz isso. **Esse é um achado de baixo risco e alto retorno**: quebrar o arquivo em (a) helpers de tenant → `utils/tenant-context`, (b) regras de escala → `services/escalas/`, (c) schemas → `schemas/escalas`.

### 5.4 A3 — Runtime não confia no schema
223 chamadas a `getSchemaColumns/tableHasColumn/hasTable…` em 50 arquivos e 391 ocorrências de `PRAGMA` em 23 arquivos. O handler analisado constrói SQL condicional: `hasIsInstrutor ? 'COALESCE(is_instrutor, 0)' : '1'`. Para a Clean Architecture isso significa que **detalhes de infraestrutura (qual coluna existe) vazam para a regra de negócio**. Já é um achado recorrente nas auditorias anteriores (memória 2026-08-11) e também em `TECHNICAL_DEBT.md` ("Schema drift em fixtures"). **A raiz é governança de schema, não arquitetura** — corrigir exige o contrato Schema V2 (ver seção 7, item fora de escopo).

### 5.5 A5/A7/A12 — Pequenas inversões baratas de corrigir
- 10 services importando rotas: mover os helpers (`qualificacoes-certificados-helpers`, `simuladores-shared-session-*`, `historico-helpers`) para `services/` ou `lib/`, e mover o tipo `TrainingComplianceSnapshot` para `types/`. É uma operação mecânica (mover + re-exportar).
- 10 arquivos com Hono `Context`: passar `{ db, empresaId, userId }` já resolvido. Alguns já seguem isso.
- `AppError` e afins: mover de `middleware/error-handler` para `lib/errors` e manter re-export.

### 5.6 Frontend
- **3 clientes HTTP:** `fetchWithAuth` (97 arquivos), `apiClient` (44), `apiFetch` (44), e `apiFetch ↔ config/api` formam o único ciclo. Já há `guard-no-raw-fetch`; a decisão a tomar é **qual é o contrato canônico** e migrar o restante.
- **Acesso a API em UI:** 40 de 470 arquivos de `pages/` e 11 de 216 de `components/` chamam `fetchWithAuth` direto; a camada `hooks` (57 hooks "api-bound") + `useQuery` em 79 arquivos mostra que a convenção existe, mas não é universal.
- **Páginas-monólito:** `Qualificacoes.tsx` (4.765), `TreinamentosPlanejadosPage.tsx` (4.143), `simuladores/fichas/[id]/index.tsx` (3.037), `EvdPage.tsx` (2.687). `Qualificacoes.tsx` tem fan-out de 48 imports.
- **Módulos de maior LOC:** `pages/escalas` 25,7k, `pages/simuladores` 24,9k, `pages/frms` 20,5k. Cada um é, na prática, um sub-aplicativo.

---

## 6. Plano de remediação em fases (junto com feature work)

Princípio: **estrangular, não reescrever.** Nada de reorganização de pastas em massa (produção tem dados reais e há ~976 testes dependendo dos caminhos atuais).

### Fase 0 — Congelar o estado (1–2 dias)
- [ ] Criar `guard-layer-boundaries.mjs` com **baseline** das violações atuais (§2). Falha apenas em violações novas. *(A1)*
- [ ] Regras iniciais: `services|lib|repositories|utils|shared` ⇏ `routes`; `repositories|utils|shared` ⇏ `services`; `services|lib|repositories` ⇏ `hono`.
- [ ] Atualizar `CLAUDE.md` com a regra de camadas (hoje cita só "Backend Route Conventions").

### Fase 1 — Inversões baratas (≈1 semana)
- [ ] Desmontar `escalas-shared.ts` (A4): tenant → `utils/tenant-context`; LMS e Aeronaves deixam de importar de Escalas.
- [ ] Mover helpers que services importam de rotas (A5) e tipos de `compliance-treinamentos` para `types/`.
- [ ] Mover `AppError` para `lib/errors` (A12).
- [ ] Quebrar os 3 ciclos (A11).

### Fase 2 — Extrair o domínio onde há mais dor (por módulo, 1 PR/handler)
Ordem sugerida: **(1) Simuladores `PUT /sessoes/:id`**, **(2) SGSO KPI**, **(3) Escalas alocações**, **(4) LMS matrículas**, **(5) Treinamentos Planejados**.
Para cada um:
1. Extrair a regra para função pura (`validateInstrutorAssignment(...)`) com teste unitário (padrão FRMS).
2. Extrair o SQL para um repositório com `empresaId` obrigatório (padrão `dashboardMetricsRepository`).
3. Handler fica com: parse + chamada + resposta (< 60 linhas).
- Critério de pronto: nenhum `prepare` no handler; contrato HTTP idêntico; testes existentes verdes.

### Fase 3 — Contratos de dados (depende de decisão)
- [ ] Definir o contrato de schema que dispensa `getSchemaColumns` (A3). *Requer migration/Schema V2 e autorização explícita — não faz parte desta auditoria.*

### Fase 4 — Frontend (paralelo, baixo risco)
- [ ] Decidir cliente HTTP canônico e adicionar guard para os outros dois (A8).
- [ ] Eliminar `src/components|hooks|services` duplicados com codemod de import (A10).
- [ ] Quebrar as 4 páginas-monólito em `feature/{api,hooks,components}` por rota.

---

### Status de execução (2026-11-02, branch `refactor/layer-boundaries-guard-tenant-resolution-20261102`, sem commit)

- ✅ **Fase 0:** `scripts/guard-layer-boundaries.mjs` + `scripts/layer-boundaries-baseline.json` (37 violações conhecidas: 11 arquivos inner→routes, 8 baixo→services, 8 hono-no-core), ligado em `npm run lint`, com teste (`__tests__/architecture/layer-boundaries-guard.test.ts`) e regra documentada no `CLAUDE.md`.
- ✅ **A4 parcial:** `getEmpresaIdSafe/Optional` movidos para `utils/tenant-resolution.ts`; `escalas-shared` re-exporta para os sub-módulos de Escalas. LMS, aeronaves, horas-voo, preferencias, deduplicate, integracoes_sigvoos, escala-mensal-integrada e `middleware/processarEventos` não dependem mais de Escalas para obter o tenant.
- ⏳ **Pendente de A4:** `getEscalaVerificada*`, `parseBody`, schemas Zod e `gerarEventosBase` continuam em `routes/escalas-shared.ts` (uso interno ao domínio Escalas).
- Nota: `utils/tenant-context.ts` já exporta outro `getEmpresaIdSafe` (retorna `null`, não lança). Os contratos são diferentes e foram deliberadamente mantidos separados.

## 7. Fora do escopo / limitações desta auditoria

- **Somente análise estática** (grep, AST leve via script e contagem). Nenhum teste, build ou smoke foi executado.
- Métricas de handler (`.get/.post/...`) usam heurística por regex; arquivos que registram rotas por outro mecanismo podem estar sub/super-contados.
- "Arquivo com SQL" = presença de `.prepare(`. Consultas montadas via helpers de DB (ex.: `db.batch`) podem fugir da contagem; o número real de acessos a dados tende a ser **maior**.
- A contagem de "sem Zod local" (Funcionários, Auth, Importação, Pasta Virtual, Controle de Voos) só detecta `zValidator`/`from 'zod'` no próprio prefixo; módulos podem validar via `src/shared/validators`.
- Não foi avaliada a **correção** das regras de negócio nem o isolamento multi-tenant linha a linha (há auditorias dedicadas anteriores).
- Memórias de auditoria anteriores apontavam números diferentes para schema probing (70 PRAGMA / 43 arquivos); aqui a medição é mais ampla (inclui helpers) e **não deve ser comparada diretamente**.
- A auditoria **não propõe** mover/alterar nada em produção, migrations ou deploy; todo item acima é proposta para planejamento.

---

## 8. Próximo passo recomendado

Executar a **Fase 0** (guard em modo baseline) e a **Fase 1 / item A4** (`escalas-shared`) em um único PR pequeno. Isso trava a regressão e remove o acoplamento LMS↔Escalas sem alterar nenhum contrato HTTP.
