# Relatorio Detalhado - FRMS: Layout, Consistencia de Efetividade e Recuperacao de Sessao

**Data:** 12 de marco de 2026  
**Commit publicado:** `3533365a`  
**Status geral:** FRMS corrigido e validado em producao; refresh de sessao publicado tanto nos hooks principais quanto nos clientes legados mais sensiveis  
**Escopo:** frontend FRMS, backend FRMS, bootstrap de autenticacao e hooks de API

---

## 1. Resumo Executivo

Esta execucao consolidou quatro frentes relacionadas, mas distintas:

1. **Redesenho do topo do dashboard FRMS** para reduzir poluicao visual e melhorar hierarquia.
2. **Correcao da divergencia entre cards de efetividade e heatmap**, onde o dashboard mostrava severidade que nao aparecia no grafico visivel.
3. **Correcao do fluxo de expiracao de sessao no frontend**, para tentar renovar o token antes de derrubar o usuario no primeiro `401`.
4. **Padronizacao dos clientes legados criticos**, cobrindo `http-client`, `ApiAdapter` e notificacoes de Escala.

### Resultado final consolidado

- O layout FRMS ficou mais legivel, com chips e cards integrados ao fluxo principal da pagina.
- A divergencia de severidade foi eliminada na origem, alinhando resumo e heatmap ao mesmo recorte temporal e ao mesmo criterio de severidade.
- A leitura de producao passou a mostrar `Severa 0` de forma coerente no card e no heatmap validado.
- O frontend agora tenta renovar a sessao tanto na montagem inicial quanto durante chamadas via `useApi` e `useApiMutation`.
- O cliente HTTP legado e o bell de notificacoes de Escala agora tambem recuperam sessao antes de falhar definitivamente.

### Estado de publicacao

- **Deployado e validado em producao:** correcoes de layout FRMS, consistencia FRMS e ajuste de recuperacao de sessao do frontend.
- **Versao publicada em Pages, worker alternativo e API:** `3533365a`.

---

## 2. Objetivo da Intervencao

O objetivo imediato era resolver duas reclamacoes do uso real:

- a tela FRMS estava visualmente confusa;
- o dashboard de efetividade aparentava estar "congelado", mostrando severidade que nao correspondia ao heatmap.

Na sequencia, surgiu um terceiro problema operacional durante a validacao local:

- a sessao expirava e o frontend removia o usuario imediatamente, mesmo quando havia `refresh_token` salvo e recuperavel.

---

## 3. Sintomas Observados

### 3.1 Sintomas de UI

- header, chips e cards criavam a sensacao de camadas empilhadas demais;
- a area superior parecia fragmentada e com excesso de informacao concorrente;
- os cards de compliance e efetividade disputavam protagonismo com os filtros.

### 3.2 Sintomas de dados

- o card de efetividade mostrava `2 severa`;
- o heatmap visivel nao mostrava a mesma severidade no mesmo contexto;
- a percepcao do usuario foi correta: havia inconsistencia entre o agregado do dashboard e a visualizacao do grafico.

### 3.3 Sintomas de autenticacao

- em `localhost:3000/frms`, o app caia em login apos expiracao do token de acesso;
- o fluxo nao tentava renovar a sessao antes do logout em varias rotas criticas;
- a sessao podia ser perdida desnecessariamente mesmo havendo `refresh_token` persistido.

---

## 4. Causa Raiz

## 4.1 Layout confuso

O problema nao era um unico componente isolado, mas a composicao:

- header fixo;
- faixa de chips separada;
- blocos de cards com visual de outra camada;
- area de conteudo rolavel iniciando somente depois desses elementos.

Isso criava excesso de fronteiras visuais e pouca continuidade entre contexto, filtros e leitura operacional.

## 4.2 Divergencia entre cards e heatmap

Foram encontradas **duas causas raiz de dados**.

### Causa A: enrichment de efetividade fora da janela visivel

No backend, a funcao `enrichWithEffectiveness(...)` enriquecia a frota com a **ultima efetividade global** por tripulante, sem respeitar o periodo visivel selecionado no dashboard.

Consequencia:

- o card usava uma severidade possivelmente fora do periodo atual;
- o heatmap mostrava apenas o periodo solicitado;
- resumo e grafico nao estavam lendo o mesmo universo temporal.

### Causa B: rolling view aceitando datas futuras

Na visao rolling, consultas ainda permitiam linhas futuras de `frms_acumulo_rolling`.

Consequencia:

- o backend podia contar uma severidade em data futura;
- a tela visivel nao necessariamente exibia essa mesma data no contexto esperado;
- surgia uma severidade "fantasma" no agregado.

## 4.3 Fluxo de sessao interrompido cedo demais

O frontend possuia infraestrutura para refresh em `src/react-app/config/api.ts` e no `AuthContext`, mas os pontos de uso estavam assim:

- `AuthContext` limpava a sessao ao receber `401/403` em `/auth/me` durante o bootstrap;
- `useApi` fazia logout imediato no primeiro `401`;
- `useApiMutation` fazia logout imediato no primeiro `401`.

Em termos práticos, o refresh existia, mas nao era integrado aos pontos mais sensiveis do fluxo real.

---

## 5. Fases Implementadas

## 5.1 Fase 1 - Redesenho do Layout FRMS

### Objetivo

Reduzir confusao visual sem reescrever a pagina toda.

### Arquivos principais

- `src/react-app/pages/frms/FrmsDashboard.tsx`
- `src/react-app/pages/frms/components/FrmsMetricCards.tsx`
- `src/react-app/pages/frms/components/FrmsFilterChips.tsx`

### Mudancas aplicadas

#### `FrmsDashboard.tsx`

- manteve o header como zona fixa principal;
- moveu `FrmsFilterChips` e `FrmsMetricCards` para dentro da area rolavel;
- centralizou o conteudo com `max-w-[1480px]` para melhorar leitura e respiro;
- preservou a estrutura funcional da pagina, sem alterar o contrato dos dados.

#### `FrmsFilterChips.tsx`

- deixou de ser uma barra horizontal de transicao;
- passou a ser um card compacto com titulo `Filtros ativos`;
- ganhou subtitulo explicando o comportamento dos chips.

#### `FrmsMetricCards.tsx`

- separou melhor os blocos de compliance e efetividade;
- introduziu colunas de contexto a esquerda e cards a direita;
- reduziu densidade visual dos cards;
- encurtou descricoes para leitura mais direta;
- melhorou proporcao de espaco vertical e badge de `tripulantes`.

### Resultado de UX

- menos ruido visual no topo;
- leitura operacional mais clara;
- filtros, contexto e metricas agora parecem parte do mesmo fluxo.

---

## 5.2 Fase 2 - Correcao da Consistencia FRMS

### Objetivo

Garantir que dashboard agregado e heatmap usem a mesma semantica temporal e o mesmo criterio de severidade.

### Arquivos principais

- `worker-airtrust/src/lib/frms/db-service.ts`
- `worker-airtrust/src/routes/frms.ts`
- `src/react-app/pages/frms/components/FrmsHeatmap.tsx`

### Mudancas aplicadas no backend

#### `db-service.ts` - `enrichWithEffectiveness(...)`

Antes:

- selecionava a efetividade mais recente global por tripulante.

Depois:

- passou a aceitar `startDate` e `endDate`;
- passou a filtrar `frms_jornada` dentro da janela solicitada;
- passou a escolher a **pior efetividade dentro da janela**, com desempate por recencia:

```sql
ORDER BY f2.effectiveness_pct ASC, j2.data DESC, f2.created_at DESC, f2.id DESC
LIMIT 1
```

Interpretacao de negocio:

- o dashboard nao deve mostrar "ultimo estado historico" sem contexto;
- deve mostrar o pior estado observavel no periodo selecionado pelo usuario.

#### `db-service.ts` - `buscarAcumuloFrota(...)`

- no modo mensal, passou a enviar `mesInicio` e `mesFim` para o enrichment;
- no modo rolling, passou a enviar janela calculada de `today - periodoDias` ate `today`;
- adicionou `ar.data_referencia <= date('now')` para impedir leitura de snapshots futuros.

#### `routes/frms.ts` - endpoint `/api/frms/heatmap`

- o ramo rolling tambem passou a bloquear datas futuras;
- isso garante que o heatmap e o resumo olhem o mesmo recorte real e visivel.

### Mudanca aplicada no frontend

#### `FrmsHeatmap.tsx`

Antes:

- a classificacao usava o primeiro valor de efetividade nao nulo encontrado no periodo.

Depois:

- calcula todos os `effectiveness_pct` visiveis;
- usa `Math.min(...)` para obter a pior efetividade do periodo visivel;
- classifica o status a partir dessa pior leitura.

### Resultado funcional

- cards e heatmap passaram a trabalhar com o mesmo recorte e a mesma semantica de pior caso no periodo;
- eliminada a discrepancia entre agregado e visualizacao principal.

---

## 5.3 Fase 3 - Recuperacao de Sessao no Frontend

### Objetivo

Evitar logout prematuro quando o token de acesso expira, mas o `refresh_token` ainda esta valido.

### Arquivos principais

- `src/react-app/context/AuthContext.tsx`
- `src/react-app/hooks/useApi.ts`

### Mudancas aplicadas em `AuthContext.tsx`

- criado `clearPersistedAuth()` para centralizar limpeza de credenciais;
- criado `renewSession(...)` para encapsular refresh e persistencia dos novos tokens;
- durante o bootstrap, quando `/auth/me` responde `401/403`, o fluxo agora:
  - tenta refresh com `airtrust_refresh_token`;
  - somente limpa sessao se o refresh falhar;
- `refreshToken()` passou a reutilizar `renewSession(...)` em vez de duplicar logica.

### Mudancas aplicadas em `useApi.ts`

- `useApi` agora consome `refreshToken` do contexto;
- ao receber `401`, tenta renovar token e reexecuta a requisicao uma vez;
- so faz `logout()` se o refresh falhar ou se o `401` persistir apos o retry.

### Mudancas aplicadas em `useApiMutation`

- o mesmo comportamento foi replicado para mutacoes;
- `POST`, `PUT`, `PATCH` e `DELETE` agora tentam refresh antes de redirecionar para login.

### Resultado tecnico esperado

- expiracao normal de access token deixa de interromper a sessao imediatamente;
- a experiencia local e de producao tende a ficar mais estavel em navegacao longa;
- o sistema usa a infraestrutura de refresh que ja existia, mas estava subaproveitada.

---

## 5.4 Fase 4 - Cobertura dos Clientes Legados

### Objetivo

Remover o buraco restante em componentes que nao usam `useApi`, mas ainda dependem de autenticacao ativa e polling.

### Arquivos principais

- `src/react-app/config/api.ts`
- `src/react-app/services/http-client.ts`
- `src/react-app/components/NotificacoesEscala.tsx`

### Mudancas aplicadas

#### `config/api.ts`

- `getRefreshToken()` passou a buscar fallback em `localStorage`;
- `refreshAccessToken()` foi alinhado ao contrato real do backend:
  - envia `refreshToken` no corpo JSON;
  - aceita resposta em `camelCase` e `snake_case`;
  - sincroniza `airtrust_token` e `airtrust_refresh_token` no `localStorage`.

#### `services/http-client.ts`

- passou a usar `getAccessToken()` como fonte primaria do bearer token;
- em `401`, tenta `refreshAccessToken()` e refaz a chamada uma vez;
- com isso, `ApiAdapter` e os consumidores dele herdaram refresh automatico sem reescrita manual.

#### `NotificacoesEscala.tsx`

- deixou de usar `fetch` manual com header montado inline;
- passou a usar `fetchWithAuth(...)` para contador, listagem e marcacao de leitura.

### Resultado funcional

- o topo passou a depender menos de caminhos paralelos de autenticacao;
- os componentes mais sensiveis a polling agora suportam expiracao normal do access token;
- a recuperacao de sessao ficou consistente entre hooks principais e parte relevante do legado.

---

## 6. Arquivos Modificados

### Frontend FRMS

- `src/react-app/pages/frms/FrmsDashboard.tsx`
- `src/react-app/pages/frms/components/FrmsFilterChips.tsx`
- `src/react-app/pages/frms/components/FrmsMetricCards.tsx`
- `src/react-app/pages/frms/components/FrmsHeatmap.tsx`

### Frontend Autenticacao

- `src/react-app/context/AuthContext.tsx`
- `src/react-app/hooks/useApi.ts`
- `src/react-app/config/api.ts`
- `src/react-app/services/http-client.ts`
- `src/react-app/components/NotificacoesEscala.tsx`

### Backend FRMS

- `worker-airtrust/src/lib/frms/db-service.ts`
- `worker-airtrust/src/routes/frms.ts`

### Deploy e versionamento local

- `deploy-full-automated.sh`
- `worker-airtrust/wrangler.toml`
- `worker-frontend/wrangler.toml`
- `.deployment_version`

---

## 7. Validacao Executada

## 7.1 Validacao FRMS em producao

Foi realizada validacao autenticada em producao usando a sessao do navegador.

### Evidencias confirmadas

- endpoint de frota retornou `severeCount = 0`;
- endpoint de heatmap retornou `severeCells = 0`;
- a tela ao vivo passou a exibir `Severa 0` no bloco de efetividade.

### Conclusao

A inconsistencia reportada pelo usuario foi resolvida de ponta a ponta em ambiente real.

## 7.2 Validacao de autenticacao e recuperacao de sessao

### Verificacoes feitas

- leitura estatica de `AuthContext.tsx` e `useApi.ts`;
- verificacao de erros de editor apos o patch;
- build completo do frontend;
- deploy do frontend e backend com versao `3533365a`;
- teste manual em `localhost:3000` com login valido;
- invalidação manual apenas do `airtrust_token`, preservando `airtrust_refresh_token`;
- reload do `/frms` para forcar o bootstrap autenticado.
- invalidação manual do `airtrust_token` com navegação em `/escalas` para exercitar componentes do topo e o bell de Escalas.

### Resultado

- sem erros em `AuthContext.tsx`;
- sem erros em `useApi.ts`;
- `npm run build` concluido com sucesso.
- `https://airtrust.online` servindo `build-version = 3533365a`;
- `https://airtrust-api-production.airtrust.workers.dev/api/health` retornando `version = 3533365a`;
- `https://airtrust-frontend.airtrust.workers.dev/version.json` retornando `version = 3533365a`;
- no localhost autenticado, apos substituir o access token por um valor invalido e recarregar `/frms`, a aplicacao renovou o JWT e permaneceu na tela `FRMS — Gerenciamento de Fadiga`.
- no localhost autenticado, apos substituir o access token por um valor invalido e abrir `/escalas`, a aplicacao renovou o JWT e permaneceu na tela `Escalas` com o topo funcional.
- `https://airtrust.online/escalas?post=3533365a` e `https://airtrust.online/frms?post=3533365a` carregaram visualmente apos cache-busting.

### Observacao

Os `401` historicos vistos em abas antigas passaram a ser atribuiveis a bundles anteriores em memoria. A etapa atual cobre os caminhos centrais em `useApi`, `useApiMutation`, `http-client`, `ApiAdapter` e `NotificacoesEscala`. Ainda podem existir `fetch(...)` diretos fora desses pontos, mas o principal fluxo de topo foi estabilizado.

---

## 8. Comandos e Operacoes Relevantes

### Inspecao e diagnostico

- leitura de componentes FRMS e hooks de dados;
- leitura de `worker-airtrust/src/lib/frms/db-service.ts`;
- leitura de `worker-airtrust/src/routes/frms.ts`;
- inspecao de `src/react-app/context/AuthContext.tsx`;
- inspecao de `src/react-app/hooks/useApi.ts`.

### Validacao local

```bash
npm run build
```

### Publicacao executada

```bash
SKIP_AUTO_COMMIT=1 ./deploy-full-automated.sh
```

### Validacao produtiva previa desta correcao de sessao

- consultas autenticadas aos endpoints FRMS;
- verificacao visual do painel `https://airtrust.online/frms`;
- confirmacao de alinhamento entre cards e heatmap.

---

## 9. Riscos Remanescentes

### 9.1 Concorrencia de refresh

O patch atual tenta refresh por requisicao que recebe `401`. Ele resolve o problema funcional principal, mas nao implementa ainda um coordenador global de refresh para colapsar multiplos `401` simultaneos em uma unica renovacao.

### 9.2 Versionamento de deploy

O deploy funcional foi publicado com o commit `3533365a`. A unica ressalva remanescente e operacional: os arquivos `.deployment_version`, `worker-airtrust/wrangler.toml` e `worker-frontend/wrangler.toml` sao reescritos pelo pipeline local quando `SKIP_AUTO_COMMIT=1` e exigem limpeza manual se o objetivo for deixar o worktree limpo sem novo commit de metadata.

### 9.3 Escopo parcial de retry autenticado

O ajuste agora cobre `useApi`, `useApiMutation`, `http-client`, `ApiAdapter` e `NotificacoesEscala`. Chamadas `fetch(...)` totalmente diretas fora desses caminhos ainda podem continuar sem refresh automatico.

---

## 10. Estado Final por Tema

### Layout FRMS

- corrigido;
- buildado;
- deployado;
- validado visualmente.

### Consistencia de efetividade FRMS

- corrigida na origem;
- deployada no backend;
- validada por endpoint e UI em producao.

### Recuperacao de sessao

- corrigida no codigo frontend;
- buildada sem erros;
- deployada;
- validada em localhost com access token invalido e refresh token preservado.

---

## 11. Checklist Final

- [x] Reduzir confusao visual do dashboard FRMS
- [x] Ajustar hierarquia entre header, chips e cards
- [x] Investigar divergencia entre `Severa` e heatmap
- [x] Restringir enrichment ao periodo visivel
- [x] Usar pior efetividade dentro da janela
- [x] Excluir rows futuras do rolling
- [x] Alinhar classificacao do heatmap com o resumo
- [x] Validar FRMS em producao
- [x] Investigar fluxo de expiracao de sessao local
- [x] Tentar refresh antes de logout no bootstrap
- [x] Tentar refresh antes de logout no `useApi`
- [x] Tentar refresh antes de logout no `useApiMutation`
- [x] Cobrir clientes legados via `http-client` e `ApiAdapter`
- [x] Cobrir notificações de Escala com `fetchWithAuth`
- [x] Validar com `npm run build`
- [x] Produzir relatorio detalhado em `.md`

---

## 12. Conclusao

O problema reportado pelo usuario nao era apenas visual e nao era apenas de formula. Havia uma combinacao de:

- composicao visual confusa;
- semantica temporal inconsistente entre agregado e grafico;
- dados futuros vazando na visao rolling;
- e, separadamente, um frontend que derrubava a sessao cedo demais.

As correcoes aplicadas atacaram a causa raiz em cada camada:

- **UI:** reorganizada para leitura mais clara;
- **backend FRMS:** alinhado ao periodo realmente visivel;
- **frontend FRMS:** classificacao por pior caso do periodo;
- **autenticacao:** refresh integrado ao fluxo real antes de logout.

O modulo FRMS foi estabilizado em producao no que diz respeito a layout e consistencia dos indicadores. A recuperacao de sessao tambem foi publicada e validada tanto no bootstrap autenticado quanto nos clientes legados mais sensiveis do topo. O principal trabalho restante passa a ser mapear e padronizar `fetch(...)` diretos restantes fora dos caminhos agora cobertos.
