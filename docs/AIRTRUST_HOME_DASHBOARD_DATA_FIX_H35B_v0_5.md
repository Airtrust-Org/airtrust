# AIRTRUST v0.5-H35-B — Home/Painel Principal: data reliability and contracts

## 1. Objetivo

Corrigir a camada de dados/contratos da Home (`DashboardPrincipal`) antes do redesign visual, garantindo:

- parâmetros de query consistentes frontend/backend;
- filtros de período/status confiáveis para cartões críticos;
- escopo por tenant em métricas de dashboard;
- erro explícito no lugar de sucesso silencioso com lista vazia;
- base segura para H35-C.

## 2. Problemas corrigidos

1. Contrato de data inconsistente (`dataInicio` vs `data_inicio`) em FRMS e sessões de simulador.
2. Endpoint `/api/simuladores/sessoes` ignorava `status` e não tinha ordenação controlada para lista de próximos.
3. Métricas/compliance no backend tinham trechos de query sobre simuladores sem `empresa_id`.
4. Atividades recentes mascaravam falha com retorno `[]` no service.
5. Home não diferenciava claramente erro de indisponibilidade em alguns blocos críticos.

## 3. Hooks alterados

Arquivo: `src/react-app/pages/dashboard/queries.ts`

- Adicionado validador comum de envelope API (`success`, `error`, `HTTP status`) com fail explícito.
- Ajustado `useFrmsAlertasQuery` para usar `data_inicio` e não mascarar falha de paginação.
- Ajustado `useSessoesSimuladorQuery`:
  - `view=summary`;
  - `status=AGENDADO,PENDENTE,CONFIRMADO`;
  - `data_inicio`;
  - `order=asc`;
  - normalização de `horario_inicio`/`horario_fim` para `hora_inicio`/`hora_fim`.
- Ajustado `useEscalasQuery` para período atual (`mes`/`ano`) em vez de leitura genérica.
- Ajustado `useTreinamentosQuery` para:
  - não cair em sucesso silencioso quando ambas fontes falham;
  - filtrar agenda futura (`>= hoje`).
- Reduzido `staleTime` e configurado `refetchInterval` por criticidade.

## 4. Endpoints alterados

### 4.1 `GET /api/simuladores/sessoes`
Arquivo: `worker-airtrust/src/routes/simuladores-sessoes.ts`

- Suporte a filtro `status` (lista CSV, normalizada em uppercase).
- Suporte a `order=asc|desc` (default preservado: `desc`).
- Mantida compatibilidade com payload `view=summary` e `view` completo.

### 4.2 Dashboard service
Arquivo: `worker-airtrust/src/services/dashboardService.ts`

- `getDashboardMetrics`:
  - aplicado `empresa_id = ?` nas consultas de `taxaConclusao`, `demanda` e tendência mensal anterior.
- `getComplianceScore`:
  - aplicado `empresa_id = ?` nas subqueries de simuladores concluídos/total (últimos 3 meses).
- `getAtividadesRecentes`:
  - removido fallback silencioso `return []` em erro; agora propaga erro para rota responder `success=false`.

## 5. Dados removidos/neutralizados

Não houve remoção estrutural de blocos nesta fase (sem redesign), mas houve neutralização de dados frágeis:

- FRMS, Escalas, Treinamentos, Sessões e Atividades agora exibem estado explícito de erro no card quando fonte falha.
- “Próximas sessões” deixa de depender de ordenação descendente inadequada e contrato quebrado.

## 6. Contratos preservados/alterados

Preservado:

- respostas existentes de dashboard e simuladores (estrutura principal `success/data/pagination`).
- `view=summary` em sessões.

Alterado/estendido com compatibilidade:

- `/simuladores/sessoes` passa a respeitar `status` e `order`.
- frontend passa a usar `data_inicio` (contrato já esperado no backend).

## 7. Estados de erro/frescor

- Home passou a tratar erro explícito por bloco crítico com `WidgetError` + `retry`.
- Política de frescor atualizada:
  - críticos (FRMS e sessões): `staleTime` menor + `refetchInterval` curto;
  - demais blocos: `staleTime` padrão + atualização periódica moderada.

## 8. Testes

### Alterados

- `worker-airtrust/src/__tests__/routes/simuladores-sessoes-pagination.test.ts`
  - novo caso cobrindo `status` CSV + `order=asc` + bind esperado.

### Novos

- `worker-airtrust/src/__tests__/services/dashboard-service-home-reliability.test.ts`
  - valida bind de `empresa_id` nas queries críticas de simuladores (metrics/compliance);
  - valida que erro em `getAtividadesRecentes` é propagado (sem sucesso silencioso).

## 9. Validações executadas

Executado com sucesso:

- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `npm run test:worker`

Resultado: suite verde (`59 files / 495 tests`).

## 10. Pendências para H35-C (redesign visual/funcional)

1. Reduzir Home para no máximo 5 blocos estratégicos.
2. Remover/mover definitivamente blocos secundários (ex.: atividade detalhada) após decisão de produto.
3. Definir hierarquia visual executiva (exceções primeiro, ação depois).
4. Refinar copy operacional e CTAs por fila crítica.

## 11. Riscos remanescentes

- Alguns endpoints de apoio da Home ainda dependem de arquitetura distribuída (múltiplas fontes) e podem se beneficiar de endpoint consolidado em fase posterior.
- Ajustes de refresh devem continuar monitorados para custo de consulta em produção.
