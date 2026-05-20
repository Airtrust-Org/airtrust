# Relatorio QA Escalas - 2026-03-07

## Escopo executado neste ciclo

- Ambiente principal de validacao: producao em https://airtrust.online/escalas
- Escala usada para retestes de estado vazio: Escala 1/2026 (`215d995a-c91f-4545-acfa-6271afaec19d`)
- Objetivo deste ciclo: validar regressos criticos do modulo Escalas, corrigir causas raiz encontradas em codigo, publicar e retestar em producao

## Resumo executivo

- Status geral do ciclo: PARCIAL
- Resultado principal: os bloqueios criticos que impediam a validacao do fluxo vazio e da visao de tripulantes foram corrigidos e retestados em producao
- Correcoes publicadas:
  - endpoint de cobertura de tripulantes voltou de HTTP 500 para HTTP 200
  - escala vazia agora exibe CTA unico na grade
  - acoes `Situacao` e `Adicionar` deixaram de aparecer no topo em escala sem alocacao operacional
  - `Limpar todos` voltou a aparecer nos filtros
  - banner de cobertura incompleta voltou a aparecer
  - service worker deixou de servir HTML antigo para rotas SPA como `/escalas`

## Casos executados

| ID  | Caso                                                            | Resultado    | Evidencia                                                                                                | Causa raiz                                                                    | Acao executada                                                                           |
| --- | --------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| R01 | Abrir lista de Escalas em producao                              | PASS         | lista carregou com meses 2026 e versao publicada                                                         | n/a                                                                           | validado em browser                                                                      |
| R02 | Abrir Escala 1/2026 vazia                                       | PASS         | escala abriu com `0 alocacoes` e `0 eventos`                                                             | n/a                                                                           | validado em browser                                                                      |
| R03 | Endpoint `/api/escalas/:id/cobertura/tripulantes`               | FAIL -> PASS | antes retornava HTTP 500; apos correcao retornou HTTP 200 com `success: true` e `resumo.total = 20`      | SQL assumia coluna `f.role`, inexistente no schema D1 de producao             | rota endurecida com `PRAGMA table_info(funcionarios)` e fallback para `funcao`/`cargo`   |
| R04 | Banner de cobertura de tripulantes incompleta                   | PASS         | banner amarelo exibido na Escala 1/2026 com `20 tripulantes ainda precisam de alocacao total no mes`     | regressao de UI em deploy anterior                                            | banner restaurado e retestado                                                            |
| R05 | Filtro `Limpar todos`                                           | PASS         | botao `Limpar todos` visivel na tela da escala                                                           | regressao de UI em iteracao anterior                                          | acao restaurada em frontend                                                              |
| R06 | Escala vazia nao deve exibir `Situacao` no topo                 | FAIL -> PASS | antes o topo exibia `Situacao`; apos deploy o botao desapareceu                                          | bundle antigo em producao e condicao de visibilidade nao refletida no cliente | condicao consolidada em `EscalasPage` e novo deploy                                      |
| R07 | Escala vazia nao deve exibir `Adicionar` no topo                | FAIL -> PASS | antes o topo exibia `Adicionar`; apos deploy o botao desapareceu                                         | bundle antigo em producao e cache antigo da rota SPA                          | condicao consolidada em `EscalasPage` e ajuste no service worker                         |
| R08 | Escala vazia deve exibir CTA unico `Alocar Tripulante` na grade | FAIL -> PASS | apos o deploy validado ha exatamente 1 ocorrencia do texto `Alocar Tripulante`                           | cliente servia HTML antigo e nao renderizava CTA da grade                     | CTA ja existia no codigo; service worker corrigido e bundle atualizado                   |
| R09 | Versionamento do frontend apos deploy                           | FAIL -> PASS | HTML publicado passou a expor `ad343a32`; app rodando tambem passou a exibir `ad343a32`                  | service worker tratava rotas SPA como `cache-first`, mantendo HTML stale      | `public/sw.js` alterado para `network-first` em navegacao e `CACHE_VERSION` incrementado |
| R10 | Modal `Nova alocacao operacional` em localhost com dados reais  | FAIL -> PASS | antes abria janeiro/2026 como `30/12/2025 -> 14/01/2026`; apos correcao abriu `01/01/2026 -> 15/01/2026` | presets legados incorretos em codigo e API local apontando para backend local | frontend passou a normalizar ranges legados e `localhost` voltou a usar API de producao  |
| R11 | Alternancia para `2ª quinzena` no modal                         | FAIL -> PASS | apos correcao passou a exibir `16/01/2026 -> 31/01/2026`                                                 | mesmo preset legado incorreto herdado no consumo das quinzenas                | normalizacao aplicada no hook `useQuinzenasQuery` e default generico consolidado         |

## Causas raiz confirmadas

### 1. Incompatibilidade de schema no endpoint de cobertura

- Arquivo: `worker-airtrust/src/routes/escalas-cobertura.ts`
- Problema: a query usava `f.role` como se fosse coluna existente em producao
- Efeito: falha 500 no endpoint de cobertura de tripulantes, bloqueando a visao `Tripulantes` e qualquer analise de cobertura por pessoa
- Correcao aplicada:
  - introspecao de schema com `PRAGMA table_info(funcionarios)`
  - expressao de papel com fallback para `funcao` e `cargo`
  - clausula `WHERE` montada dinamicamente apenas com colunas presentes

### 2. Cache incorreto de rotas SPA no service worker

- Arquivo: `public/sw.js`
- Problema: a rota `/escalas` nao era tratada como HTML/navegacao e caia na estrategia `cache-first`
- Efeito: mesmo apos deploy, o browser integrado continuava rodando bundle velho (`6fb78776`) enquanto o HTML publicado ja estava em `87736e99` e depois `ad343a32`
- Correcao aplicada:
  - navegacoes SPA passaram a usar `network-first`
  - `CACHE_VERSION` incrementado para `airtrust-v2` para expulsar caches antigos

### 3. Presets legados de quinzena cruzando o mes

- Arquivos:
  - `worker-airtrust/src/routes/escalas.ts`
  - `src/react-app/pages/escalas/utils/quinzenas.ts`
  - `src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts`
  - `src/react-app/config/api.ts`
- Problema:
  - havia presets hardcoded que montavam janeiro/2026 como `2025-12-30 -> 2026-01-14`
  - em `localhost`, a configuracao ainda priorizava backend local, contrariando o fluxo real deste workspace de validar UI local contra dados de producao
- Efeito:
  - o modal `Nova alocacao operacional` abria a 1ª quinzena com datas fora do mes
  - apos limpar o cache local, a UI podia voltar a buscar o backend local e perder a base real de dados usada neste fluxo de QA
- Correcao aplicada:
  - `getDefaultQuinzenaRange` passou a gerar quinzenas sempre limitadas ao proprio mes
  - o hook `useQuinzenasQuery` passou a normalizar apenas os ranges legados incorretos conhecidos, preservando demais dados
  - `localhost` voltou a apontar para `https://airtrust-api-production.airtrust.workers.dev/api` por padrao quando nao houver override explicito via `VITE_API_URL`

## Arquivos alterados neste ciclo

- `src/react-app/pages/escalas/EscalasPage.tsx`
- `worker-airtrust/src/routes/escalas-cobertura.ts`
- `public/sw.js`
- `worker-airtrust/src/routes/escalas.ts`
- `src/react-app/pages/escalas/utils/quinzenas.ts`
- `src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts`
- `src/react-app/config/api.ts`
- `src/__tests__/quinzenas-normalization.test.ts`

## Deploys e retestes

- Deploy 1: publicou correcoes de Escalas e Worker; endpoint ainda exigiu hotfix adicional de schema
- Deploy 2: Worker publicado com a correcao de schema; endpoint voltou a HTTP 200
- Deploy 3: Pages + Worker publicados com a correcao do service worker; frontend passou a carregar a versao `ad343a32`

## Evidencias finais de producao

- Frontend publicado: `ad343a32`
- Worker health: `success: true`, `environment: production`, `version: ad343a32`
- Endpoint `GET /api/escalas/215d995a-c91f-4545-acfa-6271afaec19d/cobertura/tripulantes`: `HTTP 200`
- Escala 1/2026 vazia:
  - `Alocar Tripulante`: 1 ocorrencia
  - `Situacao`: ausente no topo
  - `Adicionar`: ausente no topo
  - `Limpar todos`: presente
  - banner de cobertura: presente

## Evidencias finais em localhost com dados de producao

- Ambiente validado: `http://localhost:3000/escalas`
- Escala 1/2026 vazia continua com:
  - `Alocar Tripulante`: 1 ocorrencia
  - `Situacao`: ausente no topo
  - `Adicionar`: ausente no topo
  - `Limpar todos`: presente
  - banner de cobertura: presente
- Modal `Nova alocacao operacional`:
  - `1ª quinzena`: `01/01/2026 -> 15/01/2026`
  - `2ª quinzena`: `16/01/2026 -> 31/01/2026`
- Regressao automatizada adicionada:
  - `npm run test:escalas:quinzenas`

## Pendencias

- A matriz completa de 228 casos ainda precisa ser executada integralmente bloco a bloco
- Este relatorio cobre apenas os casos efetivamente testados, corrigidos e retestados neste ciclo
