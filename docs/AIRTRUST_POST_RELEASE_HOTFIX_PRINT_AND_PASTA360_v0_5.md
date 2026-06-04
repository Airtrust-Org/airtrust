# AirTrust Post-Release Hotfix: Print A4 + Pasta 360

## Evidências dos bugs

- Clique em ícones de pasta no fluxo de funcionários ainda dependia de rota/comportamento legado e podia abrir a ficha sem a aba `pasta`, ou cair em fluxo com erro global.
- A rota legada `/pasta-virtual/:funcionarioId` continuava ativa em fluxo real.
- A ficha do funcionário exibia `Erro ao carregar dados do funcionário` quando um endpoint auxiliar falhava, mesmo com a `ficha-360` válida.
- A impressão de simuladores tinha correção parcial somente para a agenda mensal detalhada; semanal, agenda/lista e formatos correlatos ainda não estavam cobertos por guards fortes nem por um formato diário explícito.

## Causa raiz Pasta 360

- Navegação operacional inconsistente:
  - listas de funcionários ainda abriam `/funcionarios/:id/ficha` sem forçar `?tab=pasta`;
  - a rota legada `/pasta-virtual/:funcionarioId` ainda renderizava a tela antiga.
- Acoplamento excessivo na `FichaFuncionarioPage`:
  - a tela falhava integralmente quando `matriz-treinamento/requisitos/:id` retornava erro, mesmo que `funcionarios/:id/ficha-360` estivesse íntegro.

## Causa raiz impressão

- A correção anterior estava centrada na agenda mensal detalhada.
- Os demais formatos ainda não tinham validação por builder dedicado.
- Alguns formatos continuavam com `@page` sem margem A4 operacional consistente.
- Faltava um builder diário explícito, o que deixava lacuna funcional e de teste.

## Arquivos alterados

- `src/react-app/App.tsx`
- `src/react-app/navigation.config.ts`
- `src/components/layout/Sidebar.tsx`
- `src/react-app/pages/FichaFuncionarioPage.tsx`
- `src/react-app/pages/funcionarios/ListaFuncionarios.tsx`
- `src/react-app/pages/funcionarios/tabs/ListaTab.tsx`
- `src/react-app/components/funcionarios/TabelaFuncionarios.tsx`
- `src/react-app/pages/simuladores/agenda/CalendarioAgendamentos.tsx`
- `src/react-app/pages/simuladores/agenda/monthlyAgendaPrint.ts`
- `src/react-app/pages/simuladores/agenda/__tests__/monthlyAgendaPrint.test.ts`
- `src/react-app/utils/__tests__/pasta360Usage.test.ts`

## Fluxos corrigidos

- Funcionários:
  - botões de pasta em listas agora usam `buildPasta360Url(..., { tab: 'pasta' })`;
  - rota legada `/pasta-virtual/:funcionarioId` agora redireciona para Pasta 360.
- Certificados e qualificações:
  - handlers continuam apontando para Pasta 360 e permanecem cobertos por guard.
- Ficha do funcionário:
  - a carga principal depende da `ficha-360`;
  - falha da matriz de treinamento deixa `requisitos` vazios, sem derrubar a tela inteira.

## Formatos de impressão cobertos

- Mensal detalhada
- Calendário mensal
- Semanal
- Diário
- Agenda/lista

## Testes e guards

- Guard de Pasta 360 ampliado para:
  - `App.tsx`
  - listas operacionais de funcionários
  - modais de certificados
  - ficha do funcionário
- Testes de impressão ampliados para:
  - mensal
  - calendário mensal
  - semanal
  - diário
  - agenda/lista

## Validações previstas

- `npm run ops:guard`
- `npm run preflight` ou `NOT_AVAILABLE`
- `cd worker-airtrust && npx tsc --noEmit --pretty false`
- `npm run test:worker`
- `npm run build`
- `git diff --check`

## Restrições confirmadas

- Sem migration/apply
- Sem DQ/MIG
- Sem mutação de banco
- Sem exposição de secrets ou PII

## Validação manual pós-deploy

- Validar clique de Pasta 360 em:
  - lista/tela de funcionários
  - qualificações
  - modal de certificados
- Validar impressão:
  - mensal detalhada
  - calendário mensal
  - semanal
  - diário
  - agenda/lista
