# AirTrust - Escala Mensal e Planejadas - Integration Fix

Data: 2026-06-07

## Escopo

Este hotfix reforca a ponte da `Escala Mensal` para eventos externos de treinamentos e simuladores sem criar migracao, backfill, saneamento manual ou escrita direta no D1.

Arquivos principais:

- `src/react-app/pages/escalas/components/EscalaCalendario/GradeTripulantes.tsx`
- `src/react-app/pages/escalas/components/EscalaCalendario/GradeTripulantes.utils.ts`
- `src/react-app/pages/escalas/components/EscalaCalendario/__tests__/GradeTripulantes.test.tsx`
- `src/react-app/pages/escalas/components/EscalaCalendario/__tests__/GradeTripulantes.utils.test.ts`

## Resultado funcional

Matriz Escala Mensal:

| Requisito | Status | Evidencia |
| --- | --- | --- |
| CRM 15/06 e 16/06 nas linhas/celulas corretas | Coberto | `treinamento_solo` vira alocacao sintetica `CURSO`; teste cobre 15/06 e 16/06. |
| Antonio 25/06 na linha/celula correta | Coberto | `treinamento_simulador` vira alocacao sintetica `SIM`; teste cobre 25/06. |
| Sessoes de simulador em junho nas celulas | Coberto | Ponte sintetica aceita eventos `simuladores` e preserva `situacao_nome`. |
| Planejadas aparecem na matriz, nao so no resumo | Corrigido | `GradeTripulantes` transforma `eventos` em `alocacoes` antes de montar o mapa por tripulante. |
| Sem falso vazio | Coberto | Teste garante preenchimento de folga quando nao ha evento e celulas `CURSO`/`SIM` quando ha evento. |
| Deduplicacao | Corrigido | Eventos sinteticos identicos sao deduplicados por tipo, id, funcionario e periodo. |
| Robustez `number`/`string` | Corrigido | IDs de escala e funcionario sao normalizados para string antes do filtro. |

## Detalhes tecnicos

`buildSyntheticAlocacoesFromEventos` agora:

- normaliza `escala_id` e `funcionario_id` com `String(...)`;
- filtra `cancelado` de forma case-insensitive;
- deduplica eventos sinteticos identicos;
- preserva `situacao_nome` a partir de `evento.observacoes`;
- mantem eventos externos read-only via `isSyntheticAlocacao`.

`GradeTripulantes` agora expoe o nome da situacao no tooltip da celula externa, por exemplo:

- `CURSO - CRM - Gerenciamento de Recursos da Tripulacao`
- `SIM - SK76 - PERIODICO - 03/03: LOFT E CHECK`

## Validacao

Gates executados:

- `npx tsc --noEmit --pretty false`
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit --pretty false`
- `npm run lint`
- `npm run build`
- `npm run test:run` - 676 passed, 3 skipped
- `npm run test:worker` - 1018 passed

Validacao API observada antes da correcao:

- `/api/escalas/.../calendario` ja retornava CRM 15/06 e 16/06 como `treinamento_solo`.
- `/api/escalas/.../calendario` ja retornava simuladores de junho como `treinamento_simulador`, incluindo sessao 75 em 2026-06-25.

Observacao: validacao visual final em producao deve ser repetida apos deploy, porque a sessao do navegador redirecionou para login durante a tentativa de abrir `Escala 6/2026`.
