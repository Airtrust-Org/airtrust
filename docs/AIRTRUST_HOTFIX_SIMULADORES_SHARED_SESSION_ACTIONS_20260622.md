# AIRTRUST HOTFIX — SIMULADORES SHARED SESSION ACTIONS — 2026-06-22

## Objetivo

Restaurar no modal `Editar Sessão de Treinamento` de `/simuladores` a mesma barra inferior de ações operacionais para sessões compartilhadas:

- Email
- WhatsApp
- Fichas com contador
- Excluir quando permitido
- Cancelar
- Continuar ou Salvar Alterações conforme a etapa

## Escopo executado

- Reutilização da barra inferior existente do `ModalNovaSessao`.
- Remoção da dependência que escondia o footer quando `modoCompartilhado === true`.
- Manutenção da lógica de validação e salvamento do `SharedSessionForm`.
- Preservação das regras atuais de fichas, exclusão e backend.

## Arquivos alterados

- `src/react-app/components/modals/ModalNovaSessao.tsx`
- `src/react-app/components/modals/SharedSessionForm.tsx`
- `src/react-app/components/modals/__tests__/ModalNovaSessao.loading-stability.test.tsx`
- `src/react-app/components/modals/__tests__/ModalNovaSessao.shared-actions.test.tsx`

## Decisão técnica

- O footer operacional passou a ser renderizado pelo `ModalNovaSessao` tanto para sessão normal quanto para sessão compartilhada.
- O `SharedSessionForm` continua dono da lógica de etapa, validação e persistência.
- O modal controla apenas o CTA principal do fluxo compartilhado via `ref`, sem duplicar regras de negócio.
- O botão `Excluir` segue condicionado à permissão `simuladores.schedule`.

## Regressões cobertas

- Sessão normal continua exibindo ações operacionais.
- Sessão compartilhada volta a exibir ações operacionais.
- `Excluir` não aparece sem permissão.
- `Fichas` continua apontando para a sessão em edição com contador correto.
- Abertura do modal em contexto de calendário continua estável.

## Validações executadas

### Testes direcionados

Comando:

```bash
npm exec -- vitest run \
  src/react-app/components/modals/__tests__/SharedSessionForm.rendered.test.tsx \
  src/react-app/components/modals/__tests__/SharedSessionForm.test.tsx \
  src/react-app/components/modals/__tests__/ModalNovaSessao.loading-stability.test.tsx \
  src/react-app/components/modals/__tests__/ModalNovaSessao.shared-actions.test.tsx
```

Resultado:

- `4` arquivos de teste
- `67` testes aprovados

### Lint

Comando:

```bash
npm run lint
```

Resultado:

- concluído com sucesso

### Build

Comando:

```bash
npm run build
```

Resultado:

- concluído com sucesso

## Status de liberação

Pronto para deploy Pages via fluxo normal de PR + CI.

## Restrições confirmadas

- Nenhum SQL executado
- Nenhuma migration/schema criada ou alterada
- Nenhuma alteração em Funcionários
- Nenhuma alteração em LMS
- Nenhuma alteração em SIGVOOS
- Nenhum deploy de Worker
- Nenhum deploy direto
- Nenhuma alteração no PR #130
