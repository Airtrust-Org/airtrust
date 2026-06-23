# AIRTRUST HOTFIX QUALIFICACOES DATE INPUT REGRESSION 2026-06-23

## Escopo

- PR: `#142`
- Titulo: `fix(qualificacoes): corrigir validacao de data ao editar turma concluida`
- Merge commit em `main`: `ca4ca43778ba7c97479841ba3b527aee4669eef5`
- Deploy Pages que levou a correcao para producao: workflow `deploy.yml` run `28055754338`
- Commit publicado no Pages deploy: `1802e23d8e23c44f38fbc8ec69e1ecb69fae5520`
- Inicio do deploy Pages (UTC): `2026-06-23T20:46:23Z`
- Conclusao do deploy Pages (UTC): `2026-06-23T20:47:19Z`
- Validacao do workflow (UTC): `2026-06-23T20:47:42Z`
- URL de producao validada: `https://airtrust.online/qualificacoes`
- Workflow: `https://github.com/airtrustsystem-alt/airtrust/actions/runs/28055754338`

## Causa raiz

O campo `Data inicial` do modal real de edicao de treinamento planejado mantinha restricao nativa de data minima para `today`, o que bloqueava turmas ja ocorridas no fluxo real de edicao.

Sintoma esperado antes do fix:

- mensagem nativa do navegador: `O valor deve ser 23/06/2026 ou posterior.`

## Smoke publico pos-deploy

- `GET https://api.airtrust.online/api/version` -> `200`
- `GET https://api.airtrust.online/api/health` -> `200`
- `GET https://api.airtrust.online/api/controle-voos` sem token -> `401`
- `https://airtrust.online/login` respondeu com UI do app
- `https://airtrust.online/sw.js` continua publicado como kill-switch/descomissionamento

## Validacao autenticada da tela real

Sessao autenticada disponivel no navegador do app.

Fluxo validado:

1. Abrir `/qualificacoes`
2. Abrir aba `Planejados`
3. Editar a turma `SK76 — Curriculo de Solo`
4. Conferir a turma com periodo `20/06/2026 -> 23/06/2026`
5. Trocar o status para `Concluido` apenas na modal, sem salvar

Evidencias observadas na modal real:

- `Data inicial` = `2026-06-20`
- `Data final` = `2026-06-23`
- `Data inicial` com `min = null`
- `Data inicial` com `max = 2026-06-23`
- `Data final` com `min = 2026-06-20`
- nenhuma mensagem nativa `O valor deve ser 23/06/2026 ou posterior.`
- `validationMessage` vazio nos campos de data inspecionados

Seguranca operacional durante a validacao:

- nenhuma alteracao foi salva
- a modal foi fechada por `Cancelar`
- nenhuma turma real foi concluida

## Decisao

`QUALIFICACOES DATA INPUT REGRESSION CORRIGIDO E DEPLOYADO`
