# AIRTRUST v0.5-H35-C — Home/Painel Principal: redesign visual/funcional sem aumento de carga

## 1. Objetivo

Redesenhar a Home executiva para ficar mais estratégica, legível e acionável, sem aumentar a carga de requisições no frontend/API.

## 2. Antes/depois conceitual

Antes:

- Home com muitos blocos simultâneos (atalhos com micro-KPIs, donut FRMS, atividade recente, footer operacional, KPIs repetidos).
- 8 hooks ativos na tela principal.
- polling configurado por `refetchInterval` em múltiplos hooks (2–5 min), gerando tráfego recorrente.

Depois:

- Home reduzida para 5 blocos estratégicos.
- Remoção de elementos visuais ruidosos e duplicados.
- Sem polling automático por `refetchInterval`.
- Atualização principal por botão manual `Atualizar dados`.

## 3. Blocos finais da Home

1. Saúde operacional hoje.
2. Operação / Escalas / Sessões.
3. FRMS.
4. Qualificações.
5. SGSO.

## 4. Blocos removidos/ocultados

- Atalhos de módulos com micro-KPIs.
- Donut FRMS decorativo.
- Card de atividade recente na Home.
- Footer operacional extenso.
- KPIs duplicados em múltiplos pontos da tela.

## 5. Política de chamadas/API

- Não foi adicionado novo endpoint na Home.
- Não houve backend novo para H35-C.
- Botão manual chama `refetch` das queries ativas já existentes.
- `refetchOnWindowFocus` configurado como `false` para os hooks da Home.
- `refetchOnReconnect` mantido `true`.

## 6. Chamadas iniciais antes/depois

Antes (H35-B, Home anterior):

- Hooks ativos: 8.
- Endpoints base no carregamento inicial: 8 hooks / 9 requisições base estimadas
  - (`treinamentos` fazia 2 chamadas: qualificações + solicitações).
- Endpoint FRMS podia paginar páginas extras além da primeira.

Depois (H35-C):

- Hooks ativos: 5.
- Endpoints base no carregamento inicial: 5 requisições estimadas.
- Endpoints ativos:
  - `/api/dashboard/metrics`
  - `/api/dashboard/alertas-criticos`
  - `/api/frms/alertas`
  - `/api/escalas`
  - `/api/simuladores/sessoes`
- FRMS continua podendo paginar páginas extras quando o total exceder o limite por página.

Resultado: redução de carga inicial e eliminação de tráfego recorrente por polling.

## 7. `staleTime`/refresh/refetch final

Configuração final em `queries.ts`:

- `STALE_CRITICAL_MS = 3 min`.
- `STALE_STANDARD_MS = 8 min`.
- `STALE_RELAXED_MS = 12 min`.
- Sem `refetchInterval`.
- `refetchOnWindowFocus: false`.
- `refetchOnReconnect: true`.
- Refresh manual via botão na Home.

## 8. Confirmação de que não há polling agressivo

- `grep` em `DashboardPrincipal.tsx` e `pages/dashboard` não encontrou `refetchInterval` ativo.
- Não existe polling abaixo de 5 minutos, pois não existe polling automático na Home.

## 9. Arquivos alterados

- `src/react-app/pages/DashboardPrincipal.tsx`
- `src/react-app/pages/dashboard/queries.ts`
- `docs/AIRTRUST_HOME_DASHBOARD_REDESIGN_H35C_v0_5.md`
- `docs/AIRTRUST_HOME_DASHBOARD_DATA_FIX_H35B_v0_5.md`

## 10. Validações

Executado com sucesso:

- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `npm run test:worker`

## 11. Pendências para H35-D

- Validar visual/funcional da Home em smoke de staging/produção (sem alterar política de carga).
- Se necessário, fazer H35-C2 apenas para ajustes de copy/espaçamento sem aumentar endpoints.
- Avaliar endpoint consolidado futuro somente se telemetria indicar custo alto por tela.
