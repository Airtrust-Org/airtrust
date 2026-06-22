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

## Fechamento do PR

- PR: `#132`
- URL: `https://github.com/airtrustsystem-alt/airtrust/pull/132`
- Merge commit: `34291293c936002d6f2406c66e00cfe3b473ed96`
- Merge realizado em: `2026-06-22T20:09:54Z`

## CI remota

Checks confirmados como `SUCCESS` no PR #132:

- `build`
- `check-demo-data`
- `lint`
- `lms-smoke`
- `test`
- `🧪 Check PR`

## Deploy Pages

- Ambiente: `Cloudflare Pages production`
- URL principal validada: `https://airtrust.online`
- Deployment URL retornada pelo Pages: `https://cb803824.airtrust.pages.dev`
- Horário do deploy validado: `2026-06-22 17:11:37 -03`
- Build version ativo em produção: `34291293`

## Smoke pós-deploy

### Validado

- `https://airtrust.online` servindo `build-version 34291293`
- `https://api.airtrust.online/api/health` retornando `200 OK`
- `https://api.airtrust.online/api/simuladores` sem token retornando `401`
- `https://airtrust.online/dashboard` redirecionando para `/login` sem sessão autenticada
- `https://airtrust.online/mro` redirecionando para `/login` sem sessão autenticada

### Limitado pelo contexto

- Não foi possível abrir sessão normal em produção já autenticada para inspeção do rodapé operacional.
- Não foi possível abrir sessão compartilhada em produção já autenticada para inspeção do rodapé operacional.
- Não foi possível validar visualmente em produção a etapa de Tripulação/Modelos autenticada porque o navegador disponível redirecionou para `/login` e não havia sessão autenticada reutilizável no contexto.
- Nenhum login manual, token, cookie ou segredo foi usado para contornar essa restrição.

## Segurança operacional

- Worker não publicado
- SQL de produção não executado
- migration/schema não alterado
- SIGVOOS intocado
- LMS intocado
- Funcionários intocado
- `frms-source-policy.ts` intocado
- `Excluir` permanece condicionado à permissão existente no frontend (`simuladores.schedule`)
- Nenhum teste destrutivo com `Excluir` foi executado em produção
- Nenhum secret, cookie ou token foi exposto

## Rollback

- Rollback de Pages permanece disponível pelo histórico de deployments do projeto
- A consulta automatizada ao histórico via Wrangler falhou por limitação de permissão do token usado nessa sessão, sem afetar o deploy já concluído

## Status de liberação

HOTFIX SESSAO COMPARTILHADA ACOES DEPLOYADO COM SUCESSO

## Restrições confirmadas

- Nenhum SQL executado
- Nenhuma migration/schema criada ou alterada
- Nenhuma alteração em Funcionários
- Nenhuma alteração em LMS
- Nenhuma alteração em SIGVOOS
- Nenhum deploy de Worker
- Nenhum deploy direto
- Nenhuma alteração no PR #130
