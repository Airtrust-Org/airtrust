# AirTrust — Opus Architecture, Efficiency & Maintainability Audit

- **Modo:** auditoria independente, read-only. Nenhum código alterado, nenhum commit/push/deploy/migration.
- **Data:** 2026-06-02
- **Branch / HEAD:** `main` / `5fa8107292e45a2805de3c6de05800e04655b8f7`
- **origin/main:** `5fa8107…` (HEAD == origin/main, 0 ahead / 0 behind)
- **Working tree:** sem tracked changes; apenas untracked (`docs/`, `knowledge/`, `scripts/seed-*.sql`, `scripts/validation/audit-endpoint-matrix.mjs`).

> Escopo: arquitetura, acoplamento, eficiência, manutenibilidade, testabilidade e sustentabilidade de evolução. **Não** é uma re-auditoria de P0/P1 de segurança.

---

## Parte A — Estado inicial e validações

Todas as validações read-only foram executadas e **passaram**:

| Verificação | Resultado |
|---|---|
| `preflight-clean-deploy.sh` | OK (clean) — warn não-bloqueante de untracked |
| `npm run ops:guard` | PASS (sem `--commit-dirty=true`, sem D1 remoto inseguro) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` (vite + tsc) | exit 0, build em ~11s |
| `npm run test:run` (frontend) | 478 passed, 3 skipped (50 arquivos) |
| `npm run test:worker` | 591 passed (80 arquivos) |
| smoke `AIRTRUST_PUBLIC_ONLY=YES` | exit 0 |

> Observação: `npm run test` (sem `:run`) entra em modo watch (vitest) e travaria — usar sempre `test:run`/`test:all`. Um teste de caminho negativo emite `console.error("db failure")` em `matriz-treinamento` mas o teste passa (asserção de erro esperada).

**Conclusão A:** base saudável e verde. Nada para corrigir aqui.

---

## 1. Resumo executivo

**A arquitetura atual sustenta crescimento?** Parcialmente. O sistema é funcional, bem testado nas frentes recém-endurecidas (tenant, dashboard, FRMS, escalas) e tem build/types limpos. Mas há **dívida estrutural concentrada** que vai encarecer cada nova feature: ausência de camada de repositório, DDL em runtime dentro de handlers, fragmentação extrema de rotas e arquivos gigantes.

- **Módulo mais arriscado de evoluir:** **FRMS** (`frms.ts` 3643 linhas + `sigvoos-frms.ts` 2931 + `frms-fadiga-checkin.ts` 1971 + `lib/frms/*`) — maior superfície, maior densidade de SQL inline, embora também o mais testado (42 arquivos de teste mitigam o risco).
- **Maior gargalo de manutenção:** **2161 chamadas `.prepare()` SQL cruas espalhadas em 130+ arquivos de rota**, sem repositório/DAO. Regras de negócio, SQL e HTTP no mesmo lugar.
- **Maior risco de performance:** **DDL por requisição** — funções `ensure*Schema` (CREATE TABLE/INDEX) chamadas em ~60 call sites no início de handlers quentes.
- **Maior gap de testes:** **`hospedagem` tem 0 testes**; `sgso-next-gen` (1147 linhas), `lms-cursos` (2266) e `evd` (2039) têm cobertura leve para o tamanho.

**Decisão final: B — seguir features, mas reservar capacidade fixa (~20-30%) para refatoração gradual**, priorizando os itens A1 abaixo. Nenhum achado justifica pausar evolução ampla (D); um módulo (FRMS) merece atenção mas está testado.

---

## 2. Top 15 achados

| Rank | Cat | Sev | Módulo | Achado | Evidência | Impacto | Recomendação |
|---|---|---|---|---|---|---|---|
| 1 | Arq/Perf | A1 | treinamentos, matriz, frms-fira, preferencias, alertas | **DDL em runtime**: `CREATE TABLE/INDEX IF NOT EXISTS` via `ensure*Schema` em handlers | `treinamentos-planejados.ts:220` chamado em :572,595,625,675,710,788…; 60 call sites de `ensure*Schema` | Overhead por request + schema fora das migrations (drift) | Migrar essas tabelas para migrations numeradas; remover `ensure*Schema` dos hot paths |
| 2 | Arq | A1 | global (worker) | **Sem camada de repositório**: 2161 `.prepare()` cruas em 130+ rotas | `grep .prepare(` = 2161; top: `simuladores-modelos.ts` 62, `auth.ts` 52 | Regra+SQL+HTTP acoplados; difícil testar/evoluir | Introduzir DAO/repositório por domínio incremental (começar por qualificações e escalas) |
| 3 | Arq | A2 | escalas, simuladores, qualificações | **Fragmentação extrema de rotas**: escalas em ~33 arquivos, simuladores ~18, qualificações ~15, montados com ordem crítica | `index.ts:508` "ORDEM CRÍTICA"; múltiplos `app.route('/api', …)` no mesmo prefixo | Ordem de montagem frágil; risco de shadowing de rota | Consolidar por sub-router com prefixo próprio; eliminar montagens em `/api` compartilhado |
| 4 | Arq | A2 | entrypoint | **`index.ts` (1008 linhas) com handlers inline e "FIX TEMPORÁRIO"** | `index.ts:876` `POST /api/fix/populate-qualificacao-ids`; `:522` fallback qualificacoes; `:753` sessoes | Entrypoint mistura bootstrap, routing e lógica | Extrair handlers inline para rotas; remover endpoint de fix temporário |
| 5 | Arq | A2 | schema/DB | **~30 tabelas `_v2/_v3/_bak/_temp/_backup`** criadas em migrations e presentes em prod | `usuarios_v3`, `escala_alocacoes_v2/v3`, `lms_cursos_v3`, `*_backup`, `*_temp` | Clutter de schema, confusão sobre tabela "fonte da verdade" | Plano de descomissionamento (verificar uso → migration de DROP autorizada) |
| 6 | Perf | P2 | compliance, simuladores, notificacoes | **Possível N+1** em 13 arquivos (loops com query por item) | `compliance.ts:314/337/359/378`; `simuladores-sessoes-update.ts:137/148/236`; `notificacoes-convocacao.ts:479` | Latência cresce linear com nº de itens | Reescrever como query agregada / `IN (...)` / batch |
| 7 | Arq/Dom | A3 | status (todo) | **Sem enum central de status**: magic strings espalhadas (CONCLUIDA ×72, CONCLUIDO ×63, PENDENTE ×50, APROVADO ×44…) | `grep` worker+frontend | Risco de filtro por gênero errado → contagem silenciosamente incorreta | Módulo de constantes de status por domínio (worker + frontend compartilhando contrato) |
| 8 | Arq/Perf | A3 | PDF | **Geração de PDF duplicada**: 3 services worker + 2 chunks vendor frontend | `html-to-pdf.ts`, `pdf-ficha.service.ts`, `pdf-generator.ts`; build `pdf-*.js` 387kB + 393kB | Bundle inflado (~780kB raw), lógica triplicada | Consolidar em 1 gerador (há `consolidate-pdf-generator.sh` inacabado) |
| 9 | Manut | A2 | arquivos gigantes | **Arquivos > 2000 linhas**: `Qualificacoes.tsx` 4855, `frms.ts` 3643, `sigvoos-frms.ts` 2931, `EvdPage.tsx` 2660 | `wc -l` | Difícil revisar/testar/evoluir; merge conflicts | Quebrar por feature/seção (ver Top 10 abaixo) |
| 10 | Test | T1 | hospedagem | **`hospedagem` (1066 linhas) sem nenhum teste** | 0 arquivos de teste referenciam "hospedagem" | Regressões invisíveis | Adicionar testes de contrato + tenant-scope |
| 11 | Test | T2 | sgso-next-gen, lms, evd | **Cobertura leve para tamanho**: sgso 4 / lms 5 / evd 4 testes vs arquivos de 1-2k linhas | matriz de cobertura | Risco moderado em módulos grandes | Priorizar testes de caminho crítico (ver roadmap) |
| 12 | Sec/Manut | A3 | respostas de erro | **15 endpoints vazam `error.message` interno em `details`** | `index.ts:929`; `grep details: error instanceof Error` = 15 | Exposição de detalhe interno ao cliente | Padronizar resposta de erro (mensagem genérica + log server-side) |
| 13 | Ops | A3 | scripts | **416 scripts (299 top-level, 90 legacy); só 24 referenciados no package.json** | `find scripts` | Sprawl operacional, scripts perigosos misturados | Arquivar não-canônicos em `scripts/legacy`; documentar os ~24 oficiais |
| 14 | Manut | A3 | observabilidade | **378 `console.log` no worker, 737 `console.*` no frontend** | `grep -c console` | Ruído, sem logging estruturado | Logger estruturado com níveis; remover logs de debug |
| 15 | Arq | A3 | EdApp | **Código EdApp morto mantido** "como referência mas não utilizado" | `index.ts:869-870`; `integracoes_edapp.ts` 1133 linhas + `lms-edapp-legado.ts` | Confusão, peso de manutenção | Mover para `legacy/` ou remover; manter só o shim 410 |

Classificação de confiança: itens 1,2,3,4,5,7,8,9,10,13,14 = **confirmado por código**; item 6 (N+1) = **suspeita forte** (loops detectados, requer leitura caso-a-caso); itens 11,12 = **confirmado** (contagem) com **impacto a medir**.

---

## 3. Mapa de arquitetura

**Dois runtimes no mesmo repo:** SPA React 19 (`src/react-app`) + Worker Cloudflare/Hono (`worker-airtrust/src`). D1 (SQLite) sem ORM.

**Worker (~140k linhas):**
- `index.ts` (1008) monta ~80 routers + middlewares globais (auth+tenant em `/api/*` com whitelist `isPublicPath`, no-cache seletivo, CSP, rate-limit seletivo, domain-event processor).
- `routes/` — **130+ arquivos**. Domínios: qualificações, simuladores, escalas/EVD, FRMS, LMS, SGSO, funcionários, empresas, admin, importação.
- `services/` — 28 arquivos (existe, mas rotas ainda carregam SQL pesado direto).
- `lib/frms/` — sub-biblioteca de cálculo (fira, jornadas, calculos) — boa separação isolada.
- `middleware/` — 12 (auth, tenant, rbac, cache, rate-limit, domainEventProcessor).

**Frontend (~164k linhas):**
- `pages/` 266 arquivos, `components/` (~30 subdiretórios), `hooks/queries` + `hooks/mutations` (React Query: 326 usos de useQuery/useMutation), `services/`, `i18n/`.
- Data fetching: maioria via hooks centralizados + `fetchWithAuth` (116 usos); **12 páginas** ainda fazem `useEffect`+fetch manual.

**Principais acoplamentos / pontos fracos:**
1. Rotas atuam como repository (SQL inline) → acoplamento regra↔persistência.
2. Schema vive em dois lugares: 356 migrations **+** DDL runtime em handlers → fonte da verdade ambígua.
3. Montagem de rotas dependente de ordem (`/api` compartilhado).
4. Status como strings livres → contrato implícito entre frontend e worker.

---

## 4. Top 10 arquivos para refatoração

| # | Arquivo | Linhas | Tipo de refatoração |
|---|---|---|---|
| 1 | `src/react-app/pages/Qualificacoes.tsx` | 4855 | Quebrar em sub-componentes por aba/seção + extrair hooks |
| 2 | `worker-airtrust/src/routes/frms.ts` | 3643 | Extrair SQL para repositório FRMS; separar leitura/escrita |
| 3 | `worker-airtrust/src/services/sigvoos-frms.ts` | 2931 | Separar parsing, sync e persistência; remover DDL runtime |
| 4 | `worker-airtrust/src/routes/escalas-alocacoes.ts` | 2267 | Já tem engine/helpers/schemas vizinhos — mover SQL p/ repo |
| 5 | `worker-airtrust/src/routes/lms-cursos.ts` | 2266 | Dividir por recurso (cursos / módulos / conteúdo) |
| 6 | `src/react-app/pages/escalas/EvdPage.tsx` | 2660 | Extrair grade, modais e lógica de conflito |
| 7 | `worker-airtrust/src/routes/escalas-evd.ts` | 2039 | Repositório + separar validação de conflito |
| 8 | `worker-airtrust/src/routes/frms-fadiga-checkin.ts` | 1971 | Mover schema (`ensure*Schema`) p/ migration; extrair cálculo |
| 9 | `src/react-app/pages/TreinamentosPlanejadosPage.tsx` | 2113 | Componentizar + remover dependência de DDL runtime no backend |
| 10 | `worker-airtrust/src/routes/auth.ts` | 1517 | Extrair serviço de auth (52 `.prepare`); isolar políticas de token |

---

## 5. Riscos de performance

**Queries:**
- **DDL por request** (`ensure*Schema`, ~60 sites) — P1, o de maior impacto e mais fácil de remover.
- **Possível N+1** (13 arquivos): `compliance.ts` (loops aninhados sobre qual/lic/req/lms), `simuladores-sessoes-update.ts`, `notificacoes-convocacao.ts` (query por destinatário).
- Tabelas críticas **têm** índices de tenant adequados (`funcionarios`, `qualificacoes_historico`, `sessoes`, `frms_jornada` com índices compostos em `empresa_id`) — **ponto positivo**.

**Frontend / dashboard:**
- PDF duplicado (~780kB raw em 2 chunks); `charts` 432kB, `excel` 429kB — candidatos a lazy-load mais agressivo (já há lazy routes).
- Componentes gigantes (Qualificacoes 4855, EvdPage 2660) re-renderizam muito; medir com profiler antes de otimizar.

**Scripts/ops:**
- 416 scripts; 24 tocam `--remote`/prod D1 (agora protegidos por `ops:guard`/preflight). Risco é de **manutenção/confusão**, não de runtime.

---

## 6. Índices / migrations candidatos (SEM criar migration)

Tenant indexes já existem para as tabelas quentes. Recomendações **a medir antes**:

| Tabela | Índice candidato | Ganho provável |
|---|---|---|
| `treinamentos_planejados` | `(empresa_id, data_prevista, deleted_at)` | médio — depende de volume |
| `escala_alocacoes` | confirmar índice em `(empresa_id, data)` além do `aeronave_funcao_data` | médio |
| (todas com `ensure*Schema`) | mover criação para migration formal **antes** de discutir índice | alto (resolve drift) |

> Não propor migration agressiva sem medição. O ganho #1 não é novo índice — é **tirar o DDL do caminho de request**.

---

## 7. Testability roadmap (priorizado)

1. **`hospedagem`** — 0 testes hoje; adicionar contrato + tenant-scope (T1).
2. **`sgso-next-gen`** — caminho crítico de KPI/auditoria, arquivo grande, 4 testes (T2).
3. **`lms-cursos`/`lms-matriculas`** — 5 testes para ~3900 linhas combinadas (T2).
4. **Teste de contrato de status** — garantir que frontend e worker concordam nos enums (cobre achado #7).
5. **Guard de tenant-scope sistemático** — lint/teste que falha se um `SELECT/UPDATE/DELETE` em tabela tenant não tiver `empresa_id` (transforma a regra do CLAUDE.md em verificação automática).

Pontos fortes a preservar: FRMS (42), auth (39), qualificações (37), tenant (29), escalas (26).

---

## 8. Refactoring roadmap

**0–7 dias (baixo risco, alto retorno):**
- Remover `POST /api/fix/populate-qualificacao-ids` ("FIX TEMPORÁRIO") e handlers inline mortos do `index.ts`.
- Padronizar respostas de erro: parar de vazar `error.message` em `details` (15 sites).
- Arquivar scripts não-canônicos em `scripts/legacy`; documentar os ~24 oficiais no README de ops.

**7–30 dias (estrutural moderado):**
- Migrar tabelas criadas por `ensure*Schema` para migrations numeradas; remover DDL dos hot paths (achado #1).
- Introduzir módulo central de status (worker + frontend) e substituir magic strings incrementalmente (#7).
- Consolidar geração de PDF em 1 caminho (#8).
- Adicionar testes para `hospedagem` e SGSO-next-gen.

**30–90 dias (refatoração de fundo):**
- Introduzir camada de repositório por domínio, começando por qualificações e escalas (#2).
- Quebrar os 10 arquivos gigantes (Top 10).
- Plano de descomissionamento das ~30 tabelas `_v2/_v3/_bak/_temp` (com autorização explícita p/ DROP em prod).
- Consolidar montagem de rotas (eliminar dependência de ordem em `/api`).

---

## 9. Decisão final

**B — Seguir com features, reservando capacidade fixa para refatoração gradual.**

Justificativa: build/types/testes verdes, segurança/tenant recém-endurecidos e cobertos por testes, índices de tenant presentes. A dívida é real mas **gerenciável incrementalmente**; não há risco que justifique pausa ampla (D). FRMS é o módulo a vigiar (C parcial), mas sua alta cobertura de testes reduz o risco de regressão durante evolução.

---

## 10. Próximas 5 ações (ordenadas)

1. **Remover DDL runtime dos hot paths** — migrar tabelas de `ensure*Schema` para migrations e tirar as chamadas dos handlers (#1, P1).
2. **Remover endpoint de fix temporário e handlers inline mortos do `index.ts`** (#4, baixo risco).
3. **Criar módulo central de status** e converter os caminhos de contagem/métrica primeiro (#7, evita bug de contagem por gênero).
4. **Cobrir `hospedagem` com testes** (contrato + tenant-scope) e elevar SGSO-next-gen (#10/#11).
5. **Arquivar/documentar scripts** — reduzir os 299 top-level aos ~24 canônicos + legacy documentado (#13).

---

## Confirmação de não-intervenção

- ✅ Nenhum código alterado
- ✅ Nenhum commit
- ✅ Nenhum push
- ✅ Nenhum deploy
- ✅ Nenhuma migration executada
- ✅ Nenhum acesso a DB remoto
- Único artefato criado: este relatório markdown **untracked** em `docs/`.
