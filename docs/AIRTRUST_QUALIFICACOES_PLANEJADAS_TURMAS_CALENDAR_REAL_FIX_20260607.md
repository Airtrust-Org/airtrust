# AirTrust - Qualificacoes Planejadas, Turmas e Calendario - Real Fix

Data: 2026-06-07

## Escopo

Este hotfix corrige a experiencia consolidada de `Qualificacoes > Planejadas` sem migracao, backfill, saneamento manual ou escrita direta no D1.

Arquivos principais:

- `src/react-app/pages/Qualificacoes.tsx`
- `src/react-app/pages/TreinamentosPlanejadosPage.tsx`
- `src/react-app/hooks/useTreinamentosPlanejados.ts`
- `worker-airtrust/src/routes/treinamentos-planejados.ts`

## Resultado funcional

Matriz Planejadas:

| Requisito | Status | Evidencia |
| --- | --- | --- |
| Subabas `Lista`, `Calendario`, `Turmas` | Corrigido | `Turmas` voltou a ser subaba visivel e preserva preferencia `plannedView="turmas"`. |
| Lista sem cards | Corrigido | `TreinamentosPlanejadosPage` renderiza `data-testid="treinamentos-planejados-table"` no modo `quadro`. |
| Calendario com dataset consolidado | Preservado | `Lista` e `Calendario` usam `/api/treinamentos/planejados`. |
| Antonio em 25/06 | Preservado | Titulo de simulador enriquecido usa participante com qualificacao vinculada. |
| CRM em 15/06 e 16/06 | Preservado | Eventos `TURMA` continuam no dataset consolidado e no calendario. |
| Sessoes de simulador em junho | Corrigido | Fonte `SIMULADOR` preserva `sessao_id` no item e em `dias[]`. |
| Clique em simulador abre modal existente | Corrigido | Fonte `SIMULADOR` chama `ModalNovaSessao` com `sessao.id`; nao navega mais para `/simuladores/sessoes/:id`. |
| Um unico `+ Nova turma` | Corrigido | Acoes internas ficam ocultas em `Lista`/`Calendario`; `Turmas` usa a acao propria da tabela filtrada por `source=TURMA`. |
| Sem `Novo treinamento` duplicado | Corrigido | Label primario vira `Nova turma` quando `sourceFilter === 'TURMA'`. |
| `Turmas` com gestao real | Corrigido | `Turmas` usa `TreinamentosPlanejadosPage` filtrado por `TURMA`, `forcedTab="quadro"`, com acoes de edicao/detalhe da turma. |

## Contrato de dados

O worker agora retorna `sessao_id` no item consolidado de simulador:

- `source: "SIMULADOR"`
- `source_id: <simulador_agendamentos.id>`
- `sessao_id: <simulador_agendamentos.id>`
- `dias[0].sessao_id: <simulador_agendamentos.id>`

Isto evita depender apenas de `source_route` para editar a sessao.

## Validacao

Gates executados:

- `npx tsc --noEmit --pretty false`
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit --pretty false`
- `npm run lint`
- `npm run build`
- `npm run test:run` - 676 passed, 3 skipped
- `npm run test:worker` - 1018 passed

Validacao de producao antes da correcao:

- Em `https://airtrust.online/qualificacoes?tab=planejados&view=calendario`, a sessao de 25/06 de Antonio aparecia no calendario.
- Clique na sessao navegava para `https://airtrust.online/simuladores/sessoes/75`, confirmando o bug de fluxo.

Observacao: validacao visual final em producao deve ser repetida apos deploy, porque a sessao do navegador redirecionou para login durante a verificacao de Escala.
