# AIRTRUST v0.5-H35-A — Auditoria produto/técnica da Home/Painel Principal

## 1. Sumário executivo

A Home executiva atual para perfis operacionais/gestão está em `DashboardPrincipal` e hoje mistura problemas de **confiabilidade de dados**, **contrato frontend/backend inconsistente** e **excesso de informação**.

Principais achados:

- Há risco real de KPI incorreto por tenant (P0) em queries de dashboard no backend (métricas/compliance com partes sem filtro por `empresa_id`).
- Há inconsistência de parâmetros entre frontend e backend (`dataInicio` vs `data_inicio`) que remove filtros de período em cards críticos (FRMS e sessões), gerando percepção de desatualização (P1).
- Parte das consultas oculta erro como lista vazia, o que mascara falha operacional (P1).
- A tela concentra muitos blocos e atalhos com baixa hierarquia executiva, dificultando ação rápida (P2/P3).

Recomendação: H35-B deve começar por correção de contratos e consolidar um payload confiável para Home executiva, antes do redesign visual.

---

## 2. Tela/arquivos identificados

### Roteamento da Home

- Rota principal pós-login: `src/react-app/App.tsx`
  - `/` usa `HomeRouter`.
  - `HomeRouter` envia `ALUNO/STUDENT/INSTRUTOR/INSTRUCTOR/USUARIO` para `HomePerfil`.
  - Demais perfis vão para `DashboardPrincipal`.

### Home/Painel principal executivo

- Página principal executiva: `src/react-app/pages/DashboardPrincipal.tsx`
- Queries/hook de dados da página: `src/react-app/pages/dashboard/queries.ts`
- Componentes renderizados na página:
  - `src/react-app/pages/dashboard/AlertsTable.tsx`
  - `src/react-app/pages/dashboard/PlannedTrainingsCard.tsx`
  - `src/react-app/pages/dashboard/ActivityCard.tsx`
  - `src/react-app/pages/dashboard/EscalasSummary.tsx`
  - `src/react-app/pages/dashboard/FrmsRiskDonut.tsx`
  - `src/react-app/pages/dashboard/OperationalFooterStrip.tsx`
  - `src/react-app/pages/dashboard/DashboardSkeleton.tsx`

### Backend relacionado

- Rotas dashboard: `worker-airtrust/src/routes/dashboard.ts`
- Serviço de dados dashboard: `worker-airtrust/src/services/dashboardService.ts`
- Rotas FRMS (alertas): `worker-airtrust/src/routes/frms.ts`
- Rotas Simuladores (sessões): `worker-airtrust/src/routes/simuladores-sessoes.ts`
- Rotas Escalas (listagem): `worker-airtrust/src/routes/escalas-crud.ts`
- Rotas Qualificações histórico: `worker-airtrust/src/routes/qualificacoes/historico.ts`
- Rotas Solicitações treinamento: `worker-airtrust/src/routes/solicitacoes-treinamento.ts`

---

## 3. Mapa atual de cards/dados/endpoints

| Card/bloco | Dado exibido | Fonte frontend | Endpoint(s) backend | Observações |
|---|---|---|---|---|
| Módulos do sistema (6 atalhos) | contagens/resumos rápidos por módulo | `DashboardPrincipal.tsx` | mistura de `metrics`, `frmsAlertas`, `escalas`, `sessoes` | é atalho + KPI ao mesmo tempo |
| Header/status operacional | data e “atualizado há…” + status operacional | `DashboardPrincipal.tsx` + `helpers.ts` | `GET /api/dashboard/metrics` | status derivado de % compliance local |
| Compliance score (card principal) | `% em dia`, meta, barras, vencidas/vencendo | `DashboardPrincipal.tsx` | `GET /api/dashboard/metrics`, `GET /api/dashboard/compliance-score`, `GET /api/dashboard/alertas-criticos` | agrega 3 fontes |
| FRMS donut | total e distribuição por nível | `FrmsRiskDonut.tsx` | `GET /api/frms/alertas?...` | frontend filtra mês atual no cliente |
| KPI Tripulantes | ativos, vencendo, em atraso | `DashboardPrincipal.tsx` | `GET /api/dashboard/metrics` | dados críticos |
| KPI Em dia | tripulantes em dia/total | `DashboardPrincipal.tsx` | `GET /api/dashboard/metrics` | derivado local |
| KPI LMS | matrículas em andamento | `DashboardPrincipal.tsx` | `GET /api/dashboard/metrics` | subobjeto `lms` |
| Alertas de qualificação | top 5 por dias restantes | `AlertsTable.tsx` | `GET /api/dashboard/alertas-criticos` | mostra vazio como sucesso |
| Treinamentos planejados | agenda/status | `PlannedTrainingsCard.tsx` | `GET /api/qualificacoes/historico?status=PLANEJADA&limit=50` + fallback `GET /api/treinamentos/solicitacoes?status=AGENDADA` | consolidação híbrida |
| Próximas sessões | até 4 sessões futuras | `DashboardPrincipal.tsx` | `GET /api/simuladores/sessoes?status=AGENDADO&dataInicio=...&limit=20` | contrato de query inconsistente |
| Escalas | até 3 escalas relevantes | `EscalasSummary.tsx` | `GET /api/escalas?limit=5` | backend ignora `limit` |
| Atividade recente | últimas 4 atividades | `ActivityCard.tsx` | `GET /api/dashboard/atividades-recentes` | vazio tratado como “sem atividade” |
| Footer strip | previsão 60d, LMS andamento, atualização | `OperationalFooterStrip.tsx` | `GET /api/dashboard/metrics` | dado pouco acionável |

### Refresh/cache observado

- `React Query` com `staleTime` de 5 min em todas as queries da Home.
- Sem `refetchInterval` automático na página principal.
- Atualização depende de reload, foco ou botão manual “Atualizar”.

---

## 4. Problemas técnicos de dados

### P0 — risco operacional / dado incorreto

1. **KPI dashboard com possíveis dados cross-tenant (métricas/compliance)**
   - Evidência:
     - `worker-airtrust/src/services/dashboardService.ts` em `getDashboardMetrics`:
       - queries de `taxaConclusao` e `demanda` sobre `simulador_agendamentos` sem filtro `empresa_id`.
     - `getComplianceScore`:
       - métrica de sessões concluídas também sem `empresa_id`.
   - Impacto: números de conclusão/demanda podem misturar empresas e distorcer decisão executiva.
   - Causa provável: queries antigas de dashboard não passaram pela hardening multi-tenant completa.
   - Correção recomendada: filtrar por `empresa_id` em todas as subqueries usadas no score.
   - Risco da correção: médio (mudança de baseline de KPI); exige validação com dados reais por tenant.
   - Requer: backend + validação produto.

2. **Sessões “próximas” podem sair vazias/incorretas por filtro de data quebrado**
   - Evidência:
     - Frontend chama `dataInicio` em `useSessoesSimuladorQuery`.
     - Backend `simuladores-sessoes.ts` espera `data_inicio`.
     - Backend ignora `status` query nesta rota.
     - Backend ordena por data DESC e limita antes; frontend filtra futuros depois.
   - Impacto: card pode não mostrar sessões futuras apesar de existirem.
   - Causa provável: divergência de contrato + ordenação/paginação incompatível com intenção de “upcoming”.
   - Correção recomendada: contrato único (`data_inicio`), aplicar filtro de status no backend e ordenar ASC para “próximas”.
   - Risco da correção: baixo/médio.
   - Requer: backend + ajuste frontend.

### P1 — dado enganoso/desatualizado

3. **FRMS com parâmetro de período inconsistente**
   - Evidência:
     - Frontend envia `dataInicio` para `/frms/alertas`.
     - Backend espera `data_inicio`.
   - Impacto: backend não recebe recorte temporal e retorna massa maior; frontend filtra mês no cliente.
   - Causa provável: naming mismatch camelCase vs snake_case.
   - Correção recomendada: padronizar parâmetro no frontend/backend e testar contrato.
   - Requer: backend/frontend.

4. **Erros mascarados como sucesso com lista vazia**
   - Evidência:
     - `getDashboardAlerts` e `getAtividadesRecentes` fazem `catch` e retornam `[]`.
     - queries frontend (`escalas`, `sessoes`, `frms`) em geral não validam `json.success` antes de usar `json.data`.
   - Impacto: painel “limpo” pode significar falha, não operação saudável.
   - Correção recomendada: fail-closed visual (estado de erro explícito por card).
   - Requer: backend + frontend.

5. **Atualização lenta para uso executivo**
   - Evidência:
     - `staleTime` 5 min sem `refetchInterval`.
   - Impacto: percepção de dado velho entre operações.
   - Correção recomendada: janela de atualização definida por bloco (ex.: 30-60s para operacionais, 5min para históricos).
   - Requer: frontend/produto.

### P2 — excesso de informação / UX operacional ruim

6. **Home mistura navegação, monitoramento e analytics em excesso**
   - Evidência: bloco “6 módulos” + múltiplos KPIs + tabelas + timeline + footer com resumo adicional.
   - Impacto: baixa leitura executiva, pouca priorização de ação.
   - Correção recomendada: reduzir para 4-5 blocos com foco em exceções e ação.

7. **Cards com baixa ação contextual**
   - Evidência: alguns cards mostram número sem “próximo passo” claro (ex.: footer, métricas secundárias).
   - Impacto: painel informativo, pouco operacional.

### P3 — estética/layout/copy

8. **Visual heterogêneo e hierarquia fraca de prioridade**
   - Evidência: muitos estilos de bloco no mesmo viewport, múltiplas narrativas simultâneas.
   - Impacto: sensação de “amontoado de indicadores”.

---

## 5. Problemas de produto/UX

- Ausência de “single source of truth” para visão executiva (dados vêm de múltiplas rotas com semânticas diferentes).
- Home atual não separa claramente:
  - o que é **estado crítico agora**,
  - o que é **trabalho pendente hoje**,
  - o que é **tendência/analítico**.
- Falta política explícita de frescor por card (tempo máximo aceitável de desatualização).
- O painel não diferencia com clareza “sem dados” vs “erro de dados”.

---

## 6. Informações que devem sair da Home

Recomendação para H35-B:

- Remover da Home executiva:
  - footer operacional atual (baixo valor acionável);
  - “distribuição por status” detalhada de treinamentos (manter no módulo de qualificações);
  - listagem textual de atividade recente genérica (mover para tela de auditoria/atividade);
  - atalhos de módulo com micro-KPI em duplicidade (manter só navegação enxuta ou mover para menu).

- Mover para telas secundárias:
  - detalhes completos de sessões simulador;
  - timelines/históricos extensos;
  - breakdown detalhado de compliance por categoria.

---

## 7. Informações que devem ficar

Manter na Home executiva (com fonte confiável e dono claro):

1. Saúde operacional hoje (status + contagem de pendências críticas).
2. Pendências críticas de escala/EVD/simulador que exigem ação hoje.
3. FRMS: alertas críticos reais e pendentes de tratamento.
4. Qualificações: vencidas e vencendo com CTA objetivo.
5. SGSO: itens abertos críticos (relatos/NC/ações vencidas) em nível resumo.

---

## 8. Proposta de nova Home/Painel v0.5

### Princípios

- Menos blocos, mais ação.
- Nenhum número sem dono de dado e sem contrato claro.
- Alertar exceção; ocultar ruído.
- Mostrar “última atualização” por bloco crítico.

### Estrutura proposta (máx. 5 blocos)

1. **Saúde operacional hoje**
   - estado geral (normal/atenção/crítico),
   - total de pendências críticas,
   - CTA: “abrir fila de ações”.

2. **Escalas / EVD / operação**
   - voos/sessões próximas confiáveis,
   - inconsistências de alocação/escala,
   - CTA por item.

3. **FRMS / fadiga**
   - críticos + violação + pendências de check-in,
   - sem gráfico excessivo; foco em ação.

4. **Qualificações**
   - vencidas, vencendo, backlog de regularização,
   - CTA direto para fila de regularização.

5. **SGSO / segurança**
   - relatos abertos, NCs abertas, ações vencidas,
   - CTA para priorização diária.

---

## 9. Endpoints/hooks que precisam correção

### Corrigir já no H35-B (backend primeiro)

1. `/api/dashboard/metrics`
   - garantir filtro `empresa_id` em todas as subqueries.

2. `/api/dashboard/compliance-score`
   - aplicar tenant filter também na parte de sessões simulador.

3. `/api/frms/alertas`
   - padronizar aceitação de `data_inicio`/`dataInicio` (preferência: `data_inicio` + compatibilidade temporária).

4. `/api/simuladores/sessoes`
   - suportar `status` query;
   - padronizar `data_inicio`/`dataInicio`;
   - criar modo “upcoming” com ordenação asc e filtro temporal no backend.

5. `/api/escalas`
   - suportar `limit`/`offset` explícitos para consumo de painel.

### Ajustes de hooks/frontend

6. `src/react-app/pages/dashboard/queries.ts`
   - alinhar parâmetros com contrato backend;
   - validar `json.success` em todas as queries;
   - exibir erro explícito por card quando falhar.

7. Política de refresh
   - configurar `refetchInterval` seletivo por bloco crítico.

---

## 10. Plano H35-B

### Etapa 1 — Patch backend (confiabilidade)

- Corrigir tenant scope nas queries de métricas/compliance.
- Corrigir contrato de parâmetros (`data_inicio`, status, paginação, upcoming).
- Criar endpoint consolidado de Home executiva (recomendado) com payload único e versionado.
- Garantir resposta com `success=false` em falhas sem fallback silencioso.

### Etapa 2 — Patch frontend (consumo confiável)

- Ajustar hooks para novo contrato.
- Estados por card: loading/error/stale/ok.
- Remover fallback enganoso para “lista vazia” quando erro.

### Etapa 3 — Redesign funcional

- Implementar layout novo com 5 blocos máximos.
- Hierarquia visual: exceções primeiro, secundários depois.
- CTAs explícitos por bloco.

### Etapa 4 — Testes e validação

- Testes de contrato API (frontend/back).
- Testes worker para tenant scope e filtros de data/status.
- Smoke em staging com cenários: dados existentes, sem dados, erro parcial.

### Etapa 5 — Deploy/smoke seguro

- Deploy apenas após aprovação.
- Smoke checklist focado em Home executiva e integridade multi-tenant.

---

## 11. Riscos e cuidados por estar em produção

- Mudanças de cálculo podem alterar KPI exibido; necessário alinhamento prévio com produto/operação.
- Risco de regressão silenciosa se continuar fallback `[]` em erro.
- Endpoints compartilhados com outros módulos exigem testes de regressão antes de publicar.
- Qualquer ajuste de cache/refresh deve equilibrar frescor e custo de consulta.

---

## 12. Recomendação final

Executar H35-B em duas ondas obrigatórias:

1. **Confiabilidade de dados (backend + contrato + hooks)**.
2. **Redesign funcional/visual** sobre dados confiáveis.

Sem corrigir primeiro os contratos e tenant scope, qualquer redesign continuará com risco de painel bonito porém enganoso.
