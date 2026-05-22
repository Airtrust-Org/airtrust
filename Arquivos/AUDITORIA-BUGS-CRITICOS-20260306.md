# Auditoria Bugs Críticos Escalas - 2026-03-06

## BUG-1

Causa raiz: src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx e worker-airtrust/src/routes/escalas-preferencias.ts

- Apenas a preferência de exibição do nome chama API real.
- Os demais controles da aba Geral são apenas `useState` local, sem botão global de salvar nem mutação HTTP.

Evidência antes:

- GET `/api/escalas/preferencias` existe.
- PUT persistente real é apenas `/api/escalas/preferencias/exibir-nome`.
- Curl validado: PUT seguido de GET retornou `exibir_nome: guerra` persistido.

Status: PENDENTE ✗

## BUG-2

Causa raiz: fluxo principal de salvar tripulação passa pelo hook certo, mas a percepção de "não salvou" é mascarada por problemas de atualização/filtragem da tela e do modal.

- UI: src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx
- Hook: src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts
- API: worker-airtrust/src/routes/escalas-tripulacoes.ts

Evidência antes:

- POST/PUT de tripulação existem e invalidam `detail`, `calendario`, `conflitos` e listas.
- Handler backend grava em `escala_tripulacoes` e regenera eventos base.

Status: PENDENTE ✗

## BUG-3

Causa raiz:

- Backend aceita `?quinzena=` e filtra corretamente: worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts
- Frontend do modal busca pilotos sem passar `quinzena`: src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts
- Filtro local do modal compara com valor inexistente `full` em vez de `custom`: src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx

Evidência antes:

- D1 produção: coluna `funcionarios.quinzena` existe.
- Curl produção: `quinzena=primeira` retornou 17; `quinzena=segunda` retornou 0 para a aeronave testada.

Status: PENDENTE ✗

## BUG-4

Causa raiz provável:

- A tela principal usa hooks com `staleTime: 0`, mas há fetches paralelos e fluxos fora do hook em EscalasPage.tsx.
- O app global define `QueryClient` com `staleTime: 5 minutos` em src/react-app/App.tsx.
- Preferências e tipos de evento ainda usam `staleTime: 5 minutos` em useEscalasQuery.ts.

Evidência antes:

- Query keys principais de escala e calendário foram mapeadas.
- Invalidações principais de tripulação/evento existem, mas ainda há fluxos paralelos e pontos com cache mais longo.

Status: PENDENTE ✗
