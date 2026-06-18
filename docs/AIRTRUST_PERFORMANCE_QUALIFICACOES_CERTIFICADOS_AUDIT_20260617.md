# AirTrust — Auditoria Read-only de Performance, Qualificações, Certificados e Ficha de Presença

**Data:** 2026-06-17
**Escopo:** `/qualificacoes` (tela, hooks, API), ícone/modal de certificado, impressão de Ficha de Presença.
**Natureza:** Somente leitura. **Nenhum** código, banco, migration, deploy alterado.
**Fora de escopo (intocado):** SIGVOOS, FRMS, `frms-source-policy.ts`.

> Aviso de método: esta auditoria é estática (leitura de código). As causas marcadas como
> **HIPÓTESE (validar autenticado)** precisam de confirmação em runtime (console/network/DevTools)
> numa sessão autenticada de produção. Nenhuma credencial, token, cookie ou payload foi coletado.

---

## 1. Retorno obrigatório (resumo executivo)

**Causa provável da lentidão:**
Backend + ausência de cache, combinados. O endpoint `GET /api/qualificacoes/historico`
([historico.ts:133](worker-airtrust/src/routes/qualificacoes/historico.ts:133)) executa, **por requisição**:
(a) duas agregações de varredura completa (`statsQuery` e `globalCountsQuery`) com **subconsultas
correlacionadas** de renovação (`EXISTS … qh_renovadora.renovacao_de = qh.id`) avaliadas por linha
([historico.ts:54](worker-airtrust/src/routes/qualificacoes/historico.ts:54),
[historico.ts:297](worker-airtrust/src/routes/qualificacoes/historico.ts:297),
[historico.ts:336](worker-airtrust/src/routes/qualificacoes/historico.ts:336));
(b) a query paginada com a mesma subconsulta correlacionada por linha + JOINs não-sargáveis
([historico.ts:362](worker-airtrust/src/routes/qualificacoes/historico.ts:362)); e
(c) introspecção de schema por request (`PRAGMA table_info`) em
[historico.ts:241](worker-airtrust/src/routes/qualificacoes/historico-helpers.ts:241) e
[historico.ts:81](worker-airtrust/src/routes/qualificacoes/historico.ts:81).
No frontend, o hook usa `bypassGetCache: true`, que adiciona `_t=Date.now()` e header de bypass em
**toda** chamada ([useApi.ts:190](src/react-app/hooks/useApi.ts:190)), anulando cache de browser e
de Worker; o `staleTime` é 0, então o cache em memória nunca é usado
([useApi.ts:212](src/react-app/hooks/useApi.ts:212)). Resultado: cada filtro/ordenação/troca de
página re-executa as três queries pesadas sem reaproveitamento.

**Endpoints mais suspeitos:**
1. `GET /api/qualificacoes/historico` (lista + stats + globalCounts numa só rota) — **principal**.
2. A **segunda** chamada sempre-ativa a esse mesmo endpoint com `limit=500` (planejadas)
   ([Qualificacoes.tsx:304](src/react-app/pages/Qualificacoes.tsx:304)).
3. `GET /api/qualificacoes/historico/stats` (dashboard) — chamada adicional em paralelo
   ([Qualificacoes.tsx:389](src/react-app/pages/Qualificacoes.tsx:389)).

**Componentes/hooks mais suspeitos:**
- `useApi` com `bypassGetCache:true` + `staleTime:0` ([useApi.ts:105](src/react-app/hooks/useApi.ts:105)).
- `useQualificacoesHistorico` (duas instâncias na página) ([useQualificacoesExt.ts:127](src/react-app/hooks/useQualificacoesExt.ts:127)).
- `Qualificacoes.tsx` (componente monolítico de ~5.120 linhas; `filteredHistorico` recalcula sem memo)
  ([Qualificacoes.tsx:1075](src/react-app/pages/Qualificacoes.tsx:1075)).

**Causa provável do modal de certificado não abrir:** **HIPÓTESE (validar autenticado).**
O modal é carregado por `lazyWithRetry` + `Suspense fallback={null}` sem error boundary visível
([Qualificacoes.tsx:84](src/react-app/pages/Qualificacoes.tsx:84),
[Qualificacoes.tsx:5062](src/react-app/pages/Qualificacoes.tsx:5062)). Após um deploy recente, um
chunk hasheado obsoleto/ausente faz o `import()` dinâmico rejeitar; com `fallback={null}` e sem
boundary, a falha é silenciosa (modal “não abre”). Hipótese secundária: re-render síncrono do
componente de 5k linhas ao clicar dá a percepção de travamento.

**Causa provável do erro na ficha de presença:** **HIPÓTESE (validar autenticado).**
`handleGerarListaPresenca` faz `await import('jspdf')` e `await gerarPDFListaPresenca()` **antes** de
chamar `previewPdfBeforeDownload`, que só então executa `window.open()`
([ModalCertificado.tsx:288](src/react-app/components/modals/ModalCertificado.tsx:288),
[pdfPreview.ts:235](src/react-app/utils/pdfPreview.ts:235)). Dois efeitos:
(1) `window.open` fora do gesto do usuário → bloqueado por popup-blocker → degrada para download;
(2) se o chunk `jspdf`/`pdf-lista-presenca` falhar ao carregar (mesmo cenário de chunk obsoleto),
o `catch` dispara `toast.error('❌ Erro ao gerar lista: …')` — o “erro ao imprimir” observado.

**Correções recomendadas frontend-only:** ver §8.A.
**Correções recomendadas backend:** ver §8.B.
**Correções que exigiriam migration/índice (fora do escopo):** ver §8.C.
**Riscos:** ver §9.
**Prioridade:** ver §10.
**Próximos passos para Codex 5.4:** ver §11.

| Restrição | Status |
|---|---|
| Banco alterado | **não** |
| Migrations | **não** |
| Deploy | **não** |
| SIGVOOS | **não** |
| FRMS | **não** |

---

## 2. Tela `/qualificacoes` — componentes, hooks, filtros, modais, API

### 2.1 Fluxo de dados
- Componente raiz: [Qualificacoes.tsx](src/react-app/pages/Qualificacoes.tsx) (~5.120 linhas).
- Dados do Histórico via `useQualificacoesHistorico` → `useApi`
  ([useQualificacoesExt.ts:127](src/react-app/hooks/useQualificacoesExt.ts:127),
  [useApi.ts:105](src/react-app/hooks/useApi.ts:105)).
- Paginação **server-side** (`limit`/`page`), padrão 50, opções 50/100
  ([Qualificacoes.tsx:180](src/react-app/pages/Qualificacoes.tsx:180),
  [Qualificacoes.tsx:2949](src/react-app/pages/Qualificacoes.tsx:2949)).

### 2.2 Chamadas de API disparadas ao abrir a aba Histórico (waterfall)
1. `historico` principal (com stats) — [Qualificacoes.tsx:287](src/react-app/pages/Qualificacoes.tsx:287).
2. `historico` planejadas `limit=500` **sempre ativa** — [Qualificacoes.tsx:304](src/react-app/pages/Qualificacoes.tsx:304).
3. `treinamentos-planejados` (convocação) — [Qualificacoes.tsx:317](src/react-app/pages/Qualificacoes.tsx:317).
4. `historico/stats` (dashboard) — [Qualificacoes.tsx:389](src/react-app/pages/Qualificacoes.tsx:389).
5. `/setores` — [Qualificacoes.tsx:622](src/react-app/pages/Qualificacoes.tsx:622).
6. `categorias` (URL por setor) — [Qualificacoes.tsx:883](src/react-app/pages/Qualificacoes.tsx:883).
7. Tipos / funcionários ativos (hooks dedicados).

→ Múltiplas requisições paralelas no mount; as nº 1, 2 e 4 batem na **mesma rota cara**.

### 2.3 Cache / invalidate (TanStack vs. custom)
- A lista **não** usa TanStack Query; usa o `useApi` caseiro. Com `bypassGetCache:true` e
  `staleTime:0`, **não há cache efetivo**: o `inMemoryGetCache` só é consultado quando `staleTime>0`
  ([useApi.ts:212](src/react-app/hooks/useApi.ts:212)), e o cache-buster `_t` impede cache HTTP/Worker
  ([useApi.ts:190](src/react-app/hooks/useApi.ts:190)).
- `refetch` limpa o cache por padrão de URL e re-busca ([useApi.ts:370](src/react-app/hooks/useApi.ts:370)).
- Ao **fechar** o modal de certificado, `onClose` chama `carregarHistorico()` → refetch completo das
  3 queries pesadas ([Qualificacoes.tsx:5070](src/react-app/pages/Qualificacoes.tsx:5070)).

### 2.4 Recomputações / render
- `filteredHistorico` é um `.filter()` **sem `useMemo`** e serve de dependência do `useMemo` de
  `prioritizedHistorico` → nova referência por render invalida o memo e o `sort` roda a cada render
  ([Qualificacoes.tsx:1075](src/react-app/pages/Qualificacoes.tsx:1075)).
  Impacto **limitado** porque a página é paginada (50–100 linhas), mas é desperdício real em
  componente tão grande.
- Não há loop de refetch infinito aparente; as dependências do efeito de `useApi` são
  `[url, enabled, authToken]` ([useApi.ts:360](src/react-app/hooks/useApi.ts:360)).

---

## 3. Fluxo do ícone de certificado

- Botão `Award` na célula de ações, renderizado só quando `!isCancelada && !isPlanejada`
  ([Qualificacoes.tsx:2104](src/react-app/pages/Qualificacoes.tsx:2104)).
- Handler: `setHistoricoSelecionado(item); setShowCertModal(true)`
  ([Qualificacoes.tsx:2107](src/react-app/pages/Qualificacoes.tsx:2107)).
- Montagem condicional: `historicoSelecionado && historicoSelecionado.id` + `isOpen={showCertModal}`,
  dentro de `Suspense fallback={null}` com `ModalCertificado` lazy
  ([Qualificacoes.tsx:5062](src/react-app/pages/Qualificacoes.tsx:5062),
  [Qualificacoes.tsx:84](src/react-app/pages/Qualificacoes.tsx:84)).
- Ao abrir, o modal busca `GET /api/certificados/historico/:id/certificados` com cache-buster
  ([ModalCertificado.tsx:188](src/react-app/components/modals/ModalCertificado.tsx:188)); o endpoint
  faz ownership-check + introspecção + query principal
  ([qualificacoes-certificados.ts:16](worker-airtrust/src/routes/qualificacoes-certificados.ts:16)).

**RBAC:** o botão não tem gate de role no frontend; a proteção é `auth()` no backend. Não foi
observado bloqueio silencioso por permissão neste caminho (validar autenticado se o modal não abrir
apenas para certos perfis).

**Erros silenciosos:** `Suspense fallback={null}` + ausência de error boundary tornam falha de chunk
invisível ⇒ ver §1 (causa do modal não abrir). `carregarCertificados` trata erro com `toast.error`,
mas isso é **após** o modal já montar ([ModalCertificado.tsx:212](src/react-app/components/modals/ModalCertificado.tsx:212)).

---

## 4. Impressão da Ficha de Presença

- Botão “Gerar Lista de Presença” → `handleGerarListaPresenca`
  ([ModalCertificado.tsx:676](src/react-app/components/modals/ModalCertificado.tsx:676),
  [ModalCertificado.tsx:288](src/react-app/components/modals/ModalCertificado.tsx:288)).
- Geração **client-side** com jsPDF (sem endpoint backend): `gerarPDFListaPresenca`
  ([pdf-lista-presenca.ts:94](src/react-app/services/pdf-lista-presenca.ts:94)).
- Pré-visualização via `previewPdfBeforeDownload` → `window.open('', '_blank')`
  ([pdfPreview.ts:227](src/react-app/utils/pdfPreview.ts:227)).
- Dados obrigatórios: nome/código da qualificação, data de conclusão, nome/matrícula do participante
  ([ModalCertificado.tsx:292](src/react-app/components/modals/ModalCertificado.tsx:292)). O PDF tolera
  campos vazios (não lança por dado ausente).
- Logo: tenta `dados.logoUrl` (não é passado) e cai para `/api/empresas/minha/logo-base64`; falha é
  silenciada ([pdf-lista-presenca.ts:82](src/react-app/services/pdf-lista-presenca.ts:82)).

**Pontos de erro (ordem de probabilidade):**
1. **Popup bloqueado / perda de gesto:** `window.open` ocorre **após** `await import(...)` e
   `await gerarPDFListaPresenca()`, fora do clique original. O util tem suporte a janela pré-aberta
   (`openPreviewWindow()` / `existingWindow`) justamente para evitar isso
   ([pdfPreview.ts:223](src/react-app/utils/pdfPreview.ts:223)), **mas o handler não usa**. Degrada
   para download; em alguns navegadores aparece como “falha ao abrir”.
2. **Falha de chunk dinâmico** (`jspdf`/`pdf-lista-presenca`) após deploy → `catch` →
   `toast.error('❌ Erro ao gerar lista: …')` ([ModalCertificado.tsx:311](src/react-app/components/modals/ModalCertificado.tsx:311)).
3. **Contexto não-seguro:** `crypto.randomUUID()` em `buildPresenceFilename`
   ([ModalCertificado.tsx:108](src/react-app/components/modals/ModalCertificado.tsx:108)) lança se a
   página não estiver em HTTPS/secure-context (improvável em produção; confirmar se houver proxy/origem custom).

> Todos os três são **HIPÓTESE (validar autenticado)** — exigem reprodução com Console/Network aberto.

---

## 5. Performance — diagnóstico detalhado

### 5.1 Backend (dominante)
- **Três passagens por request** sobre `qualificacoes_historico ⨝ funcionarios`: `statsQuery`,
  `globalCountsQuery`, `dataQuery` ([historico.ts:297](worker-airtrust/src/routes/qualificacoes/historico.ts:297),
  [historico.ts:336](worker-airtrust/src/routes/qualificacoes/historico.ts:336),
  [historico.ts:362](worker-airtrust/src/routes/qualificacoes/historico.ts:362)).
- **Subconsulta correlacionada de renovação** (`EXISTS … renovacao_de = qh.id`) avaliada **por linha**
  em todas as três + nos filtros de status ([historico.ts:55](worker-airtrust/src/routes/qualificacoes/historico.ts:55)).
- **Expressões não-sargáveis** impedem índices: cálculo de vencimento com `date(…, '+'||meses||' months')`
  e `julianday(...)` ([historico.ts:250](worker-airtrust/src/routes/qualificacoes/historico.ts:250)); JOIN de
  categoria por `UPPER(TRIM(qc.nome)) = UPPER(TRIM(...))` ([historico.ts:416](worker-airtrust/src/routes/qualificacoes/historico.ts:416));
  JOIN de modelo por `CAST(ma.id AS TEXT) = f.modelo_aeronave_id` ([historico.ts:415](worker-airtrust/src/routes/qualificacoes/historico.ts:415));
  filtro de aeronave com `INSTR(...)` + subconsulta correlacionada ([historico.ts:219](worker-airtrust/src/routes/qualificacoes/historico.ts:219)).
- **Introspecção por request:** `PRAGMA table_info(modelos_aeronave)`
  ([historico-helpers.ts:241](worker-airtrust/src/routes/qualificacoes/historico-helpers.ts:241)) e
  `PRAGMA table_info(qualificacoes_historico)` ([historico.ts:81](worker-airtrust/src/routes/qualificacoes/historico.ts:81))
  a cada chamada — round-trips extras evitáveis.
- **`stats=false` ignorado:** o handler **não lê** o parâmetro `stats`
  ([historico.ts:150](worker-airtrust/src/routes/qualificacoes/historico.ts:150)). A 2ª chamada
  (planejadas, `limit=500`, `stats=false`) **mesmo assim** dispara `statsQuery` + `globalCountsQuery`.
  É um **fallback silencioso**: o contrato `includeStats=false` do frontend não tem efeito.
- A rota `/historico/stats-extended` tem cache materializado
  ([shared.ts:51](worker-airtrust/src/routes/qualificacoes/shared.ts:51)), mas a **lista principal não usa cache**.

### 5.2 Frontend
- Sem cache efetivo (cache-buster + `staleTime:0`) → refetch integral a cada interação.
- Refetch ao fechar o modal de certificado ([Qualificacoes.tsx:5070](src/react-app/pages/Qualificacoes.tsx:5070)).
- 2ª query sempre-ativa de 500 planejadas, independentemente da aba ([Qualificacoes.tsx:304](src/react-app/pages/Qualificacoes.tsx:304)).
- `filteredHistorico` sem memo ([Qualificacoes.tsx:1075](src/react-app/pages/Qualificacoes.tsx:1075)) — impacto menor.

### 5.3 Frontend vs. backend
O gargalo perceptível é **backend + ausência de cache**. O custo de render local é secundário (lista
paginada). A latência cresce com o tamanho do tenant por causa das subconsultas correlacionadas e das
três varreduras por request, **multiplicadas** pela ausência de cache e pelas chamadas duplicadas.

---

## 6. Causas prováveis (consolidado)

| Sintoma | Causa provável | Confiança |
|---|---|---|
| Lentidão `/qualificacoes` | 3 queries de varredura + subconsulta correlacionada por linha + PRAGMA por request, sem cache (cache-buster) + chamadas duplicadas à mesma rota | **Alta** (estática) |
| Modal de certificado não abre | Falha de chunk lazy (`Suspense fallback={null}` sem boundary) pós-deploy; e/ou percepção de travamento por re-render do componente gigante | **Hipótese — validar autenticado** |
| Erro ao imprimir ficha | `window.open` após `await` (popup bloqueado) e/ou falha de chunk `jspdf` → `toast.error` no `catch` | **Hipótese — validar autenticado** |

---

## 7. Separação dos achados

**Frontend-only**
- Cache-buster sempre-ativo + `staleTime:0` ([useApi.ts:184](src/react-app/hooks/useApi.ts:184)).
- 2ª query planejadas `limit=500` sempre ativa ([Qualificacoes.tsx:304](src/react-app/pages/Qualificacoes.tsx:304)).
- `Suspense fallback={null}` sem error boundary no modal ([Qualificacoes.tsx:5062](src/react-app/pages/Qualificacoes.tsx:5062)).
- `window.open` após `await` na ficha de presença ([ModalCertificado.tsx:288](src/react-app/components/modals/ModalCertificado.tsx:288)).
- `filteredHistorico` sem memo ([Qualificacoes.tsx:1075](src/react-app/pages/Qualificacoes.tsx:1075)).

**Backend/API**
- 3 varreduras por request na lista ([historico.ts:297](worker-airtrust/src/routes/qualificacoes/historico.ts:297)+).
- Subconsulta correlacionada de renovação por linha ([historico.ts:55](worker-airtrust/src/routes/qualificacoes/historico.ts:55)).
- `stats=false` ignorado (fallback silencioso) ([historico.ts:150](worker-airtrust/src/routes/qualificacoes/historico.ts:150)).
- PRAGMA introspecção por request ([historico-helpers.ts:241](worker-airtrust/src/routes/qualificacoes/historico-helpers.ts:241), [historico.ts:81](worker-airtrust/src/routes/qualificacoes/historico.ts:81)).
- Ausência de cache na lista principal (vs. `stats-extended` que tem).

**Dependente de banco/índice/migration (FORA do escopo desta auditoria)**
- Índice em `qualificacoes_historico(renovacao_de)` para a subconsulta correlacionada.
- Índice/coluna que torne sargável o JOIN de categoria e o de modelo (`CAST AS TEXT`).
- Eventual coluna/índice de vencimento materializado para evitar `date()/julianday()` por linha.

**Precisa de validação autenticada**
- Reproduzir “modal não abre” e “erro na ficha” com Console/Network (chunk 404? popup blocked?
  `crypto.randomUUID` indefinido?).
- Medir tempo real das 3 queries em produção (sem expor dados) via logs/observabilidade.

**Risco regulatório/operacional**
- Ficha de Presença atende IS 135-003D (nota no PDF, [pdf-lista-presenca.ts:259](src/react-app/services/pdf-lista-presenca.ts:259));
  falha de impressão impacta evidência de treinamento.
- Certificados são documento de conformidade; modal inacessível bloqueia geração/anexação.
- **Não mexer** em SIGVOOS/FRMS ao corrigir — rotas vizinhas no mesmo módulo.

---

## 8. Correções recomendadas (NÃO aplicadas — apenas proposta)

### 8.A Frontend-only
1. **Reativar cache da lista:** parar de usar `bypassGetCache:true` na lista de qualificações e definir
   um `staleTime` curto (ex.: 15–30 s) no `useQualificacoesHistorico`, mantendo invalidação explícita
   após mutações. Hoje o cache em memória é inerte ([useApi.ts:212](src/react-app/hooks/useApi.ts:212)).
2. **Gate da 2ª query (planejadas 500):** só habilitar quando a aba/uso exigir, via `enabled`
   ([Qualificacoes.tsx:304](src/react-app/pages/Qualificacoes.tsx:304)).
3. **Error boundary + fallback visível** no `Suspense` do modal, com retry de chunk, para que falha de
   import não vire “modal não abre” silencioso ([Qualificacoes.tsx:5062](src/react-app/pages/Qualificacoes.tsx:5062)).
4. **Pré-abrir a janela no clique** na ficha de presença usando `openPreviewWindow()` e passando
   `existingWindow`, eliminando o bloqueio de popup ([pdfPreview.ts:223](src/react-app/utils/pdfPreview.ts:223),
   [ModalCertificado.tsx:288](src/react-app/components/modals/ModalCertificado.tsx:288)).
5. **Memoizar `filteredHistorico`** ([Qualificacoes.tsx:1075](src/react-app/pages/Qualificacoes.tsx:1075)).
6. **Fallback de `crypto.randomUUID`** (guard) no nome do arquivo, se a validação apontar contexto não-seguro.

### 8.B Backend
1. **Honrar `stats=false`:** ler o parâmetro e pular `statsQuery`/`globalCountsQuery` quando não pedido
   — corrige o fallback silencioso e remove 2 varreduras da 2ª chamada
   ([historico.ts:150](worker-airtrust/src/routes/qualificacoes/historico.ts:150)).
2. **Remover PRAGMA por request:** memoizar o resultado de `hasHistoricoRenovacaoDeColumn` e de
   `ensureModelosAeronaveModeloColumn` em cache de processo/isolate
   ([historico.ts:81](worker-airtrust/src/routes/qualificacoes/historico.ts:81),
   [historico-helpers.ts:241](worker-airtrust/src/routes/qualificacoes/historico-helpers.ts:241)).
3. **Cache de lista** análogo ao `stats-extended` ([shared.ts:51](worker-airtrust/src/routes/qualificacoes/shared.ts:51)),
   com TTL curto e invalidação nas escritas.
4. **Reduzir custo da subconsulta correlacionada** (ex.: pré-computar conjunto de `renovacao_de` numa
   CTE/derivada única em vez de `EXISTS` por linha) ([historico.ts:55](worker-airtrust/src/routes/qualificacoes/historico.ts:55)).
   *(reescrita de query; sem DDL)*

### 8.C Exigiriam migration/índice — FORA do escopo (somente registrar, não executar)
- Índice em `qualificacoes_historico(renovacao_de)`.
- Estratégia sargável para categoria/modelo (normalização ou coluna derivada + índice).
- Materialização de vencimento para eliminar `date()/julianday()` por linha.

> Estes itens **não** devem ser implementados nesta fase: implicam migration/alteração de banco.

---

## 9. Riscos

- **Operacional/Regulatório:** ficha de presença e certificado são evidências (IS 135-003D); falhas
  bloqueiam conformidade.
- **Regressão lateral:** o módulo de qualificações compartilha arquivos com rotas sensíveis; qualquer
  fix deve evitar SIGVOOS/FRMS e `frms-source-policy.ts`.
- **Cache mal calibrado:** reativar cache sem invalidar nas mutações pode mostrar dado obsoleto (a tela
  já força refetch ao fechar modal — manter invalidação explícita).
- **Fallback silencioso (`stats=false` ignorado):** mascarou custo extra; corrigir pode mudar levemente
  números exibidos se algo dependia do efeito colateral — validar.
- **Validação ainda pendente:** as causas do modal/ficha são hipóteses; agir sem reproduzir pode
  tratar sintoma errado.

---

## 10. Prioridade

| # | Ação | Tipo | Prioridade |
|---|---|---|---|
| 1 | Validar autenticado: chunk 404 / popup blocked / `randomUUID` (modal + ficha) | Diagnóstico | **P0** |
| 2 | Honrar `stats=false` + memoizar PRAGMA (corta varreduras e round-trips) | Backend | **P0** |
| 3 | Reativar cache da lista (frontend `staleTime` / parar cache-buster) | Frontend | **P1** |
| 4 | Pré-abrir janela na ficha (anti-popup-blocker) | Frontend | **P1** |
| 5 | Error boundary + fallback no `Suspense` do modal | Frontend | **P1** |
| 6 | Gate da 2ª query planejadas (500) | Frontend | **P2** |
| 7 | Reescrever subconsulta correlacionada de renovação (CTE) | Backend | **P2** |
| 8 | Índices/migration (registrados, NÃO executar agora) | Banco | **Fora de escopo** |

---

## 11. Próximos passos para Codex 5.4

1. **Reproduzir autenticado** o “modal não abre” e o “erro na ficha” com DevTools (Network + Console):
   confirmar 404 de chunk hasheado, popup bloqueado e/ou `crypto.randomUUID` indefinido. Registrar sem
   expor tokens/payloads.
2. **Backend (sem DDL):** ler/honrar `stats=false` em `GET /historico`; memoizar as duas checagens
   PRAGMA por isolate; avaliar cache curto na lista (espelhando `stats-extended`).
3. **Frontend:** parar o cache-buster na lista + `staleTime` curto; gate da 2ª query planejadas;
   error boundary com retry no `Suspense` do modal; pré-abrir janela do PDF no clique; memoizar
   `filteredHistorico`.
4. **Medir antes/depois** (tempo de resposta da rota e nº de requisições no mount) para quantificar o ganho.
5. **Itens de banco/índice:** apenas documentar como backlog; **não** criar/aplicar migration nesta fase.
6. **Guardrails:** não tocar SIGVOOS, FRMS, `frms-source-policy.ts`; sem `git add .`/`-A`; sem commit/deploy/DML.

---

### Confirmação de restrições

- **Banco alterado:** não
- **Migrations:** não
- **Deploy:** não
- **SIGVOOS:** não
- **FRMS:** não
- Nenhum dado sensível, token, cookie ou payload exposto neste relatório.
