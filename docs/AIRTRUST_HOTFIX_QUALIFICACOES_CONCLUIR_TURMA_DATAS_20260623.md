# AIRTRUST HOTFIX — QUALIFICACOES / CONCLUIR TURMA / DATAS

Data: 2026-06-23  
Branch: `codex/hotfix-qualificacoes-conclusao-planejada-20260623`  
Base: `origin/main` em `e96387d1f2f9050c5eef07257fc76ab49768876f`

## Objetivo

Corrigir o bloqueio operacional em `/qualificacoes` que impedia concluir turmas passadas por validação incorreta de data inicial, e adicionar um atalho seguro para o fluxo de conclusão da turma.

## Escopo executado

- frontend de `TreinamentosPlanejadosPage`;
- regras puras de validação/elegibilidade de conclusão;
- validação backend do endpoint `PATCH /treinamentos/planejados/:id`;
- testes direcionados do frontend e do Worker.

## Restrições respeitadas

- sem SIGVOOS/SegVoo;
- sem alteração em `worker-airtrust/src/lib/frms/frms-source-policy.ts`;
- sem SQL produção;
- sem migration/schema;
- sem alteração FRMS quinzenal;
- sem deploy de Worker nesta etapa de implementação local;
- sem criação de qualificação falsa.

## Diagnóstico

Classificação final:

- `FRONTEND_DATE_VALIDATION_INVERTED`
- `STATUS_COMPLETED_USES_WRONG_MIN_DATE`
- `COMPLETION_FLOW_MISSING` como atalho operacional, não como backend inexistente

Evidência:

- o campo `Data inicial` do modal usava `min={today}`, bloqueando turmas passadas ao editar status para `Concluído`;
- o backend aceitava `status = CONCLUIDO` sem validar participantes vinculados nem período já encerrado;
- a emissão de qualificação oficial já existia, mas depende de conclusão individual do participante (`resultado = APROVADO` + `data_conclusao_efetiva`).

## Correções aplicadas

### Frontend

- removida a exigência de data futura para `Data inicial`;
- mantida a relação correta `data_inicial <= data_final`;
- adicionada validação explícita:
  - `Data inicial não pode ser posterior à data final.`
  - `Dias efetivos devem estar dentro do período da turma.`
  - `Turma concluída não pode ter período futuro.`
  - `Não é permitido concluir turma sem participantes vinculados.`
- adicionada ação rápida com ícone `Concluir turma` na tabela de planejados:
  - só aparece para `admin/gestor`;
  - só aparece para turma não `read_only`;
  - só aparece para turma não `CANCELADO` / não `CONCLUIDO`;
  - exige participantes vinculados;
  - exige `data_fim <= hoje`;
  - abre confirmação segura e encaminha ao fluxo operacional já existente de conclusão por participante.

### Backend

- o endpoint `PATCH /treinamentos/planejados/:id` agora rejeita:
  - turma `CONCLUIDO` sem participantes;
  - turma `CONCLUIDO` com período futuro.
- a mesma proteção foi aplicada na criação de turma já com status `CONCLUIDO`.

## Arquivos alterados

- `src/react-app/pages/TreinamentosPlanejadosPage.tsx`
- `src/react-app/pages/treinamentos-planejados-rules.ts`
- `src/react-app/pages/__tests__/treinamentos-planejados-rules.test.ts`
- `worker-airtrust/src/routes/treinamentos-planejados.ts`
- `worker-airtrust/src/__tests__/routes/treinamentos-planejados.test.ts`

## Validação executada

### Testes direcionados

- frontend:
  - `src/react-app/pages/__tests__/treinamentos-planejados-rules.test.ts`
  - resultado: `6/6` passando
- worker:
  - `worker-airtrust/src/__tests__/routes/treinamentos-planejados.test.ts`
  - resultado: `13/13` passando

### Validação ampla

- `npm run lint`
  - resultado: OK
- `npm run build`
  - resultado: OK

## Limitações conhecidas

- o novo ícone `Concluir turma` não inventa conclusão em massa nem gera qualificação por regra nova;
- a qualificação oficial continua sendo emitida no fluxo seguro já existente de conclusão individual por participante;
- não houve deploy nesta etapa local;
- RBAC backend de Controle de Voos, schema parity Funcionários e plano do PR #130 permanecem para a sequência posterior, apenas após fechamento deste hotfix.

## Decisão final

`HOTFIX QUALIFICACOES — CONCLUSAO DE TURMA / DATAS IMPLEMENTADO E VALIDADO LOCALMENTE`
